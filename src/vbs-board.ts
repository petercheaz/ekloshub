import { db } from "./db/pool.js";
import { deliverOrgNotifications } from "./notify-delivery.js";
import { canWriteRole, getMembership } from "./orgs.js";
import { getTeam, listTeams, listTeamsForViewer } from "./teams.js";
import { isPlatformAdmin } from "./users.js";

function planBoardLink(orgId: string) {
  return `/org/${orgId}/vbs-plan?tab=board`;
}

async function getPlanIdForOrg(orgId: string) {
  const result = await db().query<{ id: string }>(
    "SELECT id FROM vbs_plans WHERE organization_id = $1 LIMIT 1",
    [orgId],
  );
  return result.rows[0]?.id ?? null;
}

function viewerTeamIds(
  teams: Awaited<ReturnType<typeof listTeamsForViewer>>,
  username: string,
) {
  return new Set(teams.filter((t) => t.memberUsernames.includes(username)).map((t) => t.id));
}

function canViewPost(teamId: string | null, teamIds: Set<string>, seesAllTeams: boolean) {
  if (!teamId) {
    return true;
  }
  return seesAllTeams || teamIds.has(teamId);
}

async function mutedPosters(orgId: string, username: string) {
  const result = await db().query<{ muted_username: string }>(
    `SELECT muted_username FROM user_board_mutes
     WHERE organization_id = $1 AND username = $2`,
    [orgId, username],
  );
  return new Set(result.rows.map((r) => r.muted_username));
}

async function deliverBoardNotifications(
  orgId: string,
  teamId: string | null,
  poster: string,
  title: string,
  body: string,
  exclude: string[] = [],
) {
  const teams = await listTeams(orgId);
  const team = teamId ? teams.find((t) => t.id === teamId) : null;
  const base = new Set<string>();

  if (teamId && team) {
    for (const name of team.memberUsernames) {
      base.add(name);
    }
    const subs = await db().query<{ username: string }>(
      `SELECT username FROM vbs_board_team_subscriptions
       WHERE organization_id = $1 AND team_id = $2`,
      [orgId, teamId],
    );
    for (const row of subs.rows) {
      base.add(row.username);
    }
  } else {
    const members = await db().query<{ username: string }>(
      `SELECT username FROM organization_members
       WHERE organization_id = $1 AND board_subscribe_org = TRUE`,
      [orgId],
    );
    for (const row of members.rows) {
      base.add(row.username);
    }
  }

  base.delete(poster);
  for (const name of exclude) {
    base.delete(name);
  }

  for (const name of base) {
    const mutes = await mutedPosters(orgId, name);
    if (mutes.has(poster)) {
      continue;
    }
    const prefsResult = await db().query<{
      notify_board_in_app: boolean;
      notify_board_email: boolean;
      notify_board_sms: boolean;
    }>(
      `SELECT notify_board_in_app, notify_board_email, notify_board_sms
       FROM organization_members WHERE organization_id = $1 AND username = $2`,
      [orgId, name],
    );
    const p = prefsResult.rows[0];
    if (!p) {
      continue;
    }
    await deliverOrgNotifications(orgId, [name], title, body, planBoardLink(orgId), {
      inApp: p.notify_board_in_app,
      email: p.notify_board_email,
      sms: p.notify_board_sms,
    });
  }
}

export async function listBoardPosts(orgId: string, username: string) {
  const membership = await getMembership(orgId, username);
  if (!membership) {
    return { error: "Not a member of this organization" as const };
  }
  const planId = await getPlanIdForOrg(orgId);
  if (!planId) {
    return { boardPosts: [] as const };
  }

  const platformAdmin = await isPlatformAdmin(username);
  const teams = await listTeamsForViewer(orgId, username, platformAdmin);
  const teamIds = viewerTeamIds(teams, username);
  const seesAllTeams = platformAdmin || membership.role === "org_admin";

  const posts = await db().query<{
    id: string;
    plan_id: string;
    title: string;
    body: string;
    created_by: string;
    created_at: Date;
    team_id: string | null;
  }>(
    `SELECT id, plan_id, title, body, created_by, created_at, team_id
     FROM vbs_board_posts WHERE plan_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [planId],
  );

  const visible = posts.rows.filter((row) =>
    canViewPost(row.team_id, teamIds, seesAllTeams),
  );
  const postIds = visible.map((p) => p.id);
  const replies =
    postIds.length === 0
      ? []
      : (
          await db().query<{
            id: string;
            post_id: string;
            body: string;
            created_by: string;
            created_at: Date;
          }>(
            `SELECT id, post_id, body, created_by, created_at
             FROM vbs_board_replies WHERE post_id = ANY($1::text[])
             ORDER BY created_at ASC`,
            [postIds],
          )
        ).rows;

  const repliesByPost = new Map<string, typeof replies>();
  for (const reply of replies) {
    const list = repliesByPost.get(reply.post_id) ?? [];
    list.push(reply);
    repliesByPost.set(reply.post_id, list);
  }

  const teamName = (id: string | null) => (id ? (teams.find((t) => t.id === id)?.name ?? "") : "");

  return {
    boardPosts: visible.map((row) => ({
      id: row.id,
      planId: row.plan_id,
      title: row.title,
      body: row.body,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      teamId: row.team_id ?? "",
      teamName: teamName(row.team_id),
      replies: (repliesByPost.get(row.id) ?? []).map((r) => ({
        id: r.id,
        postId: r.post_id,
        body: r.body,
        createdBy: r.created_by,
        createdAt: r.created_at.toISOString(),
      })),
    })),
  };
}

export async function createBoardPost(
  orgId: string,
  username: string,
  input: { title: string; body: string; teamId: string },
) {
  const membership = await getMembership(orgId, username);
  if (!membership) {
    return { error: "Not a member of this organization" as const };
  }
  const planId = await getPlanIdForOrg(orgId);
  if (!planId) {
    return { error: "Create a VBS plan first" as const };
  }

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) {
    return { error: "Title and message are required" as const };
  }

  const teamId = input.teamId.trim() || null;
  const platformAdmin = await isPlatformAdmin(username);
  const teams = await listTeamsForViewer(orgId, username, platformAdmin);
  const teamIds = viewerTeamIds(teams, username);
  const canWrite = canWriteRole(membership.role);

  if (teamId) {
    const team = await getTeam(orgId, teamId);
    if (!team) {
      return { error: "Team not found" as const };
    }
    if (!canWrite && !teamIds.has(teamId)) {
      return { error: "You can only post to teams you belong to" as const };
    }
  } else if (!canWrite) {
    return { error: "Only coordinators can post organization-wide" as const };
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db().query(
    `INSERT INTO vbs_board_posts (id, plan_id, title, body, created_by, created_at, team_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, planId, title, body, username, createdAt, teamId],
  );

  const audience = teamId ? `Team: ${teams.find((t) => t.id === teamId)?.name ?? "team"}` : "Organization";
  await deliverBoardNotifications(
    orgId,
    teamId,
    username,
    `VBS board: ${title}`,
    `${audience} — ${body.slice(0, 200)}`,
  );

  return {
    post: {
      id,
      planId,
      title,
      body,
      createdBy: username,
      createdAt,
      teamId: teamId ?? "",
      replies: [],
    },
  };
}

export async function createBoardReply(
  orgId: string,
  username: string,
  postId: string,
  bodyInput: string,
) {
  const membership = await getMembership(orgId, username);
  if (!membership) {
    return { error: "Not a member of this organization" as const };
  }
  const body = bodyInput.trim();
  if (!body) {
    return { error: "Reply is required" as const };
  }

  const postRow = await db().query<{
    id: string;
    plan_id: string;
    title: string;
    team_id: string | null;
    created_by: string;
  }>(
    `SELECT p.id, p.plan_id, p.title, p.team_id, p.created_by
     FROM vbs_board_posts p
     JOIN vbs_plans pl ON pl.id = p.plan_id
     WHERE p.id = $1 AND pl.organization_id = $2`,
    [postId, orgId],
  );
  const post = postRow.rows[0];
  if (!post) {
    return { error: "Post not found" as const };
  }

  const platformAdmin = await isPlatformAdmin(username);
  const teams = await listTeamsForViewer(orgId, username, platformAdmin);
  const teamIds = viewerTeamIds(teams, username);
  const seesAllTeams = platformAdmin || membership.role === "org_admin";
  if (!canViewPost(post.team_id, teamIds, seesAllTeams)) {
    return { error: "You cannot reply to this post" as const };
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db().query(
    `INSERT INTO vbs_board_replies (id, post_id, body, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, postId, body, username, createdAt],
  );

  await deliverBoardNotifications(
    orgId,
    post.team_id,
    username,
    `Reply on: ${post.title}`,
    body.slice(0, 200),
    [username],
  );

  if (post.created_by !== username) {
    const mutes = await mutedPosters(orgId, post.created_by);
    if (!mutes.has(username)) {
      const prefsResult = await db().query<{
        notify_board_in_app: boolean;
        notify_board_email: boolean;
        notify_board_sms: boolean;
      }>(
        `SELECT notify_board_in_app, notify_board_email, notify_board_sms
         FROM organization_members WHERE organization_id = $1 AND username = $2`,
        [orgId, post.created_by],
      );
      const p = prefsResult.rows[0];
      if (p) {
        await deliverOrgNotifications(
          orgId,
          [post.created_by],
          `Reply on your post: ${post.title}`,
          body.slice(0, 200),
          planBoardLink(orgId),
          {
            inApp: p.notify_board_in_app,
            email: p.notify_board_email,
            sms: p.notify_board_sms,
          },
        );
      }
    }
  }

  return {
    reply: {
      id,
      postId,
      body,
      createdBy: username,
      createdAt,
    },
  };
}
