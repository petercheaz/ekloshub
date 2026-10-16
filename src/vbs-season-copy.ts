import crypto from "node:crypto";
import { programs } from "./curriculum.js";
import { db } from "./db/pool.js";
import { canManageOrg } from "./org-permissions.js";
import { getMembership } from "./orgs.js";
import { isPlatformAdmin } from "./users.js";
import { getActiveVbsYear } from "./vbs-org-season.js";
import { addDaysToIsoDate, getPlanRow, listScheduleActivityLabels } from "./vbs-plan.js";
import {
  sameWeekdayInYear,
  shiftIsoRelativeToStart,
  shiftPlanWorksheetForSeasonCopy,
  stripVolunteerPeopleFromWorksheet,
} from "./vbs-worksheet-season-shift.js";

export type SeasonSnapshotPayload = {
  version: 1;
  seasonYear: number;
  capturedAt: string;
  plan: {
    title: string;
    publisherId: string;
    programTitle: string;
    location: string;
    startDate: string;
    endDate: string;
    dailyStart: string;
    dailyEnd: string;
    expectedKids: number;
    coordinatorNotes: string;
    familyPublicNotes: string;
    budgetAmount: number;
    worksheetData: unknown;
  };
  stations: {
    name: string;
    description: string;
    defaultTeamId: string;
    sortOrder: number;
  }[];
  tasks: {
    title: string;
    description: string;
    notes: string;
    category: string;
    dueDayOffset: number | null;
    assignedTeamId: string;
    sortOrder: number;
  }[];
  schedule: {
    dayOffset: number;
    startsAt: string;
    endsAt: string;
    label: string;
    stationKey: string;
    teamId: string;
    notes: string;
    roleLabel: string;
  }[];
  checklist: {
    category: string;
    label: string;
    notes: string;
    dueDayOffset: number | null;
    sortOrder: number;
  }[];
  supplies: {
    name: string;
    quantity: string;
    estimatedCost: number;
    assignedTeamId: string;
    notes: string;
    sortOrder: number;
  }[];
  registrationClasses: {
    name: string;
    rotationIndex: number | null;
    sectionLabel: string;
    minAge: number;
    maxAge: number;
    capacityMax: number;
    registrationClosed: boolean;
    sortOrder: number;
  }[];
  scheduleActivityLabels: string[];
};

function isoFromDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function dayOffset(planStart: string, dayIso: string): number | null {
  if (!planStart || !dayIso) {
    return null;
  }
  const [sy, sm, sd] = planStart.split("-").map(Number);
  const [dy, dm, dd] = dayIso.split("-").map(Number);
  if (!sy || !sm || !sd || !dy || !dm || !dd) {
    return null;
  }
  const start = Date.UTC(sy, sm - 1, sd);
  const day = Date.UTC(dy, dm - 1, dd);
  return Math.round((day - start) / 86_400_000);
}

export function copiedPlanTitle(
  calendarYear: number,
  programTitle: string,
  sourceTitle: string,
  sourceYear: number,
  userPickedCurriculum: boolean,
) {
  const theme = programTitle.trim();
  if (userPickedCurriculum && theme) {
    return `VBS ${calendarYear} · ${theme}`;
  }
  if (theme && !sourceTitle.trim()) {
    return `VBS ${calendarYear} · ${theme}`;
  }
  const titleBase = sourceTitle.trim() || `VBS ${sourceYear}`;
  if (titleBase.includes(String(sourceYear))) {
    return titleBase.replace(String(sourceYear), String(calendarYear));
  }
  if (theme) {
    return `VBS ${calendarYear} · ${theme}`;
  }
  return titleBase;
}

function mapCurriculumToYear(publisherId: string, programTitle: string, toYear: number) {
  const trimmed = programTitle.trim();
  const exact = programs.find(
    (p) => p.publisherId === publisherId && p.year === toYear && p.theme === trimmed,
  );
  if (exact) {
    return { publisherId, programTitle: exact.theme };
  }
  const samePublisher = programs.find((p) => p.publisherId === publisherId && p.year === toYear);
  if (samePublisher) {
    return { publisherId, programTitle: samePublisher.theme };
  }
  return { publisherId, programTitle: trimmed };
}

async function requireOrgAdmin(organizationId: string, username: string) {
  if (await isPlatformAdmin(username)) {
    return { ok: true as const };
  }
  const membership = await getMembership(organizationId, username);
  if (!membership || !canManageOrg(membership.role)) {
    return { error: "Only org admins can copy VBS season setup" as const };
  }
  return { ok: true as const };
}

export async function captureLiveSeasonSnapshot(
  organizationId: string,
  seasonYear: number,
  eventId?: string,
): Promise<SeasonSnapshotPayload | null> {
  const plan = eventId
    ? await getPlanRow(organizationId, eventId)
    : await getPlanRow(organizationId);
  if (!plan || (plan.year !== seasonYear && !eventId)) {
    return null;
  }
  const planStart = isoFromDate(plan.start_date);
  const stationsResult = await db().query<{
    id: string;
    name: string;
    description: string;
    default_team_id: string | null;
    sort_order: number;
  }>(
    `SELECT id, name, description, default_team_id, sort_order
     FROM vbs_stations WHERE plan_id = $1 ORDER BY sort_order, name`,
    [plan.id],
  );
  const stationIdToKey = new Map<string, string>();
  const stations = stationsResult.rows.map((row, index) => {
    const key = `s${index}`;
    stationIdToKey.set(row.id, key);
    return {
      name: row.name,
      description: row.description ?? "",
      defaultTeamId: row.default_team_id ?? "",
      sortOrder: row.sort_order,
    };
  });

  const tasksResult = await db().query<{
    title: string;
    description: string;
    notes: string;
    category: string;
    due_date: Date | null;
    assigned_team_id: string | null;
    sort_order: number;
  }>(
    `SELECT title, description, notes, category, due_date, assigned_team_id, sort_order
     FROM vbs_tasks WHERE plan_id = $1 ORDER BY sort_order, created_at`,
    [plan.id],
  );
  const tasks = tasksResult.rows.map((row) => ({
    title: row.title,
    description: row.description ?? "",
    notes: row.notes ?? "",
    category: row.category,
    dueDayOffset: row.due_date ? dayOffset(planStart, isoFromDate(row.due_date)) : null,
    assignedTeamId: row.assigned_team_id ?? "",
    sortOrder: row.sort_order,
  }));

  const scheduleResult = await db().query<{
    day_date: Date;
    starts_at: string;
    ends_at: string;
    label: string;
    station_id: string | null;
    team_id: string | null;
    notes: string;
    role_label: string;
  }>(
    `SELECT day_date, starts_at, ends_at, label, station_id, team_id, notes, role_label
     FROM vbs_schedule_slots WHERE plan_id = $1 ORDER BY day_date, starts_at`,
    [plan.id],
  );
  const schedule = scheduleResult.rows
    .map((row) => {
      const dayIso = isoFromDate(row.day_date);
      const offset = dayOffset(planStart, dayIso);
      if (offset === null) {
        return null;
      }
      return {
        dayOffset: offset,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        label: row.label,
        stationKey: row.station_id ? (stationIdToKey.get(row.station_id) ?? "") : "",
        teamId: row.team_id ?? "",
        notes: row.notes ?? "",
        roleLabel: row.role_label ?? "",
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const checklistResult = await db().query<{
    category: string;
    label: string;
    notes: string;
    due_date: Date | null;
    sort_order: number;
  }>(
    `SELECT category, label, notes, due_date, sort_order
     FROM vbs_checklist_items WHERE plan_id = $1 ORDER BY sort_order, category, label`,
    [plan.id],
  );
  const checklist = checklistResult.rows.map((row) => ({
    category: row.category,
    label: row.label,
    notes: row.notes ?? "",
    dueDayOffset: row.due_date ? dayOffset(planStart, isoFromDate(row.due_date)) : null,
    sortOrder: row.sort_order,
  }));

  const suppliesResult = await db().query<{
    name: string;
    quantity: string;
    estimated_cost: string;
    assigned_team_id: string | null;
    notes: string;
    sort_order: number;
  }>(
    `SELECT name, quantity, estimated_cost, assigned_team_id, notes, sort_order
     FROM vbs_supply_items WHERE plan_id = $1 ORDER BY sort_order, name`,
    [plan.id],
  );
  const supplies = suppliesResult.rows.map((row) => ({
    name: row.name,
    quantity: row.quantity ?? "",
    estimatedCost: Number(row.estimated_cost) || 0,
    assignedTeamId: row.assigned_team_id ?? "",
    notes: row.notes ?? "",
    sortOrder: row.sort_order,
  }));

  const classesResult = await db().query<{
    name: string;
    rotation_index: number | null;
    section_label: string;
    min_age: number;
    max_age: number;
    capacity_max: number;
    registration_closed: boolean;
    sort_order: number;
  }>(
    `SELECT name, rotation_index, section_label, min_age, max_age, capacity_max, registration_closed, sort_order
     FROM vbs_registration_classes
     WHERE organization_id = $1 AND (
       ($3::text IS NOT NULL AND vbs_event_id = $3)
       OR ($3::text IS NULL AND COALESCE(vbs_season_year, $2) = $2)
     )
     ORDER BY sort_order, name`,
    [organizationId, seasonYear, eventId ?? plan.event_id ?? null],
  );
  const registrationClasses = classesResult.rows.map((row) => ({
    name: row.name,
    rotationIndex: row.rotation_index,
    sectionLabel: row.section_label ?? "",
    minAge: row.min_age,
    maxAge: row.max_age,
    capacityMax: row.capacity_max,
    registrationClosed: row.registration_closed === true,
    sortOrder: row.sort_order,
  }));

  const scheduleActivityLabels = await listScheduleActivityLabels(organizationId);

  return {
    version: 1,
    seasonYear,
    capturedAt: new Date().toISOString(),
    plan: {
      title: plan.title,
      publisherId: plan.publisher_id,
      programTitle: plan.program_title,
      location: plan.location,
      startDate: planStart,
      endDate: isoFromDate(plan.end_date),
      dailyStart: plan.daily_start,
      dailyEnd: plan.daily_end,
      expectedKids: plan.expected_kids,
      coordinatorNotes: plan.coordinator_notes,
      familyPublicNotes: plan.family_public_notes ?? "",
      budgetAmount: Number(plan.budget_amount) || 0,
      worksheetData: plan.worksheet_data ?? {},
    },
    stations,
    tasks,
    schedule,
    checklist,
    supplies,
    registrationClasses,
    scheduleActivityLabels,
  };
}

export async function persistSeasonSnapshot(
  organizationId: string,
  seasonYear: number,
  snapshot: SeasonSnapshotPayload,
) {
  await db().query(
    `INSERT INTO org_vbs_season_snapshots (organization_id, season_year, snapshot, updated_at)
     VALUES ($1,$2,$3::jsonb,NOW())
     ON CONFLICT (organization_id, season_year) DO UPDATE SET
       snapshot = EXCLUDED.snapshot,
       updated_at = NOW()`,
    [organizationId, seasonYear, JSON.stringify(snapshot)],
  );
}

/** Save the live workspace as a reusable template for that VBS year. */
export async function persistLiveSeasonSnapshot(organizationId: string, seasonYear: number) {
  const snapshot = await captureLiveSeasonSnapshot(organizationId, seasonYear);
  if (!snapshot) {
    return { skipped: true as const };
  }
  await persistSeasonSnapshot(organizationId, seasonYear, snapshot);
  return { ok: true as const };
}

async function loadSnapshotForYear(organizationId: string, seasonYear: number) {
  const live = await captureLiveSeasonSnapshot(organizationId, seasonYear);
  if (live) {
    return live;
  }
  const stored = await db().query<{ snapshot: SeasonSnapshotPayload }>(
    `SELECT snapshot FROM org_vbs_season_snapshots WHERE organization_id = $1 AND season_year = $2`,
    [organizationId, seasonYear],
  );
  return stored.rows[0]?.snapshot ?? null;
}

export async function getSeasonCopyOptions(organizationId: string, username: string) {
  const access = await requireOrgAdmin(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const activeVbsYear = await getActiveVbsYear(organizationId);
  const plan = await getPlanRow(organizationId);
  const snapshots = await db().query<{ season_year: number }>(
    `SELECT season_year FROM org_vbs_season_snapshots WHERE organization_id = $1 ORDER BY season_year DESC`,
    [organizationId],
  );
  const registrationYears = await db().query<{ vbs_season_year: number }>(
    `SELECT DISTINCT vbs_season_year FROM vbs_registrations
     WHERE organization_id = $1 AND vbs_season_year IS NOT NULL
     ORDER BY vbs_season_year DESC`,
    [organizationId],
  );
  const snapshotYears = new Set(snapshots.rows.map((row) => row.season_year));
  const copyableYears = new Set<number>();
  if (plan) {
    copyableYears.add(plan.year);
  }
  for (const year of snapshotYears) {
    copyableYears.add(year);
  }
  const sourceYears = [...copyableYears].sort((a, b) => b - a);
  const registrationOnlyYears = registrationYears.rows
    .map((row) => row.vbs_season_year)
    .filter((year) => !copyableYears.has(year));
  const suggestedTargetYear = Math.max(activeVbsYear, plan?.year ?? activeVbsYear) + 1;
  return {
    activeVbsYear,
    planYear: plan?.year ?? null,
    sourceYears,
    registrationOnlyYears,
    suggestedTargetYear,
  };
}

export async function saveCurrentSeasonSnapshot(organizationId: string, username: string) {
  const access = await requireOrgAdmin(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const plan = await getPlanRow(organizationId);
  if (!plan) {
    return { error: "Create a VBS plan before saving a season snapshot" as const };
  }
  const result = await persistLiveSeasonSnapshot(organizationId, plan.year);
  if ("skipped" in result) {
    return { error: "Nothing to snapshot for the current plan" as const };
  }
  return { ok: true as const, seasonYear: plan.year };
}

async function clearPlanChildren(planId: string) {
  const taskIds = await db().query<{ id: string }>(`SELECT id FROM vbs_tasks WHERE plan_id = $1`, [planId]);
  if (taskIds.rows.length > 0) {
    await db().query(`DELETE FROM vbs_task_attachments WHERE task_id = ANY($1::text[])`, [
      taskIds.rows.map((r) => r.id),
    ]);
  }
  await db().query(`DELETE FROM vbs_schedule_slots WHERE plan_id = $1`, [planId]);
  await db().query(`DELETE FROM vbs_tasks WHERE plan_id = $1`, [planId]);
  await db().query(`DELETE FROM vbs_checklist_items WHERE plan_id = $1`, [planId]);
  await db().query(`DELETE FROM vbs_stations WHERE plan_id = $1`, [planId]);
  await db().query(`DELETE FROM vbs_supply_items WHERE plan_id = $1`, [planId]);
  await db().query(`DELETE FROM vbs_board_replies WHERE post_id IN (
    SELECT id FROM vbs_board_posts WHERE plan_id = $1
  )`, [planId]);
  await db().query(`DELETE FROM vbs_board_posts WHERE plan_id = $1`, [planId]);
}

async function replaceRegistrationClassesForSeason(
  organizationId: string,
  seasonYear: number,
  classes: SeasonSnapshotPayload["registrationClasses"],
) {
  const existing = await db().query<{ id: string }>(
    `SELECT id FROM vbs_registration_classes
     WHERE organization_id = $1 AND COALESCE(vbs_season_year, $2) = $2`,
    [organizationId, seasonYear],
  );
  if (existing.rows.length > 0) {
    const ids = existing.rows.map((r) => r.id);
    await db().query(`DELETE FROM vbs_registration_class_staff WHERE class_id = ANY($1::text[])`, [ids]);
    await db().query(
      `UPDATE vbs_registrations SET class_id = NULL
       WHERE organization_id = $1 AND vbs_season_year = $2 AND class_id = ANY($3::text[])`,
      [organizationId, seasonYear, ids],
    );
    await db().query(`DELETE FROM vbs_registration_classes WHERE id = ANY($1::text[])`, [ids]);
  }
  for (const cls of classes) {
    await db().query(
      `INSERT INTO vbs_registration_classes (
        id, organization_id, name, rotation_index, section_label, min_age, max_age, capacity_max,
        registration_closed, sort_order, vbs_season_year, vbs_event_id, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
      [
        crypto.randomUUID(),
        organizationId,
        cls.name,
        cls.rotationIndex,
        cls.sectionLabel,
        cls.minAge,
        cls.maxAge,
        cls.capacityMax,
        false,
        cls.sortOrder,
        seasonYear,
        null,
      ],
    );
  }
}

export async function loadStoredSeasonSnapshot(organizationId: string, seasonYear: number) {
  const stored = await db().query<{ snapshot: SeasonSnapshotPayload }>(
    `SELECT snapshot FROM org_vbs_season_snapshots WHERE organization_id = $1 AND season_year = $2`,
    [organizationId, seasonYear],
  );
  return stored.rows[0]?.snapshot ?? null;
}

async function insertRegistrationClassesForEvent(
  organizationId: string,
  eventId: string,
  seasonYear: number,
  classes: SeasonSnapshotPayload["registrationClasses"],
) {
  for (const cls of classes) {
    await db().query(
      `INSERT INTO vbs_registration_classes (
        id, organization_id, name, rotation_index, section_label, min_age, max_age, capacity_max,
        registration_closed, sort_order, vbs_season_year, vbs_event_id, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
      [
        crypto.randomUUID(),
        organizationId,
        cls.name,
        cls.rotationIndex,
        cls.sectionLabel,
        cls.minAge,
        cls.maxAge,
        cls.capacityMax,
        false,
        cls.sortOrder,
        seasonYear,
        eventId,
      ],
    );
  }
}

async function writeLivePlanFromSnapshot(
  organizationId: string,
  existingPlanId: string | undefined,
  snapshot: SeasonSnapshotPayload,
  fields: {
    year: number;
    title: string;
    publisherId: string;
    programTitle: string;
    startDate: string;
    endDate: string;
    worksheetData: unknown;
    eventId?: string;
    /** When set, replaces snapshot budget (use 0 for a fresh project copy). */
    budgetAmount?: number;
    /** Catalog release year (may differ from {@link fields.year} / VBS week year). */
    curriculumYear?: number;
  },
) {
  const budgetAmount = fields.budgetAmount ?? snapshot.plan.budgetAmount;
  const curriculumYear = fields.curriculumYear ?? fields.year;
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    let planId = existingPlanId;
    const now = new Date().toISOString();
    if (planId) {
      await clearPlanChildren(planId);
      await client.query(
        `UPDATE vbs_plans SET
           event_id = COALESCE($18, event_id),
           year = $2, curriculum_year = $3, title = $4, publisher_id = $5, program_title = $6, location = $7,
           start_date = $8, end_date = $9, daily_start = $10, daily_end = $11, expected_kids = $12,
           coordinator_notes = $13, family_public_notes = $14, budget_amount = $15,
           expenses_amount = 0, worksheet_data = $16::jsonb, updated_at = $17
         WHERE id = $1`,
        [
          planId,
          fields.year,
          curriculumYear,
          fields.title,
          fields.publisherId,
          fields.programTitle,
          snapshot.plan.location,
          fields.startDate,
          fields.endDate,
          snapshot.plan.dailyStart,
          snapshot.plan.dailyEnd,
          snapshot.plan.expectedKids,
          snapshot.plan.coordinatorNotes,
          snapshot.plan.familyPublicNotes,
          budgetAmount,
          JSON.stringify(fields.worksheetData ?? {}),
          now,
          fields.eventId ?? null,
        ],
      );
    } else {
      planId = crypto.randomUUID();
      await client.query(
        `INSERT INTO vbs_plans (
           id, organization_id, event_id, year, curriculum_year, title, publisher_id, program_title, location,
           start_date, end_date, daily_start, daily_end, expected_kids, coordinator_notes,
           family_public_notes, budget_amount, expenses_amount, worksheet_data, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,0,$18::jsonb,$19)`,
        [
          planId,
          organizationId,
          fields.eventId ?? null,
          fields.year,
          curriculumYear,
          fields.title,
          fields.publisherId,
          fields.programTitle,
          snapshot.plan.location,
          fields.startDate,
          fields.endDate,
          snapshot.plan.dailyStart,
          snapshot.plan.dailyEnd,
          snapshot.plan.expectedKids,
          snapshot.plan.coordinatorNotes,
          snapshot.plan.familyPublicNotes,
          budgetAmount,
          JSON.stringify(fields.worksheetData ?? {}),
          now,
        ],
      );
    }

    const stationKeyToId = new Map<string, string>();
    for (let i = 0; i < snapshot.stations.length; i += 1) {
      const station = snapshot.stations[i]!;
      const id = crypto.randomUUID();
      stationKeyToId.set(`s${i}`, id);
      await client.query(
        `INSERT INTO vbs_stations (id, plan_id, name, description, default_team_id, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          id,
          planId,
          station.name,
          station.description,
          station.defaultTeamId || null,
          station.sortOrder,
        ],
      );
    }

    for (const task of snapshot.tasks) {
      const dueDate =
        task.dueDayOffset !== null ? addDaysToIsoDate(fields.startDate, task.dueDayOffset) : null;
      await client.query(
        `INSERT INTO vbs_tasks (
           id, plan_id, title, description, notes, category, status, due_date,
           assigned_username, assigned_team_id, sort_order, created_at,
           expense_amount, reimbursement_status, reimbursement_archived
         ) VALUES ($1,$2,$3,$4,$5,$6,'todo',$7,NULL,$8,$9,$10,0,'none',FALSE)`,
        [
          crypto.randomUUID(),
          planId,
          task.title,
          task.description,
          task.notes,
          task.category,
          dueDate,
          task.assignedTeamId || null,
          task.sortOrder,
          now,
        ],
      );
    }

    for (const item of snapshot.checklist) {
      const dueDate =
        item.dueDayOffset !== null ? addDaysToIsoDate(fields.startDate, item.dueDayOffset) : null;
      await client.query(
        `INSERT INTO vbs_checklist_items (
           id, plan_id, category, label, done, status, assigned_team_id, due_date, sort_order, notes
         ) VALUES ($1,$2,$3,$4,FALSE,'not_started',NULL,$5,$6,$7)`,
        [
          crypto.randomUUID(),
          planId,
          item.category,
          item.label,
          dueDate,
          item.sortOrder,
          item.notes,
        ],
      );
    }

    for (const slot of snapshot.schedule) {
      const dayDate = addDaysToIsoDate(fields.startDate, slot.dayOffset);
      const stationId = slot.stationKey ? (stationKeyToId.get(slot.stationKey) ?? null) : null;
      await client.query(
        `INSERT INTO vbs_schedule_slots (
           id, plan_id, day_date, starts_at, ends_at, label, station_id, team_id, notes, role_label, assigned_username
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'')`,
        [
          crypto.randomUUID(),
          planId,
          dayDate,
          slot.startsAt,
          slot.endsAt,
          slot.label,
          stationId,
          slot.teamId || null,
          slot.notes,
          slot.roleLabel,
        ],
      );
    }

    for (const supply of snapshot.supplies) {
      await client.query(
        `INSERT INTO vbs_supply_items (
           id, plan_id, name, quantity, estimated_cost, purchased, assigned_team_id, notes, sort_order
         ) VALUES ($1,$2,$3,$4,$5,FALSE,$6,$7,$8)`,
        [
          crypto.randomUUID(),
          planId,
          supply.name,
          supply.quantity,
          supply.estimatedCost,
          supply.assignedTeamId || null,
          supply.notes,
          supply.sortOrder,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function restoreSeasonSnapshotToLivePlan(organizationId: string, snapshot: SeasonSnapshotPayload) {
  const plan = await getPlanRow(organizationId);
  const startDate = snapshot.plan.startDate || `${snapshot.seasonYear}-06-01`;
  const endDate =
    snapshot.plan.endDate || addDaysToIsoDate(startDate, 4);
  await writeLivePlanFromSnapshot(organizationId, plan?.id, snapshot, {
    year: snapshot.seasonYear,
    title: snapshot.plan.title.trim() || `VBS ${snapshot.seasonYear}`,
    publisherId: snapshot.plan.publisherId,
    programTitle: snapshot.plan.programTitle,
    startDate,
    endDate,
    worksheetData: snapshot.plan.worksheetData,
    eventId: plan?.event_id ?? undefined,
  });
  const { syncPrayerReminders } = await import("./vbs-prayer-reminders.js");
  const worksheet = snapshot.plan.worksheetData as { prayerSchedule?: unknown } | null;
  await syncPrayerReminders(organizationId, worksheet?.prayerSchedule);
}

export async function restoreSeasonSnapshotToEventPlan(
  organizationId: string,
  eventId: string,
  snapshot: SeasonSnapshotPayload,
) {
  const existing = await db().query<{ id: string }>(`SELECT id FROM vbs_plans WHERE event_id = $1`, [eventId]);
  const startDate = snapshot.plan.startDate || `${snapshot.seasonYear}-06-01`;
  const endDate = snapshot.plan.endDate || addDaysToIsoDate(startDate, 4);
  await writeLivePlanFromSnapshot(organizationId, existing.rows[0]?.id, snapshot, {
    year: snapshot.seasonYear,
    title: snapshot.plan.title.trim() || `VBS ${snapshot.seasonYear}`,
    publisherId: snapshot.plan.publisherId,
    programTitle: snapshot.plan.programTitle,
    startDate,
    endDate,
    worksheetData: snapshot.plan.worksheetData,
    eventId,
  });
}

export async function copyVbsSeasonToNewEvent(
  organizationId: string,
  username: string,
  input: {
    fromEventId: string;
    toYear: number;
    name?: string;
    startDate?: string;
    endDate?: string;
    publisherId?: string;
    programTitle?: string;
    curriculumYear?: number;
    makeCurrent?: boolean;
  },
) {
  const access = await requireOrgAdmin(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const {
    addMemberToVbsEvent,
    getVbsEvent,
    defaultProjectNameFromDates,
    setActiveVbsEvent,
    syncEventCurriculum,
    uniqueEventName,
  } = await import("./vbs-event-context.js");
  const sourceEvent = await getVbsEvent(organizationId, input.fromEventId);
  if (!sourceEvent) {
    return { error: "Choose a VBS to copy from" as const };
  }
  const toYear = input.toYear;
  if (!Number.isInteger(toYear) || toYear < 2000) {
    return { error: "A valid VBS year is required" as const };
  }
  const source =
    (await captureLiveSeasonSnapshot(organizationId, sourceEvent.year, sourceEvent.id)) ??
    (await loadSnapshotForYear(organizationId, sourceEvent.year));
  if (!source) {
    return {
      error: `No saved setup found for ${sourceEvent.year}. Open that plan first, then copy it.` as const,
    };
  }

  const sourceStart = source.plan.startDate;
  const startDate =
    input.startDate?.trim() ||
    (sourceStart
      ? toYear === sourceEvent.year
        ? sourceStart
        : sameWeekdayInYear(sourceStart, toYear)
      : `${toYear}-06-01`);
  const endDate =
    input.endDate?.trim() ||
    (source.plan.endDate && sourceStart
      ? shiftIsoRelativeToStart(source.plan.endDate, sourceStart, startDate)
      : addDaysToIsoDate(startDate, 4));
  const preferred =
    (input.name ?? "").trim() ||
    defaultProjectNameFromDates(startDate, endDate) ||
    "Session";
  const name = await uniqueEventName(organizationId, toYear, preferred);

  const chosenPublisher = input.publisherId?.trim() || "";
  const chosenTitle = input.programTitle?.trim() || "";
  const userPickedCurriculum = Boolean(chosenPublisher && chosenTitle);
  const curriculum = userPickedCurriculum
    ? { publisherId: chosenPublisher, programTitle: chosenTitle }
    : mapCurriculumToYear(
        chosenPublisher || source.plan.publisherId,
        chosenTitle || source.plan.programTitle,
        toYear,
      );

  const catalogYear =
    input.curriculumYear && Number.isInteger(input.curriculumYear) && input.curriculumYear >= 2000
      ? input.curriculumYear
      : toYear;

  const eventId = crypto.randomUUID();
  await db().query(
    `INSERT INTO vbs_events (id, organization_id, year, curriculum_year, name, publisher_id, program_title, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
    [eventId, organizationId, toYear, catalogYear, name, curriculum.publisherId, curriculum.programTitle],
  );
  await addMemberToVbsEvent(organizationId, username, eventId);
  const shiftedWorksheet = stripVolunteerPeopleFromWorksheet(
    shiftPlanWorksheetForSeasonCopy(source.plan.worksheetData, sourceStart, startDate, endDate),
  );

  await writeLivePlanFromSnapshot(organizationId, undefined, source, {
    year: toYear,
    curriculumYear: catalogYear,
    title: name,
    publisherId: curriculum.publisherId,
    programTitle: curriculum.programTitle,
    startDate,
    endDate,
    worksheetData: shiftedWorksheet,
    eventId,
    budgetAmount: 0,
  });
  await syncEventCurriculum(eventId, {
    year: toYear,
    curriculumYear: catalogYear,
    publisherId: curriculum.publisherId,
    programTitle: curriculum.programTitle,
    name,
  });
  await insertRegistrationClassesForEvent(organizationId, eventId, toYear, source.registrationClasses);
  if (input.makeCurrent) {
    await setActiveVbsEvent(organizationId, eventId);
  }
  const { syncPrayerReminders } = await import("./vbs-prayer-reminders.js");
  await syncPrayerReminders(organizationId, shiftedWorksheet.prayerSchedule);

  return {
    ok: true as const,
    eventId,
    fromEventId: sourceEvent.id,
    fromYear: sourceEvent.year,
    toYear,
    name,
    startDate,
    endDate,
    copied: {
      stations: source.stations.length,
      tasks: source.tasks.length,
      scheduleSlots: source.schedule.length,
      checklistItems: source.checklist.length,
      supplies: source.supplies.length,
      registrationClasses: source.registrationClasses.length,
    },
  };
}

export async function copyVbsSeasonFromYear(
  organizationId: string,
  username: string,
  input: {
    fromYear: number;
    toYear: number;
    name?: string;
    fromEventId?: string;
    startDate?: string;
    endDate?: string;
    publisherId?: string;
    programTitle?: string;
    curriculumYear?: number;
    makeCurrent?: boolean;
  },
) {
  const fromYear = input.fromYear;
  const toYear = input.toYear;
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear) || fromYear < 2000 || toYear < 2000) {
    return { error: "Valid from and to VBS years are required" as const };
  }
  let fromEventId = input.fromEventId?.trim() ?? "";
  if (!fromEventId) {
    const match = await db().query<{ id: string }>(
      `SELECT e.id FROM vbs_events e
       LEFT JOIN vbs_plans p ON p.event_id = e.id
       WHERE e.organization_id = $1 AND e.year = $2
       ORDER BY CASE WHEN p.id IS NULL THEN 1 ELSE 0 END, e.name
       LIMIT 1`,
      [organizationId, fromYear],
    );
    fromEventId = match.rows[0]?.id ?? "";
  }
  if (!fromEventId) {
    return {
      error: `No saved setup found for VBS ${fromYear}. Open the plan for that year first, or pick another source.` as const,
    };
  }
  return copyVbsSeasonToNewEvent(organizationId, username, {
    fromEventId,
    toYear,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    publisherId: input.publisherId,
    programTitle: input.programTitle,
    curriculumYear: input.curriculumYear,
    makeCurrent: input.makeCurrent === true,
  });
}
