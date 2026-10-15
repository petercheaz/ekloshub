import { listCalendarReminders, readCalendarViewPref } from "./vbs-calendar.js";
import { defaultCurriculumYear, programs, publishers } from "./curriculum.js";
import { formatPgDate } from "./pg-dates.js";
import { db } from "./db/pool.js";
import { vbsPlanTabLink } from "./app-url.js";
import { deliverOrgNotifications } from "./notify-delivery.js";
import { orgAdminUsernames } from "./org-notify.js";
import { canWriteRole, getMembership, type OrgRole } from "./orgs.js";
import { listBoardPosts } from "./vbs-board.js";
import { getTeam, listTeamsForViewer } from "./teams.js";
import { objectUrl, storeUpload } from "./db/s3.js";
import { findUser } from "./users.js";
/** Common week-of roles — suggestions for schedule blocks, not an enforced enum. */
export const SCHEDULE_ROLE_SUGGESTIONS = [
  "Welcome / check-in",
  "Worship leader",
  "Storyteller",
  "Station leader",
  "Games",
  "Crafts",
  "Snacks",
  "Registration desk",
  "Safety / float",
  "Closing assembly",
] as const;
import { MAX_ATTACHMENT_BYTES } from "./media-limits.js";
import {
  buildFullVbsSchedule,
  DEFAULT_VBS_SCHEDULE_ACTIVITIES,
  enumerateIsoDays,
} from "./vbs-schedule-activities.js";
import {
  defaultVbsPlanStationNames,
  rotationBucket,
  rotationNameMatches,
  VBS_ROTATION_STATION_NAMES,
} from "./vbs-rotation-stations.js";

export type VbsTaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type VbsReimbursementStatus = "none" | "pending" | "submitted" | "reimbursed" | "denied";
export type VbsTaskCategory =
  | "planning"
  | "volunteers"
  | "curriculum"
  | "supplies"
  | "safety"
  | "communications";

const taskStatuses: VbsTaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const reimbursementStatuses: VbsReimbursementStatus[] = ["none", "pending", "submitted", "reimbursed", "denied"];

export const vbsMilestoneCategories = [
  "Before VBS",
  "Curriculum & programming",
  "Volunteers & teams",
  "Facilities & safety",
  "Supplies & decorations",
  "Communications & registration",
  "Day of VBS",
  "After VBS / follow-up",
] as const;

export type VbsMilestoneCategory = (typeof vbsMilestoneCategories)[number];

export type VbsMilestoneStatus = "not_started" | "in_progress" | "done";

function normalizeMilestoneStatus(input: { status?: string; done?: boolean }): VbsMilestoneStatus {
  if (input.status === "not_started" || input.status === "in_progress" || input.status === "done") {
    return input.status;
  }
  return input.done ? "done" : "not_started";
}

const milestoneCategoryAliases: Record<string, VbsMilestoneCategory> = {
  Facilities: "Facilities & safety",
  Communications: "Communications & registration",
  General: "Before VBS",
};

export function addDaysToIsoDate(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    return iso;
  }
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function normalizeMilestoneCategory(value: string): VbsMilestoneCategory {
  const trimmed = value.trim();
  if ((vbsMilestoneCategories as readonly string[]).includes(trimmed)) {
    return trimmed as VbsMilestoneCategory;
  }
  return milestoneCategoryAliases[trimmed] ?? "Before VBS";
}

export function sumTaskExpenseAmounts(tasks: { expenseAmount: number }[]) {
  return tasks.reduce((total, task) => total + Math.max(0, Number(task.expenseAmount) || 0), 0);
}

async function syncPlanExpensesFromTasks(planId: string) {
  const now = new Date().toISOString();
  await db().query(
    `UPDATE vbs_plans SET expenses_amount = COALESCE(
       (SELECT SUM(expense_amount) FROM vbs_tasks WHERE plan_id = $1),
       0
     ), updated_at = $2
     WHERE id = $1`,
    [planId, now],
  );
}

type TaskAttachmentInput = { name: string; type: string; size: number; dataUrl: string };

async function replaceTaskAttachments(taskId: string, files: TaskAttachmentInput[]) {
  const existing = await db().query<{ id: string; object_key: string }>(
    "SELECT id, object_key FROM vbs_task_attachments WHERE task_id = $1",
    [taskId],
  );
  const byUrl = new Map(existing.rows.map((row) => [objectUrl(row.object_key), row.object_key]));

  await db().query("DELETE FROM vbs_task_attachments WHERE task_id = $1", [taskId]);

  let order = 0;
  for (const file of files.slice(0, 10)) {
    if (!file.name?.trim() || file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
      continue;
    }
    let objectKey = "";
    if (file.dataUrl.startsWith("data:")) {
      const uploaded = await storeUpload(`vbs-tasks/${taskId}`, file);
      objectKey = uploaded.objectKey;
    } else {
      objectKey = byUrl.get(file.dataUrl) ?? "";
    }
    if (!objectKey) {
      continue;
    }
    await db().query(
      `INSERT INTO vbs_task_attachments (id, task_id, name, type, size, object_key, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [crypto.randomUUID(), taskId, file.name.trim(), file.type || "", file.size, objectKey, order],
    );
    order += 1;
  }
}

async function loadTaskAttachments(planId: string) {
  const rows = await db().query<{
    id: string;
    task_id: string;
    name: string;
    type: string;
    size: number;
    object_key: string;
    sort_order: number;
  }>(
    `SELECT a.id, a.task_id, a.name, a.type, a.size, a.object_key, a.sort_order
     FROM vbs_task_attachments a
     JOIN vbs_tasks t ON t.id = a.task_id
     WHERE t.plan_id = $1
     ORDER BY a.sort_order, a.name`,
    [planId],
  );
  const byTask = new Map<string, { id: string; name: string; type: string; size: number; dataUrl: string }[]>();
  for (const row of rows.rows) {
    const list = byTask.get(row.task_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      type: row.type,
      size: row.size,
      dataUrl: objectUrl(row.object_key),
    });
    byTask.set(row.task_id, list);
  }
  return byTask;
}
const taskCategories: VbsTaskCategory[] = [
  "planning",
  "volunteers",
  "curriculum",
  "supplies",
  "safety",
  "communications",
];

function planLink(orgId: string) {
  return `/org/${orgId}/vbs-plan`;
}

async function requireMember(orgId: string, username: string) {
  const { isPlatformAdmin } = await import("./users.js");
  const platformAdmin = await isPlatformAdmin(username);
  const membership = await getMembership(orgId, username);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" as const };
  }
  return {
    membership: membership ?? { username, role: "org_admin" as OrgRole },
    platformAdmin,
  };
}

function canWrite(role: OrgRole) {
  return canWriteRole(role);
}

type MemberAccess = { membership: { role: OrgRole; username?: string }; platformAdmin?: boolean };

function planWriteAllowed(access: MemberAccess) {
  return canWrite(access.membership.role) || access.platformAdmin === true;
}

export async function getPlanRow(orgId: string) {
  const result = await db().query<{
    id: string;
    organization_id: string;
    year: number;
    title: string;
    publisher_id: string;
    program_title: string;
    location: string;
    start_date: Date | null;
    end_date: Date | null;
    daily_start: string;
    daily_end: string;
    expected_kids: number;
    coordinator_notes: string;
    family_public_notes: string;
    budget_amount: string;
    expenses_amount: string;
    worksheet_data: unknown;
    updated_at: Date;
  }>(
    `SELECT id, organization_id, year, title, publisher_id, program_title, location,
            start_date, end_date, daily_start, daily_end, expected_kids, coordinator_notes,
            family_public_notes, budget_amount, expenses_amount, worksheet_data, updated_at
     FROM vbs_plans WHERE organization_id = $1 ORDER BY year DESC LIMIT 1`,
    [orgId],
  );
  return result.rows[0] ?? null;
}

function presentPlan(row: NonNullable<Awaited<ReturnType<typeof getPlanRow>>>) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    year: row.year,
    title: row.title,
    publisherId: row.publisher_id,
    programTitle: row.program_title,
    location: row.location,
    startDate: row.start_date ? row.start_date.toISOString().slice(0, 10) : "",
    endDate: row.end_date ? row.end_date.toISOString().slice(0, 10) : "",
    dailyStart: row.daily_start,
    dailyEnd: row.daily_end,
    expectedKids: row.expected_kids,
    coordinatorNotes: row.coordinator_notes,
    familyPublicNotes: row.family_public_notes ?? "",
    budgetAmount: Number(row.budget_amount) || 0,
    expensesAmount: Number(row.expenses_amount) || 0,
    worksheetData: row.worksheet_data ?? {},
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function saveVbsWorksheet(
  orgId: string,
  username: string,
  worksheetData: Record<string, unknown>,
) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access" as const };
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Create a VBS plan first" as const };
  }
  await db().query(`UPDATE vbs_plans SET worksheet_data = $2::jsonb, updated_at = $3 WHERE id = $1`, [
    plan.id,
    JSON.stringify(worksheetData ?? {}),
    new Date().toISOString(),
  ]);
  const { syncPrayerReminders } = await import("./vbs-prayer-reminders.js");
  await syncPrayerReminders(orgId, worksheetData.prayerSchedule);
  return { ok: true as const };
}

async function seedStarterContent(planId: string, orgId: string, planStartDate: string | null) {
  const anchorDate =
    planStartDate ||
    addDaysToIsoDate(new Date().toISOString().slice(0, 10), 90);
  const now = new Date().toISOString();
  const stations = defaultVbsPlanStationNames();
  for (let i = 0; i < stations.length; i += 1) {
    await db().query(
      `INSERT INTO vbs_stations (id, plan_id, name, description, default_team_id, sort_order)
       VALUES ($1,$2,$3,'',NULL,$4)`,
      [crypto.randomUUID(), planId, stations[i], i],
    );
  }

  const checklist: { category: string; label: string; dueOffset: number }[] = [
    { category: "Before VBS", label: "Confirm curriculum kit and leader guides", dueOffset: -56 },
    { category: "Volunteers & teams", label: "Recruit and confirm volunteer roster", dueOffset: -42 },
    { category: "Volunteers & teams", label: "Background checks and safety training", dueOffset: -35 },
    { category: "Before VBS", label: "Approve budget and purchase supplies", dueOffset: -28 },
    { category: "Facilities & safety", label: "Assign rooms and post rotation signage", dueOffset: -14 },
    { category: "Facilities & safety", label: "Walk building for trip hazards and exits", dueOffset: -7 },
    { category: "Communications & registration", label: "Send parent info letter and registration link", dueOffset: -21 },
    { category: "Communications & registration", label: "Publish volunteer schedule to teams", dueOffset: -10 },
    { category: "Day of VBS", label: "Set up registration table and name tags", dueOffset: -1 },
    { category: "Day of VBS", label: "Stock first-aid kit and allergy list", dueOffset: 0 },
    { category: "Day of VBS", label: "Test A/V and music for opening", dueOffset: 0 },
  ];
  for (let i = 0; i < checklist.length; i += 1) {
    const item = checklist[i];
    await db().query(
      `INSERT INTO vbs_checklist_items (id, plan_id, category, label, done, assigned_team_id, due_date, sort_order)
       VALUES ($1,$2,$3,$4,FALSE,NULL,$5,$6)`,
      [
        crypto.randomUUID(),
        planId,
        normalizeMilestoneCategory(item.category),
        item.label,
        addDaysToIsoDate(anchorDate, item.dueOffset),
        i,
      ],
    );
  }

  const tasks: { title: string; category: VbsTaskCategory; dueOffset: number }[] = [
    { title: "Pick VBS dates and reserve building", category: "planning", dueOffset: -60 },
    { title: "Order curriculum and preview lessons", category: "curriculum", dueOffset: -45 },
    { title: "Build volunteer teams by station", category: "volunteers", dueOffset: -35 },
    { title: "Create snack and allergy plan", category: "safety", dueOffset: -21 },
    { title: "Decorate rooms and stage opening area", category: "supplies", dueOffset: -7 },
    { title: "Send week-of reminder to all teams", category: "communications", dueOffset: -3 },
  ];
  for (let i = 0; i < tasks.length; i += 1) {
    await db().query(
      `INSERT INTO vbs_tasks (
         id, plan_id, title, description, category, status, due_date,
         assigned_username, assigned_team_id, sort_order, created_at
       ) VALUES ($1,$2,$3,'',$4,'todo',$5,NULL,NULL,$6,$7)`,
      [
        crypto.randomUUID(),
        planId,
        tasks[i].title,
        tasks[i].category,
        addDaysToIsoDate(anchorDate, tasks[i].dueOffset),
        i,
        now,
      ],
    );
  }
}

async function ensureScheduleActivityLabels(orgId: string) {
  const existing = await db().query<{ label: string }>(
    "SELECT label FROM vbs_schedule_activity_labels WHERE organization_id = $1",
    [orgId],
  );
  if (existing.rows.length > 0) {
    return;
  }
  for (let i = 0; i < DEFAULT_VBS_SCHEDULE_ACTIVITIES.length; i += 1) {
    const label = DEFAULT_VBS_SCHEDULE_ACTIVITIES[i];
    await db().query(
      `INSERT INTO vbs_schedule_activity_labels (organization_id, label, sort_order)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [orgId, label, i],
    );
  }
}

export async function listScheduleActivityLabels(orgId: string) {
  await ensureScheduleActivityLabels(orgId);
  const result = await db().query<{ label: string }>(
    "SELECT label FROM vbs_schedule_activity_labels WHERE organization_id = $1 ORDER BY sort_order, label",
    [orgId],
  );
  return result.rows.map((row) => row.label);
}

export async function addScheduleActivityLabel(orgId: string, username: string, label: string) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access" as const };
  }
  const trimmed = label.trim();
  if (!trimmed) {
    return { error: "Label is required" as const };
  }
  await ensureScheduleActivityLabels(orgId);
  const sort = await db().query<{ max: number }>(
    "SELECT COALESCE(MAX(sort_order), -1)::int AS max FROM vbs_schedule_activity_labels WHERE organization_id = $1",
    [orgId],
  );
  await db().query(
    `INSERT INTO vbs_schedule_activity_labels (organization_id, label, sort_order)
     VALUES ($1,$2,$3) ON CONFLICT (organization_id, label) DO NOTHING`,
    [orgId, trimmed, (sort.rows[0]?.max ?? -1) + 1],
  );
  return { ok: true as const, labels: await listScheduleActivityLabels(orgId) };
}

export async function removeScheduleActivityLabel(orgId: string, username: string, label: string) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (access.membership.role !== "org_admin") {
    return { error: "Only org admins can remove schedule activities" as const };
  }
  const trimmed = decodeURIComponent(label).trim();
  if (!trimmed) {
    return { error: "Label is required" as const };
  }
  await db().query("DELETE FROM vbs_schedule_activity_labels WHERE organization_id = $1 AND label = $2", [
    orgId,
    trimmed,
  ]);
  return { ok: true as const, labels: await listScheduleActivityLabels(orgId) };
}

async function seedWeekSchedule(planId: string, plan: NonNullable<Awaited<ReturnType<typeof getPlanRow>>>) {
  const startDate = plan.start_date ? plan.start_date.toISOString().slice(0, 10) : "";
  const endDate = plan.end_date ? plan.end_date.toISOString().slice(0, 10) : "";
  if (!startDate || !endDate) {
    return;
  }
  const days = buildFullVbsSchedule(startDate, endDate, plan.daily_start, plan.daily_end);
  for (const day of days) {
    for (const slot of day.slots) {
      await db().query(
        `INSERT INTO vbs_schedule_slots (
           id, plan_id, day_date, starts_at, ends_at, label, station_id, team_id, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,'')`,
        [crypto.randomUUID(), planId, day.dayDate, slot.startsAt, slot.endsAt, slot.label],
      );
    }
  }
}

/** Keep schedule blocks aligned when Overview start/end dates change (by day index). */
async function remapScheduleDayDates(
  planId: string,
  oldStart: string,
  oldEnd: string,
  newStart: string,
  newEnd: string,
) {
  const oldDays = enumerateIsoDays(oldStart, oldEnd);
  const newDays = enumerateIsoDays(newStart, newEnd);
  if (oldDays.length === 0 || newDays.length === 0) {
    return;
  }
  const lastNew = newDays[newDays.length - 1]!;
  for (let i = 0; i < oldDays.length; i++) {
    const from = oldDays[i]!;
    const to = newDays[Math.min(i, newDays.length - 1)]!;
    if (from === to) {
      continue;
    }
    await db().query(
      `UPDATE vbs_schedule_slots SET day_date = $3 WHERE plan_id = $1 AND day_date = $2`,
      [planId, from, to],
    );
  }
  for (let i = newDays.length; i < oldDays.length; i++) {
    const from = oldDays[i]!;
    if (from === lastNew) {
      continue;
    }
    await db().query(
      `UPDATE vbs_schedule_slots SET day_date = $3 WHERE plan_id = $1 AND day_date = $2`,
      [planId, from, lastNew],
    );
  }
}

async function syncScheduleFromOverview(
  planId: string,
  plan: NonNullable<Awaited<ReturnType<typeof getPlanRow>>>,
  previous?: { startDate: string; endDate: string },
) {
  const startDate = plan.start_date ? plan.start_date.toISOString().slice(0, 10) : "";
  const endDate = plan.end_date ? plan.end_date.toISOString().slice(0, 10) : "";
  if (!startDate || !endDate) {
    return;
  }
  const count = await db().query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM vbs_schedule_slots WHERE plan_id = $1",
    [planId],
  );
  const slotCount = count.rows[0]?.count ?? 0;
  if (slotCount === 0) {
    await seedWeekSchedule(planId, plan);
    return;
  }
  if (
    previous?.startDate &&
    previous.endDate &&
    (previous.startDate !== startDate || previous.endDate !== endDate)
  ) {
    await remapScheduleDayDates(planId, previous.startDate, previous.endDate, startDate, endDate);
  }
}

export async function generateVbsDailySchedule(orgId: string, username: string, replace: boolean) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access" as const };
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Create a VBS plan first" as const };
  }
  const startDate = plan.start_date ? plan.start_date.toISOString().slice(0, 10) : "";
  const endDate = plan.end_date ? plan.end_date.toISOString().slice(0, 10) : "";
  if (!startDate || !endDate) {
    return { error: "Set VBS start and end dates on Overview first" as const };
  }
  if (replace) {
    await db().query("DELETE FROM vbs_schedule_slots WHERE plan_id = $1", [plan.id]);
  }
  const existing = await db().query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM vbs_schedule_slots WHERE plan_id = $1",
    [plan.id],
  );
  if (Number(existing.rows[0]?.count) > 0) {
    return { error: "Schedule already has blocks; use replace to rebuild" as const };
  }
  await seedWeekSchedule(plan.id, plan);
  return { ok: true as const };
}

export type OrgVbsCurriculum = {
  year: number;
  publisherId: string;
  programTitle: string;
  publisherName: string;
};

function curriculumPayload() {
  return {
    defaultYear: defaultCurriculumYear,
    publishers: publishers.map((p) => ({ id: p.id, name: p.name })),
    programs: programs.map((p) => ({
      id: p.id,
      year: p.year,
      publisherId: p.publisherId,
      theme: p.theme,
    })),
  };
}

function presentCurriculum(row: NonNullable<Awaited<ReturnType<typeof getPlanRow>>>): OrgVbsCurriculum {
  const publisherName = publishers.find((p) => p.id === row.publisher_id)?.name ?? row.publisher_id;
  return {
    year: row.year,
    publisherId: row.publisher_id,
    programTitle: row.program_title,
    publisherName,
  };
}

export async function getOrgVbsDefault(orgId: string, username: string) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  const planRow = await getPlanRow(orgId);
  const orgDefault =
    planRow && planRow.publisher_id && planRow.program_title ? presentCurriculum(planRow) : null;
  return {
    orgDefault,
    canWrite: planWriteAllowed(access),
    ...curriculumPayload(),
  };
}

export async function setOrgVbsCurriculumDefault(
  orgId: string,
  username: string,
  input: { year: number; publisherId: string; programTitle: string },
) {
  const planRow = await getPlanRow(orgId);
  const result = await upsertVbsPlan(orgId, username, {
    year: input.year,
    title: planRow?.title.trim() || input.programTitle.trim() || `VBS ${input.year}`,
    publisherId: input.publisherId,
    programTitle: input.programTitle.trim(),
    location: planRow?.location ?? "",
    startDate: planRow?.start_date ? planRow.start_date.toISOString().slice(0, 10) : "",
    endDate: planRow?.end_date ? planRow.end_date.toISOString().slice(0, 10) : "",
    dailyStart: planRow?.daily_start ?? "09:00",
    dailyEnd: planRow?.daily_end ?? "12:00",
    expectedKids: planRow?.expected_kids ?? 0,
    coordinatorNotes: planRow?.coordinator_notes ?? "",
    budgetAmount: planRow ? Number(planRow.budget_amount) || 0 : 0,
    expensesAmount: planRow ? Number(planRow.expenses_amount) || 0 : 0,
    seedTemplate: false,
    seedSchedule: false,
  });
  if ("error" in result) {
    return result;
  }
  const row = await getPlanRow(orgId);
  return row && row.publisher_id && row.program_title
    ? { orgDefault: presentCurriculum(row) }
    : { error: "Could not save default VBS" as const };
}

async function ensurePlanRotationStations(planId: string) {
  const result = await db().query<{ id: string; name: string; sort_order: number }>(
    `SELECT id, name, sort_order FROM vbs_stations WHERE plan_id = $1`,
    [planId],
  );
  const rows = result.rows;
  if (rows.length > 0) {
    return;
  }
  let maxOrder = rows.reduce((max, row) => Math.max(max, row.sort_order), -1);

  for (const row of rows) {
    const bucket = rotationBucket(row.name);
    if (bucket !== null) {
      const canonical = VBS_ROTATION_STATION_NAMES[bucket];
      if (row.name !== canonical && rotationNameMatches(row.name, canonical)) {
        await db().query(`UPDATE vbs_stations SET name = $2 WHERE id = $1`, [row.id, canonical]);
      }
    }
  }

  for (const name of defaultVbsPlanStationNames()) {
    if (rows.some((row) => rotationNameMatches(row.name, name))) {
      continue;
    }
    maxOrder += 1;
    await db().query(
      `INSERT INTO vbs_stations (id, plan_id, name, description, default_team_id, sort_order)
       VALUES ($1,$2,$3,'',NULL,$4)`,
      [crypto.randomUUID(), planId, name, maxOrder],
    );
  }
}

export async function getVbsWorkspace(orgId: string, username: string) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  const role = access.membership.role;
  const planRow = await getPlanRow(orgId);
  if (planRow) {
    await ensurePlanRotationStations(planRow.id);
  }
  const plan = planRow ? presentPlan(planRow) : null;
  if (plan) {
    const { assertPlanSeasonAccess } = await import("./vbs-org-season.js");
    const planAccess = await assertPlanSeasonAccess(orgId, username, access.platformAdmin === true, plan.year);
    if ("error" in planAccess) {
      return { error: planAccess.error };
    }
  }

  const prefsResult = await db().query<{ notify_email: boolean; notify_sms: boolean }>(
    `SELECT notify_email, notify_sms FROM organization_members
     WHERE organization_id = $1 AND username = $2`,
    [orgId, username],
  );
  const prefs = prefsResult.rows[0];
  const calendarDefaultView = await readCalendarViewPref(orgId, username);
  const reminderPayload = await listCalendarReminders(orgId, username);
  const calendarReminders = "reminders" in reminderPayload ? reminderPayload.reminders : [];

  const loadRelated = async (planId: string) => {
    const [tasks, stations, schedule, checklist, attachmentsByTask] = await Promise.all([
      db().query(
        `SELECT id, plan_id, title, description, notes, category, status, due_date,
                assigned_username, assigned_team_id, sort_order, created_at,
                expense_amount, reimbursement_status, reimbursement_archived
         FROM vbs_tasks WHERE plan_id = $1 ORDER BY sort_order, created_at`,
        [planId],
      ),
      db().query(
        `SELECT id, plan_id, name, description, default_team_id, sort_order
         FROM vbs_stations WHERE plan_id = $1 ORDER BY sort_order, name`,
        [planId],
      ),
      db().query(
        `SELECT id, plan_id, day_date, starts_at, ends_at, label, station_id, team_id, notes,
                role_label, assigned_username
         FROM vbs_schedule_slots WHERE plan_id = $1 ORDER BY day_date, starts_at`,
        [planId],
      ),
      db().query(
        `SELECT id, plan_id, category, label, done, status, assigned_team_id, due_date, sort_order, notes
         FROM vbs_checklist_items WHERE plan_id = $1 ORDER BY sort_order, category, label`,
        [planId],
      ),
      loadTaskAttachments(planId),
    ]);
    return {
      tasks: tasks.rows.map((row) => ({
        id: row.id,
        planId: row.plan_id,
        title: row.title,
        description: row.description,
        notes: row.notes ?? "",
        category: row.category as VbsTaskCategory,
        status: row.status as VbsTaskStatus,
        dueDate: formatPgDate(row.due_date),
        assignedUsername: row.assigned_username ?? "",
        assignedTeamId: row.assigned_team_id ?? "",
        sortOrder: row.sort_order,
        createdAt: row.created_at.toISOString(),
        expenseAmount: Number(row.expense_amount) || 0,
        reimbursementStatus: reimbursementStatuses.includes(row.reimbursement_status as VbsReimbursementStatus)
          ? (row.reimbursement_status as VbsReimbursementStatus)
          : "none",
        reimbursementArchived: row.reimbursement_archived === true,
        attachments: attachmentsByTask.get(row.id) ?? [],
      })),
      stations: stations.rows.map((row) => ({
        id: row.id,
        planId: row.plan_id,
        name: row.name,
        description: row.description,
        defaultTeamId: row.default_team_id ?? "",
        sortOrder: row.sort_order,
      })),
      schedule: schedule.rows.map((row) => ({
        id: row.id,
        planId: row.plan_id,
        dayDate: formatPgDate(row.day_date),
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        label: row.label,
        stationId: row.station_id ?? "",
        teamId: row.team_id ?? "",
        notes: row.notes,
        roleLabel: row.role_label ?? "",
        assignedUsername: row.assigned_username ?? "",
      })),
      checklist: checklist.rows.map((row) => {
        const status = normalizeMilestoneStatus({ status: row.status, done: row.done });
        return {
          id: row.id,
          planId: row.plan_id,
          category: row.category,
          label: row.label,
          status,
          done: status === "done",
          assignedTeamId: row.assigned_team_id ?? "",
          dueDate: formatPgDate(row.due_date),
          sortOrder: row.sort_order,
          notes: row.notes ?? "",
        };
      }),
    };
  };

  const related = plan
    ? await loadRelated(plan.id)
    : { tasks: [], stations: [], schedule: [], checklist: [] };
  const supplies = plan ? await listSupplyItems(plan.id) : [];
  const planWithTaskExpenses = plan
    ? { ...plan, expensesAmount: sumTaskExpenseAmounts(related.tasks) }
    : null;
  const boardPayload = await listBoardPosts(orgId, username);
  const boardPosts = "boardPosts" in boardPayload ? boardPayload.boardPosts : [];
  const { isPlatformAdmin } = await import("./users.js");
  const teams = await listTeamsForViewer(orgId, username, await isPlatformAdmin(username));
  const year = plan?.year ?? defaultCurriculumYear;
  const programList = programs
    .filter((p) => p.year === year)
    .map((p) => ({
      id: p.id,
      year: p.year,
      publisherId: p.publisherId,
      theme: p.theme,
    }));

  const scheduleActivityLabels = await listScheduleActivityLabels(orgId);

  return {
    plan: planWithTaskExpenses,
    ...related,
    supplies,
    boardPosts,
    teams,
    canWrite: planWriteAllowed(access),
    canAdmin: role === "org_admin" || access.platformAdmin === true,
    scheduleActivityLabels,
    scheduleRoleSuggestions: [...SCHEDULE_ROLE_SUGGESTIONS],
    notificationPrefs: {
      notifyEmail: prefs?.notify_email ?? true,
      notifySms: prefs?.notify_sms ?? false,
    },
    calendarDefaultView,
    calendarReminders,
    defaultYear: defaultCurriculumYear,
    publishers: publishers.map((p) => ({ id: p.id, name: p.name })),
    programs: programList,
    taskStatuses,
    taskCategories,
    taskReimbursementStatuses: reimbursementStatuses,
    milestoneCategories: [...vbsMilestoneCategories],
  };
}

export async function upsertVbsPlan(
  orgId: string,
  username: string,
  input: {
    year: number;
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
    familyPublicNotes?: string;
    budgetAmount: number;
    expensesAmount: number;
    seedTemplate?: boolean;
    seedSchedule?: boolean;
  },
) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access to edit the VBS plan" as const };
  }
  if (!input.year) {
    return { error: "Year is required" as const };
  }
  const { resolveViewerSeason, syncActiveVbsYear } = await import("./vbs-org-season.js");
  const season = await resolveViewerSeason(orgId, username, access.platformAdmin === true);
  if ("error" in season) {
    return { error: season.error };
  }
  if (!season.viewAllSeasons && input.year !== season.viewSeason) {
    return {
      error: `Your access is for VBS ${season.viewSeason}. You cannot edit the plan for VBS ${input.year}.` as const,
    };
  }

  const existing = await getPlanRow(orgId);
  const now = new Date().toISOString();
  const startDate = input.startDate || null;
  const endDate = input.endDate || null;

  if (existing && existing.year !== input.year) {
    const { persistLiveSeasonSnapshot } = await import("./vbs-season-copy.js");
    await persistLiveSeasonSnapshot(orgId, existing.year);
  }

  if (existing) {
    await db().query(
      `UPDATE vbs_plans SET year=$2, title=$3, publisher_id=$4, program_title=$5, location=$6,
         start_date=$7, end_date=$8, daily_start=$9, daily_end=$10, expected_kids=$11,
         coordinator_notes=$12, family_public_notes=$13, budget_amount=$14, updated_at=$15
       WHERE id=$1`,
      [
        existing.id,
        input.year,
        input.title.trim(),
        input.publisherId,
        input.programTitle.trim(),
        input.location.trim(),
        startDate,
        endDate,
        input.dailyStart || "09:00",
        input.dailyEnd || "12:00",
        input.expectedKids || 0,
        input.coordinatorNotes.trim(),
        (input.familyPublicNotes ?? existing.family_public_notes ?? "").trim(),
        Math.max(0, input.budgetAmount || 0),
        now,
      ],
    );
    await syncPlanExpensesFromTasks(existing.id);
    const previousOverviewDates = {
      startDate: existing.start_date ? existing.start_date.toISOString().slice(0, 10) : "",
      endDate: existing.end_date ? existing.end_date.toISOString().slice(0, 10) : "",
    };
    const planRow = await getPlanRow(orgId);
    if (planRow) {
      await syncScheduleFromOverview(existing.id, planRow, previousOverviewDates);
    }
    await syncActiveVbsYear(orgId, input.year);
    const updated = await getPlanRow(orgId);
    return updated ? { plan: presentPlan(updated) } : { error: "Could not update plan" as const };
  }

  const id = crypto.randomUUID();
  await db().query(
    `INSERT INTO vbs_plans (
       id, organization_id, year, title, publisher_id, program_title, location,
       start_date, end_date, daily_start, daily_end, expected_kids, coordinator_notes,
       family_public_notes, budget_amount, expenses_amount, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      id,
      orgId,
      input.year,
      input.title.trim() || `VBS ${input.year}`,
      input.publisherId,
      input.programTitle.trim(),
      input.location.trim(),
      startDate,
      endDate,
      input.dailyStart || "09:00",
      input.dailyEnd || "12:00",
      input.expectedKids || 0,
      input.coordinatorNotes.trim(),
      (input.familyPublicNotes ?? "").trim(),
      Math.max(0, input.budgetAmount || 0),
      Math.max(0, input.expensesAmount || 0),
      now,
    ],
  );

  if (input.seedTemplate !== false) {
    await seedStarterContent(id, orgId, input.startDate || null);
  }
  const planRow = await getPlanRow(orgId);
  if (planRow) {
    await syncScheduleFromOverview(id, planRow);
  }

  await syncActiveVbsYear(orgId, input.year);
  const row = await getPlanRow(orgId);
  return row ? { plan: presentPlan(row) } : { error: "Could not create plan" as const };
}

async function taskAssignees(orgId: string, task: { assigned_username: string | null; assigned_team_id: string | null }) {
  const usernames: string[] = [];
  if (task.assigned_username) {
    usernames.push(task.assigned_username);
  }
  if (task.assigned_team_id) {
    const team = await getTeam(orgId, task.assigned_team_id);
    if (team) {
      usernames.push(...team.memberUsernames);
    }
  }
  return [...new Set(usernames)];
}

async function canEditTask(
  orgId: string,
  username: string,
  role: OrgRole,
  task: { assigned_username: string | null; assigned_team_id: string | null },
) {
  if (canWrite(role)) {
    return true;
  }
  if (task.assigned_username === username) {
    return true;
  }
  if (task.assigned_team_id) {
    const team = await getTeam(orgId, task.assigned_team_id);
    return team?.memberUsernames.includes(username) ?? false;
  }
  return false;
}

export async function saveVbsTask(
  orgId: string,
  username: string,
  input: {
    id?: string;
    title: string;
    description: string;
    notes?: string;
    category: string;
    status: string;
    dueDate: string;
    assignedUsername: string;
    assignedTeamId: string;
    expenseAmount?: number;
    reimbursementStatus?: string;
    attachments?: TaskAttachmentInput[];
    notify?: boolean;
  },
) {
  const notes = (input.notes ?? "").trim();
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Create a VBS plan first" as const };
  }

  const title = input.title.trim();
  if (!title) {
    return { error: "Task title is required" as const };
  }
  const category = taskCategories.includes(input.category as VbsTaskCategory)
    ? (input.category as VbsTaskCategory)
    : "planning";
  const status = taskStatuses.includes(input.status as VbsTaskStatus)
    ? (input.status as VbsTaskStatus)
    : "todo";
  const reimbursementStatus = reimbursementStatuses.includes(input.reimbursementStatus as VbsReimbursementStatus)
    ? (input.reimbursementStatus as VbsReimbursementStatus)
    : "none";
  const expenseAmount = Math.max(0, Number(input.expenseAmount) || 0);

  let assignedUsername: string | null = null;
  if (input.assignedUsername.trim()) {
    const resolved = await findUser(input.assignedUsername.trim());
    if (!resolved) {
      return { error: "Assigned user not found" as const };
    }
    const membership = await getMembership(orgId, resolved);
    if (!membership) {
      return { error: "Assigned user is not in this organization" as const };
    }
    assignedUsername = resolved;
  }

  const assignedTeamId = input.assignedTeamId.trim() || null;
  if (assignedTeamId && !(await getTeam(orgId, assignedTeamId))) {
    return { error: "Assigned team not found" as const };
  }

  const dueDate = input.dueDate || null;
  const now = new Date().toISOString();

  let previousReimbursementStatus: VbsReimbursementStatus | null = null;

  if (input.id) {
    const existing = await db().query<{
      id: string;
      assigned_username: string | null;
      assigned_team_id: string | null;
      reimbursement_status: string;
    }>(
      "SELECT id, assigned_username, assigned_team_id, reimbursement_status FROM vbs_tasks WHERE id = $1 AND plan_id = $2",
      [input.id, plan.id],
    );
    const row = existing.rows[0];
    if (!row) {
      return { error: "Task not found" as const };
    }
    previousReimbursementStatus = reimbursementStatuses.includes(row.reimbursement_status as VbsReimbursementStatus)
      ? (row.reimbursement_status as VbsReimbursementStatus)
      : "none";
    const editable =
      planWriteAllowed(access) ||
      (await canEditTask(orgId, username, access.membership.role, row));
    if (!editable) {
      return { error: "You cannot edit this task" as const };
    }
    const writeFields = planWriteAllowed(access);
    await db().query(
      writeFields
        ? `UPDATE vbs_tasks SET title=$2, description=$3, notes=$4, category=$5, status=$6, due_date=$7,
             assigned_username=$8, assigned_team_id=$9, expense_amount=$10, reimbursement_status=$11,
             reimbursement_archived = CASE WHEN $11 = 'submitted' THEN FALSE ELSE reimbursement_archived END
             WHERE id=$1`
        : `UPDATE vbs_tasks SET status=$2 WHERE id=$1`,
      writeFields
        ? [
            input.id,
            title,
            input.description.trim(),
            notes,
            category,
            status,
            dueDate,
            assignedUsername,
            assignedTeamId,
            expenseAmount,
            reimbursementStatus,
          ]
        : [input.id, status],
    );
    if (writeFields && input.attachments !== undefined) {
      await replaceTaskAttachments(input.id, input.attachments);
    }
  } else {
    if (!planWriteAllowed(access)) {
      return { error: "You need write access to add tasks" as const };
    }
    const id = crypto.randomUUID();
    const sort = await db().query<{ max: number }>(
      "SELECT COALESCE(MAX(sort_order), -1)::int AS max FROM vbs_tasks WHERE plan_id = $1",
      [plan.id],
    );
    await db().query(
      `INSERT INTO vbs_tasks (
         id, plan_id, title, description, notes, category, status, due_date,
         assigned_username, assigned_team_id, sort_order, created_at,
         expense_amount, reimbursement_status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        plan.id,
        title,
        input.description.trim(),
        notes,
        category,
        status,
        dueDate,
        assignedUsername,
        assignedTeamId,
        (sort.rows[0]?.max ?? -1) + 1,
        now,
        expenseAmount,
        reimbursementStatus,
      ],
    );
    input.id = id;
    if (input.attachments?.length) {
      await replaceTaskAttachments(id, input.attachments);
    }
  }

  if (input.notify) {
    const taskRow = await db().query<{
      title: string;
      assigned_username: string | null;
      assigned_team_id: string | null;
    }>("SELECT title, assigned_username, assigned_team_id FROM vbs_tasks WHERE id = $1", [input.id]);
    const task = taskRow.rows[0];
    if (task) {
      const recipients = await taskAssignees(orgId, task);
      await deliverOrgNotifications(
        orgId,
        recipients,
        "VBS task assigned",
        task.title,
        planLink(orgId),
        { inApp: true, email: true, sms: true },
      );
    }
  }

  if (
    reimbursementStatus === "submitted" &&
    previousReimbursementStatus !== "submitted" &&
    input.id
  ) {
    const admins = await orgAdminUsernames(orgId);
    const amountLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      expenseAmount,
    );
    await deliverOrgNotifications(
      orgId,
      admins,
      "Receipt submitted for reimbursement",
      `${title} — ${amountLabel}. Review in Reimbursements.`,
      vbsPlanTabLink(orgId, "reimbursements"),
      { inApp: true, email: true, sms: true },
    );
  }

  if (reimbursementStatus === "submitted" && !input.id) {
    const admins = await orgAdminUsernames(orgId);
    const amountLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      expenseAmount,
    );
    await deliverOrgNotifications(
      orgId,
      admins,
      "Receipt submitted for reimbursement",
      `${title} — ${amountLabel}. Review in Reimbursements.`,
      vbsPlanTabLink(orgId, "reimbursements"),
      { inApp: true, email: true, sms: true },
    );
  }

  await syncPlanExpensesFromTasks(plan.id);
  return { ok: true as const };
}

export async function deleteVbsTask(orgId: string, username: string, taskId: string) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access to delete tasks" as const };
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Plan not found" as const };
  }
  await db().query("DELETE FROM vbs_tasks WHERE id = $1 AND plan_id = $2", [taskId, plan.id]);
  await syncPlanExpensesFromTasks(plan.id);
  return { ok: true as const };
}

export async function saveVbsStation(
  orgId: string,
  username: string,
  input: { id?: string; name: string; description: string; defaultTeamId: string },
) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access" as const };
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Create a VBS plan first" as const };
  }
  const name = input.name.trim();
  if (!name) {
    return { error: "Station name is required" as const };
  }
  const defaultTeamId = input.defaultTeamId.trim() || null;
  if (defaultTeamId && !(await getTeam(orgId, defaultTeamId))) {
    return { error: "Team not found" as const };
  }

  if (input.id) {
    await db().query(
      "UPDATE vbs_stations SET name=$2, description=$3, default_team_id=$4 WHERE id=$1 AND plan_id=$5",
      [input.id, name, input.description.trim(), defaultTeamId, plan.id],
    );
  } else {
    const sort = await db().query<{ max: number }>(
      "SELECT COALESCE(MAX(sort_order), -1)::int AS max FROM vbs_stations WHERE plan_id = $1",
      [plan.id],
    );
    await db().query(
      `INSERT INTO vbs_stations (id, plan_id, name, description, default_team_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [crypto.randomUUID(), plan.id, name, input.description.trim(), defaultTeamId, (sort.rows[0]?.max ?? -1) + 1],
    );
  }
  return { ok: true as const };
}

export async function deleteVbsStation(orgId: string, username: string, stationId: string) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access" as const };
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Plan not found" as const };
  }
  await db().query("DELETE FROM vbs_stations WHERE id = $1 AND plan_id = $2", [stationId, plan.id]);
  return { ok: true as const };
}

export async function saveVbsScheduleSlot(
  orgId: string,
  username: string,
  input: {
    id?: string;
    dayDate: string;
    startsAt: string;
    endsAt: string;
    label: string;
    stationId: string;
    teamId: string;
    notes: string;
    roleLabel?: string;
    assignedUsername?: string;
  },
) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access" as const };
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Create a VBS plan first" as const };
  }
  if (!input.dayDate || !input.label.trim()) {
    return { error: "Day and label are required" as const };
  }
  const stationId = input.stationId.trim() || null;
  const teamIdRaw = input.teamId.trim();
  let teamId: string | null = null;
  if (teamIdRaw) {
    const team = await getTeam(orgId, teamIdRaw);
    if (!team) {
      return { error: "Team not found" as const };
    }
    teamId = teamIdRaw;
  }
  const roleLabel = (input.roleLabel ?? "").trim().slice(0, 120);
  let assignedUsername = "";
  if (input.assignedUsername?.trim()) {
    const resolved = await findUser(input.assignedUsername.trim());
    if (!resolved) {
      return { error: "Assigned person was not found" as const };
    }
    const member = await getMembership(orgId, resolved);
    if (!member) {
      return { error: "Assigned person must be an organization member" as const };
    }
    assignedUsername = resolved;
  }

  const trimmedLabel = input.label.trim();
  const labelSaved = await addScheduleActivityLabel(orgId, username, trimmedLabel);
  if ("error" in labelSaved) {
    return labelSaved;
  }

  if (input.id) {
    await db().query(
      `UPDATE vbs_schedule_slots SET day_date=$2, starts_at=$3, ends_at=$4, label=$5,
         station_id=$6, team_id=$7, notes=$8, role_label=$9, assigned_username=$10
       WHERE id=$1 AND plan_id=$11`,
      [
        input.id,
        input.dayDate,
        input.startsAt || "09:00",
        input.endsAt || "09:30",
        trimmedLabel,
        stationId,
        teamId,
        input.notes.trim(),
        roleLabel,
        assignedUsername,
        plan.id,
      ],
    );
  } else {
    await db().query(
      `INSERT INTO vbs_schedule_slots (
         id, plan_id, day_date, starts_at, ends_at, label, station_id, team_id, notes,
         role_label, assigned_username
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        crypto.randomUUID(),
        plan.id,
        input.dayDate,
        input.startsAt || "09:00",
        input.endsAt || "09:30",
        trimmedLabel,
        stationId,
        teamId,
        input.notes.trim(),
        roleLabel,
        assignedUsername,
      ],
    );
  }
  return { ok: true as const };
}

export async function deleteVbsScheduleSlot(orgId: string, username: string, slotId: string) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access" as const };
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Plan not found" as const };
  }
  await db().query("DELETE FROM vbs_schedule_slots WHERE id = $1 AND plan_id = $2", [slotId, plan.id]);
  return { ok: true as const };
}

export async function saveVbsChecklistItem(
  orgId: string,
  username: string,
  input: {
    id?: string;
    category?: string;
    label?: string;
    done?: boolean;
    status?: string;
    assignedTeamId?: string;
    dueDate?: string;
    notes?: string;
  },
) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Create a VBS plan first" as const };
  }

  const patchOnlyUpdate =
    input.id &&
    !String(input.label ?? "").trim() &&
    !String(input.category ?? "").trim() &&
    (typeof input.done === "boolean" ||
      input.status === "not_started" ||
      input.status === "in_progress" ||
      input.status === "done");

  if (patchOnlyUpdate) {
    const status = normalizeMilestoneStatus({
      status: input.status,
      done: input.done,
    });
    await db().query(
      "UPDATE vbs_checklist_items SET done = $2, status = $3 WHERE id = $1 AND plan_id = $4",
      [input.id, status === "done", status, plan.id],
    );
    return { ok: true as const };
  }

  if (!planWriteAllowed(access)) {
    return { error: "You need write access" as const };
  }
  const label = String(input.label ?? "").trim();
  const category = normalizeMilestoneCategory(String(input.category ?? ""));
  if (!label) {
    return { error: "Checklist label is required" as const };
  }
  const assignedTeamId = String(input.assignedTeamId ?? "").trim() || null;
  const dueDate = input.dueDate?.trim() || null;
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const status = normalizeMilestoneStatus({
    status: input.status,
    done: input.done,
  });
  const done = status === "done";

  if (input.id) {
    await db().query(
      `UPDATE vbs_checklist_items
       SET category=$2, label=$3, assigned_team_id=$4, due_date=$5, notes=$6, done=$7, status=$8
       WHERE id=$1 AND plan_id=$9`,
      [input.id, category, label, assignedTeamId, dueDate, notes, done, status, plan.id],
    );
  } else {
    const sort = await db().query<{ max: number }>(
      "SELECT COALESCE(MAX(sort_order), -1)::int AS max FROM vbs_checklist_items WHERE plan_id = $1",
      [plan.id],
    );
    await db().query(
      `INSERT INTO vbs_checklist_items (id, plan_id, category, label, done, status, assigned_team_id, due_date, sort_order, notes)
       VALUES ($1,$2,$3,$4,FALSE,'not_started',$5,$6,$7,$8)`,
      [
        crypto.randomUUID(),
        plan.id,
        category,
        label,
        assignedTeamId,
        dueDate,
        (sort.rows[0]?.max ?? -1) + 1,
        notes,
      ],
    );
  }
  return { ok: true as const };
}

export async function deleteVbsChecklistItem(orgId: string, username: string, itemId: string) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access" as const };
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Plan not found" as const };
  }
  await db().query("DELETE FROM vbs_checklist_items WHERE id = $1 AND plan_id = $2", [itemId, plan.id]);
  return { ok: true as const };
}

const MAX_SUPPLY_NAME = 200;
const MAX_SUPPLY_QUANTITY = 80;
const MAX_SUPPLY_NOTES = 2000;

export async function listSupplyItems(planId: string) {
  const result = await db().query<{
    id: string;
    plan_id: string;
    name: string;
    quantity: string;
    estimated_cost: string;
    purchased: boolean;
    assigned_team_id: string | null;
    notes: string;
    sort_order: number;
  }>(
    `SELECT id, plan_id, name, quantity, estimated_cost, purchased, assigned_team_id, notes, sort_order
     FROM vbs_supply_items WHERE plan_id = $1 ORDER BY sort_order, name`,
    [planId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    planId: row.plan_id,
    name: row.name,
    quantity: row.quantity,
    estimatedCost: Number(row.estimated_cost) || 0,
    purchased: row.purchased === true,
    assignedTeamId: row.assigned_team_id ?? "",
    notes: row.notes,
    sortOrder: row.sort_order,
  }));
}

export async function saveVbsSupplyItem(
  orgId: string,
  username: string,
  input: {
    id?: string;
    name: string;
    quantity: string;
    estimatedCost: number;
    purchased: boolean;
    assignedTeamId: string;
    notes: string;
  },
) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access" as const };
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Create a VBS plan first" as const };
  }
  const name = input.name.trim().slice(0, MAX_SUPPLY_NAME);
  if (!name) {
    return { error: "Item name is required" as const };
  }
  const teamIdRaw = input.assignedTeamId.trim();
  let teamId: string | null = null;
  if (teamIdRaw) {
    const team = await getTeam(orgId, teamIdRaw);
    if (!team) {
      return { error: "Team not found" as const };
    }
    teamId = teamIdRaw;
  }
  const cost = Math.max(0, Math.min(input.estimatedCost || 0, 999_999.99));
  const quantity = input.quantity.trim().slice(0, MAX_SUPPLY_QUANTITY);
  const notes = input.notes.trim().slice(0, MAX_SUPPLY_NOTES);

  if (input.id) {
    await db().query(
      `UPDATE vbs_supply_items SET name=$2, quantity=$3, estimated_cost=$4, purchased=$5,
         assigned_team_id=$6, notes=$7 WHERE id=$1 AND plan_id=$8`,
      [input.id, name, quantity, cost, input.purchased === true, teamId, notes, plan.id],
    );
  } else {
    const order = await db().query<{ max: number | null }>(
      "SELECT MAX(sort_order) AS max FROM vbs_supply_items WHERE plan_id = $1",
      [plan.id],
    );
    const sortOrder = (order.rows[0]?.max ?? -1) + 1;
    await db().query(
      `INSERT INTO vbs_supply_items (
         id, plan_id, name, quantity, estimated_cost, purchased, assigned_team_id, notes, sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [crypto.randomUUID(), plan.id, name, quantity, cost, input.purchased === true, teamId, notes, sortOrder],
    );
  }
  return { ok: true as const };
}

export async function deleteVbsSupplyItem(orgId: string, username: string, itemId: string) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  if (!planWriteAllowed(access)) {
    return { error: "You need write access" as const };
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Plan not found" as const };
  }
  await db().query("DELETE FROM vbs_supply_items WHERE id = $1 AND plan_id = $2", [itemId, plan.id]);
  return { ok: true as const };
}

export async function updateVbsNotificationPrefs(
  orgId: string,
  username: string,
  input: { notifyEmail: boolean; notifySms: boolean },
) {
  const access = await requireMember(orgId, username);
  if ("error" in access) {
    return access;
  }
  await db().query(
    `UPDATE organization_members SET notify_email = $3, notify_sms = $4
     WHERE organization_id = $1 AND username = $2`,
    [orgId, username, input.notifyEmail, input.notifySms],
  );
  return {
    notificationPrefs: { notifyEmail: input.notifyEmail, notifySms: input.notifySms },
  };
}
