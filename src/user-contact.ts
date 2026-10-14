import { db } from "./db/pool.js";
import { resolveUserEmail, updateProfile } from "./users.js";

export async function getUserContact(username: string) {
  const result = await db().query<{
    email: string | null;
    phone: string;
    first_name: string;
    last_name: string;
  }>(`SELECT email, phone, first_name, last_name FROM users WHERE username = $1`, [username]);
  const row = result.rows[0];
  if (!row) {
    return { error: "User not found" as const };
  }
  return {
    username,
    email: resolveUserEmail(username, row.email),
    phone: row.phone.trim(),
    firstName: row.first_name.trim(),
    lastName: row.last_name.trim(),
  };
}

export async function saveUserContact(
  username: string,
  input: { email: string; phone: string; firstName: string; lastName: string },
) {
  await updateProfile(username, {
    email: input.email.trim(),
    phone: input.phone.trim(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
  });
  return getUserContact(username);
}
