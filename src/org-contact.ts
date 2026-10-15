import { db } from "./db/pool.js";
import { sendMail } from "./mail.js";
import { deliverOrgNotifications } from "./notify-delivery.js";
import { canContactOrg, canManageRegistration, getMembership } from "./orgs.js";
import { isPlatformAdmin } from "./users.js";
import { listTeams } from "./teams.js";
import { findUser } from "./users.js";
import { normalizeRegistrationEmail } from "./vbs-registration.js";

const MAX_OUTREACH_SUBJECT = 200;
const MAX_OUTREACH_BODY = 5000;
const MAX_PARENT_RECIPIENTS = 500;
const MAX_PARENT_SENDS_PER_HOUR = 4;
const parentSendBuckets = new Map<string, number[]>();

function checkParentSendRateLimit(orgId: string) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const hits = (parentSendBuckets.get(orgId) ?? []).filter((time) => now - time < windowMs);
  if (hits.length >= MAX_PARENT_SENDS_PER_HOUR) {
    return false;
  }
  hits.push(now);
  parentSendBuckets.set(orgId, hits);
  return true;
}

function collectEmailsFromRow(row: { contact1_email: string; contact2_email: string }) {
  const emails = new Set<string>();
  for (const raw of [row.contact1_email, row.contact2_email]) {
    const normalized = normalizeRegistrationEmail(raw ?? "");
    if (normalized) {
      emails.add(normalized);
    }
  }
  return emails;
}

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

async function parentEmailStats(organizationId: string, classId?: string) {
  const rows = await db().query<{ contact1_email: string; contact2_email: string; class_id: string | null }>(
    classId
      ? `SELECT contact1_email, contact2_email, class_id FROM vbs_registrations
         WHERE organization_id = $1 AND class_id = $2`
      : `SELECT contact1_email, contact2_email, class_id FROM vbs_registrations WHERE organization_id = $1`,
    classId ? [organizationId, classId] : [organizationId],
  );
  const emails = new Set<string>();
  for (const row of rows.rows) {
    for (const email of collectEmailsFromRow(row)) {
      emails.add(email);
    }
  }
  return { studentCount: rows.rows.length, familyEmailCount: emails.size };
}

export async function getContactOptions(organizationId: string, actor: string) {
  const platformAdmin = await isPlatformAdmin(actor);
  const membership = await getMembership(organizationId, actor);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" as const };
  }
  const role = membership?.role ?? "org_admin";
  const canVolunteers = canContactOrg(role) || platformAdmin;
  const canParents = canManageRegistration(role) || platformAdmin;
  if (!canVolunteers && !canParents) {
    return { error: "You do not have permission to send outreach for this organization" as const };
  }

  const allTeams = await listTeams(organizationId);
  let teams = allTeams.map((t) => ({ id: t.id, name: t.name, memberCount: t.memberUsernames.length }));
  let canContactWholeOrg = role === "org_admin" || platformAdmin;

  if (role === "org_team_admin") {
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

  const parentAll = canParents ? await parentEmailStats(organizationId) : { studentCount: 0, familyEmailCount: 0 };
  let registrationClasses: { id: string; name: string; studentCount: number; familyEmailCount: number }[] = [];
  if (canParents) {
    const { listRegistrationClasses } = await import("./vbs-registration-classes.js");
    const classes = await listRegistrationClasses(organizationId);
    registrationClasses = await Promise.all(
      classes.map(async (c) => {
        const stats = await parentEmailStats(organizationId, c.id);
        return { id: c.id, name: c.name, ...stats };
      }),
    );
  }

  return {
    canContactVolunteers: canVolunteers,
    canContactParents: canParents,
    canContactWholeOrg,
    teams,
    memberCount: memberCount ?? 0,
    role,
    parentAll,
    registrationClasses,
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

export async function sendParentContact(
  organizationId: string,
  actor: string,
  input: { subject: string; message: string; scope: "all" | "class"; classId?: string },
) {
  const platformAdmin = await isPlatformAdmin(actor);
  const membership = await getMembership(organizationId, actor);
  const role = membership?.role ?? null;
  if (!canManageRegistration(role) && !platformAdmin) {
    return { error: "You do not have permission to email registered families" as const };
  }
  if (!checkParentSendRateLimit(organizationId)) {
    return { error: "Too many family email sends this hour. Try again later." as const };
  }

  const subject = input.subject.trim().slice(0, MAX_OUTREACH_SUBJECT);
  const message = input.message.trim().slice(0, MAX_OUTREACH_BODY);
  if (!subject || !message) {
    return { error: "Subject and message are required" as const };
  }

  const classId = input.scope === "class" ? input.classId?.trim() : "";
  if (input.scope === "class") {
    if (!classId) {
      return { error: "Select a class" as const };
    }
    const { listRegistrationClasses } = await import("./vbs-registration-classes.js");
    const classes = await listRegistrationClasses(organizationId);
    if (!classes.some((c) => c.id === classId)) {
      return { error: "Class not found" as const };
    }
  }

  const rows = await db().query<{ contact1_email: string; contact2_email: string }>(
    input.scope === "class"
      ? `SELECT contact1_email, contact2_email FROM vbs_registrations
         WHERE organization_id = $1 AND class_id = $2`
      : `SELECT contact1_email, contact2_email FROM vbs_registrations WHERE organization_id = $1`,
    input.scope === "class" ? [organizationId, classId] : [organizationId],
  );

  const emails = new Set<string>();
  for (const row of rows.rows) {
    for (const email of collectEmailsFromRow(row)) {
      emails.add(email);
    }
  }

  if (emails.size === 0) {
    return {
      error:
        "No parent/guardian emails on file for that selection. Add emails on student registrations first." as const,
    };
  }
  if (emails.size > MAX_PARENT_RECIPIENTS) {
    return {
      error: `Too many recipients (${emails.size}). Narrow the audience or contact support.` as const,
    };
  }

  const org = await db().query<{ name: string }>(`SELECT name FROM organizations WHERE id = $1`, [organizationId]);
  const orgName = org.rows[0]?.name ?? "Your church";
  const title = `${orgName} VBS: ${subject}`;
  const footer = `\n\n—\nYou received this because a child in your care is registered for Vacation Bible School at ${orgName}. This message was sent by authorized church staff. Please reply to the church directly, not to this automated address.`;
  const body = `${message}${footer}`;

  let sent = 0;
  for (const to of emails) {
    await sendMail(to, title, body);
    sent += 1;
  }

  return {
    ok: true as const,
    recipientCount: sent,
    skippedNoEmail: Math.max(0, rows.rows.length - sent),
  };
}
