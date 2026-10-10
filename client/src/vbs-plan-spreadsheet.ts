import type { VbsPlanWorkspace } from "./types";
import { buildPlanCalendarEvents, type CalendarItemType } from "./vbs-plan-calendar";

export type SpreadsheetRowKind = CalendarItemType;

export type SpreadsheetRow = {
  key: string;
  itemType: SpreadsheetRowKind;
  itemId: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  title: string;
  subtitle: string;
  teamLabel: string;
  readOnly: boolean;
};

export function formatIsoDay(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildSpreadsheetRows(input: {
  data: VbsPlanWorkspace;
  username: string;
  seesAllTeams: boolean;
  teamName: (id: string) => string;
}): SpreadsheetRow[] {
  const { data, username, seesAllTeams, teamName } = input;
  const events = buildPlanCalendarEvents({
    plan: data.plan,
    tasks: data.tasks,
    schedule: data.schedule,
    checklist: data.checklist,
    teams: data.teams,
    username,
    canWrite: data.canWrite,
    seesAllTeams,
    teamName,
  });

  const teamForEvent = (event: (typeof events)[number]) => {
    if (event.itemType === "task") {
      const task = data.tasks.find((t) => t.id === event.itemId);
      if (!task) {
        return "";
      }
      if (task.assignedUsername) {
        return task.assignedUsername;
      }
      return task.assignedTeamId ? teamName(task.assignedTeamId) : "";
    }
    if (event.itemType === "schedule") {
      const slot = data.schedule.find((s) => s.id === event.itemId);
      return slot?.teamId ? teamName(slot.teamId) : "";
    }
    if (event.itemType === "checklist") {
      const item = data.checklist.find((c) => c.id === event.itemId);
      return item?.assignedTeamId ? teamName(item.assignedTeamId) : "";
    }
    return "";
  };

  return events.map((event) => {
    const readOnly = event.itemType === "plan_start" || event.itemType === "plan_end";
    const date = formatIsoDay(event.start);
    let timeStart = "";
    let timeEnd = "";
    if (!event.allDay) {
      timeStart = `${String(event.start.getHours()).padStart(2, "0")}:${String(event.start.getMinutes()).padStart(2, "0")}`;
      timeEnd = `${String(event.end.getHours()).padStart(2, "0")}:${String(event.end.getMinutes()).padStart(2, "0")}`;
    }
    const typeLabel =
      event.itemType === "task"
        ? "Task"
        : event.itemType === "schedule"
          ? "Schedule"
          : event.itemType === "checklist"
            ? "Checklist"
            : "Plan";

    return {
      key: event.key,
      itemType: event.itemType,
      itemId: event.itemId,
      date,
      timeStart,
      timeEnd,
      title: event.title,
      subtitle: typeLabel,
      teamLabel: teamForEvent(event),
      readOnly,
    };
  });
}
