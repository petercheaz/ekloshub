import { db } from "./db/pool.js";
import {
  defaultVbsPassword,
  hashUserPassword,
  hashVbsDefaultPassword,
} from "./vbs-password.js";
import { defaultEmailForUsername, findUser, resolveUserEmail } from "./users.js";

export const orgRoles = ["org_admin", "org_team_admin", "org_write", "org_read"] as const;
export type OrgRole = (typeof orgRoles)[number];

export type Organization = {
  id: string;
  name: string;
  address: string;
  contact: string;
  createdBy: string;
  createdAt: string;
  role: OrgRole | null;
};

type OrgRow = {
  id: string;
  name: string;
  address: string;
  contact: string;
  created_by: string;
  created_at: Date;
  role: OrgRole | null;
};

type MemberRow = {
  username: string;
  role: OrgRole;
  email: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  verified: boolean;
  password_custom: boolean;
};

function presentMember(row: MemberRow) {
  return {
    username: row.username,
    role: row.role,
    email: resolveUserEmail(row.username, row.email),
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    phone: row.phone ?? "",
    verified: row.verified === true,
    usesDefaultPassword: !row.password_custom,
  };
}

function present(row: OrgRow): Organization {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    contact: row.contact,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    role: row.role,
  };
}

export function isOrgRole(value: string): value is OrgRole {
  return orgRoles.includes(value as OrgRole);
}

export function canWriteRole(role: OrgRole | null) {
  return role === "org_admin" || role === "org_write";
}

export function canContactOrg(role: OrgRole | null) {
  return role === "org_admin" || role === "org_team_admin";
}

export function canManageOrg(role: OrgRole | null) {
  return role === "org_admin";
}

export async function getMembership(organizationId: string, username: string) {
  const result = await db().query<MemberRow>(
    "SELECT username, role FROM organization_members WHERE organization_id = $1 AND username = $2",
    [organizationId, username],
  );
  return result.rows[0] ?? null;
}

export async function listOrganizations(username: string, _platformAdmin = false) {
  const result = await db().query<OrgRow>(
    `SELECT o.*, m.role
     FROM organizations o
     JOIN organization_members m ON m.organization_id = o.id
     WHERE m.username = $1
     ORDER BY o.name`,
    [username],
  );
  return result.rows.map(present);
}

export async function getOrganization(organizationId: string, username: string, platformAdmin: boolean) {
  const result = await db().query<OrgRow>(
    `SELECT o.*, m.role
     FROM organizations o
     LEFT JOIN organization_members m ON m.organization_id = o.id AND m.username = $1
     WHERE o.id = $2`,
    [username, organizationId],
  );
  const org = result.rows[0];
  if (!org) {
    return { error: "Organization not found" as const };
  }
  if (!org.role && !platformAdmin) {
    return { error: "Not a member of this organization" as const };
  }
  const members = await db().query<MemberRow>(
    `SELECT m.username, m.role, u.email, u.first_name, u.last_name, u.phone, u.verified,
            COALESCE(u.password_custom, FALSE) AS password_custom
     FROM organization_members m
     JOIN users u ON u.username = m.username
     WHERE m.organization_id = $1
     ORDER BY LOWER(COALESCE(NULLIF(u.last_name, ''), m.username)), LOWER(u.first_name), m.username`,
    [organizationId],
  );
  const invitations =
    org.role === "org_admin"
      ? (
          await db().query<{
            id: string;
            email: string;
            token: string;
            keyword: string;
            created_at: Date;
            accepted_at: Date | null;
          }>(
            `SELECT id, email, token, keyword, created_at, accepted_at
             FROM org_invites
             WHERE organization_id = $1
             ORDER BY created_at DESC`,
            [organizationId],
          )
        ).rows.map((row) => ({
          id: row.id,
          email: row.email,
          token: row.token,
          keyword: row.accepted_at ? "" : row.keyword,
          link: `/invite/${row.token}?email=${encodeURIComponent(row.email)}`,
          createdAt: row.created_at.toISOString(),
          acceptedAt: row.accepted_at ? row.accepted_at.toISOString() : null,
        }))
      : [];
  const { listTeamsForViewer } = await import("./teams.js");
  const { listTeamAdminTeamIds } = await import("./org-contact.js");
  const teamAdminByUser = new Map<string, string[]>();
  if (org.role === "org_admin") {
    const assignments = await db().query<{ username: string; team_id: string }>(
      `SELECT username, team_id FROM org_team_admin_assignments WHERE organization_id = $1`,
      [organizationId],
    );
    for (const row of assignments.rows) {
      const list = teamAdminByUser.get(row.username) ?? [];
      list.push(row.team_id);
      teamAdminByUser.set(row.username, list);
    }
    const primaryAdmins = await db().query<{ username: string; team_id: string }>(
      `SELECT team_admin_username AS username, id AS team_id
       FROM org_teams
       WHERE organization_id = $1 AND team_admin_username IS NOT NULL`,
      [organizationId],
    );
    for (const row of primaryAdmins.rows) {
      const list = teamAdminByUser.get(row.username) ?? [];
      if (!list.includes(row.team_id)) {
        list.push(row.team_id);
        teamAdminByUser.set(row.username, list);
      }
    }
  }
  return {
    organization: present(org),
    members: members.rows.map((row) => ({
      ...presentMember(row),
      teamAdminTeamIds: teamAdminByUser.get(row.username) ?? [],
    })),
    invitations,
    teams: await listTeamsForViewer(organizationId, username, platformAdmin),
    vbsDefaultPassword: org.role === "org_admin" ? defaultVbsPassword() : undefined,
    contactTeamIds:
      org.role === "org_team_admin" ? await listTeamAdminTeamIds(organizationId, username) : undefined,
  };
}

export async function createOrganization(
  username: string,
  input: { name: string; address: string; contact: string },
) {
  const name = input.name.trim();
  const address = input.address.trim();
  const contact = input.contact.trim();
  if (!name || !address || !contact) {
    return { error: "Org/Church name, address, and contact are required" as const };
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db().query(
    `INSERT INTO organizations (id, name, address, contact, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, name, address, contact, username, createdAt],
  );
  await db().query(
    "INSERT INTO organization_members (organization_id, username, role) VALUES ($1,$2,'org_admin')",
    [id, username],
  );
  return {
    organization: {
      id,
      name,
      address,
      contact,
      createdBy: username,
      createdAt,
      role: "org_admin" as const,
    },
  };
}

export async function deleteOrganization(organizationId: string, username: string) {
  const membership = await getMembership(organizationId, username);
  if (!membership) {
    const exists = await db().query("SELECT 1 FROM organizations WHERE id = $1", [organizationId]);
    return { error: (exists.rowCount ?? 0) === 0 ? ("Organization not found" as const) : ("Only org admins can delete this organization" as const) };
  }
  if (membership.role !== "org_admin") {
    return { error: "Only org admins can delete this organization" as const };
  }
  await db().query("DELETE FROM organizations WHERE id = $1", [organizationId]);
  return { ok: true as const };
}

export async function addOrganizationMember(
  organizationId: string,
  actor: string,
  username: string,
  role: string,
) {
  const membership = await getMembership(organizationId, actor);
  if (membership?.role !== "org_admin") {
    return { error: "Only org admins can add members" as const };
  }
  const names = [...new Set(username.split(/[,;]+/).map((item) => item.trim()).filter(Boolean))];
  if (names.length === 0) {
    return { error: "Enter at least one user" as const };
  }
  if (!isOrgRole(role)) {
    return { error: "Role must be org_admin, org_team_admin, org_write, or org_read" as const };
  }
  const resolved: string[] = [];
  for (const name of names) {
    const found = await findUser(name);
    if (!found) {
      return { error: `${name} is not a known user` as const };
    }
    resolved.push(found);
  }
  for (const name of [...new Set(resolved)]) {
    if (role !== "org_admin") {
      const existing = await getMembership(organizationId, name);
      if (existing?.role === "org_admin") {
        const admins = await db().query(
          "SELECT COUNT(*)::int AS count FROM organization_members WHERE organization_id = $1 AND role = 'org_admin'",
          [organizationId],
        );
        if ((admins.rows[0]?.count as number) <= 1) {
          return { error: "Add another org admin before changing the last admin's role" as const };
        }
      }
    }
    await db().query(
      `INSERT INTO organization_members (organization_id, username, role)
       VALUES ($1,$2,$3)
       ON CONFLICT (organization_id, username) DO UPDATE SET role = EXCLUDED.role`,
      [organizationId, name, role],
    );
  }
  return getOrganization(organizationId, actor, false);
}

export async function updateOrganizationMember(
  organizationId: string,
  actor: string,
  memberUsername: string,
  input: {
    role: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    verified: boolean;
    newPassword: string;
    resetPasswordToDefault: boolean;
    teamAdminTeamIds: string[];
  },
) {
  const membership = await getMembership(organizationId, actor);
  if (membership?.role !== "org_admin") {
    return { error: "Only org admins can edit members" as const };
  }
  const target = await getMembership(organizationId, memberUsername);
  if (!target) {
    return { error: "User is not a member of this organization" as const };
  }
  if (!isOrgRole(input.role)) {
    return { error: "Role must be org_admin, org_team_admin, org_write, or org_read" as const };
  }
  if (input.role === "org_team_admin" && input.teamAdminTeamIds.length === 0) {
    return { error: "Team admins must be assigned to at least one team" as const };
  }
  if (input.role === "org_team_admin") {
    const { assertUserOnTeamRosters } = await import("./team-admin.js");
    const rosterCheck = await assertUserOnTeamRosters(
      organizationId,
      memberUsername,
      input.teamAdminTeamIds,
    );
    if ("error" in rosterCheck) {
      return { error: rosterCheck.error };
    }
  }

  const email = input.email.trim() || defaultEmailForUsername(memberUsername);
  const clash = await db().query<{ username: string }>(
    `SELECT username FROM users
     WHERE LOWER(email) = LOWER($1) AND username <> $2
     LIMIT 1`,
    [email, memberUsername],
  );
  if (clash.rows[0]) {
    return { error: "Another account already uses this email" as const };
  }

  if (target.role === "org_admin" && input.role !== "org_admin") {
    const admins = await db().query(
      "SELECT COUNT(*)::int AS count FROM organization_members WHERE organization_id = $1 AND role = 'org_admin'",
      [organizationId],
    );
    if ((admins.rows[0]?.count as number) <= 1) {
      return { error: "Add another org admin before changing the last admin's role" as const };
    }
  }
  if (target.role === "org_team_admin" && input.role !== "org_team_admin") {
    await db().query(
      `DELETE FROM org_team_admin_assignments WHERE organization_id = $1 AND username = $2`,
      [organizationId, memberUsername],
    );
  }

  let passwordHash: string | null = null;
  let passwordCustom: boolean | null = null;
  if (input.resetPasswordToDefault) {
    passwordHash = hashVbsDefaultPassword();
    passwordCustom = false;
  } else if (input.newPassword.trim()) {
    if (input.newPassword.trim().length < 6) {
      return { error: "Password must be at least 6 characters" as const };
    }
    passwordHash = hashUserPassword(input.newPassword.trim());
    passwordCustom = true;
  }

  if (passwordHash !== null && passwordCustom !== null) {
    await db().query(
      `UPDATE users SET
         email = $2,
         first_name = $3,
         last_name = $4,
         phone = $5,
         verified = $6,
         password_hash = $7,
         password_custom = $8
       WHERE username = $1`,
      [
        memberUsername,
        email,
        input.firstName.trim(),
        input.lastName.trim(),
        input.phone.trim(),
        input.verified,
        passwordHash,
        passwordCustom,
      ],
    );
  } else {
    await db().query(
      `UPDATE users SET
         email = $2,
         first_name = $3,
         last_name = $4,
         phone = $5,
         verified = $6
       WHERE username = $1`,
      [
        memberUsername,
        email,
        input.firstName.trim(),
        input.lastName.trim(),
        input.phone.trim(),
        input.verified,
      ],
    );
  }

  const { syncTeamAdminAssignments } = await import("./org-contact.js");
  const syncResult = await syncTeamAdminAssignments(
    organizationId,
    memberUsername,
    input.role,
    input.role === "org_team_admin" ? input.teamAdminTeamIds : [],
  );
  if (syncResult.error) {
    return { error: syncResult.error };
  }

  await db().query(
    `UPDATE organization_members SET role = $3 WHERE organization_id = $1 AND username = $2`,
    [organizationId, memberUsername, input.role],
  );

  return getOrganization(organizationId, actor, false);
}

export async function removeOrganizationMember(organizationId: string, actor: string, username: string) {
  const membership = await getMembership(organizationId, actor);
  if (membership?.role !== "org_admin") {
    return { error: "Only org admins can remove members" as const };
  }
  const target = await getMembership(organizationId, username);
  if (!target) {
    return { error: "User not found" as const };
  }
  if (target.role === "org_admin") {
    const admins = await db().query(
      "SELECT COUNT(*)::int AS count FROM organization_members WHERE organization_id = $1 AND role = 'org_admin'",
      [organizationId],
    );
    if ((admins.rows[0]?.count as number) <= 1) {
      return { error: "Add another org admin before removing the last admin" as const };
    }
  }
  await db().query("DELETE FROM organization_members WHERE organization_id = $1 AND username = $2", [
    organizationId,
    username,
  ]);
  return getOrganization(organizationId, actor, false);
}
