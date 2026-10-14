import { useMemo } from "react";
import type { VbsPlanWorkspace } from "./types";
import { enumeratePlanDays } from "./vbs-plan-worksheet-views";
import { milestoneIsDone } from "./vbs-milestone-status";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Props = {
  data: VbsPlanWorkspace;
};

export function VbsPlanAdherence({ data }: Props) {
  const today = todayIso();
  const planDays = useMemo(() => enumeratePlanDays(data.plan), [data.plan]);

  const overdueTasks = useMemo(
    () =>
      data.tasks.filter(
        (t) => t.status !== "done" && t.dueDate && t.dueDate < today,
      ),
    [data.tasks, today],
  );

  const overdueMilestones = useMemo(
    () =>
      data.checklist.filter((item) => !milestoneIsDone(item) && item.dueDate && item.dueDate < today),
    [data.checklist, today],
  );

  const scheduleDaysWithBlocks = useMemo(() => {
    const set = new Set(data.schedule.map((s) => s.dayDate).filter(Boolean));
    return set;
  }, [data.schedule]);

  const emptyProgramDays = useMemo(
    () => planDays.filter((day) => !scheduleDaysWithBlocks.has(day.iso)),
    [planDays, scheduleDaysWithBlocks],
  );

  const openTasksNoDue = useMemo(
    () => data.tasks.filter((t) => t.status !== "done" && !t.dueDate),
    [data.tasks],
  );

  const issueCount =
    overdueTasks.length +
    overdueMilestones.length +
    emptyProgramDays.length +
    (openTasksNoDue.length > 0 ? 1 : 0);

  if (!data.plan) {
    return null;
  }

  return (
    <section className="vbs-panel vbs-plan-adherence" aria-label="Schedule health">
      <header className="vbs-plan-adherence-head">
        <strong>Schedule health</strong>
        <span className={issueCount === 0 ? "vbs-plan-adherence-ok" : "vbs-plan-adherence-warn"}>
          {issueCount === 0 ? "On track" : `${issueCount} attention item${issueCount === 1 ? "" : "s"}`}
        </span>
      </header>
      <p className="muted">
        Overdue work, milestones past due, and VBS week days without schedule blocks. Fix these before week-of.
      </p>
      <div className="vbs-plan-adherence-grid">
        <div>
          <h3>Overdue tasks ({overdueTasks.length})</h3>
          {overdueTasks.length === 0 ? (
            <p className="muted">None</p>
          ) : (
            <ul className="vbs-plan-adherence-list">
              {overdueTasks.slice(0, 12).map((t) => (
                <li key={t.id}>
                  <strong>{t.title}</strong>
                  <span className="muted"> due {t.dueDate}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Overdue milestones ({overdueMilestones.length})</h3>
          {overdueMilestones.length === 0 ? (
            <p className="muted">None</p>
          ) : (
            <ul className="vbs-plan-adherence-list">
              {overdueMilestones.slice(0, 12).map((m) => (
                <li key={m.id}>
                  <strong>{m.label}</strong>
                  <span className="muted"> due {m.dueDate}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>VBS days without schedule ({emptyProgramDays.length})</h3>
          {emptyProgramDays.length === 0 ? (
            <p className="muted">Every plan day has at least one block</p>
          ) : (
            <ul className="vbs-plan-adherence-list">
              {emptyProgramDays.map((d) => (
                <li key={d.iso}>
                  {d.weekday} {d.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        {openTasksNoDue.length > 0 ? (
          <div>
            <h3>Tasks without due dates ({openTasksNoDue.length})</h3>
            <p className="muted">Assign due dates so they appear on the calendar and timeline.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
