import { defaultCurriculumYear, programs, publishers, type PublisherId } from "./curriculum.js";
import { db } from "./db/pool.js";
import { objectUrl, parseDataUrl, putObject, storeUpload } from "./db/s3.js";
import { buildRoomIdeaPrompt, decorateRoomPhoto } from "./llm-images.js";
import { sendMessage } from "./messages.js";
import { addNotification } from "./notifications.js";
import { getMembership } from "./orgs.js";
import { publisherName } from "./setup.js";
import { findUser } from "./users.js";

export type RoomIdeaImage = {
  key: string;
  url: string;
};

export type RoomIdea = {
  id: string;
  organizationId: string;
  username: string;
  year: number;
  publisherId: string;
  publisherName: string;
  title: string;
  notes: string;
  sourceUrl: string;
  images: RoomIdeaImage[];
  createdAt: string;
};

type IdeaRow = {
  id: string;
  organization_id: string;
  username: string;
  year: number;
  publisher_id: string;
  title: string;
  notes: string;
  source_key: string;
  created_at: Date;
};

const publisherIds = new Set(publishers.map((publisher) => publisher.id));

function isPublisher(id: string): id is PublisherId {
  return publisherIds.has(id as PublisherId);
}

async function requireMember(organizationId: string, username: string) {
  const membership = await getMembership(organizationId, username);
  if (!membership) {
    return { error: "Not a member of this organization" as const };
  }
  return { ok: true as const, membership };
}

function present(row: IdeaRow, images: RoomIdeaImage[]): RoomIdea {
  return {
    id: row.id,
    organizationId: row.organization_id,
    username: row.username,
    year: row.year,
    publisherId: row.publisher_id,
    publisherName: publisherName(row.publisher_id as PublisherId),
    title: row.title,
    notes: row.notes,
    sourceUrl: objectUrl(row.source_key),
    images,
    createdAt: row.created_at.toISOString(),
  };
}

async function imagesFor(ideaId: string) {
  const result = await db().query<{ object_key: string }>(
    "SELECT object_key FROM room_idea_images WHERE idea_id = $1 ORDER BY sort_order",
    [ideaId],
  );
  return result.rows.map((row) => ({ key: row.object_key, url: objectUrl(row.object_key) }));
}

export async function roomIdeaOptions() {
  return {
    defaultYear: defaultCurriculumYear(),
    publishers,
    programs: programs.map((program) => ({
      id: program.id,
      year: program.year,
      publisherId: program.publisherId,
      theme: program.theme,
    })),
  };
}

export async function listRoomIdeas(organizationId: string, username: string) {
  const access = await requireMember(organizationId, username);
  if (!access.ok) {
    return { error: access.error };
  }
  const result = await db().query<IdeaRow>(
    `SELECT id, organization_id, username, year, publisher_id, title, notes, source_key, created_at
     FROM room_ideas
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId],
  );
  const ideas = [];
  for (const row of result.rows) {
    ideas.push(present(row, await imagesFor(row.id)));
  }
  return { ideas };
}

export async function generateRoomIdeaImages(
  organizationId: string,
  username: string,
  input: {
    publisherId: string;
    year: number;
    title: string;
    notes: string;
    sourceImage: string;
    count?: number;
  },
) {
  const access = await requireMember(organizationId, username);
  if (!access.ok) {
    return { error: access.error };
  }
  if (!isPublisher(input.publisherId) || !Number.isInteger(input.year) || !input.title.trim()) {
    return { error: "Publisher, year, and VBS title are required" as const };
  }
  const program = programs.find(
    (item) =>
      item.publisherId === input.publisherId && item.year === input.year && item.theme === input.title.trim(),
  );
  if (!program) {
    return { error: "Choose a VBS title that matches the publisher and year" as const };
  }
  const parsed = parseDataUrl(input.sourceImage);
  if (!parsed) {
    return { error: "Upload a room or wall picture" as const };
  }
  const count = Math.min(3, Math.max(1, input.count ?? 3));
  const prompt = buildRoomIdeaPrompt({
    publisher: publisherName(input.publisherId),
    year: input.year,
    title: input.title.trim(),
    notes: input.notes,
  });
  const images: RoomIdeaImage[] = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const bytes = await decorateRoomPhoto(parsed.bytes, parsed.contentType, prompt);
      const key = `room-ideas/${organizationId}/gen/${crypto.randomUUID()}.png`;
      await putObject(key, bytes, "image/png");
      images.push({ key, url: objectUrl(key) });
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not generate pictures" };
  }
  return { images };
}

export async function saveRoomIdea(
  organizationId: string,
  username: string,
  input: {
    publisherId: string;
    year: number;
    title: string;
    notes: string;
    sourceImage: string;
    imageKeys: string[];
  },
) {
  const access = await requireMember(organizationId, username);
  if (!access.ok) {
    return { error: access.error };
  }
  if (!isPublisher(input.publisherId) || !Number.isInteger(input.year) || !input.title.trim()) {
    return { error: "Publisher, year, and VBS title are required" as const };
  }
  const keys = [...new Set(input.imageKeys.map((key) => key.trim()).filter(Boolean))].slice(0, 3);
  if (keys.length === 0) {
    return { error: "Generate at least one picture before saving" as const };
  }
  const uploaded = await storeUpload(`room-ideas/${organizationId}/source`, {
    name: "source.jpg",
    type: "image/jpeg",
    size: input.sourceImage.length,
    dataUrl: input.sourceImage,
  });
  if (!uploaded.objectKey) {
    return { error: "Upload a room or wall picture" as const };
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db().query(
    `INSERT INTO room_ideas (
      id, organization_id, username, year, publisher_id, title, notes, source_key, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      organizationId,
      username,
      input.year,
      input.publisherId,
      input.title.trim(),
      input.notes.trim(),
      uploaded.objectKey,
      createdAt,
    ],
  );
  const images: RoomIdeaImage[] = [];
  for (const [index, key] of keys.entries()) {
    await db().query("INSERT INTO room_idea_images (id, idea_id, object_key, sort_order) VALUES ($1,$2,$3,$4)", [
      crypto.randomUUID(),
      id,
      key,
      index,
    ]);
    images.push({ key, url: objectUrl(key) });
  }
  return {
    idea: present(
      {
        id,
        organization_id: organizationId,
        username,
        year: input.year,
        publisher_id: input.publisherId,
        title: input.title.trim(),
        notes: input.notes.trim(),
        source_key: uploaded.objectKey,
        created_at: new Date(createdAt),
      },
      images,
    ),
  };
}

export async function getRoomIdea(organizationId: string, ideaId: string, username: string) {
  const access = await requireMember(organizationId, username);
  if (!access.ok) {
    return { error: access.error };
  }
  const result = await db().query<IdeaRow>(
    `SELECT id, organization_id, username, year, publisher_id, title, notes, source_key, created_at
     FROM room_ideas
     WHERE id = $1 AND organization_id = $2`,
    [ideaId, organizationId],
  );
  const row = result.rows[0];
  if (!row) {
    return { error: "Room idea not found" as const };
  }
  return { idea: present(row, await imagesFor(row.id)) };
}

export async function shareRoomIdea(
  organizationId: string,
  ideaId: string,
  username: string,
  input: { teamIds?: string[]; usernames?: string; publicSetup?: boolean },
) {
  const loaded = await getRoomIdea(organizationId, ideaId, username);
  if (!("idea" in loaded) || !loaded.idea) {
    return { error: "error" in loaded && loaded.error ? loaded.error : "Room idea not found" };
  }
  const idea = loaded.idea;
  const heading = `Room idea: ${idea.publisherName} ${idea.year} — ${idea.title}`;
  const body = [heading, idea.notes, ...idea.images.map((image) => image.url)].filter(Boolean).join("\n\n");
  const teamIds = input.teamIds ?? [];
  const people = input.usernames ?? "";
  if (teamIds.length === 0 && !people.trim() && !input.publicSetup) {
    return { error: "Choose a team, person, or public Show Your Setup" as const };
  }

  if (teamIds.length > 0 || people.trim()) {
    const to = people
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const resolved: string[] = [];
    for (const name of to) {
      const found = await findUser(name);
      if (!found) {
        return { error: `${name} is not a known user` as const };
      }
      resolved.push(found);
    }
    const sent = await sendMessage(username, resolved, body, organizationId, undefined, teamIds);
    if ("error" in sent) {
      return sent;
    }
  }

  if (input.publicSetup) {
    const postId = crypto.randomUUID();
    await db().query(
      `INSERT INTO setup_posts (id, year, publisher_id, title, body, video_url, username, created_at, tenant_id)
       VALUES ($1,$2,$3,$4,$5,'',$6,$7,NULL)`,
      [postId, idea.year, idea.publisherId, idea.title, idea.notes || heading, username, new Date().toISOString()],
    );
    for (const [index, image] of idea.images.entries()) {
      await db().query(
        `INSERT INTO setup_media (id, post_id, kind, name, type, size, object_key, sort_order)
         VALUES ($1,$2,'picture',$3,'image/png',0,$4,$5)`,
        [crypto.randomUUID(), postId, `room-idea-${index + 1}.png`, image.key, index],
      );
    }
    await addNotification(
      username,
      "Shared to Show Your Setup",
      `${idea.title} is now on the public Show Your Setup board.`,
      "/setup",
    );
  }

  return { ok: true as const, idea };
}
