import type { VbsChecklistItem, VbsPlan, VbsPlanWorkspace, VbsTask } from "./types";
import { buildSpreadsheetRows, type SpreadsheetRow } from "./vbs-plan-spreadsheet";
import { parseLocalDay } from "./vbs-plan-calendar";

export type WorksheetViewId = "timeline" | "taskRegister" | "readiness";

export const WORKSHEET_VIEWS: {
  id: WorksheetViewId;
  title: string;
  hint: string;
}[] = [
  {
    id: "timeline",
    title: "Master timeline",
    hint: "Chronological log of milestones, tasks, schedule blocks, and dated checklist items—stays in sync with the calendar.",
  },
  {
    id: "taskRegister",
    title: "Task register",
    hint: "Work breakdown structure: category, owner, team, due date, and status—the sheet you’d share with team leads.",
  },
  {
    id: "readiness",
    title: "Milestones checklist",
    hint: "Pre-event milestones by category: due dates and done/open for sign-off before VBS week.",
  },
];

export type WorksheetViewContext = {
  data: VbsPlanWorkspace;
  username: string;
  seesAllTeams: boolean;
  teamName: (id: string) => string;
};

function myTeamIds(data: VbsPlanWorkspace, username: string) {
  return new Set(data.teams.filter((t) => t.memberUsernames.includes(username)).map((t) => t.id));
}

export function includeTask(ctx: WorksheetViewContext, task: VbsTask) {
  const { data, username, seesAllTeams } = ctx;
  const teams = myTeamIds(data, username);
  return (
    data.canWrite ||
    seesAllTeams ||
    task.assignedUsername === username ||
    (task.assignedTeamId && teams.has(task.assignedTeamId))
  );
}

export function includeChecklistItem(ctx: WorksheetViewContext, item: VbsChecklistItem) {
  const { data, username, seesAllTeams } = ctx;
  const teams = myTeamIds(data, username);
  return data.canWrite || seesAllTeams || (item.assignedTeamId && teams.has(item.assignedTeamId));
}

export function buildTimelineRows(ctx: WorksheetViewContext): SpreadsheetRow[] {
  return buildSpreadsheetRows(ctx);
}

export type TaskRegisterRow = {
  rowKey: string;
  taskId: string;
  category: string;
  title: string;
  assignedUsername: string;
  assignedTeamId: string;
  dueDate: string;
  status: VbsTask["status"];
  description: string;
  notes: string;
};

export function buildTaskRegisterRows(ctx: WorksheetViewContext): TaskRegisterRow[] {
  const tasks = ctx.data.tasks.filter((t) => includeTask(ctx, t));
  tasks.sort((a, b) => {
    const due = (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
    if (due !== 0) {
      return due;
    }
    const cat = a.category.localeCompare(b.category);
    if (cat !== 0) {
      return cat;
    }
    return a.title.localeCompare(b.title);
  });
  return tasks.map((task) => ({
    rowKey: `task:${task.id}`,
    taskId: task.id,
    category: task.category,
    title: task.title,
    assignedUsername: task.assignedUsername,
    assignedTeamId: task.assignedTeamId,
    dueDate: task.dueDate,
    status: task.status,
    description: task.description,
    notes: task.notes,
  }));
}

export type ReadinessRow = {
  rowKey: string;
  itemId: string;
  category: string;
  label: string;
  assignedTeamId: string;
  dueDate: string;
  done: boolean;
  status: string;
};

export function buildReadinessRows(ctx: WorksheetViewContext): ReadinessRow[] {
  const items = ctx.data.checklist.filter((item) => includeChecklistItem(ctx, item));
  items.sort((a, b) => {
    const aDue = a.dueDate || "";
    const bDue = b.dueDate || "";
    if (!aDue && !bDue) {
      const cat = a.category.localeCompare(b.category);
      return cat !== 0 ? cat : a.label.localeCompare(b.label);
    }
    if (!aDue) {
      return 1;
    }
    if (!bDue) {
      return -1;
    }
    const dueCmp = aDue.localeCompare(bDue);
    return dueCmp !== 0 ? dueCmp : a.label.localeCompare(b.label);
  });
  return items.map((item) => ({
    rowKey: `checklist:${item.id}`,
    itemId: item.id,
    category: item.category,
    label: item.label,
    assignedTeamId: item.assignedTeamId,
    dueDate: item.dueDate,
    done: item.done,
    status: item.status,
  }));
}

export function enumeratePlanDays(plan: VbsPlan | null): { iso: string; label: string; weekday: string }[] {
  if (!plan?.startDate || !plan?.endDate) {
    return [];
  }
  const start = parseLocalDay(plan.startDate);
  const end = parseLocalDay(plan.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }
  const days: { iso: string; label: string; weekday: string }[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const weekday = cursor.toLocaleDateString(undefined, { weekday: "short" });
    const label = cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    days.push({ iso, label, weekday });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function viewSummary(viewId: WorksheetViewId, ctx: WorksheetViewContext): string {
  if (viewId === "timeline") {
    const n = buildTimelineRows(ctx).length;
    return n === 0 ? "No dated rows yet" : `${n} dated row${n === 1 ? "" : "s"}`;
  }
  if (viewId === "taskRegister") {
    const rows = buildTaskRegisterRows(ctx);
    const open = rows.filter((r) => r.status !== "done").length;
    return rows.length === 0 ? "No tasks yet" : `${rows.length} tasks · ${open} open`;
  }
  const rows = buildReadinessRows(ctx);
  const open = rows.filter((r) => !r.done).length;
  return rows.length === 0 ? "No checklist items yet" : `${rows.length} items · ${open} open`;
}
