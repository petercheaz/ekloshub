import { canManageOrgMembers, type OrgRole } from "./org-permissions.js";
import { getMembership } from "./orgs.js";
import { isPlatformAdmin } from "./users.js";
import { db } from "./db/pool.js";
import { parseSeasonYear } from "./vbs-org-season.js";

export const backgroundCheckStatuses = ["not_started", "pending", "cleared"] as const;
export type BackgroundCheckStatus = (typeof backgroundCheckStatuses)[number];

export function isBackgroundCheckStatus(value: string): value is BackgroundCheckStatus {
  return backgroundCheckStatuses.includes(value as BackgroundCheckStatus);
}

export const backgroundCheckStatusLabels: Record<BackgroundCheckStatus, string> = {
  not_started: "Not started",
  pending: "Pending",
  cleared: "Cleared",
};

async function requireComplianceViewer(organizationId: string, username: string) {
  if (await isPlatformAdmin(username)) {
    return { ok: true as const };
  }
  const membership = await getMembership(organizationId, username);
  if (!membership || !canManageOrgMembers(membership.role)) {
    return { error: "Only org admins or registration admins can view volunteer compliance" as const };
  }
  return { ok: true as const };
}

export async function listVolunteerCompliance(
  organizationId: string,
  username: string,
  viewingYear?: number,
) {
  const access = await requireComplianceViewer(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const { resolveRequestedVbsEvent } = await import("./vbs-event-context.js");
  const viewingEvent = await resolveRequestedVbsEvent(organizationId);
  const eventYear = viewingEvent?.year ?? parseSeasonYear(viewingYear);
  const eventMembers = viewingEvent
    ? new Set(
        (
          await db().query<{ username: string }>(
            `SELECT username FROM vbs_event_members WHERE event_id = $1`,
            [viewingEvent.id],
          )
        ).rows.map((row) => row.username),
      )
    : null;
  const result = await db().query<{
    username: string;
    role: OrgRole;
    background_check_status: string;
    first_name: string;
    last_name: string;
    email: string;
    removed_at: Date | null;
    vbs_season_year: number;
  }>(
    `SELECT m.username, m.role, m.background_check_status,
            u.first_name, u.last_name, u.email, m.removed_at, m.vbs_season_year
     FROM organization_members m
     JOIN users u ON u.username = m.username
     WHERE m.organization_id = $1 AND m.removed_at IS NULL
     ORDER BY LOWER(COALESCE(NULLIF(u.last_name, ''), m.username)), LOWER(u.first_name), m.username`,
    [organizationId],
  );
  const volunteers = result.rows
    .filter((row) => {
      if (eventMembers && eventMembers.size > 0) {
        return eventMembers.has(row.username);
      }
      return !eventYear || row.vbs_season_year === eventYear;
    })
    .map((row) => ({
    username: row.username,
    role: row.role,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    email: row.email ?? row.username,
    vbsSeasonYear: row.vbs_season_year,
    backgroundCheckStatus: isBackgroundCheckStatus(row.background_check_status)
      ? row.background_check_status
      : ("not_started" as const),
  }));
  const summary = {
    total: volunteers.length,
    notStarted: volunteers.filter((v) => v.backgroundCheckStatus === "not_started").length,
    pending: volunteers.filter((v) => v.backgroundCheckStatus === "pending").length,
    cleared: volunteers.filter((v) => v.backgroundCheckStatus === "cleared").length,
  };
  return { volunteers, summary, statusOptions: [...backgroundCheckStatuses] };
}

export async function updateVolunteerBackgroundCheck(
  organizationId: string,
  actor: string,
  memberUsername: string,
  status: string,
  viewingYear?: number,
) {
  const access = await requireComplianceViewer(organizationId, actor);
  if ("error" in access) {
    return access;
  }
  if (!isBackgroundCheckStatus(status)) {
    return { error: "Status must be not_started, pending, or cleared" as const };
  }
  const target = await db().query(
    `SELECT username FROM organization_members
     WHERE organization_id = $1 AND username = $2 AND removed_at IS NULL`,
    [organizationId, memberUsername],
  );
  if (!target.rows[0]) {
    return { error: "Member not found" as const };
  }
  await db().query(
    `UPDATE organization_members SET background_check_status = $3
     WHERE organization_id = $1 AND username = $2`,
    [organizationId, memberUsername, status],
  );
  return listVolunteerCompliance(organizationId, actor, viewingYear);
}
