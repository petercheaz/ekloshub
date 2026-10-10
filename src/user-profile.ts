import { db } from "./db/pool.js";
import { getMembership } from "./orgs.js";
import { listTeams } from "./teams.js";

export type OrgNotificationSettings = {
  organizationId: string;
  organizationName: string;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyBoardInApp: boolean;
  notifyBoardEmail: boolean;
  notifyBoardSms: boolean;
  boardSubscribeOrg: boolean;
  subscribedTeamIds: string[];
  mutedUsernames: string[];
  teams: { id: string; name: string }[];
};

export async function getNotificationProfile(username: string) {
  const orgs = await db().query<{ organization_id: string; name: string }>(
    `SELECT m.organization_id, o.name
     FROM organization_members m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.username = $1
     ORDER BY o.name`,
    [username],
  );

  const settings: OrgNotificationSettings[] = [];
  for (const org of orgs.rows) {
    const row = await db().query<{
      notify_email: boolean;
      notify_sms: boolean;
      notify_board_in_app: boolean;
      notify_board_email: boolean;
      notify_board_sms: boolean;
      board_subscribe_org: boolean;
    }>(
      `SELECT notify_email, notify_sms, notify_board_in_app, notify_board_email,
              notify_board_sms, board_subscribe_org
       FROM organization_members WHERE organization_id = $1 AND username = $2`,
      [org.organization_id, username],
    );
    const prefs = row.rows[0];
    if (!prefs) {
      continue;
    }

    const teamSubs = await db().query<{ team_id: string }>(
      `SELECT team_id FROM vbs_board_team_subscriptions
       WHERE organization_id = $1 AND username = $2`,
      [org.organization_id, username],
    );
    const mutes = await db().query<{ muted_username: string }>(
      `SELECT muted_username FROM user_board_mutes
       WHERE organization_id = $1 AND username = $2
       ORDER BY muted_username`,
      [org.organization_id, username],
    );
    const teams = await listTeams(org.organization_id);

    settings.push({
      organizationId: org.organization_id,
      organizationName: org.name,
      notifyEmail: prefs.notify_email,
      notifySms: prefs.notify_sms,
      notifyBoardInApp: prefs.notify_board_in_app,
      notifyBoardEmail: prefs.notify_board_email,
      notifyBoardSms: prefs.notify_board_sms,
      boardSubscribeOrg: prefs.board_subscribe_org,
      subscribedTeamIds: teamSubs.rows.map((r) => r.team_id),
      mutedUsernames: mutes.rows.map((r) => r.muted_username),
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
    });
  }

  return { organizations: settings };
}

export async function updateOrgNotificationProfile(
  orgId: string,
  username: string,
  input: {
    notifyEmail?: boolean;
    notifySms?: boolean;
    notifyBoardInApp?: boolean;
    notifyBoardEmail?: boolean;
    notifyBoardSms?: boolean;
    boardSubscribeOrg?: boolean;
    subscribedTeamIds?: string[];
    mutedUsernames?: string[];
  },
) {
  const membership = await getMembership(orgId, username);
  if (!membership) {
    return { error: "Not a member of this organization" as const };
  }

  const current = await db().query<{
    notify_email: boolean;
    notify_sms: boolean;
    notify_board_in_app: boolean;
    notify_board_email: boolean;
    notify_board_sms: boolean;
    board_subscribe_org: boolean;
  }>(
    `SELECT notify_email, notify_sms, notify_board_in_app, notify_board_email,
            notify_board_sms, board_subscribe_org
     FROM organization_members WHERE organization_id = $1 AND username = $2`,
    [orgId, username],
  );
  const c = current.rows[0];
  if (!c) {
    return { error: "Membership not found" as const };
  }

  await db().query(
    `UPDATE organization_members SET
       notify_email = $3,
       notify_sms = $4,
       notify_board_in_app = $5,
       notify_board_email = $6,
       notify_board_sms = $7,
       board_subscribe_org = $8
     WHERE organization_id = $1 AND username = $2`,
    [
      orgId,
      username,
      input.notifyEmail ?? c.notify_email,
      input.notifySms ?? c.notify_sms,
      input.notifyBoardInApp ?? c.notify_board_in_app,
      input.notifyBoardEmail ?? c.notify_board_email,
      input.notifyBoardSms ?? c.notify_board_sms,
      input.boardSubscribeOrg ?? c.board_subscribe_org,
    ],
  );

  if (input.subscribedTeamIds) {
    const teams = await listTeams(orgId);
    const valid = new Set(teams.map((t) => t.id));
    const ids = [...new Set(input.subscribedTeamIds.filter((id) => valid.has(id)))];
    await db().query(
      `DELETE FROM vbs_board_team_subscriptions WHERE organization_id = $1 AND username = $2`,
      [orgId, username],
    );
    for (const teamId of ids) {
      await db().query(
        `INSERT INTO vbs_board_team_subscriptions (organization_id, username, team_id)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [orgId, username, teamId],
      );
    }
  }

  if (input.mutedUsernames) {
    const muted = [...new Set(input.mutedUsernames.map((u) => u.trim()).filter(Boolean))].filter(
      (u) => u !== username,
    );
    await db().query(`DELETE FROM user_board_mutes WHERE organization_id = $1 AND username = $2`, [
      orgId,
      username,
    ]);
    for (const mutedUsername of muted) {
      const exists = await db().query(`SELECT 1 FROM users WHERE username = $1`, [mutedUsername]);
      if (exists.rowCount) {
        await db().query(
          `INSERT INTO user_board_mutes (organization_id, username, muted_username)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [orgId, username, mutedUsername],
        );
      }
    }
  }

  return getNotificationProfile(username);
}
