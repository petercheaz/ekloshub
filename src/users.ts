import { db } from "./db/pool.js";

export const seedUsers = [
  "admin",
  "maria.santos",
  "james.okonkwo",
  "lily.chen",
  "pastor.reed",
  "dce.hanna",
  "tom.walters",
  "sofia.nguyen",
  "marcus.bell",
  "rachel.owens",
  "kim.patel",
  "andre.louis",
  "nina.brooks",
  "caleb.ortiz",
  "elena.vargas",
  "jordan.miles",
  "priya.shah",
  "owen.clark",
  "grace.kim",
  "diego.ramirez",
  "aisha.cole",
  "ben.hart",
  "clara.yoon",
  "felix.ng",
  "hannah.brooks",
] as const;

export const seedVerifiedUsers = new Set([
  "admin",
  "maria.santos",
  "pastor.reed",
  "dce.hanna",
  "lily.chen",
  "james.okonkwo",
  "grace.kim",
]);

export async function listUsernames() {
  const result = await db().query<{ username: string }>("SELECT username FROM users ORDER BY username");
  return result.rows.map((row) => row.username);
}

export async function findUser(login: string) {
  const value = login.trim();
  const result = await db().query<{ username: string }>(
    `SELECT username FROM users
     WHERE username = $1 OR LOWER(email) = LOWER($1)
     LIMIT 1`,
    [value],
  );
  return result.rows[0]?.username ?? null;
}

export async function findUserByEmail(email: string) {
  const result = await db().query<{ username: string }>(
    "SELECT username FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [email.trim()],
  );
  return result.rows[0]?.username ?? null;
}

export async function userExists(username: string) {
  return (await findUser(username)) !== null;
}

export async function isVerified(username: string) {
  const result = await db().query<{ verified: boolean }>("SELECT verified FROM users WHERE username = $1", [username]);
  return result.rows[0]?.verified === true;
}

export type UserSuggestion = {
  username: string;
  email: string;
};

export async function searchUsers(query: string, exclude?: string, tenantId?: string | null) {
  const needle = `%${query.trim().toLowerCase()}%`;
  const result = tenantId
    ? await db().query<UserSuggestion>(
        `SELECT u.username, COALESCE(u.email, '') AS email FROM users u
         JOIN organization_members m ON m.username = u.username
         WHERE m.organization_id = $3
           AND ($2::text IS NULL OR u.username <> $2)
           AND ($1 = '%%' OR LOWER(u.username) LIKE $1 OR LOWER(COALESCE(u.email, '')) LIKE $1)
         ORDER BY u.username`,
        [needle, exclude ?? null, tenantId],
      )
    : await db().query<UserSuggestion>(
        `SELECT username, COALESCE(email, '') AS email FROM users
         WHERE ($2::text IS NULL OR username <> $2)
           AND ($1 = '%%' OR LOWER(username) LIKE $1 OR LOWER(COALESCE(email, '')) LIKE $1)
         ORDER BY username`,
        [needle, exclude ?? null],
      );
  return result.rows;
}

export async function isPlatformAdmin(username: string) {
  const result = await db().query<{ platform_admin: boolean }>(
    "SELECT platform_admin FROM users WHERE username = $1",
    [username],
  );
  return result.rows[0]?.platform_admin === true;
}

export async function passwordHashFor(login: string) {
  const username = await findUser(login);
  if (!username) {
    return null;
  }
  const result = await db().query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE username = $1",
    [username],
  );
  return result.rows[0]?.password_hash ?? null;
}

export async function updateProfile(
  username: string,
  input: { email: string; firstName: string; lastName: string; phone: string },
) {
  await db().query(
    `UPDATE users
     SET email = $2, first_name = $3, last_name = $4, phone = $5
     WHERE username = $1`,
    [username, input.email, input.firstName, input.lastName, input.phone],
  );
}
