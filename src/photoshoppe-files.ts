import { db } from "./db/pool.js";
import { getObject, objectUrl, parseDataUrl, putObject } from "./db/s3.js";
import { isAcceptableAttachment } from "./media-limits.js";
import { getMembership } from "./orgs.js";
import { canUseOrgEditors } from "./org-permissions.js";
import { isPlatformAdmin } from "./users.js";

export type EditorSnapshot = {
  layers: unknown[];
  pixels: Record<string, string>;
  doc: { width: number; height: number };
  activeLayerId: string | null;
};

type EntryRow = {
  id: string;
  organization_id: string;
  parent_id: string | null;
  kind: "folder" | "document";
  name: string;
  snapshot_key: string;
  preview_key: string;
  updated_by: string | null;
  updated_at: Date;
};

export type PhotoshoppeFolder = {
  id: string;
  name: string;
  updatedAt: string;
};

export type PhotoshoppeDocument = {
  id: string;
  name: string;
  parentId: string | null;
  previewUrl: string;
  updatedAt: string;
  updatedBy: string;
};

export type PhotoshoppeBrowseResult = {
  folderId: string | null;
  path: { id: string | null; name: string }[];
  folders: PhotoshoppeFolder[];
  documents: PhotoshoppeDocument[];
};

async function requireMember(organizationId: string, username: string) {
  const platformAdmin = await isPlatformAdmin(username);
  const membership = await getMembership(organizationId, username);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" as const };
  }
  return { ok: true as const, membership, platformAdmin };
}

async function requireEditor(organizationId: string, username: string) {
  const gate = await requireMember(organizationId, username);
  if ("error" in gate) {
    return gate;
  }
  const role = gate.membership?.role ?? null;
  if (!gate.platformAdmin && !canUseOrgEditors(role)) {
    return { error: "Coordinator or org admin access is required to edit files" as const };
  }
  return { ok: true as const };
}

function sanitizeName(raw: string) {
  const name = raw.trim().replace(/[/\\]+/g, "-");
  if (!name) {
    return { error: "Name is required" as const };
  }
  if (name.length > 120) {
    return { error: "Name is too long" as const };
  }
  return { name };
}

async function folderExists(organizationId: string, folderId: string | null) {
  if (!folderId) {
    return true;
  }
  const result = await db().query<{ id: string }>(
    `SELECT id FROM photoshoppe_entries
     WHERE id = $1 AND organization_id = $2 AND kind = 'folder'`,
    [folderId, organizationId],
  );
  return Boolean(result.rows[0]);
}

type FolderPathRow = { id: string; name: string; parent_id: string | null };

async function loadFolderRow(organizationId: string, id: string) {
  const folderLookup = await db().query<FolderPathRow>(
    `SELECT id, name, parent_id FROM photoshoppe_entries
     WHERE id = $1 AND organization_id = $2 AND kind = 'folder'`,
    [id, organizationId],
  );
  return folderLookup.rows[0] ?? null;
}

async function buildPath(organizationId: string, folderId: string | null) {
  const path: { id: string | null; name: string }[] = [{ id: null, name: "Photoshoppe" }];
  const chain: { id: string; name: string }[] = [];
  let current: string | null = folderId;
  while (current) {
    const row = await loadFolderRow(organizationId, current);
    if (!row) {
      break;
    }
    chain.unshift({ id: row.id, name: row.name });
    current = row.parent_id;
  }
  for (const item of chain) {
    path.push(item);
  }
  return path;
}

function presentFolder(row: EntryRow): PhotoshoppeFolder {
  return {
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at.toISOString(),
  };
}

function presentDocument(row: EntryRow): PhotoshoppeDocument {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    previewUrl: objectUrl(row.preview_key),
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by ?? "",
  };
}

export async function browsePhotoshoppe(
  organizationId: string,
  username: string,
  folderId: string | null,
): Promise<PhotoshoppeBrowseResult | { error: string }> {
  const gate = await requireMember(organizationId, username);
  if ("error" in gate) {
    return { error: gate.error ?? "Not a member of this organization" };
  }
  if (folderId && !(await folderExists(organizationId, folderId))) {
    return { error: "Folder not found" };
  }
  const parent = folderId;
  const result = await db().query<EntryRow>(
    `SELECT id, organization_id, parent_id, kind, name, snapshot_key, preview_key, updated_by, updated_at
     FROM photoshoppe_entries
     WHERE organization_id = $1
       AND (($2::text IS NULL AND parent_id IS NULL) OR parent_id = $2)
     ORDER BY kind DESC, lower(name), updated_at DESC`,
    [organizationId, parent],
  );
  const folders: PhotoshoppeFolder[] = [];
  const documents: PhotoshoppeDocument[] = [];
  for (const row of result.rows) {
    if (row.kind === "folder") {
      folders.push(presentFolder(row));
    } else {
      documents.push(presentDocument(row));
    }
  }
  return {
    folderId: parent,
    path: await buildPath(organizationId, parent),
    folders,
    documents,
  };
}

export async function createPhotoshoppeFolder(
  organizationId: string,
  username: string,
  input: { parentId: string | null; name: string },
) {
  const gate = await requireEditor(organizationId, username);
  if ("error" in gate) {
    return { error: gate.error };
  }
  const parsed = sanitizeName(input.name);
  if ("error" in parsed) {
    return { error: parsed.error };
  }
  if (input.parentId && !(await folderExists(organizationId, input.parentId))) {
    return { error: "Parent folder not found" as const };
  }
  const id = crypto.randomUUID();
  try {
    await db().query(
      `INSERT INTO photoshoppe_entries (id, organization_id, parent_id, kind, name, updated_by, updated_at)
       VALUES ($1,$2,$3,'folder',$4,$5,NOW())`,
      [id, organizationId, input.parentId, parsed.name, username],
    );
  } catch {
    return { error: "A folder with that name already exists here" as const };
  }
  return { folder: { id, name: parsed.name, updatedAt: new Date().toISOString() } };
}

const MAX_SNAPSHOT_CHARS = 22_000_000;

export async function savePhotoshoppeDocument(
  organizationId: string,
  username: string,
  input: {
    parentId: string | null;
    name: string;
    documentId?: string;
    snapshot: EditorSnapshot;
    preview: { name: string; type: string; size: number; dataUrl: string };
  },
) {
  const gate = await requireEditor(organizationId, username);
  if ("error" in gate) {
    return { error: gate.error };
  }
  const parsed = sanitizeName(input.name);
  if ("error" in parsed) {
    return { error: parsed.error };
  }
  if (!isAcceptableAttachment(input.preview)) {
    return { error: "Preview image is missing or too large" as const };
  }
  if (!input.snapshot || !Array.isArray(input.snapshot.layers) || !input.snapshot.doc) {
    return { error: "Invalid project data" as const };
  }
  const snapshotJson = JSON.stringify(input.snapshot);
  if (snapshotJson.length > MAX_SNAPSHOT_CHARS) {
    return { error: "Project is too large to save" as const };
  }
  if (input.parentId && !(await folderExists(organizationId, input.parentId))) {
    return { error: "Folder not found" as const };
  }

  const previewParsed = parseDataUrl(input.preview.dataUrl);
  if (!previewParsed) {
    return { error: "Invalid preview image" as const };
  }

  let entryId = input.documentId?.trim() || "";
  let snapshotKey = "";
  let previewKey = "";

  if (entryId) {
    const existing = await db().query<EntryRow>(
      `SELECT id, organization_id, parent_id, kind, name, snapshot_key, preview_key, updated_by, updated_at
       FROM photoshoppe_entries
       WHERE id = $1 AND organization_id = $2 AND kind = 'document'`,
      [entryId, organizationId],
    );
    const row = existing.rows[0];
    if (!row) {
      return { error: "Document not found" as const };
    }
    snapshotKey = row.snapshot_key || `photoshoppe/${organizationId}/${entryId}.json`;
    previewKey = row.preview_key || `photoshoppe/${organizationId}/${entryId}-preview.png`;
    await db().query(
      `UPDATE photoshoppe_entries SET name = $3, parent_id = $4, updated_by = $5, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [entryId, organizationId, parsed.name, input.parentId, username],
    );
  } else {
    entryId = crypto.randomUUID();
    snapshotKey = `photoshoppe/${organizationId}/${entryId}.json`;
    previewKey = `photoshoppe/${organizationId}/${entryId}-preview.png`;
    try {
      await db().query(
        `INSERT INTO photoshoppe_entries
           (id, organization_id, parent_id, kind, name, snapshot_key, preview_key, updated_by, updated_at)
         VALUES ($1,$2,$3,'document',$4,$5,$6,$7,NOW())`,
        [entryId, organizationId, input.parentId, parsed.name, snapshotKey, previewKey, username],
      );
    } catch {
      return { error: "A file with that name already exists in this folder" as const };
    }
  }

  await putObject(snapshotKey, Buffer.from(snapshotJson, "utf8"), "application/json");
  await putObject(previewKey, previewParsed.bytes, previewParsed.contentType || "image/png");

  return {
    document: {
      id: entryId,
      name: parsed.name,
      parentId: input.parentId,
      previewUrl: objectUrl(previewKey),
      updatedAt: new Date().toISOString(),
      updatedBy: username,
    },
  };
}

export async function loadPhotoshoppeDocument(
  organizationId: string,
  username: string,
  documentId: string,
): Promise<{ snapshot: EditorSnapshot; document: PhotoshoppeDocument } | { error: string }> {
  const gate = await requireMember(organizationId, username);
  if ("error" in gate) {
    return { error: gate.error ?? "Not a member of this organization" };
  }
  const docLookup = await db().query<EntryRow>(
    `SELECT id, organization_id, parent_id, kind, name, snapshot_key, preview_key, updated_by, updated_at
     FROM photoshoppe_entries
     WHERE id = $1 AND organization_id = $2 AND kind = 'document'`,
    [documentId, organizationId],
  );
  const row = docLookup.rows[0];
  if (!row || !row.snapshot_key) {
    return { error: "Document not found" };
  }
  const object = await getObject(row.snapshot_key);
  const raw = await object.Body?.transformToString("utf8");
  if (!raw) {
    return { error: "Could not read saved project" };
  }
  let snapshot: EditorSnapshot;
  try {
    snapshot = JSON.parse(raw) as EditorSnapshot;
  } catch {
    return { error: "Saved project is corrupted" };
  }
  return {
    snapshot,
    document: presentDocument(row),
  };
}
