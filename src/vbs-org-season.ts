import { db } from "./db/pool.js";
import { canManageOrg, type OrgRole } from "./org-permissions.js";
import { getMembership } from "./orgs.js";

export type OrgMembershipSeason = {
  username: string;
  role: OrgRole;
  vbsSeasonYear: number;
  addedAt: string;
  removedAt: string | null;
};

export function isOrgSeasonAdmin(role: OrgRole | null, platformAdmin: boolean) {
  return platformAdmin || role === "org_admin";
}

export function parseSeasonYear(value: unknown): number | undefined {
  const year = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return undefined;
  }
  return year;
}

export async function getActiveVbsYear(organizationId: string) {
  const result = await db().query<{ active_vbs_year: number | null; event_year: number | null }>(
    `SELECT o.active_vbs_year, e.year AS event_year
     FROM organizations o
     LEFT JOIN vbs_events e ON e.id = o.active_vbs_event_id
     WHERE o.id = $1`,
    [organizationId],
  );
  const row = result.rows[0];
  if (!row) {
    return new Date().getFullYear();
  }
  return row.event_year ?? row.active_vbs_year ?? new Date().getFullYear();
}

export async function syncActiveVbsYear(organizationId: string, year: number) {
  await db().query(
    `UPDATE organizations SET active_vbs_year = $2
     WHERE id = $1`,
    [organizationId, year],
  );
  await db().query(
    `UPDATE vbs_events SET year = $2, updated_at = NOW()
     WHERE id = (SELECT active_vbs_event_id FROM organizations WHERE id = $1)
       AND (SELECT COUNT(*) FROM vbs_events WHERE organization_id = $1 AND year = $2) = 1`,
    [organizationId, year],
  );
}

export async function getMembershipSeason(
  organizationId: string,
  username: string,
): Promise<OrgMembershipSeason | null> {
  const result = await db().query<{
    username: string;
    role: OrgRole;
    vbs_season_year: number;
    added_at: Date;
    removed_at: Date | null;
  }>(
    `SELECT username, role, vbs_season_year, added_at, removed_at
     FROM organization_members
     WHERE organization_id = $1 AND username = $2`,
    [organizationId, username],
  );
  const row = result.rows[0];
  if (!row || row.removed_at) {
    return null;
  }
  return {
    username: row.username,
    role: row.role,
    vbsSeasonYear: row.vbs_season_year,
    addedAt: row.added_at.toISOString(),
    removedAt: null,
  };
}

type ResolvedSeasonAccess =
  | { ok: true; viewAllSeasons: true; activeSeason: number }
  | { ok: true; viewAllSeasons: false; viewSeason: number; activeSeason: number };

/** Plan and general org-wide season scope — org admin (and platform admin) only. */
export async function resolveViewerSeason(
  organizationId: string,
  username: string,
  platformAdmin: boolean,
): Promise<ResolvedSeasonAccess | { error: string }> {
  const activeSeason = await getActiveVbsYear(organizationId);
  const membership = await getMembershipSeason(organizationId, username);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" };
  }
  const role = membership?.role ?? null;
  if (isOrgSeasonAdmin(role, platformAdmin)) {
    return { ok: true, viewAllSeasons: true, activeSeason };
  }
  if (!membership) {
    return { error: "Not a member of this organization" };
  }
  return {
    ok: true,
    viewAllSeasons: false,
    viewSeason: membership.vbsSeasonYear,
    activeSeason,
  };
}

/** Registration roster — org admin, registration admin, and platform admin see every season. */
export async function resolveRegistrationViewerSeason(
  organizationId: string,
  username: string,
  platformAdmin: boolean,
): Promise<ResolvedSeasonAccess | { error: string }> {
  const activeSeason = await getActiveVbsYear(organizationId);
  const membership = await getMembershipSeason(organizationId, username);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" };
  }
  const role = membership?.role ?? null;
  if (platformAdmin || role === "org_admin" || role === "registration_admin") {
    return { ok: true, viewAllSeasons: true, activeSeason };
  }
  if (!membership) {
    return { error: "Not a member of this organization" };
  }
  return {
    ok: true,
    viewAllSeasons: false,
    viewSeason: membership.vbsSeasonYear,
    activeSeason,
  };
}

export async function assertPlanSeasonAccess(
  organizationId: string,
  username: string,
  platformAdmin: boolean,
  planYear: number,
) {
  const access = await resolveViewerSeason(organizationId, username, platformAdmin);
  if ("error" in access) {
    return access;
  }
  if (access.viewAllSeasons) {
    return { ok: true as const };
  }
  if (access.viewSeason !== planYear) {
    return {
      error: `Your access is for VBS ${access.viewSeason}. This plan is for VBS ${planYear}. Ask an org admin to add you to the current season or browse registration for your year.` as const,
    };
  }
  return { ok: true as const };
}

export async function seasonYearForNewMember(organizationId: string) {
  return getActiveVbsYear(organizationId);
}

export async function seasonYearForNewRegistration(organizationId: string) {
  return getActiveVbsYear(organizationId);
}

type ResolvedViewerSeason =
  | { ok: true; viewAllSeasons: true; activeSeason: number }
  | { ok: true; viewAllSeasons: false; viewSeason: number; activeSeason: number };

export function registrationStudentVisible(studentSeasonYear: number, access: ResolvedViewerSeason) {
  if (access.viewAllSeasons) {
    return true;
  }
  return studentSeasonYear === access.viewSeason;
}

/** Staff edits (add/update/delete) — non-admins only for their season while it is the active VBS year. */
export async function assertRegistrationWrite(
  organizationId: string,
  username: string,
  platformAdmin: boolean,
) {
  const access = await resolveRegistrationViewerSeason(organizationId, username, platformAdmin);
  if ("error" in access) {
    return access;
  }
  if (access.viewAllSeasons) {
    return { ok: true as const, access };
  }
  if (access.viewSeason !== access.activeSeason) {
    return {
      error: `Your account is for VBS ${access.viewSeason}. Registration edits are only available during the active VBS ${access.activeSeason} season.` as const,
    };
  }
  return { ok: true as const, access };
}
