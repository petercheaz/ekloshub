import type { OrgTeam, VbsChecklistItem, VbsPlan, VbsScheduleSlot, VbsTask } from "./types";
import { MILESTONE_STATUS_LABELS, normalizeMilestoneStatus } from "./vbs-milestone-status";

export type CalendarItemType = "task" | "schedule" | "checklist" | "plan_start" | "plan_end";
export type CalendarViewMode = "day" | "week" | "month";

export type PlanCalendarEvent = {
  key: string;
  itemType: CalendarItemType;
  itemId: string;
  title: string;
  detail: string;
  /** Full text for hover tooltip and detail panel header. */
  tooltipText: string;
  start: Date;
  end: Date;
  allDay: boolean;
  kind: "task" | "schedule" | "checklist" | "milestone";
};

export const REMINDER_OFFSETS = [
  { minutes: 10, label: "10 minutes before" },
  { minutes: 20, label: "20 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 1440, label: "1 day before" },
] as const;

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function weekStart(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

export function weekDays(anchor: Date) {
  const start = weekStart(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function parseLocalDay(isoDate: string) {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) {
    return new Date(NaN);
  }
  return new Date(y, m - 1, d);
}

function parseTimeOnDay(day: string, time: string, fallbackHour: number) {
  const base = parseLocalDay(day);
  const [h, m] = time.split(":").map(Number);
  base.setHours(Number.isFinite(h) ? h : fallbackHour, Number.isFinite(m) ? m : 0, 0, 0);
  return base;
}

export function buildPlanCalendarEvents(input: {
  plan: VbsPlan | null;
  tasks: VbsTask[];
  schedule: VbsScheduleSlot[];
  checklist: VbsChecklistItem[];
  teams: OrgTeam[];
  username: string;
  canWrite: boolean;
  seesAllTeams: boolean;
  teamName: (id: string) => string;
}): PlanCalendarEvent[] {
  const { plan, tasks, schedule, checklist, teams, username, canWrite, seesAllTeams, teamName } = input;
  const myTeamIds = new Set(teams.filter((t) => t.memberUsernames.includes(username)).map((t) => t.id));
  const events: PlanCalendarEvent[] = [];

  const includeTask = (task: VbsTask) =>
    canWrite ||
    seesAllTeams ||
    task.assignedUsername === username ||
    (task.assignedTeamId && myTeamIds.has(task.assignedTeamId));

  const includeSchedule = (slot: VbsScheduleSlot) =>
    canWrite || seesAllTeams || !slot.teamId || myTeamIds.has(slot.teamId);

  const includeChecklist = (item: VbsChecklistItem) =>
    canWrite ||
    seesAllTeams ||
    (item.assignedTeamId && myTeamIds.has(item.assignedTeamId));

  if (plan?.startDate) {
    const start = startOfDay(parseLocalDay(plan.startDate));
    const startDetail = `${plan.title || "VBS"} · ${plan.startDate} · ${plan.dailyStart}–${plan.dailyEnd}`;
    events.push({
      key: `plan-start-${plan.id}`,
      itemType: "plan_start",
      itemId: plan.id,
      title: "VBS starts",
      detail: startDetail,
      tooltipText: `VBS starts\n${startDetail}`,
      start,
      end: start,
      allDay: true,
      kind: "milestone",
    });
  }
  if (plan?.endDate) {
    const end = startOfDay(parseLocalDay(plan.endDate));
    const endDetail = `${plan.title || "VBS"} · ${plan.endDate}`;
    events.push({
      key: `plan-end-${plan.id}`,
      itemType: "plan_end",
      itemId: plan.id,
      title: "VBS ends",
      detail: endDetail,
      tooltipText: `VBS ends\n${endDetail}`,
      start: end,
      end,
      allDay: true,
      kind: "milestone",
    });
  }

  for (const task of tasks) {
    if (!task.dueDate || !includeTask(task)) {
      continue;
    }
    const start = startOfDay(parseLocalDay(task.dueDate));
    if (Number.isNaN(start.getTime())) {
      continue;
    }
    const assignee = task.assignedUsername || (task.assignedTeamId ? teamName(task.assignedTeamId) : "Unassigned");
    const meta = `Task · ${task.category} · ${task.status.replace("_", " ")} · due ${task.dueDate} · ${assignee}`;
    events.push({
      key: `task-${task.id}`,
      itemType: "task",
      itemId: task.id,
      title: task.title,
      detail: meta,
      tooltipText: [task.title, task.description.trim(), meta].filter(Boolean).join("\n"),
      start,
      end: start,
      allDay: true,
      kind: "task",
    });
  }

  for (const item of checklist) {
    if (!item.dueDate || !includeChecklist(item)) {
      continue;
    }
    const start = startOfDay(parseLocalDay(item.dueDate));
    if (Number.isNaN(start.getTime())) {
      continue;
    }
    const team = item.assignedTeamId ? teamName(item.assignedTeamId) : "Unassigned";
    const meta = `Milestone · ${item.category} · ${MILESTONE_STATUS_LABELS[normalizeMilestoneStatus(item)]} · ${team}`;
    events.push({
      key: `checklist-${item.id}`,
      itemType: "checklist",
      itemId: item.id,
      title: item.label,
      detail: meta,
      tooltipText: [item.label, item.notes?.trim(), meta].filter(Boolean).join("\n"),
      start,
      end: start,
      allDay: true,
      kind: "checklist",
    });
  }

  for (const slot of schedule) {
    if (!slot.dayDate || !includeSchedule(slot)) {
      continue;
    }
    const start = parseTimeOnDay(slot.dayDate, slot.startsAt, 9);
    const end = parseTimeOnDay(slot.dayDate, slot.endsAt || slot.startsAt, 10);
    if (end <= start) {
      end.setMinutes(start.getMinutes() + 30);
    }
    const team = slot.teamId ? teamName(slot.teamId) : "All teams";
    const meta = `${slot.dayDate} · ${slot.startsAt}–${slot.endsAt || "?"} · ${team}`;
    events.push({
      key: `schedule-${slot.id}`,
      itemType: "schedule",
      itemId: slot.id,
      title: slot.label,
      detail: `${meta}${slot.notes ? ` · ${slot.notes}` : ""}`,
      tooltipText: [slot.label, meta, slot.notes.trim()].filter(Boolean).join("\n"),
      start,
      end,
      allDay: false,
      kind: "schedule",
    });
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function eventsOnDay(events: PlanCalendarEvent[], day: Date) {
  return events.filter((event) => sameDay(event.start, day));
}

export function truncate(text: string, max: number) {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
