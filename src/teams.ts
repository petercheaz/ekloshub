import { db } from "./db/pool.js";
import { getMembership } from "./orgs.js";
import { findUser, isPlatformAdmin } from "./users.js";

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
     ORDER BY name, created_at`,
    [organizationId],
  );
  return result.rows.map((row) => present(row, parseMemberList(row.members)));
}

async function reassignTeamId(organizationId: string, fromTeamId: string, toTeamId: string) {
  if (fromTeamId === toTeamId) {
    return;
  }
  const plan = await db().query<{ id: string }>(
    "SELECT id FROM vbs_plans WHERE organization_id = $1 LIMIT 1",
    [organizationId],
  );
  const planId = plan.rows[0]?.id;
  if (planId) {
    await db().query(
      "UPDATE vbs_tasks SET assigned_team_id = $1 WHERE plan_id = $2 AND assigned_team_id = $3",
      [toTeamId, planId, fromTeamId],
    );
    await db().query(
      "UPDATE vbs_schedule_slots SET team_id = $1 WHERE plan_id = $2 AND team_id = $3",
      [toTeamId, planId, fromTeamId],
    );
    await db().query(
      "UPDATE vbs_stations SET default_team_id = $1 WHERE plan_id = $2 AND default_team_id = $3",
      [toTeamId, planId, fromTeamId],
    );
    await db().query(
      "UPDATE vbs_checklist_items SET assigned_team_id = $1 WHERE plan_id = $2 AND assigned_team_id = $3",
      [toTeamId, planId, fromTeamId],
    );
    await db().query("UPDATE vbs_board_posts SET team_id = $1 WHERE plan_id = $2 AND team_id = $3", [
      toTeamId,
      planId,
      fromTeamId,
    ]);
  }
  await db().query(
    "UPDATE vbs_board_team_subscriptions SET team_id = $1 WHERE organization_id = $2 AND team_id = $3",
    [toTeamId, organizationId, fromTeamId],
  );
  await db().query("UPDATE messages SET team_id = $1 WHERE tenant_id = $2 AND team_id = $3", [
    toTeamId,
    organizationId,
    fromTeamId,
  ]);
}

/** One team name per org — merges duplicate rows left from older seeds or manual creates. */
export async function dedupeOrgTeamsByName(organizationId: string) {
  const teams = await listTeams(organizationId);
  const groups = new Map<string, OrgTeam[]>();
  for (const team of teams) {
    const key = team.name.trim().toLowerCase();
    const bucket = groups.get(key) ?? [];
    bucket.push(team);
    groups.set(key, bucket);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) {
      continue;
    }
    const sorted = [...group].sort((a, b) => {
      const aSeed = a.id.startsWith("team-cornerstone-") ? 0 : 1;
      const bSeed = b.id.startsWith("team-cornerstone-") ? 0 : 1;
      if (aSeed !== bSeed) {
        return aSeed - bSeed;
      }
      return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    });
    const keep = sorted[0]!;
    for (const dupe of sorted.slice(1)) {
      await reassignTeamId(organizationId, dupe.id, keep.id);
      await db().query("DELETE FROM org_teams WHERE id = $1 AND organization_id = $2", [
        dupe.id,
        organizationId,
      ]);
    }
  }
}

async function teamNameTaken(organizationId: string, name: string, exceptTeamId?: string) {
  const normalized = name.trim().toLowerCase();
  const teams = await listTeams(organizationId);
  return teams.some(
    (team) => team.name.trim().toLowerCase() === normalized && team.id !== exceptTeamId,
  );
}

/** Org admins and platform admins are treated as members of every team (calendar, tasks, messages). */
export async function listTeamsForViewer(
  organizationId: string,
  viewerUsername: string | null,
  platformAdminHint = false,
) {
  const teams = await listTeams(organizationId);
  if (!viewerUsername) {
    return teams;
  }
  const membership = await getMembership(organizationId, viewerUsername);
  const platformAdmin = platformAdminHint || (await isPlatformAdmin(viewerUsername));
  const allTeamsAccess = platformAdmin || membership?.role === "org_admin";
  if (!allTeamsAccess) {
    return teams;
  }
  return teams.map((team) => ({
    ...team,
    memberUsernames: [...new Set([...team.memberUsernames, viewerUsername])],
  }));
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
  if (await teamNameTaken(organizationId, name)) {
    return { error: "A team with this name already exists in the organization" as const };
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
  if (await teamNameTaken(organizationId, name, teamId)) {
    return { error: "A team with this name already exists in the organization" as const };
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
