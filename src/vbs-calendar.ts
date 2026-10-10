import { db } from "./db/pool.js";
import { deliverOrgNotifications } from "./notify-delivery.js";
import { getMembership } from "./orgs.js";

type VbsTask = { id: string; dueDate: string; title: string };
type VbsScheduleSlot = { id: string; dayDate: string; startsAt: string; label: string };
type VbsChecklistItem = { id: string; dueDate: string; label: string };

export type CalendarItemType = "task" | "schedule" | "checklist" | "plan_start" | "plan_end";
export type CalendarViewMode = "day" | "week" | "month";

export const REMINDER_OFFSETS_MINUTES = [10, 20, 30, 60, 1440] as const;

export type CalendarReminder = {
  id: string;
  itemType: CalendarItemType;
  itemId: string;
  minutesBefore: number;
  notifyEmail: boolean;
  notifySms: boolean;
};

type PlanDates = {
  planId: string;
  startDate: string;
  endDate: string;
  title: string;
};

function presentReminder(row: {
  id: string;
  item_type: string;
  item_id: string;
  minutes_before: number;
  notify_email: boolean;
  notify_sms: boolean;
}): CalendarReminder {
  return {
    id: row.id,
    itemType: row.item_type as CalendarItemType,
    itemId: row.item_id,
    minutesBefore: row.minutes_before,
    notifyEmail: row.notify_email,
    notifySms: row.notify_sms,
  };
}

export async function listCalendarReminders(orgId: string, username: string) {
  const membership = await getMembership(orgId, username);
  if (!membership) {
    return { error: "Not a member of this organization" as const };
  }
  const result = await db().query<{
    id: string;
    item_type: string;
    item_id: string;
    minutes_before: number;
    notify_email: boolean;
    notify_sms: boolean;
  }>(
    `SELECT id, item_type, item_id, minutes_before, notify_email, notify_sms
     FROM vbs_calendar_reminders
     WHERE organization_id = $1 AND username = $2
     ORDER BY item_type, item_id, minutes_before`,
    [orgId, username],
  );
  return { reminders: result.rows.map(presentReminder) };
}

export async function saveCalendarReminders(
  orgId: string,
  username: string,
  input: {
    itemType: CalendarItemType;
    itemId: string;
    reminders: { minutesBefore: number; notifyEmail: boolean; notifySms: boolean }[];
  },
) {
  const membership = await getMembership(orgId, username);
  if (!membership) {
    return { error: "Not a member of this organization" as const };
  }
  const allowed = new Set(REMINDER_OFFSETS_MINUTES);
  for (const item of input.reminders) {
    if (!allowed.has(item.minutesBefore as (typeof REMINDER_OFFSETS_MINUTES)[number])) {
      return { error: "Invalid reminder timing" as const };
    }
  }

  await db().query(
    `DELETE FROM vbs_calendar_reminders
     WHERE organization_id = $1 AND username = $2 AND item_type = $3 AND item_id = $4`,
    [orgId, username, input.itemType, input.itemId],
  );

  for (const item of input.reminders) {
    await db().query(
      `INSERT INTO vbs_calendar_reminders (
         id, organization_id, username, item_type, item_id, minutes_before, notify_email, notify_sms
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        crypto.randomUUID(),
        orgId,
        username,
        input.itemType,
        input.itemId,
        item.minutesBefore,
        item.notifyEmail,
        item.notifySms,
      ],
    );
  }

  return listCalendarReminders(orgId, username);
}

export async function updateCalendarViewPref(orgId: string, username: string, view: CalendarViewMode) {
  const membership = await getMembership(orgId, username);
  if (!membership) {
    return { error: "Not a member of this organization" as const };
  }
  if (view !== "day" && view !== "week" && view !== "month") {
    return { error: "Invalid calendar view" as const };
  }
  await db().query(
    `UPDATE organization_members SET vbs_calendar_default_view = $3
     WHERE organization_id = $1 AND username = $2`,
    [orgId, username, view],
  );
  return { calendarDefaultView: view };
}

export async function readCalendarViewPref(orgId: string, username: string): Promise<CalendarViewMode> {
  const result = await db().query<{ vbs_calendar_default_view: string }>(
    `SELECT vbs_calendar_default_view FROM organization_members WHERE organization_id = $1 AND username = $2`,
    [orgId, username],
  );
  const view = result.rows[0]?.vbs_calendar_default_view;
  if (view === "day" || view === "week" || view === "month") {
    return view;
  }
  return "week";
}

function parseEventAt(
  itemType: CalendarItemType,
  itemId: string,
  plan: PlanDates | null,
  tasks: VbsTask[],
  schedule: VbsScheduleSlot[],
  checklist: VbsChecklistItem[] = [],
): Date | null {
  if (!plan) {
    return null;
  }
  if (itemType === "plan_start" && plan.startDate) {
    return new Date(`${plan.startDate}T08:00:00`);
  }
  if (itemType === "plan_end" && plan.endDate) {
    return new Date(`${plan.endDate}T17:00:00`);
  }
  if (itemType === "task") {
    const task = tasks.find((t) => t.id === itemId);
    if (!task?.dueDate) {
      return null;
    }
    return new Date(`${task.dueDate}T09:00:00`);
  }
  if (itemType === "schedule") {
    const slot = schedule.find((s) => s.id === itemId);
    if (!slot?.dayDate) {
      return null;
    }
    const time = slot.startsAt || "09:00";
    return new Date(`${slot.dayDate}T${time}:00`);
  }
  if (itemType === "checklist") {
    const item = checklist.find((c) => c.id === itemId);
    if (!item?.dueDate) {
      return null;
    }
    return new Date(`${item.dueDate}T09:00:00`);
  }
  return null;
}

function reminderLabel(
  itemType: CalendarItemType,
  itemId: string,
  plan: PlanDates,
  tasks: VbsTask[],
  schedule: VbsScheduleSlot[],
  checklist: VbsChecklistItem[] = [],
) {
  if (itemType === "plan_start") {
    return `${plan.title || "VBS"} starts`;
  }
  if (itemType === "plan_end") {
    return `${plan.title || "VBS"} ends`;
  }
  if (itemType === "task") {
    return tasks.find((t) => t.id === itemId)?.title ?? "Task";
  }
  if (itemType === "checklist") {
    return checklist.find((c) => c.id === itemId)?.label ?? "Checklist item";
  }
  return schedule.find((s) => s.id === itemId)?.label ?? "Schedule block";
}

export async function processCalendarReminders() {
  const rows = await db().query<{
    id: string;
    organization_id: string;
    username: string;
    item_type: CalendarItemType;
    item_id: string;
    minutes_before: number;
    notify_email: boolean;
    notify_sms: boolean;
    fired_at: Date | null;
  }>(
    `SELECT id, organization_id, username, item_type, item_id, minutes_before, notify_email, notify_sms, fired_at
     FROM vbs_calendar_reminders
     WHERE fired_at IS NULL`,
  );

  const now = Date.now();
  for (const row of rows.rows) {
    const planRow = await db().query<{
      id: string;
      title: string;
      start_date: Date | null;
      end_date: Date | null;
    }>(
      `SELECT id, title, start_date, end_date FROM vbs_plans WHERE organization_id = $1 LIMIT 1`,
      [row.organization_id],
    );
    const planData = planRow.rows[0];
    if (!planData) {
      continue;
    }
    const plan: PlanDates = {
      planId: planData.id,
      title: planData.title,
      startDate: planData.start_date ? planData.start_date.toISOString().slice(0, 10) : "",
      endDate: planData.end_date ? planData.end_date.toISOString().slice(0, 10) : "",
    };

    const [tasksRes, scheduleRes, checklistRes] = await Promise.all([
      db().query<{ id: string; title: string; due_date: Date | null }>(
        `SELECT id, title, due_date FROM vbs_tasks WHERE plan_id = $1`,
        [planData.id],
      ),
      db().query<{ id: string; day_date: Date; starts_at: string; label: string }>(
        `SELECT id, day_date, starts_at, label FROM vbs_schedule_slots WHERE plan_id = $1`,
        [planData.id],
      ),
      db().query<{ id: string; label: string; due_date: Date | null }>(
        `SELECT id, label, due_date FROM vbs_checklist_items WHERE plan_id = $1`,
        [planData.id],
      ),
    ]);

    const tasks: VbsTask[] = tasksRes.rows.map((t) => ({
      id: t.id,
      planId: planData.id,
      title: t.title,
      description: "",
      category: "planning",
      status: "todo",
      dueDate: t.due_date ? t.due_date.toISOString().slice(0, 10) : "",
      assignedUsername: "",
      assignedTeamId: "",
      sortOrder: 0,
      createdAt: "",
    }));
    const schedule: VbsScheduleSlot[] = scheduleRes.rows.map((s) => ({
      id: s.id,
      planId: planData.id,
      dayDate: s.day_date.toISOString().slice(0, 10),
      startsAt: s.starts_at,
      endsAt: "",
      label: s.label,
      stationId: "",
      teamId: "",
      notes: "",
    }));
    const checklist: VbsChecklistItem[] = checklistRes.rows.map((c) => ({
      id: c.id,
      label: c.label,
      dueDate: c.due_date ? c.due_date.toISOString().slice(0, 10) : "",
    }));

    const eventAt = parseEventAt(row.item_type, row.item_id, plan, tasks, schedule, checklist);
    if (!eventAt) {
      continue;
    }
    const triggerAt = eventAt.getTime() - row.minutes_before * 60_000;
    if (now < triggerAt || now > eventAt.getTime() + 15 * 60_000) {
      continue;
    }

    const title = reminderLabel(row.item_type, row.item_id, plan, tasks, schedule, checklist);
    const when = eventAt.toLocaleString();
    const offset =
      row.minutes_before >= 1440
        ? "1 day"
        : row.minutes_before >= 60
          ? `${row.minutes_before / 60} hour${row.minutes_before > 60 ? "s" : ""}`
          : `${row.minutes_before} minutes`;
    const body = `Reminder (${offset} before): ${title} at ${when}`;
    const link = `/org/${row.organization_id}/vbs-plan`;

    await deliverOrgNotifications(row.organization_id, [row.username], `VBS calendar: ${title}`, body, link, {
      inApp: true,
      email: row.notify_email,
      sms: row.notify_sms,
    });
    await db().query("UPDATE vbs_calendar_reminders SET fired_at = NOW() WHERE id = $1", [row.id]);
  }
}
