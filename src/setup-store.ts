import { defaultCurriculumYear, programs, publishers, type PublisherId } from "./curriculum.js";
import { db } from "./db/pool.js";
import { objectUrl, storeUpload } from "./db/s3.js";
import { publisherName, type SetupComment, type SetupMedia, type SetupPost } from "./setup.js";
import { isVerified } from "./users.js";

type PostRow = {
  id: string;
  year: number;
  publisher_id: PublisherId;
  title: string;
  body: string;
  video_url: string;
  username: string;
  created_at: Date;
  verified: boolean;
};

type MediaRow = {
  post_id: string;
  kind: "picture" | "attachment";
  name: string;
  type: string;
  size: number;
  object_key: string;
  sort_order: number;
};

type CommentRow = {
  id: string;
  post_id: string;
  username: string;
  body: string;
  created_at: Date;
  verified: boolean;
};

function mediaFrom(row: MediaRow): SetupMedia {
  return { name: row.name, type: row.type, size: row.size, dataUrl: objectUrl(row.object_key) };
}

function sortPosts(posts: SetupPost[]) {
  return [...posts].sort((a, b) => {
    if (a.year !== b.year) {
      return b.year - a.year;
    }
    const publisherCompare = publisherName(a.publisherId).localeCompare(publisherName(b.publisherId));
    if (publisherCompare !== 0) {
      return publisherCompare;
    }
    const titleCompare = a.title.localeCompare(b.title);
    if (titleCompare !== 0) {
      return titleCompare;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Public Show Your Setup posts (tenant_id NULL) are visible everywhere; org posts add on top. */
function setupVisibilitySql(column = "p.tenant_id") {
  return `(${column} IS NULL OR ${column} IS NOT DISTINCT FROM $1)`;
}

async function loadPosts(tenantId: string | null) {
  const posts = await db().query<PostRow>(
    `SELECT p.*, u.verified
     FROM setup_posts p
     JOIN users u ON u.username = p.username
     WHERE ${setupVisibilitySql()}`,
    [tenantId],
  );
  const media = await db().query<MediaRow>(
    "SELECT post_id, kind, name, type, size, object_key, sort_order FROM setup_media ORDER BY sort_order",
  );
  const comments = await db().query<CommentRow>(
    `SELECT c.*, u.verified
     FROM setup_comments c
     JOIN users u ON u.username = c.username
     ORDER BY c.created_at`,
  );
  const mediaByPost = new Map<string, MediaRow[]>();
  for (const row of media.rows) {
    const list = mediaByPost.get(row.post_id) ?? [];
    list.push(row);
    mediaByPost.set(row.post_id, list);
  }
  const commentsByPost = new Map<string, (SetupComment & { verified: boolean })[]>();
  for (const row of comments.rows) {
    const list = commentsByPost.get(row.post_id) ?? [];
    list.push({
      id: row.id,
      postId: row.post_id,
      username: row.username,
      body: row.body,
      createdAt: row.created_at.toISOString(),
      verified: row.verified,
    });
    commentsByPost.set(row.post_id, list);
  }

  return posts.rows.map((row) => {
    const files = mediaByPost.get(row.id) ?? [];
    const post: SetupPost & { publisherName: string; verified: boolean; comments: (SetupComment & { verified: boolean })[] } = {
      id: row.id,
      year: row.year,
      publisherId: row.publisher_id,
      title: row.title,
      body: row.body,
      videoUrl: row.video_url,
      pictures: files.filter((file) => file.kind === "picture").map(mediaFrom),
      attachments: files.filter((file) => file.kind === "attachment").map(mediaFrom),
      username: row.username,
      createdAt: row.created_at.toISOString(),
      publisherName: publisherName(row.publisher_id),
      verified: row.verified,
      comments: commentsByPost.get(row.id) ?? [],
    };
    return post;
  });
}

export async function listSetups(tenantId: string | null) {
  const posts = sortPosts(await loadPosts(tenantId));
  return {
    defaultYear: defaultCurriculumYear(),
    publishers,
    programs: programs.map((program) => ({
      id: program.id,
      year: program.year,
      publisherId: program.publisherId,
      theme: program.theme,
    })),
    posts,
  };
}

export async function addSetup(
  username: string,
  tenantId: string | null,
  input: {
    year: number;
    publisherId: PublisherId;
    title: string;
    body: string;
    videoUrl: string;
    pictures: SetupMedia[];
    attachments: SetupMedia[];
  },
) {
  const post: SetupPost = {
    id: crypto.randomUUID(),
    year: input.year,
    publisherId: input.publisherId,
    title: input.title.trim(),
    body: input.body.trim(),
    videoUrl: input.videoUrl.trim(),
    pictures: [],
    attachments: [],
    username,
    createdAt: new Date().toISOString(),
  };

  await db().query(
    `INSERT INTO setup_posts (id, year, publisher_id, title, body, video_url, username, created_at, tenant_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [post.id, post.year, post.publisherId, post.title, post.body, post.videoUrl, post.username, post.createdAt, tenantId],
  );

  let order = 0;
  for (const file of input.pictures) {
    const uploaded = await storeUpload(`setups/${post.id}`, file);
    await db().query(
      `INSERT INTO setup_media (id, post_id, kind, name, type, size, object_key, sort_order)
       VALUES ($1,$2,'picture',$3,$4,$5,$6,$7)`,
      [crypto.randomUUID(), post.id, uploaded.name, uploaded.type, uploaded.size, uploaded.objectKey, order],
    );
    post.pictures.push({
      name: uploaded.name,
      type: uploaded.type,
      size: uploaded.size,
      dataUrl: objectUrl(uploaded.objectKey),
    });
    order += 1;
  }
  for (const file of input.attachments) {
    const uploaded = await storeUpload(`setups/${post.id}`, file);
    await db().query(
      `INSERT INTO setup_media (id, post_id, kind, name, type, size, object_key, sort_order)
       VALUES ($1,$2,'attachment',$3,$4,$5,$6,$7)`,
      [crypto.randomUUID(), post.id, uploaded.name, uploaded.type, uploaded.size, uploaded.objectKey, order],
    );
    post.attachments.push({
      name: uploaded.name,
      type: uploaded.type,
      size: uploaded.size,
      dataUrl: objectUrl(uploaded.objectKey),
    });
    order += 1;
  }

  return {
    ...post,
    publisherName: publisherName(post.publisherId),
    verified: await isVerified(username),
    comments: [],
  };
}

export async function deleteSetup(username: string, postId: string, tenantId: string | null) {
  const result = await db().query<{ username: string }>(
    `SELECT username FROM setup_posts
     WHERE id = $1 AND ${setupVisibilitySql("tenant_id")}`,
    [postId, tenantId],
  );
  const post = result.rows[0];
  if (!post) {
    return { error: "Setup not found" as const };
  }
  if (post.username !== username) {
    return { error: "You can delete only your own setup" as const };
  }
  await db().query("DELETE FROM setup_posts WHERE id = $1", [postId]);
  return { ok: true as const };
}

export async function addSetupComment(username: string, postId: string, body: string, tenantId: string | null) {
  const exists = await db().query(
    `SELECT 1 FROM setup_posts
     WHERE id = $1 AND ${setupVisibilitySql("tenant_id")}`,
    [postId, tenantId],
  );
  if ((exists.rowCount ?? 0) === 0) {
    return { error: "Setup not found" as const };
  }
  const text = body.trim();
  if (!text) {
    return { error: "Comment is required" as const };
  }
  await db().query(
    `INSERT INTO setup_comments (id, post_id, username, body, created_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [crypto.randomUUID(), postId, username, text, new Date().toISOString()],
  );
  const tenant = await db().query<{ tenant_id: string | null }>("SELECT tenant_id FROM setup_posts WHERE id = $1", [
    postId,
  ]);
  const posts = await loadPosts(tenant.rows[0]?.tenant_id ?? null);
  const post = posts.find((item) => item.id === postId);
  return post ?? { error: "Setup not found" as const };
}

export async function deleteSetupComment(username: string, commentId: string) {
  const result = await db().query<{ username: string; post_username: string }>(
    `SELECT c.username, p.username AS post_username
     FROM setup_comments c
     JOIN setup_posts p ON p.id = c.post_id
     WHERE c.id = $1`,
    [commentId],
  );
  const comment = result.rows[0];
  if (!comment) {
    return { error: "Comment not found" as const };
  }
  if (comment.username !== username && comment.post_username !== username) {
    return { error: "You can delete only your comment" as const };
  }
  await db().query("DELETE FROM setup_comments WHERE id = $1", [commentId]);
  return { ok: true as const };
}
