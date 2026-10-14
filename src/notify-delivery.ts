import { absoluteAppLink } from "./app-url.js";
import { db } from "./db/pool.js";
import { sendMail } from "./mail.js";
import { addNotification } from "./notifications.js";
import { sendSms } from "./sms.js";

type MemberPrefs = {
  notifyEmail: boolean;
  notifySms: boolean;
};

type Contact = {
  email: string;
  phone: string;
};

async function memberPrefs(organizationId: string, usernames: string[]) {
  if (usernames.length === 0) {
    return new Map<string, MemberPrefs>();
  }
  const result = await db().query<{ username: string; notify_email: boolean; notify_sms: boolean }>(
    `SELECT username, notify_email, notify_sms
     FROM organization_members
     WHERE organization_id = $1 AND username = ANY($2::text[])`,
    [organizationId, usernames],
  );
  return new Map(
    result.rows.map((row) => [
      row.username,
      { notifyEmail: row.notify_email, notifySms: row.notify_sms },
    ]),
  );
}

async function contacts(usernames: string[]) {
  if (usernames.length === 0) {
    return new Map<string, Contact>();
  }
  const result = await db().query<{ username: string; email: string | null; phone: string }>(
    `SELECT username, email, phone FROM users WHERE username = ANY($1::text[])`,
    [usernames],
  );
  return new Map(
    result.rows.map((row) => [
      row.username,
      { email: row.email?.trim() ?? "", phone: row.phone.trim() },
    ]),
  );
}

export async function deliverOrgNotifications(
  organizationId: string,
  usernames: string[],
  title: string,
  body: string,
  link: string,
  channels: { inApp?: boolean; email?: boolean; sms?: boolean },
) {
  const unique = [...new Set(usernames.filter(Boolean))];
  if (unique.length === 0) {
    return;
  }

  if (channels.inApp !== false) {
    await Promise.all(unique.map((username) => addNotification(username, title, body, link)));
  }

  if (!channels.email && !channels.sms) {
    return;
  }

  const [prefs, contactMap] = await Promise.all([memberPrefs(organizationId, unique), contacts(unique)]);
  const fullBody = link ? `${body}\n\nOpen: ${absoluteAppLink(link)}` : body;

  for (const username of unique) {
    const pref = prefs.get(username) ?? { notifyEmail: true, notifySms: false };
    const contact = contactMap.get(username);
    if (!contact) {
      continue;
    }
    if (channels.email && pref.notifyEmail && contact.email) {
      await sendMail(contact.email, title, fullBody);
    }
    if (channels.sms && pref.notifySms && contact.phone) {
      await sendSms(contact.phone, `${title}: ${body}`);
    }
  }
}
