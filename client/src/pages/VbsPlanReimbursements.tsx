import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { VbsTaskAttachment } from "../types";

type QueueItem = {
  taskId: string;
  title: string;
  expenseAmount: number;
  assignedUsername: string;
  dueDate: string;
  attachments: VbsTaskAttachment[];
};

function formatMoney(amount: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount);
}

export function VbsPlanReimbursementsTab({ orgId }: { orgId: string }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [totalPendingAmount, setTotalPendingAmount] = useState(0);
  const [reimbursedAwaitingArchive, setReimbursedAwaitingArchive] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const data = await api.vbsReimbursementQueue(orgId);
    setQueue(data.queue);
    setTotalPendingAmount(data.totalPendingAmount);
    setReimbursedAwaitingArchive(data.reimbursedAwaitingArchive);
    setError("");
  }, [orgId]);

  useEffect(() => {
    void reload().catch((err: Error) => setError(err.message));
  }, [reload]);

  async function markReimbursed(taskId: string) {
    setBusy(true);
    setStatus("");
    try {
      const data = await api.markVbsTaskReimbursed(orgId, taskId);
      setQueue(data.queue);
      setTotalPendingAmount(data.totalPendingAmount);
      setReimbursedAwaitingArchive(data.reimbursedAwaitingArchive);
      setStatus("Marked reimbursed.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function closeCycle() {
    if (
      !window.confirm(
        "Close this VBS reimbursement cycle? Reimbursed receipts will be archived and cleared from admin tracking. The queue must be empty first.",
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const data = await api.closeVbsReimbursementCycle(orgId);
      setQueue(data.queue);
      setTotalPendingAmount(data.totalPendingAmount);
      setReimbursedAwaitingArchive(data.reimbursedAwaitingArchive);
      setStatus(`Cycle closed. ${data.archivedCount} reimbursed receipt(s) archived.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not close cycle");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <p className="status">{error}</p>;
  }

  return (
    <section className="vbs-panel vbs-reimbursements">
      <h2 className="vbs-plan-section-title">Submitted receipts</h2>
      <p className="muted vbs-registration-view-lead">
        Tasks with reimbursement status <strong>Submitted</strong> appear here. Volunteers attach receipts on the{" "}
        <Link to={`/org/${orgId}/vbs-plan?tab=tasks`}>Tasks</Link> tab and set status to Submitted when ready for
        payout.
      </p>

      <ul className="vbs-plan-snapshot vbs-reimbursements-stats" aria-label="Reimbursement summary">
        <li>
          <strong>{queue.length}</strong>
          <span>Awaiting reimbursement</span>
        </li>
        <li>
          <strong>{formatMoney(totalPendingAmount)}</strong>
          <span>Pending total</span>
        </li>
        <li>
          <strong>{reimbursedAwaitingArchive}</strong>
          <span>Reimbursed (ready to archive)</span>
        </li>
      </ul>

      {queue.length === 0 ? (
        <p className="muted">No submitted receipts waiting for reimbursement.</p>
      ) : (
        <div className="vbs-spreadsheet-scroll">
          <table className="vbs-spreadsheet vbs-reimbursements-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Assignee</th>
                <th>Amount</th>
                <th>Receipts</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr key={item.taskId}>
                  <td>{item.title}</td>
                  <td>{item.assignedUsername || "—"}</td>
                  <td>{formatMoney(item.expenseAmount)}</td>
                  <td>
                    {item.attachments.length === 0 ? (
                      <span className="muted">No files</span>
                    ) : (
                      <div className="vbs-task-receipt-strip">
                        {item.attachments.map((file) => (
                          <a
                            key={file.id}
                            className="vbs-task-receipt-thumb-link"
                            href={file.dataUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {file.type.startsWith("image/") ? (
                              <img src={file.dataUrl} alt="" />
                            ) : (
                              <span className="vbs-task-receipt-file-badge">PDF</span>
                            )}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="vbs-plan-save"
                      disabled={busy}
                      onClick={() => void markReimbursed(item.taskId)}
                    >
                      Mark reimbursed
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="vbs-plan-form-actions vbs-reimbursements-actions">
        <button
          type="button"
          className="ghost"
          disabled={busy || queue.length > 0 || reimbursedAwaitingArchive === 0}
          onClick={() => void closeCycle()}
        >
          Close VBS reimbursement cycle
        </button>
        <p className="muted vbs-reimbursements-close-hint">
          Available when the queue is empty. Archives {reimbursedAwaitingArchive} reimbursed item(s) so you start
          clean next cycle.
        </p>
      </div>
      {status ? <p className="tagline">{status}</p> : null}
    </section>
  );
}
