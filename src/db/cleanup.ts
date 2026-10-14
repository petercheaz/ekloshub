import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { db } from "./pool.js";
import { s3 } from "./config.js";
import { s3Client } from "./s3.js";

async function migrationApplied(id: string) {
  const result = await db().query(`SELECT 1 FROM schema_data_migrations WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

async function markMigration(id: string) {
  await db().query(`INSERT INTO schema_data_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [id]);
}

export async function collectReferencedObjectKeys() {
  const keys = new Set<string>();
  const queries = [
    `SELECT object_key AS key FROM share_attachments WHERE object_key <> ''`,
    `SELECT object_key AS key FROM setup_media WHERE object_key <> ''`,
    `SELECT object_key AS key FROM vbs_task_attachments WHERE object_key <> ''`,
    `SELECT object_key AS key FROM room_idea_images WHERE object_key <> ''`,
    `SELECT source_key AS key FROM room_ideas WHERE source_key <> ''`,
    `SELECT nametag_image_key AS key FROM vbs_registrations WHERE nametag_image_key <> ''`,
    `SELECT snapshot_key AS key FROM photoshoppe_entries WHERE snapshot_key <> ''`,
    `SELECT preview_key AS key FROM photoshoppe_entries WHERE preview_key <> ''`,
  ];
  for (const sql of queries) {
    const result = await db().query<{ key: string }>(sql);
    for (const row of result.rows) {
      if (row.key) {
        keys.add(row.key);
      }
    }
  }
  return keys;
}

async function listAllObjectKeys() {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page: ListObjectsV2CommandOutput = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: s3.bucket,
        ContinuationToken: token,
      }),
    );
    for (const item of page.Contents ?? []) {
      if (item.Key) {
        keys.push(item.Key);
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function deleteObjectKeys(keys: string[]) {
  for (const key of keys) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: key }));
  }
}

/** Remove S3 objects not referenced by any attachment / room-idea row. */
export async function purgeUnreferencedS3Objects() {
  const referenced = await collectReferencedObjectKeys();
  const storedList = await listAllObjectKeys();
  const stored = new Set(storedList);
  const orphans = storedList.filter((key) => !referenced.has(key));
  if (orphans.length > 0) {
    await deleteObjectKeys(orphans);
  }
  const staleRows = await purgeStaleAttachmentRows(stored);
  return {
    deleted: orphans.length,
    staleRows,
    referenced: referenced.size,
    stored: storedList.length,
  };
}

/** Drop legacy table after board posts were migrated. */
export async function dropLegacyVbsAnnouncements() {
  if (await migrationApplied("drop_vbs_announcements_table")) {
    return;
  }
  const legacy = await db().query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'vbs_announcements'`,
  );
  if ((legacy.rowCount ?? 0) > 0) {
    await db().query(
      `INSERT INTO vbs_board_posts (id, plan_id, title, body, created_by, created_at, team_id)
       SELECT a.id, a.plan_id, a.title, a.body, a.created_by, a.created_at, a.team_id
       FROM vbs_announcements a
       WHERE NOT EXISTS (SELECT 1 FROM vbs_board_posts p WHERE p.id = a.id)`,
    );
    await db().query("DROP TABLE vbs_announcements");
  }
  await markMigration("drop_vbs_announcements_table");
}

/** Calendar reminders pointing at deleted plan items. */
async function purgeStaleAttachmentRows(storedKeys: Set<string>) {
  const tables = [
    { table: "share_attachments", column: "object_key" },
    { table: "setup_media", column: "object_key" },
    { table: "vbs_task_attachments", column: "object_key" },
    { table: "room_idea_images", column: "object_key" },
    { table: "photoshoppe_entries", column: "snapshot_key" },
    { table: "photoshoppe_entries", column: "preview_key" },
  ] as const;
  let removed = 0;
  for (const { table, column } of tables) {
    const result = await db().query<{ key: string }>(
      `SELECT ${column} AS key FROM ${table} WHERE ${column} <> ''`,
    );
    for (const row of result.rows) {
      if (!storedKeys.has(row.key)) {
        await db().query(`DELETE FROM ${table} WHERE ${column} = $1`, [row.key]);
        removed += 1;
      }
    }
  }
  const sources = await db().query<{ key: string }>(
    `SELECT source_key AS key FROM room_ideas WHERE source_key <> ''`,
  );
  for (const row of sources.rows) {
    if (!storedKeys.has(row.key)) {
      await db().query(`DELETE FROM room_ideas WHERE source_key = $1`, [row.key]);
      removed += 1;
    }
  }
  return removed;
}

export async function purgeOrphanCalendarReminders() {
  await db().query(
    `DELETE FROM vbs_calendar_reminders r
     WHERE (
       r.item_type = 'task'
       AND NOT EXISTS (SELECT 1 FROM vbs_tasks t WHERE t.id = r.item_id)
     ) OR (
       r.item_type = 'schedule'
       AND NOT EXISTS (SELECT 1 FROM vbs_schedule_slots s WHERE s.id = r.item_id)
     ) OR (
       r.item_type = 'checklist'
       AND NOT EXISTS (SELECT 1 FROM vbs_checklist_items c WHERE c.id = r.item_id)
     ) OR (
       r.item_type IN ('plan_start', 'plan_end')
       AND NOT EXISTS (SELECT 1 FROM vbs_plans p WHERE p.id = r.item_id)
     )`,
  );
}

export async function runDataCleanup() {
  await dropLegacyVbsAnnouncements();
  await purgeOrphanCalendarReminders();

  if (!(await migrationApplied("s3_orphan_purge_v1"))) {
    const summary = await purgeUnreferencedS3Objects();
    await markMigration("s3_orphan_purge_v1");
    if (summary.deleted > 0 || summary.staleRows > 0) {
      console.log(
        `Media cleanup: ${summary.deleted} S3 object(s) removed, ${summary.staleRows} stale DB row(s) removed (${summary.referenced} keys referenced, ${summary.stored} in bucket).`,
      );
    }
  }
}
