import { db } from "./db/pool.js";
import { deliverOrgNotifications } from "./notify-delivery.js";

export async function registrationAdminUsernames(organizationId: string) {
  const result = await db().query<{ username: string }>(
    `SELECT username FROM organization_members
     WHERE organization_id = $1 AND role IN ('org_admin', 'registration_admin')`,
    [organizationId],
  );
  return result.rows.map((row) => row.username);
}

export async function notifyRegistrationAdmins(
  organizationId: string,
  title: string,
  body: string,
  link: string,
) {
  const usernames = await registrationAdminUsernames(organizationId);
  await deliverOrgNotifications(organizationId, usernames, title, body, link, {
    inApp: true,
    email: true,
    sms: true,
  });
}
