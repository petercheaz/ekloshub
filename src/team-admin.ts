import { db } from "./db/pool.js";
import { getMembership } from "./orgs.js";
import { findUser } from "./users.js";

function parseMemberList(raw: string) {
  return [...new Set(raw.split(/[,;]+/).map((item) => item.trim()).filter(Boolean))];
}

export async function teamRosterUsernames(organizationId: string, teamId: string) {
  const result = await db().query<{ members: string; name: string }>(
    `SELECT members, name FROM org_teams WHERE id = $1 AND organization_id = $2`,
    [teamId, organizationId],
  );
  const row = result.rows[0];
  if (!row) {
    return { error: "Team not found" as const };
  }
  const resolved: string[] = [];
  for (const name of parseMemberList(row.members)) {
    const username = await findUser(name);
    if (username) {
      resolved.push(username);
    }
  }
  return { teamName: row.name, usernames: [...new Set(resolved)] };
}

export async function assertUserOnTeamRosters(
  organizationId: string,
  username: string,
  teamIds: string[],
) {
  const unique = [...new Set(teamIds)];
  for (const teamId of unique) {
    const roster = await teamRosterUsernames(organizationId, teamId);
    if ("error" in roster) {
      return roster;
    }
    if (!roster.usernames.includes(username)) {
      return {
        error: `${username} must be listed on ${roster.teamName}'s member roster to be its team admin`,
      };
    }
  }
  return { ok: true as const };
}

async function teamAdminTeamCount(organizationId: string, username: string) {
  const result = await db().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT team_id FROM org_team_admin_assignments
       WHERE organization_id = $1 AND username = $2
       UNION
       SELECT id AS team_id FROM org_teams
       WHERE organization_id = $1 AND team_admin_username = $2
     ) q`,
    [organizationId, username],
  );
  return result.rows[0]?.count ?? 0;
}

/** Org admins keep org_admin; everyone else assigned as team admin becomes org_team_admin. */
export async function promoteMemberToTeamAdmin(organizationId: string, username: string) {
  const membership = await getMembership(organizationId, username);
  if (!membership || membership.role === "org_admin") {
    return;
  }
  if (membership.role === "org_team_admin") {
    return;
  }
  await db().query(
    `UPDATE organization_members SET role = 'org_team_admin'
     WHERE organization_id = $1 AND username = $2`,
    [organizationId, username],
  );
}

/** Drop org_team_admin when the member no longer administers any team. */
export async function reconcileTeamAdminMemberRole(organizationId: string, username: string) {
  const membership = await getMembership(organizationId, username);
  if (!membership || membership.role === "org_admin") {
    return;
  }
  if (membership.role !== "org_team_admin") {
    return;
  }
  if ((await teamAdminTeamCount(organizationId, username)) > 0) {
    return;
  }
  await db().query(
    `UPDATE organization_members SET role = 'org_write'
     WHERE organization_id = $1 AND username = $2`,
    [organizationId, username],
  );
}

export async function assignPrimaryTeamAdmin(
  organizationId: string,
  teamId: string,
  adminUsername: string,
  rosterUsernames?: string[],
): Promise<{ username: string } | { error: string }> {
  const username = adminUsername.trim();
  if (!username) {
    return { error: "Team admin is required" };
  }
  const resolved = await findUser(username);
  if (!resolved) {
    return { error: `${username} is not a known user` };
  }
  const membership = await getMembership(organizationId, resolved);
  if (!membership) {
    return { error: `${username} is not a member of this organization` };
  }

  let roster = rosterUsernames;
  if (!roster) {
    const loaded = await teamRosterUsernames(organizationId, teamId);
    if ("error" in loaded) {
      return { error: "Team not found" };
    }
    roster = loaded.usernames;
  }
  if (!roster.includes(resolved)) {
    return { error: `${resolved} must be listed on this team's member roster to be team admin` };
  }

  const prev = await db().query<{ team_admin_username: string | null }>(
    `SELECT team_admin_username FROM org_teams WHERE id = $1 AND organization_id = $2`,
    [teamId, organizationId],
  );
  const previousAdmin = prev.rows[0]?.team_admin_username?.trim() || null;

  await db().query(
    `UPDATE org_teams SET team_admin_username = $3 WHERE id = $1 AND organization_id = $2`,
    [teamId, organizationId, resolved],
  );
  await db().query(
    `DELETE FROM org_team_admin_assignments WHERE organization_id = $1 AND team_id = $2`,
    [organizationId, teamId],
  );
  await db().query(
    `INSERT INTO org_team_admin_assignments (organization_id, username, team_id)
     VALUES ($1,$2,$3)
     ON CONFLICT DO NOTHING`,
    [organizationId, resolved, teamId],
  );

  await promoteMemberToTeamAdmin(organizationId, resolved);
  if (previousAdmin && previousAdmin !== resolved) {
    await reconcileTeamAdminMemberRole(organizationId, previousAdmin);
  }

  return { username: resolved };
}
