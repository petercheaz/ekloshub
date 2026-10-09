import { db } from "./db/pool.js";

export type Notification = {
  id: string;
  title: string;
  body: string;
  link: string;
  createdAt: string;
  read: boolean;
};

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  link: string;
  created_at: Date;
  read_at: Date | null;
};

function present(row: NotificationRow): Notification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    link: row.link,
    createdAt: row.created_at.toISOString(),
    read: Boolean(row.read_at),
  };
}

export async function addNotification(username: string, title: string, body: string, link: string) {
  await db().query(
    `INSERT INTO notifications (id, username, title, body, link, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [crypto.randomUUID(), username, title, body, link, new Date().toISOString()],
  );
}

export async function listNotifications(username: string) {
  const result = await db().query<NotificationRow>(
    `SELECT id, title, body, link, created_at, read_at
     FROM notifications
     WHERE username = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [username],
  );
  return result.rows.map(present);
}

export async function unreadNotificationCount(username: string) {
  const result = await db().query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM notifications WHERE username = $1 AND read_at IS NULL",
    [username],
  );
  return result.rows[0]?.count ?? 0;
}

export async function markNotificationRead(username: string, id: string) {
  await db().query("UPDATE notifications SET read_at = NOW() WHERE id = $1 AND username = $2 AND read_at IS NULL", [
    id,
    username,
  ]);
}
