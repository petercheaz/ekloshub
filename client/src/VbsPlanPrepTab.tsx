import { useMemo, useState, type ComponentType } from "react";
import type { VbsPlanWorkspace } from "./types";
import {
  buildPrepTimelineRows,
  defaultPrepTeamScope,
  type PrepNavigateFocus,
  type PrepTeamScope,
  type PrepView,
  scopePrepWorkspace,
  userTeamIds,
} from "./vbs-plan-prep";

type PrepPanelProps = {
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  username: string;
  seesAllTeams: boolean;
  teamName: (id: string) => string;
  view: PrepView;
  focusTaskId: string | null;
  focusMilestoneId: string | null;
  onNavigatePrep: (view: PrepView, focus?: PrepNavigateFocus) => void;
  onRun: (action: () => Promise<unknown>) => void;
  TasksPanel: ComponentType<{
    data: VbsPlanWorkspace;
    orgId: string;
    busy: boolean;
    teamName: (id: string) => string;
    onRun: (action: () => Promise<unknown>) => void;
    expandedTaskId: string | null;
    onExpandedTaskIdChange: (id: string | null) => void;
  }>;
  MilestonesPanel: ComponentType<{
    data: VbsPlanWorkspace;
    orgId: string;
    busy: boolean;
    teamName: (id: string) => string;
    onRun: (action: () => Promise<unknown>) => void;
    expandedItemId: string | null;
    onExpandedItemIdChange: (id: string | null) => void;
  }>;
};

export function VbsPlanPrepTab({
  data,
  orgId,
  busy,
  username,
  seesAllTeams,
  teamName,
  view,
  focusTaskId,
  focusMilestoneId,
  onNavigatePrep,
  onRun,
  TasksPanel,
  MilestonesPanel,
}: PrepPanelProps) {
  const myTeamIds = useMemo(() => userTeamIds(data, username), [data, username]);
  const [scope, setScope] = useState<PrepTeamScope>(() => defaultPrepTeamScope(seesAllTeams, myTeamIds));
  const scopedData = useMemo(
    () => scopePrepWorkspace(data, scope, username, seesAllTeams),
    [data, scope, username, seesAllTeams],
  );

  const timelineRows = useMemo(
    () => buildPrepTimelineRows(scopedData.tasks, scopedData.checklist, teamName),
    [scopedData.tasks, scopedData.checklist, teamName],
  );

  if (!data.plan) {
    return <p className="muted">Create your plan on the Overview tab first.</p>;
  }

  function openRow(row: (typeof timelineRows)[number]) {
    if (row.kind === "task") {
      onNavigatePrep("tasks", { taskId: row.itemId, milestoneId: null });
    } else {
      onNavigatePrep("milestones", { milestoneId: row.itemId, taskId: null });
    }
  }

  return (
    <section className="vbs-panel vbs-prep-panel">
      <div className="vbs-prep-toolbar">
        {!seesAllTeams ? (
          <div className="vbs-prep-scope" role="group" aria-label="Team scope">
            <button
              type="button"
              className={scope === "mine" ? "vbs-prep-scope-btn active" : "vbs-prep-scope-btn"}
              onClick={() => setScope("mine")}
            >
              My teams
            </button>
            <button
              type="button"
              className={scope === "all" ? "vbs-prep-scope-btn active" : "vbs-prep-scope-btn"}
              onClick={() => setScope("all")}
            >
              Whole org
            </button>
          </div>
        ) : (
          <p className="muted vbs-prep-scope-hint">Showing all prep work for the organization.</p>
        )}
        <div className="vbs-prep-nav">
          <div className="vbs-prep-main-views" role="tablist" aria-label="Prep work">
            {(
              [
                ["tasks", "Tasks"],
                ["milestones", "Milestones"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                className={view === id ? "vbs-prep-main-view-btn active" : "vbs-prep-main-view-btn"}
                onClick={() =>
                  onNavigatePrep(id, id === "tasks" ? { milestoneId: null } : { taskId: null })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="tab"
            aria-selected={view === "timeline"}
            className={
              view === "timeline" ? "vbs-prep-timeline-view-btn active" : "vbs-prep-timeline-view-btn"
            }
            onClick={() => onNavigatePrep("timeline", {})}
          >
            All by due date
          </button>
        </div>
      </div>

      {view === "timeline" ? (
        <>
          <p className="muted vbs-prep-timeline-lead">
            Read-only combined list sorted by due date. To add or edit, use{" "}
            <button type="button" className="vbs-prep-inline-link" onClick={() => onNavigatePrep("tasks", {})}>
              Tasks
            </button>{" "}
            or{" "}
            <button type="button" className="vbs-prep-inline-link" onClick={() => onNavigatePrep("milestones", {})}>
              Milestones
            </button>
            . Click a row to open it there.
          </p>
          {timelineRows.length === 0 ? (
            <div className="vbs-prep-timeline-empty">
              <p className="muted vbs-task-empty">Nothing due yet in this scope.</p>
              {data.canWrite ? (
                <div className="vbs-prep-timeline-empty-actions">
                  <button type="button" className="vbs-prep-main-view-btn" onClick={() => onNavigatePrep("tasks", {})}>
                    Go to Tasks
                  </button>
                  <button
                    type="button"
                    className="vbs-prep-main-view-btn"
                    onClick={() => onNavigatePrep("milestones", {})}
                  >
                    Go to Milestones
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <ul className="vbs-prep-timeline">
              {timelineRows.map((row) => (
                <li key={row.key} className={row.done ? "vbs-prep-timeline-row done" : "vbs-prep-timeline-row"}>
                  <button type="button" className="vbs-prep-timeline-open" onClick={() => openRow(row)}>
                    <span className={`vbs-prep-kind kind-${row.kind}`}>
                      {row.kind === "task" ? "Task" : "Milestone"}
                    </span>
                    <span className="vbs-prep-timeline-due">{row.dueDate || "No due date"}</span>
                    <strong className="vbs-prep-timeline-title">{row.title}</strong>
                    <span className="muted vbs-prep-timeline-meta">
                      {row.teamLabel} · {row.statusLabel}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {view === "tasks" ? (
        <>
          <TasksPanel
            data={scopedData}
            orgId={orgId}
            busy={busy}
            teamName={teamName}
            onRun={onRun}
            expandedTaskId={focusTaskId}
            onExpandedTaskIdChange={(id) => onNavigatePrep("tasks", { taskId: id })}
          />
        </>
      ) : null}

      {view === "milestones" ? (
        <>
          <MilestonesPanel
            data={scopedData}
            orgId={orgId}
            busy={busy}
            teamName={teamName}
            onRun={onRun}
            expandedItemId={focusMilestoneId}
            onExpandedItemIdChange={(id) => onNavigatePrep("milestones", { milestoneId: id })}
          />
        </>
      ) : null}
    </section>
  );
}
