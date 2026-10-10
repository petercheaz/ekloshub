import type { VbsChecklistItem, VbsMilestoneStatus } from "./types";

export const MILESTONE_STATUS_LABELS: Record<VbsMilestoneStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

export function normalizeMilestoneStatus(item: {
  status?: string;
  done?: boolean;
}): VbsMilestoneStatus {
  if (item.status === "not_started" || item.status === "in_progress" || item.status === "done") {
    return item.status;
  }
  return item.done ? "done" : "not_started";
}

export function milestoneIsDone(item: Pick<VbsChecklistItem, "status" | "done">) {
  return normalizeMilestoneStatus(item) === "done";
}

export type MilestoneTone = "done" | "not-started" | "overdue" | "upcoming";

/** Visual tone for milestone timeline cards. */
export function milestoneTone(item: Pick<VbsChecklistItem, "status" | "done" | "dueDate">, today: string): MilestoneTone {
  const status = normalizeMilestoneStatus(item);
  if (status === "done") {
    return "done";
  }
  if (item.dueDate && item.dueDate < today) {
    return "overdue";
  }
  if (status === "not_started") {
    return "not-started";
  }
  return "upcoming";
}
