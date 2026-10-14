import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getMembership } from "../orgs.js";
import { isPlatformAdmin } from "../users.js";
import { s3 } from "./config.js";
import { db } from "./pool.js";

export const s3Client = new S3Client({
  region: s3.region,
  endpoint: s3.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: s3.accessKey,
    secretAccessKey: s3.secretKey,
  },
});

export function objectUrl(key: string) {
  if (!key) {
    return "";
  }
  return `${s3.publicUrl}/${key}`;
}

export async function ensureBucket() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: s3.bucket }));
  } catch {
    await s3Client.send(new CreateBucketCommand({ Bucket: s3.bucket }));
  }
}

export async function getObject(key: string) {
  return s3Client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: key }));
}

export async function waitForS3(tries = 40) {
  let lastError: unknown;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      await ensureBucket();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("S3 is not reachable");
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }),
  );
  return objectUrl(key);
}

export function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { contentType: match[1], bytes: Buffer.from(match[2], "base64") };
}

export async function storeUpload(
  prefix: string,
  file: { name: string; type: string; size: number; dataUrl: string },
) {
  const parsed = parseDataUrl(file.dataUrl);
  if (!parsed) {
    return { name: file.name, type: file.type, size: file.size, objectKey: "" };
  }
  const safeName = file.name.replace(/[^\w.-]+/g, "-") || "file";
  const objectKey = `${prefix}/${crypto.randomUUID()}-${safeName}`;
  await putObject(objectKey, parsed.bytes, parsed.contentType || file.type);
  return { name: file.name, type: file.type || parsed.contentType, size: file.size, objectKey };
}

const orgScopedKeyPattern =
  /^(?:room-ideas|photoshoppe|vbs-registration)\/([^/]+)\//;

async function userIsOrgMember(username: string, organizationId: string) {
  return (await getMembership(organizationId, username)) !== null;
}

/** Whether a signed-in user may fetch this object key via /files. */
export async function userCanAccessObjectKey(username: string, key: string): Promise<boolean> {
  if (!key || key.includes("..")) {
    return false;
  }
  if (await isPlatformAdmin(username)) {
    return true;
  }

  const referenced = await db().query<{ allowed: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1 FROM (
        SELECT 1
        FROM share_attachments a
        JOIN share_listings l ON l.id = a.listing_id
        WHERE a.object_key = $2
          AND (
            l.tenant_id IS NULL
            OR EXISTS (
              SELECT 1 FROM organization_members m
              WHERE m.organization_id = l.tenant_id AND m.username = $1
            )
          )
        UNION ALL
        SELECT 1
        FROM setup_media sm
        JOIN setup_posts sp ON sp.id = sm.post_id
        WHERE sm.object_key = $2
          AND (
            sp.tenant_id IS NULL
            OR EXISTS (
              SELECT 1 FROM organization_members m
              WHERE m.organization_id = sp.tenant_id AND m.username = $1
            )
          )
        UNION ALL
        SELECT 1
        FROM vbs_task_attachments ta
        JOIN vbs_tasks t ON t.id = ta.task_id
        JOIN vbs_plans p ON p.id = t.plan_id
        JOIN organization_members m ON m.organization_id = p.organization_id AND m.username = $1
        WHERE ta.object_key = $2
        UNION ALL
        SELECT 1
        FROM room_idea_images ri
        JOIN room_ideas r ON r.id = ri.idea_id
        JOIN organization_members m ON m.organization_id = r.organization_id AND m.username = $1
        WHERE ri.object_key = $2
        UNION ALL
        SELECT 1
        FROM room_ideas r
        JOIN organization_members m ON m.organization_id = r.organization_id AND m.username = $1
        WHERE r.source_key = $2
        UNION ALL
        SELECT 1
        FROM vbs_registrations vr
        JOIN organization_members m ON m.organization_id = vr.organization_id AND m.username = $1
        WHERE vr.nametag_image_key = $2
        UNION ALL
        SELECT 1
        FROM photoshoppe_entries pe
        JOIN organization_members m ON m.organization_id = pe.organization_id AND m.username = $1
        WHERE pe.snapshot_key = $2 OR pe.preview_key = $2
      ) allowed
    ) AS allowed
    `,
    [username, key],
  );
  if (referenced.rows[0]?.allowed) {
    return true;
  }

  const prefixMatch = orgScopedKeyPattern.exec(key);
  if (prefixMatch) {
    return userIsOrgMember(username, prefixMatch[1]!);
  }

  return false;
}
