import type { VbsTask } from "./types";

/** API body for saveVbsTask — preserves expense fields and receipt attachments. */
export function vbsTaskSavePayload(task: VbsTask, patch: Partial<VbsTask> = {}) {
  const merged = { ...task, ...patch };
  return {
    id: merged.id,
    title: merged.title,
    description: merged.description,
    notes: merged.notes ?? "",
    category: merged.category,
    status: merged.status,
    dueDate: merged.dueDate,
    assignedUsername: merged.assignedUsername,
    assignedTeamId: merged.assignedTeamId,
    expenseAmount: merged.expenseAmount ?? 0,
    reimbursementStatus: merged.reimbursementStatus ?? "none",
    attachments: (merged.attachments ?? []).map(({ name, type, size, dataUrl }) => ({
      name,
      type,
      size,
      dataUrl,
    })),
  };
}
