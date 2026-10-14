import { db } from "./db/pool.js";

export async function orgAdminUsernames(organizationId: string) {
  const result = await db().query<{ username: string }>(
    `SELECT username FROM organization_members
     WHERE organization_id = $1 AND role = 'org_admin'`,
    [organizationId],
  );
  return result.rows.map((row) => row.username);
}
