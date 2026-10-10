import { db } from "./db/pool.js";
import { findUser } from "./users.js";

export const orgRoles = ["org_admin", "org_write", "org_read"] as const;
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
};

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
    "SELECT username, role FROM organization_members WHERE organization_id = $1 ORDER BY username",
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
  return {
    organization: present(org),
    members: members.rows,
    invitations,
    teams: await listTeamsForViewer(organizationId, username, platformAdmin),
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
    return { error: "Role must be org_admin, org_write, or org_read" as const };
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
