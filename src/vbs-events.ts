import { db } from "./db/pool.js";
import {
  canManageOrg,
  canManageRegistration,
  canWriteRole,
} from "./org-permissions.js";
import { getMembership } from "./orgs.js";
import { isPlatformAdmin } from "./users.js";
import {
  addMemberToVbsEvent,
  defaultProjectNameFromDates,
  ensureEventHasUniqueName,
  eventLabel,
  getActiveVbsEvent,
  getVbsEvent,
  listMemberEventIds,
  publisherNameFor,
  sessionNameFromDates,
  setActiveVbsEvent,
  uniqueEventName,
  type VbsEventRow,
} from "./vbs-event-context.js";
import { parseSeasonYear } from "./vbs-org-season.js";

export type OrgVbsEvent = {
  id: string;
  year: number;
  name: string;
  label: string;
  programTitle: string;
  publisherId: string;
  publisherName: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isDefault: boolean;
  hasPlan: boolean;
  hasRegistrations: boolean;
  hasMembers: boolean;
};

async function requireOrgMember(organizationId: string, username: string) {
  const platformAdmin = await isPlatformAdmin(username);
  const membership = await getMembership(organizationId, username);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" as const };
  }
  const role = membership?.role ?? null;
  return {
    ok: true as const,
    platformAdmin,
    role,
    canSwitchEvents:
      platformAdmin || canManageOrg(role) || canManageRegistration(role) || canWriteRole(role),
    canMakeCurrent: platformAdmin || canManageOrg(role),
    canCreateEvent: platformAdmin || canManageOrg(role),
    viewAllEvents:
      platformAdmin || canManageOrg(role) || canManageRegistration(role),
  };
}

function presentEvent(
  row: VbsEventRow & {
    has_plan?: boolean;
    has_registrations?: boolean;
    has_members?: boolean;
    start_date?: Date | string | null;
    end_date?: Date | string | null;
  },
  currentId: string | null,
  defaultId: string | null,
): OrgVbsEvent {
  const programTitle = row.program_title ?? "";
  const startDate = typeof row.start_date === "string"
    ? row.start_date.slice(0, 10)
    : row.start_date
      ? row.start_date.toISOString().slice(0, 10)
      : "";
  const endDate = typeof row.end_date === "string"
    ? row.end_date.slice(0, 10)
    : row.end_date
      ? row.end_date.toISOString().slice(0, 10)
      : "";
  return {
    id: row.id,
    year: row.year,
    name: row.name ?? "",
    label: eventLabel(row.year, programTitle, row.name ?? ""),
    programTitle,
    publisherId: row.publisher_id ?? "",
    publisherName: publisherNameFor(row.publisher_id ?? ""),
    startDate,
    endDate,
    isCurrent: row.id === currentId,
    isDefault: row.id === defaultId,
    hasPlan: row.has_plan === true,
    hasRegistrations: row.has_registrations === true,
    hasMembers: row.has_members === true,
  };
}

export async function listOrgVbsEvents(organizationId: string, username: string) {
  const access = await requireOrgMember(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const active = await getActiveVbsEvent(organizationId);
  const defaultRow = await db().query<{ default_vbs_event_id: string | null }>(
    `SELECT default_vbs_event_id FROM organization_members
     WHERE organization_id = $1 AND username = $2`,
    [organizationId, username],
  );
  const defaultEventId = defaultRow.rows[0]?.default_vbs_event_id ?? null;
  const rows = await db().query<
    VbsEventRow & {
      has_plan: boolean;
      has_registrations: boolean;
      has_members: boolean;
      start_date: Date | null;
      end_date: Date | null;
    }
  >(
    `SELECT e.id, e.organization_id, e.year, e.name, e.publisher_id, e.program_title,
            p.start_date, p.end_date,
            EXISTS (SELECT 1 FROM vbs_plans plan WHERE plan.event_id = e.id) AS has_plan,
            EXISTS (SELECT 1 FROM vbs_registrations r WHERE r.vbs_event_id = e.id) AS has_registrations,
            EXISTS (SELECT 1 FROM vbs_event_members m WHERE m.event_id = e.id) AS has_members
     FROM vbs_events e
     LEFT JOIN vbs_plans p ON p.event_id = e.id
     WHERE e.organization_id = $1
     ORDER BY e.year DESC, p.start_date NULLS LAST, e.name ASC`,
    [organizationId],
  );
  for (const row of rows.rows) {
    if (!row.name.trim()) {
      row.name = await ensureEventHasUniqueName(organizationId, row, {
        startDate: row.start_date,
        endDate: row.end_date,
      });
    }
  }
  let events = rows.rows.map((row) => presentEvent(row, active?.id ?? null, defaultEventId));
  if (!access.viewAllEvents) {
    const memberIds = new Set(await listMemberEventIds(organizationId, username));
    events = events.filter(
      (event) => memberIds.has(event.id) || event.isDefault || event.isCurrent,
    );
    if (events.length === 0) {
      events = rows.rows
        .filter((row) => row.id === active?.id)
        .map((row) => presentEvent(row, active?.id ?? null, defaultEventId));
    }
  }
  return {
    currentVbsYear: active?.year ?? new Date().getFullYear(),
    currentEventId: active?.id ?? null,
    defaultEventId,
    livePlanYear: active?.year ?? null,
    events,
    canSwitchEvents: access.canSwitchEvents || events.length > 1,
    canMakeCurrent: access.canMakeCurrent,
    canCreateEvent: access.canCreateEvent,
  };
}

export async function activateOrgVbsEvent(
  organizationId: string,
  username: string,
  yearOrEvent: unknown,
) {
  const access = await requireOrgMember(organizationId, username);
  if ("error" in access) {
    return access;
  }
  if (!access.canMakeCurrent) {
    return { error: "Only org admins can change the current VBS" as const };
  }
  const eventId = typeof yearOrEvent === "string" ? yearOrEvent.trim() : "";
  let target = eventId ? await getVbsEvent(organizationId, eventId) : null;
  if (!target) {
    const year = parseSeasonYear(yearOrEvent);
    if (year) {
      const match = await db().query<VbsEventRow>(
        `SELECT id, organization_id, year, name, publisher_id, program_title
         FROM vbs_events WHERE organization_id = $1 AND year = $2
         ORDER BY name LIMIT 1`,
        [organizationId, year],
      );
      target = match.rows[0] ?? null;
    }
  }
  if (!target) {
    return { error: "Choose a valid VBS event" as const };
  }
  await setActiveVbsEvent(organizationId, target.id);
  return listOrgVbsEvents(organizationId, username);
}

export async function setPersonalVbsEventDefault(
  organizationId: string,
  username: string,
  eventIdValue: unknown,
) {
  const access = await requireOrgMember(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const eventId = typeof eventIdValue === "string" ? eventIdValue.trim() : "";
  const event = eventId ? await getVbsEvent(organizationId, eventId) : null;
  if (!event) {
    return { error: "Choose a valid VBS event" as const };
  }
  if (!access.viewAllEvents) {
    const memberIds = await listMemberEventIds(organizationId, username);
    if (memberIds.length > 0 && !memberIds.includes(event.id)) {
      return { error: "You can only default a VBS you belong to" as const };
    }
  }
  await addMemberToVbsEvent(organizationId, username, event.id);
  await db().query(
    `UPDATE organization_members SET default_vbs_event_id = $3
     WHERE organization_id = $1 AND username = $2`,
    [organizationId, username, event.id],
  );
  return listOrgVbsEvents(organizationId, username);
}

export async function createOrgVbsEvent(
  organizationId: string,
  username: string,
  input: {
    fromEventId?: string;
    year?: number;
    name?: string;
    startDate?: string;
    endDate?: string;
    makeCurrent?: boolean;
  },
) {
  const access = await requireOrgMember(organizationId, username);
  if ("error" in access) {
    return access;
  }
  if (!access.canCreateEvent) {
    return { error: "Only org admins can add a VBS event" as const };
  }
  const { copyVbsSeasonToNewEvent } = await import("./vbs-season-copy.js");
  const sourceId = input.fromEventId?.trim();
  const source = sourceId
    ? await getVbsEvent(organizationId, sourceId)
    : await getActiveVbsEvent(organizationId);
  if (!source) {
    return { error: "Choose a VBS to copy from" as const };
  }
  const year = parseSeasonYear(input.year) ?? source.year;
  const explicitName = typeof input.name === "string" ? input.name.trim() : "";
  const duplicateName =
    explicitName || (input.startDate || input.endDate ? "" : source.name.trim()) || undefined;
  const copied = await copyVbsSeasonToNewEvent(organizationId, username, {
    fromEventId: source.id,
    toYear: year,
    name: duplicateName,
    startDate: input.startDate,
    endDate: input.endDate,
    makeCurrent: input.makeCurrent === true,
  });
  if ("error" in copied || !("eventId" in copied)) {
    return "error" in copied ? copied : { error: "Could not create the VBS event" as const };
  }
  const listed = await listOrgVbsEvents(organizationId, username);
  if ("error" in listed) {
    return listed;
  }
  return { ...listed, createdEventId: copied.eventId };
}

export async function renameOrgVbsEvent(
  organizationId: string,
  username: string,
  eventIdValue: unknown,
  nameValue: unknown,
) {
  const access = await requireOrgMember(organizationId, username);
  if ("error" in access) {
    return access;
  }
  if (!access.canCreateEvent) {
    return { error: "Only org admins can rename a VBS project" as const };
  }
  const eventId = typeof eventIdValue === "string" ? eventIdValue.trim() : "";
  const event = eventId ? await getVbsEvent(organizationId, eventId) : null;
  if (!event) {
    return { error: "Choose a valid VBS project" as const };
  }
  const typed = typeof nameValue === "string" ? nameValue.trim() : "";
  let preferred = typed;
  if (!preferred) {
    const dates = await db().query<{ start_date: Date | null; end_date: Date | null }>(
      `SELECT start_date, end_date FROM vbs_plans WHERE event_id = $1`,
      [event.id],
    );
    preferred =
      defaultProjectNameFromDates(dates.rows[0]?.start_date, dates.rows[0]?.end_date) ||
      sessionNameFromDates(dates.rows[0]?.start_date, dates.rows[0]?.end_date) ||
      "Session";
  }
  const name = await uniqueEventName(organizationId, event.year, preferred, event.id);
  await db().query(`UPDATE vbs_events SET name = $2, updated_at = NOW() WHERE id = $1`, [event.id, name]);
  return listOrgVbsEvents(organizationId, username);
}

async function deleteVbsEventRegistrationData(organizationId: string, eventId: string) {
  const classes = await db().query<{ id: string }>(
    `SELECT id FROM vbs_registration_classes WHERE organization_id = $1 AND vbs_event_id = $2`,
    [organizationId, eventId],
  );
  const classIds = classes.rows.map((row) => row.id);
  if (classIds.length > 0) {
    await db().query(`DELETE FROM vbs_registration_class_students WHERE class_id = ANY($1::text[])`, [classIds]);
    await db().query(`DELETE FROM vbs_registration_class_staff WHERE class_id = ANY($1::text[])`, [classIds]);
    await db().query(`DELETE FROM vbs_registration_classes WHERE id = ANY($1::text[])`, [classIds]);
  }
  await db().query(`DELETE FROM vbs_registrations WHERE organization_id = $1 AND vbs_event_id = $2`, [
    organizationId,
    eventId,
  ]);
}

export async function deleteOrgVbsEvent(organizationId: string, username: string, eventIdValue: unknown) {
  const access = await requireOrgMember(organizationId, username);
  if ("error" in access) {
    return access;
  }
  if (!access.canCreateEvent) {
    return { error: "Only org admins can delete a VBS project" as const };
  }
  const eventId = typeof eventIdValue === "string" ? eventIdValue.trim() : "";
  const event = eventId ? await getVbsEvent(organizationId, eventId) : null;
  if (!event) {
    return { error: "Choose a valid VBS project" as const };
  }
  const countRow = await db().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM vbs_events WHERE organization_id = $1`,
    [organizationId],
  );
  if ((countRow.rows[0]?.count ?? 0) <= 1) {
    return { error: "Keep at least one VBS project for this church" as const };
  }
  const active = await getActiveVbsEvent(organizationId);
  if (active?.id === event.id) {
    const fallback = await db().query<{ id: string; year: number }>(
      `SELECT id, year FROM vbs_events
       WHERE organization_id = $1 AND id <> $2
       ORDER BY year DESC, name ASC
       LIMIT 1`,
      [organizationId, event.id],
    );
    const next = fallback.rows[0];
    if (next) {
      await setActiveVbsEvent(organizationId, next.id);
    }
  }
  await deleteVbsEventRegistrationData(organizationId, event.id);
  await db().query(`DELETE FROM vbs_events WHERE id = $1 AND organization_id = $2`, [event.id, organizationId]);
  return listOrgVbsEvents(organizationId, username);
}
