import { db } from "./db/pool.js";
import { deliverOrgNotifications } from "./notify-delivery.js";
import { getMembership } from "./orgs.js";
import { getTeam } from "./teams.js";
import { userExists } from "./users.js";

export type DirectMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  body: string;
  createdAt: string;
  readBy: string[];
  deletedBy: string[];
  teamId?: string;
  teamName?: string;
};

export const seedMessages: DirectMessage[] = [
  {
    id: "dm-seed-1",
    threadId: "thread-seed-1",
    from: "maria.santos",
    to: ["admin"],
    body: "Admin — can you take a look at the 2026 Illumination Station glow décor listing before we post more Dallas leftovers?",
    createdAt: "2026-09-28T14:12:00.000Z",
    readBy: [],
    deletedBy: [],
  },
  {
    id: "dm-seed-2",
    threadId: "thread-seed-2",
    from: "pastor.reed",
    to: ["admin", "dce.hanna"],
    body: "We have extra True North trail signs if anyone in the network still needs them. Happy to coordinate pickup.",
    createdAt: "2026-09-30T09:40:00.000Z",
    readBy: ["dce.hanna"],
    deletedBy: [],
  },
  {
    id: "dm-seed-3",
    threadId: "thread-seed-3",
    from: "lily.chen",
    to: ["admin"],
    body: "Thanks for the Magnified! review notes. We used them in our planning meeting last night.",
    createdAt: "2026-10-01T18:05:00.000Z",
    readBy: ["admin"],
    deletedBy: [],
  },
];

type MessageRow = {
  id: string;
  thread_id: string;
  from_user: string;
  to_users: string[];
  body: string;
  created_at: Date;
  read_by: string[];
  deleted_by: string[];
  team_id: string | null;
  team_name: string | null;
};

function fromRow(row: MessageRow): DirectMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    from: row.from_user,
    to: row.to_users,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    readBy: row.read_by ?? [],
    deletedBy: row.deleted_by ?? [],
    teamId: row.team_id ?? undefined,
    teamName: row.team_name || undefined,
  };
}

function visible(message: DirectMessage, username: string) {
  return (
    (message.from === username || message.to.includes(username)) &&
    !message.deletedBy.includes(username)
  );
}

function unreadFor(message: DirectMessage, username: string) {
  return message.to.includes(username) && !message.readBy.includes(username);
}

function summarize(message: DirectMessage, username: string) {
  return {
    ...message,
    unread: unreadFor(message, username),
  };
}

async function allMessages(tenantId: string | null) {
  const result = await db().query<MessageRow>(
    `SELECT * FROM messages
     WHERE ($1::text IS NULL AND tenant_id IS NULL OR tenant_id = $1)`,
    [tenantId],
  );
  return result.rows.map(fromRow);
}

export async function unreadCount(username: string, tenantId: string | null) {
  const messages = await allMessages(tenantId);
  return messages.filter((message) => visible(message, username) && unreadFor(message, username)).length;
}

export async function listThreads(username: string, tenantId: string | null) {
  const messages = (await allMessages(tenantId))
    .filter((message) => visible(message, username))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = new Set<string>();
  const threads = [];
  for (const message of messages) {
    if (seen.has(message.threadId)) {
      continue;
    }
    seen.add(message.threadId);
    const threadMessages = messages.filter((item) => item.threadId === message.threadId);
    threads.push({
      threadId: message.threadId,
      latest: summarize(message, username),
      unread: threadMessages.some((item) => unreadFor(item, username)),
      participants: [...new Set(threadMessages.flatMap((item) => [item.from, ...item.to]))],
      teamName: threadMessages.find((item) => item.teamName)?.teamName,
    });
  }
  return threads;
}

export async function getThread(username: string, threadId: string, tenantId: string | null) {
  const messages = (await allMessages(tenantId))
    .filter((message) => message.threadId === threadId && visible(message, username))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((message) => summarize(message, username));
  if (messages.length === 0) {
    return null;
  }
  return messages;
}

export async function sendMessage(
  from: string,
  to: string[],
  body: string,
  tenantId: string | null,
  threadId?: string,
  teamIds: string[] = [],
) {
  const uniqueTeamIds = [...new Set(teamIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueTeamIds.length > 0) {
    if (!tenantId) {
      return { error: "Teams can only be messaged inside an organization" as const };
    }
    const sender = await getMembership(tenantId, from);
    if (!sender) {
      return { error: "Only organization members can message a team" as const };
    }
  }

  let teamName = "";
  let teamId: string | undefined;
  const fromTeams: string[] = [];
  for (const id of uniqueTeamIds) {
    const team = tenantId ? await getTeam(tenantId, id) : null;
    if (!team) {
      return { error: "Team not found in this organization" as const };
    }
    fromTeams.push(...team.memberUsernames);
    teamName = uniqueTeamIds.length === 1 ? team.name : "Teams";
    teamId = uniqueTeamIds.length === 1 ? team.id : undefined;
  }

  const recipients = [...new Set([...to, ...fromTeams].map((name) => name.trim()).filter(Boolean))].filter(
    (name) => name !== from,
  );
  if (recipients.length === 0) {
    return { error: "Choose at least one recipient" as const };
  }
  const known = await Promise.all(recipients.map((name) => userExists(name)));
  if (known.some((ok) => !ok)) {
    return { error: "Every recipient must be a known user" as const };
  }
  if (tenantId) {
    const members = await Promise.all(recipients.map((name) => getMembership(tenantId, name)));
    if (members.some((member) => !member)) {
      return { error: "Every recipient must belong to this organization" as const };
    }
  }
  const text = body.trim();
  if (!text) {
    return { error: "Message is required" as const };
  }

  const message: DirectMessage = {
    id: crypto.randomUUID(),
    threadId: threadId ?? crypto.randomUUID(),
    from,
    to: recipients,
    body: text,
    createdAt: new Date().toISOString(),
    readBy: [from],
    deletedBy: [],
    teamId,
    teamName: teamName || undefined,
  };
  await db().query(
    `INSERT INTO messages (id, thread_id, from_user, to_users, body, created_at, read_by, deleted_by, tenant_id, team_id, team_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      message.id,
      message.threadId,
      message.from,
      message.to,
      message.body,
      message.createdAt,
      message.readBy,
      message.deletedBy,
      tenantId,
      teamId ?? null,
      teamName,
    ],
  );
  if (tenantId) {
    const preview = text.length > 140 ? `${text.slice(0, 137)}…` : text;
    await deliverOrgNotifications(
      tenantId,
      recipients,
      teamName ? `Team message: ${teamName}` : `Direct message from ${from}`,
      preview,
      `/org/${tenantId}/messages`,
      { inApp: true, email: true, sms: false },
    );
  }
  return { message: summarize(message, from) };
}

export async function markThread(username: string, threadId: string, read: boolean, tenantId: string | null) {
  if (read) {
    await db().query(
      `UPDATE messages
       SET read_by = CASE WHEN $1 = ANY(read_by) THEN read_by ELSE array_append(read_by, $1) END
       WHERE thread_id = $2 AND $1 = ANY(to_users) AND NOT ($1 = ANY(deleted_by))
         AND ($3::text IS NULL AND tenant_id IS NULL OR tenant_id = $3)`,
      [username, threadId, tenantId],
    );
  } else {
    await db().query(
      `UPDATE messages
       SET read_by = array_remove(read_by, $1)
       WHERE thread_id = $2 AND $1 = ANY(to_users) AND NOT ($1 = ANY(deleted_by))
         AND ($3::text IS NULL AND tenant_id IS NULL OR tenant_id = $3)`,
      [username, threadId, tenantId],
    );
  }
  return getThread(username, threadId, tenantId);
}

export async function deleteThread(username: string, threadId: string, tenantId: string | null) {
  await db().query(
    `UPDATE messages
     SET deleted_by = CASE WHEN $1 = ANY(deleted_by) THEN deleted_by ELSE array_append(deleted_by, $1) END
     WHERE thread_id = $2 AND ($1 = from_user OR $1 = ANY(to_users))
       AND ($3::text IS NULL AND tenant_id IS NULL OR tenant_id = $3)`,
    [username, threadId, tenantId],
  );
}
