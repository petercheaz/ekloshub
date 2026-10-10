import { hashVbsDefaultPassword } from "../vbs-password.js";
import { db } from "./pool.js";
import { defaultEmailForUsername } from "../users.js";

export const CORNERSTONE_ORG_ID = "org-cornerstone-seattle";

type MemberSeed = {
  username: string;
  firstName: string;
  lastName: string;
};

/** Cornerstone Seattle org roster (default login password = vbs{program year}). */
export const CORNERSTONE_MEMBER_SEEDS: MemberSeed[] = [
  { username: "mark.yamashita", firstName: "Mark", lastName: "Yamashita" },
  { username: "marlene.yamashita", firstName: "Marlene", lastName: "Yamashita" },
  { username: "nolen.lee", firstName: "Nolen", lastName: "Lee" },
  { username: "david.yip", firstName: "David", lastName: "Yip" },
  { username: "alice.yip", firstName: "Alice", lastName: "Yip" },
  { username: "curtis.munechika", firstName: "Curtis", lastName: "Munechika" },
  { username: "pastor.daryl", firstName: "Pastor", lastName: "Daryl" },
  { username: "pastor.stephen", firstName: "Pastor", lastName: "Stephen" },
  { username: "pastor.gordon", firstName: "Pastor", lastName: "Gordon" },
  { username: "amanda.wan", firstName: "Amanda", lastName: "Wan" },
  { username: "christopher.chan", firstName: "Christopher", lastName: "Chan" },
  { username: "sophie.nguyen", firstName: "Sophie", lastName: "Nguyen" },
  { username: "lisa.wong", firstName: "Lisa", lastName: "Wong" },
  { username: "eugene.wong", firstName: "Eugene", lastName: "Wong" },
  { username: "ryan.wong", firstName: "Ryan", lastName: "Wong" },
  { username: "christina.wong", firstName: "Christina", lastName: "Wong" },
  { username: "kaylee.okamoto", firstName: "Kaylee", lastName: "Okamoto" },
  { username: "abby.chow", firstName: "Abby", lastName: "Chow" },
  { username: "felicity.ng", firstName: "Felicity", lastName: "Ng" },
  { username: "abby.chan", firstName: "Abby", lastName: "Chan" },
  { username: "ken.wong", firstName: "Ken", lastName: "Wong" },
];

export function cornerstoneMemberUsernames() {
  return CORNERSTONE_MEMBER_SEEDS.map((member) => member.username);
}

export async function ensureCornerstoneMembers(orgId: string) {
  if (orgId !== CORNERSTONE_ORG_ID) {
    return;
  }
  const passwordHash = hashVbsDefaultPassword();
  for (const member of CORNERSTONE_MEMBER_SEEDS) {
    const email = defaultEmailForUsername(member.username);
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
      `INSERT INTO organization_members (organization_id, username, role)
       VALUES ($1,$2,'org_write')
       ON CONFLICT (organization_id, username) DO NOTHING`,
      [orgId, member.username],
    );
  }
}
