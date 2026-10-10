import { db } from "./db/pool.js";
import { deliverOrgNotifications } from "./notify-delivery.js";
import { canContactOrg, getMembership } from "./orgs.js";
import { listTeams } from "./teams.js";
import { findUser } from "./users.js";

function parseMemberList(raw: string) {
  return [...new Set(raw.split(/[,;]+/).map((item) => item.trim()).filter(Boolean))];
}

export async function listTeamAdminTeamIds(organizationId: string, username: string) {
  const result = await db().query<{ team_id: string }>(
    `SELECT team_id FROM org_team_admin_assignments
     WHERE organization_id = $1 AND username = $2
     UNION
     SELECT id AS team_id FROM org_teams
     WHERE organization_id = $1 AND team_admin_username = $2`,
    [organizationId, username],
  );
  return [...new Set(result.rows.map((row) => row.team_id))];
}

export async function syncTeamAdminAssignments(
  organizationId: string,
  username: string,
  role: string,
  teamIds: string[],
): Promise<{ error?: string }> {
  const { assignPrimaryTeamAdmin, promoteMemberToTeamAdmin, reconcileTeamAdminMemberRole } = await import(
    "./team-admin.js"
  );
  const previousIds = await listTeamAdminTeamIds(organizationId, username);

  if (role !== "org_team_admin") {
    await db().query(
      `DELETE FROM org_team_admin_assignments WHERE organization_id = $1 AND username = $2`,
      [organizationId, username],
    );
    await db().query(
      `UPDATE org_teams SET team_admin_username = NULL
       WHERE organization_id = $1 AND team_admin_username = $2`,
      [organizationId, username],
    );
    await reconcileTeamAdminMemberRole(organizationId, username);
    return {};
  }

  const next = [...new Set(teamIds)];
  for (const teamId of next) {
    const result = await assignPrimaryTeamAdmin(organizationId, teamId, username);
    if ("error" in result) {
      return { error: result.error };
    }
  }
  const removed = previousIds.filter((id) => !next.includes(id));
  for (const teamId of removed) {
    await db().query(
      `DELETE FROM org_team_admin_assignments
       WHERE organization_id = $1 AND username = $2 AND team_id = $3`,
      [organizationId, username, teamId],
    );
    await db().query(
      `UPDATE org_teams SET team_admin_username = NULL
       WHERE organization_id = $1 AND id = $2 AND team_admin_username = $3`,
      [organizationId, teamId, username],
    );
  }
  await promoteMemberToTeamAdmin(organizationId, username);
  await reconcileTeamAdminMemberRole(organizationId, username);
  return {};
}

export async function getContactOptions(organizationId: string, actor: string) {
  const membership = await getMembership(organizationId, actor);
  if (!membership || !canContactOrg(membership.role)) {
    return { error: "Only org admins and team admins can send org contact messages" as const };
  }
  const allTeams = await listTeams(organizationId);
  let teams = allTeams.map((t) => ({ id: t.id, name: t.name, memberCount: t.memberUsernames.length }));
  let canContactWholeOrg = membership.role === "org_admin";

  if (membership.role === "org_team_admin") {
    const allowed = new Set(await listTeamAdminTeamIds(organizationId, actor));
    teams = teams.filter((t) => allowed.has(t.id));
    canContactWholeOrg = false;
  }

  const memberCount = (
    await db().query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM organization_members WHERE organization_id = $1`,
      [organizationId],
    )
  ).rows[0]?.count;

  return {
    canContactWholeOrg,
    teams,
    memberCount: memberCount ?? 0,
    role: membership.role,
  };
}

export async function sendOrgContact(
  organizationId: string,
  actor: string,
  input: { subject: string; message: string; scope: "organization" | "teams"; teamIds?: string[] },
) {
  const membership = await getMembership(organizationId, actor);
  if (!membership || !canContactOrg(membership.role)) {
    return { error: "Only org admins and team admins can send org contact messages" as const };
  }

  const subject = input.subject.trim();
  const message = input.message.trim();
  if (!subject || !message) {
    return { error: "Subject and message are required" as const };
  }

  const org = await db().query<{ name: string }>(`SELECT name FROM organizations WHERE id = $1`, [
    organizationId,
  ]);
  const orgName = org.rows[0]?.name ?? "Your organization";

  let recipients: string[] = [];

  if (input.scope === "organization") {
    if (membership.role !== "org_admin") {
      return { error: "Only org admins can message the whole organization" as const };
    }
    const rows = await db().query<{ username: string }>(
      `SELECT username FROM organization_members WHERE organization_id = $1`,
      [organizationId],
    );
    recipients = rows.rows.map((r) => r.username);
  } else {
    const teamIds = [...new Set((input.teamIds ?? []).filter(Boolean))];
    if (teamIds.length === 0) {
      return { error: "Select at least one team" as const };
    }
    const allTeams = await listTeams(organizationId);
    const byId = new Map(allTeams.map((t) => [t.id, t]));

    if (membership.role === "org_team_admin") {
      const allowed = new Set(await listTeamAdminTeamIds(organizationId, actor));
      for (const id of teamIds) {
        if (!allowed.has(id)) {
          return { error: "You can only contact teams you administer" as const };
        }
      }
    }

    const usernames = new Set<string>();
    for (const teamId of teamIds) {
      const team = byId.get(teamId);
      if (!team) {
        return { error: "Unknown team selected" as const };
      }
      const tokens = [...new Set([...team.memberUsernames, ...parseMemberList(team.members)])];
      for (const token of tokens) {
        const username = await findUser(token);
        if (username) {
          usernames.add(username);
        }
      }
    }
    recipients = [...usernames];
  }

  recipients = recipients.filter((u) => u !== actor);
  if (recipients.length === 0) {
    return { error: "No recipients matched your selection" as const };
  }

  const title = `${orgName}: ${subject}`;
  const link = `/org/${organizationId}/messages`;

  await deliverOrgNotifications(organizationId, recipients, title, message, link, {
    inApp: true,
    email: true,
    sms: true,
  });

  return {
    ok: true as const,
    recipientCount: recipients.length,
  };
}
