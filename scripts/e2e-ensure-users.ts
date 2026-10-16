/**
 * Ensures E2E personas exist with passwords and org roles from .env.
 * Run: tsx --env-file=.env scripts/e2e-ensure-users.ts
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { ensureKnownAccounts } from "../src/db/seed.js";
import { db } from "../src/db/pool.js";
import { CORNERSTONE_ORG_ID } from "../src/db/seed-cornerstone-members.js";
import type { OrgRole } from "../src/org-permissions.js";
import { defaultEmailForUsername } from "../src/users.js";
import { assignPrimaryTeamAdmin } from "../src/team-admin.js";
import { hashUserPassword } from "../src/vbs-password.js";

function passwordFor(envKey: string) {
  const value =
    process.env[envKey]?.trim() ||
    process.env.E2E_DEFAULT_PASSWORD?.trim() ||
    process.env.AUTH_PASSWORD?.trim();
  if (!value) {
    throw new Error(`Set ${envKey}, E2E_DEFAULT_PASSWORD, or AUTH_PASSWORD in .env`);
  }
  return value;
}

type PersonaDef = {
  usernameEnv: string;
  passwordEnv: string;
  defaultUsername: string;
  role: OrgRole;
  platformAdmin?: boolean;
  firstName?: string;
  lastName?: string;
};

const PERSONAS: PersonaDef[] = [
  {
    usernameEnv: "E2E_PLATFORM_ADMIN_USERNAME",
    passwordEnv: "E2E_PLATFORM_ADMIN_PASSWORD",
    defaultUsername: "admin",
    role: "org_read",
    platformAdmin: true,
  },
  {
    usernameEnv: "E2E_ORG_ADMIN_USERNAME",
    passwordEnv: "E2E_ORG_ADMIN_PASSWORD",
    defaultUsername: "pcheaz@gmail.com",
    role: "org_admin",
    firstName: "Peter",
    lastName: "Cheaz",
  },
  {
    usernameEnv: "E2E_REGISTRATION_ADMIN_USERNAME",
    passwordEnv: "E2E_REGISTRATION_ADMIN_PASSWORD",
    defaultUsername: "patti.tam@gmail.com",
    role: "registration_admin",
    firstName: "Patti",
    lastName: "Tam",
  },
  {
    usernameEnv: "E2E_ORG_WRITE_USERNAME",
    passwordEnv: "E2E_ORG_WRITE_PASSWORD",
    defaultUsername: "mark.yamashita",
    role: "org_write",
    firstName: "Mark",
    lastName: "Yamashita",
  },
  {
    usernameEnv: "E2E_ORG_READ_USERNAME",
    passwordEnv: "E2E_ORG_READ_PASSWORD",
    defaultUsername: "e2e.org.read@cornerstone.test",
    role: "org_read",
    firstName: "E2E",
    lastName: "Reader",
  },
  {
    usernameEnv: "E2E_TEAM_ADMIN_USERNAME",
    passwordEnv: "E2E_TEAM_ADMIN_PASSWORD",
    defaultUsername: "e2e.team.admin@cornerstone.test",
    role: "org_team_admin",
    firstName: "E2E",
    lastName: "TeamAdmin",
  },
];

async function upsertUser(
  username: string,
  password: string,
  platformAdmin: boolean,
  firstName: string,
  lastName: string,
) {
  const hash = hashUserPassword(password);
  const email = defaultEmailForUsername(username);
  await db().query(
    `INSERT INTO users (
       username, password_hash, password_custom, verified, platform_admin,
       email, first_name, last_name, phone, vbs_default_all_filters
     ) VALUES ($1,$2,TRUE,TRUE,$3,$4,$5,$6,'',TRUE)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       password_custom = TRUE,
       verified = TRUE,
       platform_admin = EXCLUDED.platform_admin,
       email = COALESCE(NULLIF(TRIM(users.email), ''), EXCLUDED.email),
       first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), users.first_name),
       last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), users.last_name)`,
    [username, hash, platformAdmin, email, firstName, lastName],
  );
}

async function ensureOrgMember(orgId: string, username: string, role: OrgRole) {
  await db().query(
    `INSERT INTO organization_members (organization_id, username, role)
     VALUES ($1,$2,$3)
     ON CONFLICT (organization_id, username) DO UPDATE SET role = EXCLUDED.role`,
    [orgId, username, role],
  );
}

async function ensureTeamAdmin(orgId: string, username: string) {
  const teamName = process.env.E2E_TEAM_NAME?.trim() || "E2E Test Team";
  const existing = await db().query<{ id: string }>(
    `SELECT id FROM org_teams WHERE organization_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
    [orgId, teamName],
  );
  let teamId = existing.rows[0]?.id;
  if (!teamId) {
    teamId = randomUUID();
    await db().query(
      `INSERT INTO org_teams (id, organization_id, name, members, team_admin_username, created_at)
       VALUES ($1,$2,$3,$4,$4,NOW())`,
      [teamId, orgId, teamName, username],
    );
  } else {
    await db().query(`UPDATE org_teams SET members = $2 WHERE id = $1`, [teamId, username]);
  }
  const assigned = await assignPrimaryTeamAdmin(orgId, teamId, username, [username]);
  if ("error" in assigned) {
    throw new Error(`Team admin setup failed: ${assigned.error}`);
  }
}

async function main() {
  await ensureKnownAccounts();

  const orgId = process.env.E2E_ORG_ID?.trim() || CORNERSTONE_ORG_ID;
  const orgRow = await db().query(`SELECT id FROM organizations WHERE id = $1`, [orgId]);
  if ((orgRow.rowCount ?? 0) === 0) {
    throw new Error(`E2E org not found: ${orgId}. Set E2E_ORG_ID or run seed (Cornerstone).`);
  }

  for (const persona of PERSONAS) {
    const username = process.env[persona.usernameEnv]?.trim() || persona.defaultUsername;
    const password = passwordFor(persona.passwordEnv);
    const firstName = persona.firstName ?? username.split("@")[0] ?? "E2E";
    const lastName = persona.lastName ?? "User";
    await upsertUser(username, password, persona.platformAdmin ?? false, firstName, lastName);

    if (persona.platformAdmin) {
      await db().query(`UPDATE users SET platform_admin = TRUE WHERE username = $1`, [username]);
    }

    const membershipRole: OrgRole = persona.platformAdmin ? "org_admin" : persona.role;
    await ensureOrgMember(orgId, username, membershipRole);

    if (persona.role === "org_team_admin") {
      await ensureTeamAdmin(orgId, username);
    }

    console.log(`E2E persona ready: ${username} (${persona.role}${persona.platformAdmin ? ", platform admin" : ""})`);
  }

  console.log(`E2E org: ${orgId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
