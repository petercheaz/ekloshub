import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashVbsDefaultPassword } from "../vbs-password.js";
import { db } from "./pool.js";
import { defaultEmailForUsername } from "../users.js";

export const CORNERSTONE_ORG_ID = "org-cornerstone-seattle";

const __seedDir = dirname(fileURLToPath(import.meta.url));

export type MemberSeed = {
  username: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  backgroundCheckStatus?: "not_started" | "pending" | "cleared";
};

type VolunteerJsonRow = {
  username: string;
  firstName: string;
  lastName: string;
  email: string | null;
  backgroundCheckStatus: "not_started" | "pending" | "cleared";
};

function loadCornerstoneVolunteerSeeds(): MemberSeed[] {
  const raw = JSON.parse(
    readFileSync(join(__seedDir, "cornerstone-volunteers-2026.json"), "utf8"),
  ) as VolunteerJsonRow[];
  return raw.map((row) => ({
    username: row.username.trim(),
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    backgroundCheckStatus: row.backgroundCheckStatus,
  }));
}

/** Cornerstone Seattle org roster from the 2026 VBS Planning workbook Volunteers sheet. */
export const CORNERSTONE_MEMBER_SEEDS: MemberSeed[] = loadCornerstoneVolunteerSeeds();

export function cornerstoneMemberUsernames() {
  return CORNERSTONE_MEMBER_SEEDS.map((member) => member.username);
}

function resolveBackgroundCheckStatus(member: MemberSeed): "not_started" | "pending" | "cleared" {
  if (member.username === "mark.yamashita" || member.username === "patti.tam@gmail.com") {
    return "cleared";
  }
  if (member.username === "david.yip" || member.username === "alice.yip") {
    return "pending";
  }
  return member.backgroundCheckStatus ?? "not_started";
}

export async function ensureCornerstoneMembers(orgId: string) {
  if (orgId !== CORNERSTONE_ORG_ID) {
    return;
  }
  const passwordHash = hashVbsDefaultPassword();
  for (const member of CORNERSTONE_MEMBER_SEEDS) {
    const email = (member.email?.trim() || defaultEmailForUsername(member.username)).trim();
    const bgStatus = resolveBackgroundCheckStatus(member);
    await db().query(
      `INSERT INTO users (
         username, password_hash, password_custom, verified, platform_admin, email, first_name, last_name, vbs_default_all_filters
       ) VALUES ($1,$2,FALSE,TRUE,FALSE,$5,$3,$4,TRUE)
       ON CONFLICT (username) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         email = CASE
           WHEN users.email IS NULL OR TRIM(users.email) = '' OR users.email = users.username
           THEN EXCLUDED.email
           ELSE users.email
         END,
         password_hash = CASE
           WHEN users.password_custom THEN users.password_hash
           ELSE EXCLUDED.password_hash
         END,
         password_custom = CASE
           WHEN users.password_custom THEN users.password_custom
           ELSE FALSE
         END`,
      [member.username, passwordHash, member.firstName, member.lastName, email],
    );
    await db().query(
      `INSERT INTO organization_members (organization_id, username, role, vbs_season_year, background_check_status)
       VALUES ($1,$2,'org_write',2026,$3)
       ON CONFLICT (organization_id, username) DO UPDATE SET
         vbs_season_year = COALESCE(organization_members.vbs_season_year, 2026),
         background_check_status = EXCLUDED.background_check_status`,
      [orgId, member.username, bgStatus],
    );
  }
}
