import { db } from "./db/pool.js";
import { objectUrl } from "./db/s3.js";
import { canManageOrg } from "./org-permissions.js";
import { getMembership } from "./orgs.js";
import { getPlanRow } from "./vbs-plan.js";
import { isPlatformAdmin } from "./users.js";

async function requireReimbursementAdmin(orgId: string, username: string) {
  const membership = await getMembership(orgId, username);
  const platformAdmin = await isPlatformAdmin(username);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" as const };
  }
  const role = membership?.role ?? "org_admin";
  if (!canManageOrg(role) && !platformAdmin) {
    return { error: "Only org admins can manage reimbursements" as const };
  }
  return { ok: true as const, platformAdmin };
}

async function attachmentsForTasks(taskIds: string[]) {
  const map = new Map<string, { id: string; name: string; type: string; size: number; dataUrl: string }[]>();
  if (taskIds.length === 0) {
    return map;
  }
  const rows = await db().query<{
    id: string;
    task_id: string;
    name: string;
    type: string;
    size: number;
    object_key: string;
  }>(`SELECT id, task_id, name, type, size, object_key FROM vbs_task_attachments WHERE task_id = ANY($1)`, [
    taskIds,
  ]);
  for (const row of rows.rows) {
    const list = map.get(row.task_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      type: row.type,
      size: row.size,
      dataUrl: objectUrl(row.object_key),
    });
    map.set(row.task_id, list);
  }
  return map;
}

export async function getReimbursementQueue(orgId: string, username: string) {
  const access = await requireReimbursementAdmin(orgId, username);
  if ("error" in access) {
    return access;
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Create a VBS plan first" as const };
  }

  const queueResult = await db().query<{
    id: string;
    title: string;
    expense_amount: string;
    reimbursement_status: string;
    assigned_username: string | null;
    due_date: Date | null;
    created_at: Date;
  }>(
    `SELECT id, title, expense_amount, reimbursement_status, assigned_username, due_date, created_at
     FROM vbs_tasks
     WHERE plan_id = $1
       AND reimbursement_status = 'submitted'
       AND COALESCE(reimbursement_archived, FALSE) = FALSE
     ORDER BY due_date NULLS LAST, created_at`,
    [plan.id],
  );

  const taskIds = queueResult.rows.map((row) => row.id);
  const attachments = await attachmentsForTasks(taskIds);

  const archivedCount = await db().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM vbs_tasks
     WHERE plan_id = $1 AND reimbursement_status = 'reimbursed' AND COALESCE(reimbursement_archived, FALSE) = FALSE`,
    [plan.id],
  );

  const queue = queueResult.rows.map((row) => ({
    taskId: row.id,
    title: row.title,
    expenseAmount: Number(row.expense_amount) || 0,
    assignedUsername: row.assigned_username ?? "",
    dueDate: row.due_date ? row.due_date.toISOString().slice(0, 10) : "",
    submittedAt: row.created_at.toISOString(),
    attachments: attachments.get(row.id) ?? [],
  }));

  return {
    queue,
    totalPendingAmount: queue.reduce((sum, item) => sum + item.expenseAmount, 0),
    reimbursedAwaitingArchive: archivedCount.rows[0]?.count ?? 0,
  };
}

export async function markTaskReimbursed(orgId: string, username: string, taskId: string) {
  const access = await requireReimbursementAdmin(orgId, username);
  if ("error" in access) {
    return access;
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Create a VBS plan first" as const };
  }
  const updated = await db().query(
    `UPDATE vbs_tasks SET reimbursement_status = 'reimbursed', reimbursement_archived = FALSE
     WHERE id = $1 AND plan_id = $2 AND reimbursement_status = 'submitted'`,
    [taskId, plan.id],
  );
  if ((updated.rowCount ?? 0) === 0) {
    return { error: "Receipt not found or not in submitted status" as const };
  }
  return getReimbursementQueue(orgId, username);
}

export async function closeReimbursementCycle(orgId: string, username: string) {
  const access = await requireReimbursementAdmin(orgId, username);
  if ("error" in access) {
    return access;
  }
  const plan = await getPlanRow(orgId);
  if (!plan) {
    return { error: "Create a VBS plan first" as const };
  }
  const pending = await db().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM vbs_tasks
     WHERE plan_id = $1 AND reimbursement_status = 'submitted' AND COALESCE(reimbursement_archived, FALSE) = FALSE`,
    [plan.id],
  );
  if ((pending.rows[0]?.count ?? 0) > 0) {
    return { error: "Mark or process all submitted receipts before closing the cycle" as const };
  }
  const archived = await db().query(
    `UPDATE vbs_tasks SET reimbursement_archived = TRUE
     WHERE plan_id = $1 AND reimbursement_status = 'reimbursed' AND COALESCE(reimbursement_archived, FALSE) = FALSE`,
    [plan.id],
  );
  return {
    ok: true as const,
    archivedCount: archived.rowCount ?? 0,
    ...(await getReimbursementQueue(orgId, username)),
  };
}
