import { db } from "./db/pool.js";
import { getMembership } from "./orgs.js";
import { findUser } from "./users.js";

export type OrgTeam = {
  id: string;
  organizationId: string;
  name: string;
  members: string;
  memberUsernames: string[];
  createdAt: string;
};

type TeamRow = {
  id: string;
  organization_id: string;
  name: string;
  members: string;
  created_at: Date;
};

function parseMemberList(raw: string) {
  return [...new Set(raw.split(/[,;]+/).map((item) => item.trim()).filter(Boolean))];
}

function present(row: TeamRow, usernames: string[]): OrgTeam {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    members: usernames.join("; "),
    memberUsernames: usernames,
    createdAt: row.created_at.toISOString(),
  };
}

async function resolveMembers(
  organizationId: string,
  raw: string,
): Promise<{ usernames: string[] } | { error: string }> {
  const names = parseMemberList(raw);
  if (names.length === 0) {
    return { error: "Add at least one user, separated by semicolons" as const };
  }
  const usernames: string[] = [];
  for (const name of names) {
    const username = await findUser(name);
    if (!username) {
      return { error: `${name} is not a known user` as const };
    }
    const membership = await getMembership(organizationId, username);
    if (!membership) {
      return { error: `${name} is not a member of this organization` as const };
    }
    usernames.push(username);
  }
  return { usernames: [...new Set(usernames)] };
}

async function canManageTeams(organizationId: string, username: string) {
  const membership = await getMembership(organizationId, username);
  return membership?.role === "org_admin";
}

export async function listTeams(organizationId: string) {
  const result = await db().query<TeamRow>(
    `SELECT id, organization_id, name, members, created_at
     FROM org_teams
     WHERE organization_id = $1
     ORDER BY name`,
    [organizationId],
  );
  return result.rows.map((row) => present(row, parseMemberList(row.members)));
}

export async function getTeam(organizationId: string, teamId: string) {
  const result = await db().query<TeamRow>(
    `SELECT id, organization_id, name, members, created_at
     FROM org_teams
     WHERE id = $1 AND organization_id = $2`,
    [teamId, organizationId],
  );
  const row = result.rows[0];
  return row ? present(row, parseMemberList(row.members)) : null;
}

export async function createTeam(organizationId: string, actor: string, input: { name: string; members: string }) {
  if (!(await canManageTeams(organizationId, actor))) {
    return { error: "Only org admins can create teams" as const };
  }
  const name = input.name.trim();
  if (!name) {
    return { error: "Team name is required" as const };
  }
  const resolved = await resolveMembers(organizationId, input.members);
  if ("error" in resolved) {
    return resolved;
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const members = resolved.usernames.join("; ");
  await db().query(
    `INSERT INTO org_teams (id, organization_id, name, members, created_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, organizationId, name, members, createdAt],
  );
  return {
    team: {
      id,
      organizationId,
      name,
      members,
      memberUsernames: resolved.usernames,
      createdAt,
    },
  };
}

export async function updateTeam(
  organizationId: string,
  teamId: string,
  actor: string,
  input: { name: string; members: string },
) {
  if (!(await canManageTeams(organizationId, actor))) {
    return { error: "Only org admins can edit teams" as const };
  }
  const existing = await getTeam(organizationId, teamId);
  if (!existing) {
    return { error: "Team not found" as const };
  }
  const name = input.name.trim();
  if (!name) {
    return { error: "Team name is required" as const };
  }
  const resolved = await resolveMembers(organizationId, input.members);
  if ("error" in resolved) {
    return resolved;
  }
  const members = resolved.usernames.join("; ");
  await db().query("UPDATE org_teams SET name = $1, members = $2 WHERE id = $3 AND organization_id = $4", [
    name,
    members,
    teamId,
    organizationId,
  ]);
  return {
    team: {
      ...existing,
      name,
      members,
      memberUsernames: resolved.usernames,
    },
  };
}
