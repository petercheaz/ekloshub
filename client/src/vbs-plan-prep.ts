import type { VbsChecklistItem, VbsPlanWorkspace, VbsScheduleSlot, VbsTask } from "./types";
import { milestoneIsDone, normalizeMilestoneStatus } from "./vbs-milestone-status";

export type PrepView = "timeline" | "tasks" | "milestones";
export type PrepTeamScope = "mine" | "all";

export function prepViewFromSearch(params: URLSearchParams): PrepView {
  const tab = params.get("tab");
  if (tab === "tasks") {
    return "tasks";
  }
  if (tab === "checklist") {
    return "milestones";
  }
  const prep = params.get("prep");
  if (prep === "tasks" || prep === "milestones" || prep === "timeline") {
    return prep;
  }
  return "tasks";
}

export function prepFocusTaskIdFromSearch(params: URLSearchParams): string | null {
  const id = params.get("taskId")?.trim();
  return id || null;
}

export function prepFocusMilestoneIdFromSearch(params: URLSearchParams): string | null {
  const id = params.get("milestoneId")?.trim() ?? params.get("checklistId")?.trim();
  return id || null;
}

export type PrepNavigateFocus = {
  taskId?: string | null;
  milestoneId?: string | null;
};

export function userTeamIds(data: VbsPlanWorkspace, username: string) {
  return new Set(
    data.teams.filter((team) => team.memberUsernames.includes(username)).map((team) => team.id),
  );
}

export function myScheduleSlots(data: VbsPlanWorkspace, username: string): VbsScheduleSlot[] {
  const teams = userTeamIds(data, username);
  return data.schedule.filter(
    (slot) =>
      (slot.assignedUsername && slot.assignedUsername === username) ||
      (slot.teamId && teams.has(slot.teamId)),
  );
}

export function myOpenTasks(data: VbsPlanWorkspace, username: string): VbsTask[] {
  const teams = userTeamIds(data, username);
  return data.tasks.filter((task) => {
    if (task.status === "done") {
      return false;
    }
    if (task.assignedUsername && task.assignedUsername === username) {
      return true;
    }
    return Boolean(task.assignedTeamId && teams.has(task.assignedTeamId));
  });
}

export function sortScheduleSlots(slots: VbsScheduleSlot[]) {
  return [...slots].sort((a, b) => {
    const day = a.dayDate.localeCompare(b.dayDate);
    if (day !== 0) {
      return day;
    }
    return a.startsAt.localeCompare(b.startsAt);
  });
}

export function sortTasksByDue(tasks: VbsTask[]) {
  return [...tasks].sort((a, b) => {
    const dueA = a.dueDate || "9999-12-31";
    const dueB = b.dueDate || "9999-12-31";
    return dueA.localeCompare(dueB);
  });
}

export function defaultPrepTeamScope(seesAllTeams: boolean, myTeamIds: Set<string>): PrepTeamScope {
  if (seesAllTeams) {
    return "all";
  }
  return myTeamIds.size > 0 ? "mine" : "all";
}

function matchesTeamScope(
  assignedTeamId: string,
  assignedUsername: string,
  scope: PrepTeamScope,
  username: string,
  myTeamIds: Set<string>,
  seesAllTeams: boolean,
) {
  if (scope === "all" || seesAllTeams) {
    return true;
  }
  if (assignedUsername && assignedUsername === username) {
    return true;
  }
  return Boolean(assignedTeamId && myTeamIds.has(assignedTeamId));
}

export function scopePrepWorkspace(
  data: VbsPlanWorkspace,
  scope: PrepTeamScope,
  username: string,
  seesAllTeams: boolean,
): VbsPlanWorkspace {
  const myTeamIds = userTeamIds(data, username);
  const tasks = data.tasks.filter((task) =>
    matchesTeamScope(task.assignedTeamId, task.assignedUsername, scope, username, myTeamIds, seesAllTeams),
  );
  const checklist = data.checklist.filter((item) =>
    matchesTeamScope(item.assignedTeamId, "", scope, username, myTeamIds, seesAllTeams),
  );
  return { ...data, tasks, checklist };
}

export type PrepTimelineRow = {
  key: string;
  kind: "task" | "milestone";
  itemId: string;
  title: string;
  dueDate: string;
  sortDue: string;
  teamLabel: string;
  statusLabel: string;
  done: boolean;
};

const TASK_STATUS: Record<VbsTask["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

export function buildPrepTimelineRows(
  tasks: VbsTask[],
  checklist: VbsChecklistItem[],
  teamName: (id: string) => string,
): PrepTimelineRow[] {
  const rows: PrepTimelineRow[] = [];
  for (const task of tasks) {
    rows.push({
      key: `task-${task.id}`,
      kind: "task",
      itemId: task.id,
      title: task.title,
      dueDate: task.dueDate,
      sortDue: task.dueDate || "9999-12-31",
      teamLabel: task.assignedTeamId ? teamName(task.assignedTeamId) : "Unassigned",
      statusLabel: TASK_STATUS[task.status],
      done: task.status === "done",
    });
  }
  for (const item of checklist) {
    const status = normalizeMilestoneStatus(item);
    rows.push({
      key: `milestone-${item.id}`,
      kind: "milestone",
      itemId: item.id,
      title: item.label,
      dueDate: item.dueDate,
      sortDue: item.dueDate || "9999-12-31",
      teamLabel: item.assignedTeamId ? teamName(item.assignedTeamId) : "Unassigned",
      statusLabel: status.replace(/_/g, " "),
      done: milestoneIsDone(item),
    });
  }
  rows.sort((a, b) => {
    const due = a.sortDue.localeCompare(b.sortDue);
    if (due !== 0) {
      return due;
    }
    if (a.done !== b.done) {
      return a.done ? 1 : -1;
    }
    return a.title.localeCompare(b.title);
  });
  return rows;
}
