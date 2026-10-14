import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { api } from "./api";
import { vbsTaskSavePayload } from "./vbs-task-payload";
import { OrgUserTypeahead } from "./OrgUserTypeahead";
import type { VbsMilestoneStatus, VbsPlanWorkspace, VbsTaskCategory, VbsTaskStatus } from "./types";
import { MILESTONE_STATUS_LABELS, milestoneIsDone, normalizeMilestoneStatus } from "./vbs-milestone-status";
import { applyImportedRows, exportPlanWorkbook, parseWorkbookFile } from "./vbs-worksheet-io";
import { reimbursementRowsFromPlan, type WorkbookExportBundle } from "./vbs-workbook-sheets";
import type { SpreadsheetRow } from "./vbs-plan-spreadsheet";
import {
  WORKSHEET_VIEWS,
  buildReadinessRows,
  buildTaskRegisterRows,
  buildTimelineRows,
  type ReadinessRow,
  type TaskRegisterRow,
  type WorksheetViewContext,
  type WorksheetViewId,
  viewSummary,
} from "./vbs-plan-worksheet-views";
import {
  emptyWorksheetData,
  type PlanWorksheetData,
  type TimelineColumn,
  type WorksheetCellStyle,
  resolveCellStyle,
  worksheetCellKey,
  worksheetRowKey,
} from "./vbs-worksheet-types";

type Props = {
  orgId: string;
  data: VbsPlanWorkspace;
  username: string;
  seesAllTeams: boolean;
  teamName: (id: string) => string;
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => void;
};

type SelectedCell = { viewId: WorksheetViewId; rowKey: string; column: string };

const TASK_STATUS_LABEL: Record<VbsTaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

function normalizeWorksheetData(raw: unknown): PlanWorksheetData {
  if (!raw || typeof raw !== "object") {
    return emptyWorksheetData();
  }
  const value = raw as PlanWorksheetData;
  return {
    styles: value.styles ?? {},
    notes: value.notes ?? {},
  };
}

function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  const d =
    direction === "down"
      ? "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"
      : "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="vbs-plan-cal-chevron">
      <path fill="currentColor" d={d} />
    </svg>
  );
}

export function VbsPlanSpreadsheet({ orgId, data, username, seesAllTeams, teamName, busy, onRun }: Props) {
  const ctx = useMemo(
    (): WorksheetViewContext => ({ data, username, seesAllTeams, teamName }),
    [data, username, seesAllTeams, teamName],
  );

  const [expandedViews, setExpandedViews] = useState<Record<WorksheetViewId, boolean>>({
    timeline: false,
    taskRegister: false,
    readiness: false,
  });
  const [worksheetData, setWorksheetData] = useState<PlanWorksheetData>(() =>
    normalizeWorksheetData(data.plan?.worksheetData),
  );
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anyExpanded = WORKSHEET_VIEWS.some((view) => expandedViews[view.id]);

  useEffect(() => {
    setWorksheetData(normalizeWorksheetData(data.plan?.worksheetData));
  }, [data.plan?.id, data.plan?.worksheetData]);

  const queueWorksheetSave = useCallback(
    (next: PlanWorksheetData) => {
      if (!data.canWrite) {
        return;
      }
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => {
        void api.saveVbsWorksheet(orgId, next as unknown as Record<string, unknown>);
      }, 700);
    },
    [data.canWrite, orgId],
  );

  const updateWorksheet = useCallback(
    (updater: (current: PlanWorksheetData) => PlanWorksheetData) => {
      setWorksheetData((current) => {
        const next = updater(current);
        queueWorksheetSave(next);
        return next;
      });
    },
    [queueWorksheetSave],
  );

  function toggleFormat(field: keyof WorksheetCellStyle) {
    if (!selectedCell || !data.canWrite) {
      return;
    }
    const { viewId, rowKey, column } = selectedCell;
    updateWorksheet((current) => {
      const styles = { ...current.styles };
      const key = worksheetCellKey(viewId, rowKey, column);
      const prev = styles[key] ?? {};
      styles[key] = { ...prev, [field]: !prev[field] };
      return { ...current, styles };
    });
  }

  function cellStyle(viewId: WorksheetViewId, rowKey: string, column: string): CSSProperties {
    const style = resolveCellStyle(worksheetData, viewId, rowKey, column);
    return {
      fontWeight: style.bold ? 700 : undefined,
      fontStyle: style.italic ? "italic" : undefined,
      textDecoration: style.underline ? "underline" : undefined,
    };
  }

  function selectCell(viewId: WorksheetViewId, rowKey: string, column: string) {
    setSelectedCell({ viewId, rowKey, column });
  }

  function toggleView(viewId: WorksheetViewId) {
    setExpandedViews((prev) => ({ ...prev, [viewId]: !prev[viewId] }));
  }

  async function onExport() {
    const reimb = reimbursementRowsFromPlan(data.tasks);
    const extra: WorkbookExportBundle = {
      registration: null,
      reimbursementOpen: reimb.open,
      reimbursementArchived: reimb.archived,
    };
    try {
      extra.registration = await api.vbsRegistration(orgId);
    } catch {
      extra.registration = null;
    }
    await exportPlanWorkbook(ctx, worksheetData, data.plan?.title ?? "VBS plan", extra);
  }

  async function onImportFile(file: File) {
    const imported = await parseWorkbookFile(file);
    if (imported.length === 0) {
      return;
    }
    onRun(async () => {
      await applyImportedRows(imported, orgId, data, api);
    });
  }

  if (!data.plan) {
    return null;
  }

  return (
    <section className="vbs-plan-worksheets" aria-label="Plan workbooks">
      <div className="vbs-plan-worksheets-head">
        <div className="vbs-plan-worksheets-head-text">
          <strong>Plan workbooks</strong>
          <p className="muted">
            Plan views plus export: one Excel file with timeline, tasks, milestones, registration, classes, allergies,
            volunteers, and reimbursement tabs (when you have access). Import reads the <em>Master timeline</em> tab.
          </p>
        </div>
        {anyExpanded ? (
          <div className="vbs-worksheet-toolbar vbs-worksheet-toolbar-global" role="toolbar" aria-label="Spreadsheet tools">
            <div className="vbs-worksheet-toolbar-group">
              <button type="button" className="vbs-worksheet-tool" disabled={!selectedCell} onClick={() => toggleFormat("bold")}>
                B
              </button>
              <button
                type="button"
                className="vbs-worksheet-tool italic"
                disabled={!selectedCell}
                onClick={() => toggleFormat("italic")}
              >
                I
              </button>
              <button
                type="button"
                className="vbs-worksheet-tool underline"
                disabled={!selectedCell}
                onClick={() => toggleFormat("underline")}
              >
                U
              </button>
            </div>
            <div className="vbs-worksheet-toolbar-group">
              <button type="button" className="ghost" onClick={() => void onExport()}>
                Export all (Excel)
              </button>
              <button type="button" className="ghost" disabled={!data.canWrite || busy} onClick={() => importRef.current?.click()}>
                Import timeline
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    void onImportFile(file);
                  }
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {WORKSHEET_VIEWS.map((view) => {
        const expanded = expandedViews[view.id];
        return (
          <section
            key={view.id}
            className={expanded ? "vbs-plan-worksheet expanded" : "vbs-plan-worksheet compact"}
            aria-label={view.title}
          >
            <div className="vbs-plan-worksheet-strip">
              <div className="vbs-plan-calendar-brand">
                <div className="vbs-plan-calendar-brand-text">
                  <strong>{view.title}</strong>
                  <span className="muted">{viewSummary(view.id, ctx)}</span>
                </div>
              </div>
              <button
                type="button"
                className="vbs-plan-calendar-toggle"
                aria-expanded={expanded}
                aria-label={expanded ? `Collapse ${view.title}` : `Expand ${view.title}`}
                onClick={() => toggleView(view.id)}
              >
                <ChevronIcon direction={expanded ? "up" : "down"} />
              </button>
            </div>
            {expanded ? (
              <>
                <p className="vbs-plan-worksheet-hint muted">{view.hint}</p>
                {view.id === "timeline" ? (
                  <TimelineGrid
                    ctx={ctx}
                    orgId={orgId}
                    busy={busy}
                    data={data}
                    onRun={onRun}
                    worksheetData={worksheetData}
                    updateWorksheet={updateWorksheet}
                    selectedCell={selectedCell}
                    onSelectCell={selectCell}
                    cellStyle={cellStyle}
                    teamName={teamName}
                  />
                ) : null}
                {view.id === "taskRegister" ? (
                  <TaskRegisterGrid
                    ctx={ctx}
                    orgId={orgId}
                    busy={busy}
                    data={data}
                    onRun={onRun}
                    worksheetData={worksheetData}
                    updateWorksheet={updateWorksheet}
                    selectedCell={selectedCell}
                    onSelectCell={selectCell}
                    cellStyle={cellStyle}
                    teamName={teamName}
                  />
                ) : null}
                {view.id === "readiness" ? (
                  <ReadinessGrid
                    ctx={ctx}
                    orgId={orgId}
                    busy={busy}
                    data={data}
                    onRun={onRun}
                    worksheetData={worksheetData}
                    updateWorksheet={updateWorksheet}
                    selectedCell={selectedCell}
                    onSelectCell={selectCell}
                    cellStyle={cellStyle}
                    teamName={teamName}
                  />
                ) : null}
              </>
            ) : null}
          </section>
        );
      })}
    </section>
  );
}

function isSelected(selected: SelectedCell | null, viewId: WorksheetViewId, rowKey: string, column: string) {
  return selected?.viewId === viewId && selected.rowKey === rowKey && selected.column === column;
}

function cellClass(selected: SelectedCell | null, viewId: WorksheetViewId, rowKey: string, column: string) {
  return isSelected(selected, viewId, rowKey, column) ? "vbs-worksheet-cell selected" : "vbs-worksheet-cell";
}

function TimelineGrid({
  ctx,
  orgId,
  data,
  busy,
  onRun,
  worksheetData,
  updateWorksheet,
  selectedCell,
  onSelectCell,
  cellStyle,
}: {
  ctx: WorksheetViewContext;
  orgId: string;
  data: VbsPlanWorkspace;
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => void;
  worksheetData: PlanWorksheetData;
  updateWorksheet: (updater: (current: PlanWorksheetData) => PlanWorksheetData) => void;
  selectedCell: SelectedCell | null;
  onSelectCell: (viewId: WorksheetViewId, rowKey: string, column: string) => void;
  cellStyle: (viewId: WorksheetViewId, rowKey: string, column: string) => CSSProperties;
  teamName: (id: string) => string;
}) {
  const rows = useMemo(() => buildTimelineRows(ctx), [ctx]);
  const viewId = "timeline" as const;

  if (rows.length === 0) {
    return <p className="muted vbs-task-empty">No dated items yet. Use + on the calendar or import a timeline sheet.</p>;
  }

  return (
    <div className="vbs-spreadsheet-scroll vbs-worksheet-grid-wrap">
      <table className="vbs-spreadsheet vbs-worksheet-grid">
        <thead>
          <tr>
            <th className="vbs-worksheet-row-num">#</th>
            <th>Date</th>
            <th>Start</th>
            <th>End</th>
            <th>Type</th>
            <th>Title</th>
            <th>Team / owner</th>
            <th>Notes</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <TimelineGridRow
              key={row.key}
              index={index + 1}
              row={row}
              viewId={viewId}
              data={data}
              orgId={orgId}
              busy={busy}
              onRun={onRun}
              worksheetData={worksheetData}
              updateWorksheet={updateWorksheet}
              selectedCell={selectedCell}
              onSelectCell={onSelectCell}
              cellStyle={cellStyle}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineGridRow({
  index,
  row,
  viewId,
  data,
  orgId,
  busy,
  onRun,
  worksheetData,
  updateWorksheet,
  selectedCell,
  onSelectCell,
  cellStyle,
}: {
  index: number;
  row: SpreadsheetRow;
  viewId: WorksheetViewId;
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => void;
  worksheetData: PlanWorksheetData;
  updateWorksheet: (updater: (current: PlanWorksheetData) => PlanWorksheetData) => void;
  selectedCell: SelectedCell | null;
  onSelectCell: (viewId: WorksheetViewId, rowKey: string, column: string) => void;
  cellStyle: (viewId: WorksheetViewId, rowKey: string, column: string) => CSSProperties;
}) {
  const rowKey = worksheetRowKey(row.itemType, row.itemId);
  const [date, setDate] = useState(row.date);
  const [timeStart, setTimeStart] = useState(row.timeStart);
  const [timeEnd, setTimeEnd] = useState(row.timeEnd);
  const [title, setTitle] = useState(row.title);

  useEffect(() => {
    setDate(row.date);
    setTimeStart(row.timeStart);
    setTimeEnd(row.timeEnd);
    setTitle(row.title);
  }, [row]);

  const canEdit = data.canWrite && !row.readOnly;

  function notesValue() {
    if (worksheetData.notes[rowKey] !== undefined) {
      return worksheetData.notes[rowKey];
    }
    if (row.itemType === "task") {
      return data.tasks.find((t) => t.id === row.itemId)?.notes ?? "";
    }
    if (row.itemType === "schedule") {
      return data.schedule.find((s) => s.id === row.itemId)?.notes ?? "";
    }
    return "";
  }

  function saveRowFields() {
    if (!canEdit) {
      return;
    }
    if (date === row.date && timeStart === row.timeStart && timeEnd === row.timeEnd && title === row.title) {
      return;
    }
    if (row.itemType === "task") {
      const task = data.tasks.find((t) => t.id === row.itemId);
      if (!task) {
        return;
      }
      onRun(() => api.saveVbsTask(orgId, vbsTaskSavePayload(task, { title: title.trim() || task.title, dueDate: date })));
      return;
    }
    if (row.itemType === "schedule") {
      const slot = data.schedule.find((s) => s.id === row.itemId);
      if (!slot) {
        return;
      }
      onRun(() =>
        api.saveVbsScheduleSlot(orgId, {
          id: slot.id,
          dayDate: date,
          startsAt: timeStart || slot.startsAt,
          endsAt: timeEnd || slot.endsAt,
          label: title.trim() || slot.label,
          stationId: slot.stationId,
          teamId: slot.teamId,
          notes: slot.notes,
        }),
      );
      return;
    }
    if (row.itemType === "checklist") {
      const item = data.checklist.find((c) => c.id === row.itemId);
      if (!item) {
        return;
      }
      onRun(() =>
        api.saveVbsChecklistItem(orgId, {
          id: item.id,
          category: item.category,
          label: title.trim() || item.label,
          assignedTeamId: item.assignedTeamId,
          dueDate: date,
          notes: item.notes,
        }),
      );
    }
  }

  function saveNotes(nextNotes: string) {
    updateWorksheet((current) => ({
      ...current,
      notes: { ...current.notes, [rowKey]: nextNotes },
    }));
    if (!canEdit) {
      return;
    }
    if (row.itemType === "task") {
      const task = data.tasks.find((t) => t.id === row.itemId);
      if (!task) {
        return;
      }
      onRun(() => api.saveVbsTask(orgId, vbsTaskSavePayload(task, { notes: nextNotes })));
      return;
    }
    if (row.itemType === "schedule") {
      const slot = data.schedule.find((s) => s.id === row.itemId);
      if (!slot) {
        return;
      }
      onRun(() =>
        api.saveVbsScheduleSlot(orgId, {
          id: slot.id,
          dayDate: slot.dayDate,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          label: slot.label,
          stationId: slot.stationId,
          teamId: slot.teamId,
          notes: nextNotes,
        }),
      );
      return;
    }
    if (row.itemType === "checklist") {
      const item = data.checklist.find((c) => c.id === row.itemId);
      if (!item) {
        return;
      }
      onRun(() =>
        api.saveVbsChecklistItem(orgId, {
          id: item.id,
          category: item.category,
          label: item.label,
          assignedTeamId: item.assignedTeamId,
          dueDate: item.dueDate,
          notes: nextNotes,
        }),
      );
    }
  }

  function remove() {
    if (!canEdit || row.itemType === "plan_start" || row.itemType === "plan_end") {
      return;
    }
    const ok = window.confirm(`Remove “${row.title}” from the plan?`);
    if (!ok) {
      return;
    }
    if (row.itemType === "task") {
      onRun(() => api.deleteVbsTask(orgId, row.itemId));
    } else if (row.itemType === "schedule") {
      onRun(() => api.deleteVbsScheduleSlot(orgId, row.itemId));
    } else if (row.itemType === "checklist") {
      onRun(() => api.deleteVbsChecklistItem(orgId, row.itemId));
    }
  }

  const cols: TimelineColumn[] = ["date", "start", "end", "type", "title", "team", "notes"];

  return (
    <tr className={row.readOnly ? "vbs-spreadsheet-row readonly" : "vbs-spreadsheet-row"}>
      <td className="vbs-worksheet-row-num muted">{index}</td>
      {cols.map((column) => {
        if (column === "date") {
          return (
            <td
              key={column}
              className={cellClass(selectedCell, viewId, rowKey, column)}
              style={cellStyle(viewId, rowKey, column)}
              onClick={() => onSelectCell(viewId, rowKey, column)}
            >
              {canEdit ? (
                <input type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} onBlur={saveRowFields} />
              ) : (
                date
              )}
            </td>
          );
        }
        if (column === "start") {
          return (
            <td
              key={column}
              className={cellClass(selectedCell, viewId, rowKey, column)}
              style={cellStyle(viewId, rowKey, column)}
              onClick={() => onSelectCell(viewId, rowKey, column)}
            >
              {canEdit && row.itemType === "schedule" ? (
                <input type="time" value={timeStart} disabled={busy} onChange={(e) => setTimeStart(e.target.value)} onBlur={saveRowFields} />
              ) : (
                timeStart || "—"
              )}
            </td>
          );
        }
        if (column === "end") {
          return (
            <td
              key={column}
              className={cellClass(selectedCell, viewId, rowKey, column)}
              style={cellStyle(viewId, rowKey, column)}
              onClick={() => onSelectCell(viewId, rowKey, column)}
            >
              {canEdit && row.itemType === "schedule" ? (
                <input type="time" value={timeEnd} disabled={busy} onChange={(e) => setTimeEnd(e.target.value)} onBlur={saveRowFields} />
              ) : (
                timeEnd || "—"
              )}
            </td>
          );
        }
        if (column === "type") {
          return (
            <td
              key={column}
              className={cellClass(selectedCell, viewId, rowKey, column)}
              style={cellStyle(viewId, rowKey, column)}
              onClick={() => onSelectCell(viewId, rowKey, column)}
            >
              <span className={`vbs-spreadsheet-type type-${row.itemType}`}>{row.subtitle}</span>
            </td>
          );
        }
        if (column === "title") {
          return (
            <td
              key={column}
              className={cellClass(selectedCell, viewId, rowKey, column)}
              style={cellStyle(viewId, rowKey, column)}
              onClick={() => onSelectCell(viewId, rowKey, column)}
            >
              {canEdit ? (
                <input
                  type="text"
                  className="vbs-spreadsheet-title-input"
                  value={title}
                  disabled={busy}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={saveRowFields}
                />
              ) : (
                title
              )}
            </td>
          );
        }
        if (column === "team") {
          return (
            <td
              key={column}
              className={cellClass(selectedCell, viewId, rowKey, column)}
              style={cellStyle(viewId, rowKey, column)}
              onClick={() => onSelectCell(viewId, rowKey, column)}
            >
              {row.teamLabel || "—"}
            </td>
          );
        }
        return (
          <td
            key={column}
            className={cellClass(selectedCell, viewId, rowKey, column)}
            style={cellStyle(viewId, rowKey, column)}
            onClick={() => onSelectCell(viewId, rowKey, column)}
          >
            {canEdit ? (
              <textarea
                className="vbs-worksheet-notes"
                rows={1}
                defaultValue={notesValue()}
                disabled={busy}
                onBlur={(e) => saveNotes(e.target.value)}
              />
            ) : (
              notesValue() || "—"
            )}
          </td>
        );
      })}
      <td>
        {canEdit && row.itemType !== "plan_start" && row.itemType !== "plan_end" ? (
          <button type="button" className="vbs-task-remove" aria-label={`Delete ${row.title}`} disabled={busy} onClick={remove}>
            ×
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function TaskRegisterGrid({
  ctx,
  orgId,
  data,
  busy,
  onRun,
  worksheetData,
  updateWorksheet,
  selectedCell,
  onSelectCell,
  cellStyle,
  teamName,
}: {
  ctx: WorksheetViewContext;
  orgId: string;
  data: VbsPlanWorkspace;
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => void;
  worksheetData: PlanWorksheetData;
  updateWorksheet: (updater: (current: PlanWorksheetData) => PlanWorksheetData) => void;
  selectedCell: SelectedCell | null;
  onSelectCell: (viewId: WorksheetViewId, rowKey: string, column: string) => void;
  cellStyle: (viewId: WorksheetViewId, rowKey: string, column: string) => CSSProperties;
  teamName: (id: string) => string;
}) {
  const rows = useMemo(() => buildTaskRegisterRows(ctx), [ctx]);
  const viewId = "taskRegister" as const;

  if (rows.length === 0) {
    return <p className="muted vbs-task-empty">No tasks yet. Add tasks on the Tasks tab—they appear here automatically.</p>;
  }

  return (
    <div className="vbs-spreadsheet-scroll vbs-worksheet-grid-wrap">
      <table className="vbs-spreadsheet vbs-worksheet-grid">
        <thead>
          <tr>
            <th className="vbs-worksheet-row-num">#</th>
            <th>Category</th>
            <th>Task</th>
            <th>Assigned to</th>
            <th>Team</th>
            <th>Due date</th>
            <th>Status</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <TaskRegisterRow
              key={row.rowKey}
              index={index + 1}
              row={row}
              viewId={viewId}
              data={data}
              orgId={orgId}
              busy={busy}
              onRun={onRun}
              worksheetData={worksheetData}
              updateWorksheet={updateWorksheet}
              selectedCell={selectedCell}
              onSelectCell={onSelectCell}
              cellStyle={cellStyle}
              teamName={teamName}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskRegisterRow({
  index,
  row,
  viewId,
  data,
  orgId,
  busy,
  onRun,
  worksheetData,
  updateWorksheet,
  selectedCell,
  onSelectCell,
  cellStyle,
  teamName,
}: {
  index: number;
  row: TaskRegisterRow;
  viewId: WorksheetViewId;
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => void;
  worksheetData: PlanWorksheetData;
  updateWorksheet: (updater: (current: PlanWorksheetData) => PlanWorksheetData) => void;
  selectedCell: SelectedCell | null;
  onSelectCell: (viewId: WorksheetViewId, rowKey: string, column: string) => void;
  cellStyle: (viewId: WorksheetViewId, rowKey: string, column: string) => CSSProperties;
  teamName: (id: string) => string;
}) {
  const task = data.tasks.find((t) => t.id === row.taskId);
  const canEdit = data.canWrite && Boolean(task);
  const [title, setTitle] = useState(row.title);
  const [dueDate, setDueDate] = useState(row.dueDate);
  const [assignedUsername, setAssignedUsername] = useState(row.assignedUsername);
  const [assignedTeamId, setAssignedTeamId] = useState(row.assignedTeamId);
  const [category, setCategory] = useState(row.category);
  const [status, setStatus] = useState(row.status);

  useEffect(() => {
    setTitle(row.title);
    setDueDate(row.dueDate);
    setAssignedUsername(row.assignedUsername);
    setAssignedTeamId(row.assignedTeamId);
    setCategory(row.category);
    setStatus(row.status);
  }, [row]);

  function notesValue() {
    return worksheetData.notes[row.rowKey] ?? row.notes;
  }

  function persist(patch: Partial<{ title: string; dueDate: string; assignedUsername: string; assignedTeamId: string; category: VbsTaskCategory; status: VbsTaskStatus; notes: string }>) {
    if (!canEdit || !task) {
      return;
    }
    onRun(() =>
      api.saveVbsTask(
        orgId,
        vbsTaskSavePayload(task, {
          title: patch.title ?? (title.trim() || task.title),
          notes: patch.notes ?? notesValue(),
          category: (patch.category ?? category) as VbsTaskCategory,
          status: patch.status ?? status,
          dueDate: patch.dueDate ?? dueDate,
          assignedUsername: patch.assignedUsername ?? assignedUsername,
          assignedTeamId: patch.assignedTeamId ?? assignedTeamId,
        }),
      ),
    );
  }

  function saveNotes(nextNotes: string) {
    updateWorksheet((current) => ({
      ...current,
      notes: { ...current.notes, [row.rowKey]: nextNotes },
    }));
    persist({ notes: nextNotes });
  }

  return (
    <tr className="vbs-spreadsheet-row">
      <td className="vbs-worksheet-row-num muted">{index}</td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "category")}
        style={cellStyle(viewId, row.rowKey, "category")}
        onClick={() => onSelectCell(viewId, row.rowKey, "category")}
      >
        {canEdit ? (
          <select value={category} disabled={busy} onChange={(e) => { setCategory(e.target.value as VbsTaskCategory); persist({ category: e.target.value as VbsTaskCategory }); }}>
            {data.taskCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          category
        )}
      </td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "title")}
        style={cellStyle(viewId, row.rowKey, "title")}
        onClick={() => onSelectCell(viewId, row.rowKey, "title")}
      >
        {canEdit ? (
          <input type="text" className="vbs-spreadsheet-title-input" value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} onBlur={() => persist({ title })} />
        ) : (
          title
        )}
      </td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "owner")}
        style={cellStyle(viewId, row.rowKey, "owner")}
        onClick={() => onSelectCell(viewId, row.rowKey, "owner")}
      >
        {canEdit ? (
          <OrgUserTypeahead
            orgId={orgId}
            value={assignedUsername}
            disabled={busy}
            compact
            showAssignMe={false}
            onChange={setAssignedUsername}
            onCommit={(next) => persist({ assignedUsername: next })}
          />
        ) : (
          assignedUsername || "—"
        )}
      </td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "team")}
        style={cellStyle(viewId, row.rowKey, "team")}
        onClick={() => onSelectCell(viewId, row.rowKey, "team")}
      >
        {canEdit ? (
          <select value={assignedTeamId} disabled={busy} onChange={(e) => { setAssignedTeamId(e.target.value); persist({ assignedTeamId: e.target.value }); }}>
            <option value="">—</option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : (
          row.assignedTeamId ? teamName(row.assignedTeamId) : "—"
        )}
      </td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "due")}
        style={cellStyle(viewId, row.rowKey, "due")}
        onClick={() => onSelectCell(viewId, row.rowKey, "due")}
      >
        {canEdit ? (
          <input type="date" value={dueDate} disabled={busy} onChange={(e) => setDueDate(e.target.value)} onBlur={() => persist({ dueDate })} />
        ) : (
          dueDate || "—"
        )}
      </td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "status")}
        style={cellStyle(viewId, row.rowKey, "status")}
        onClick={() => onSelectCell(viewId, row.rowKey, "status")}
      >
        {canEdit ? (
          <select value={status} disabled={busy} onChange={(e) => { setStatus(e.target.value as VbsTaskStatus); persist({ status: e.target.value as VbsTaskStatus }); }}>
            {data.taskStatuses.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          TASK_STATUS_LABEL[row.status]
        )}
      </td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "notes")}
        style={cellStyle(viewId, row.rowKey, "notes")}
        onClick={() => onSelectCell(viewId, row.rowKey, "notes")}
      >
        {canEdit ? (
          <textarea className="vbs-worksheet-notes" rows={1} defaultValue={notesValue()} disabled={busy} onBlur={(e) => saveNotes(e.target.value)} />
        ) : (
          notesValue() || "—"
        )}
      </td>
    </tr>
  );
}

function ReadinessGrid({
  ctx,
  orgId,
  data,
  busy,
  onRun,
  worksheetData,
  updateWorksheet,
  selectedCell,
  onSelectCell,
  cellStyle,
  teamName,
}: {
  ctx: WorksheetViewContext;
  orgId: string;
  data: VbsPlanWorkspace;
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => void;
  worksheetData: PlanWorksheetData;
  updateWorksheet: (updater: (current: PlanWorksheetData) => PlanWorksheetData) => void;
  selectedCell: SelectedCell | null;
  onSelectCell: (viewId: WorksheetViewId, rowKey: string, column: string) => void;
  cellStyle: (viewId: WorksheetViewId, rowKey: string, column: string) => CSSProperties;
  teamName: (id: string) => string;
}) {
  const rows = useMemo(() => buildReadinessRows(ctx), [ctx]);
  const viewId = "readiness" as const;

  if (rows.length === 0) {
    return <p className="muted vbs-task-empty">No milestones yet. Add them on the Milestones Checklist tab.</p>;
  }

  return (
    <div className="vbs-spreadsheet-scroll vbs-worksheet-grid-wrap">
      <table className="vbs-spreadsheet vbs-worksheet-grid">
        <thead>
          <tr>
            <th className="vbs-worksheet-row-num">#</th>
            <th>Workstream</th>
            <th>Item</th>
            <th>Team</th>
            <th>Target date</th>
            <th>Status</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <ReadinessRow
              key={row.rowKey}
              index={index + 1}
              row={row}
              viewId={viewId}
              data={data}
              orgId={orgId}
              busy={busy}
              onRun={onRun}
              worksheetData={worksheetData}
              updateWorksheet={updateWorksheet}
              selectedCell={selectedCell}
              onSelectCell={onSelectCell}
              cellStyle={cellStyle}
              teamName={teamName}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadinessRow({
  index,
  row,
  viewId,
  data,
  orgId,
  busy,
  onRun,
  worksheetData,
  updateWorksheet,
  selectedCell,
  onSelectCell,
  cellStyle,
  teamName,
}: {
  index: number;
  row: ReadinessRow;
  viewId: WorksheetViewId;
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => void;
  worksheetData: PlanWorksheetData;
  updateWorksheet: (updater: (current: PlanWorksheetData) => PlanWorksheetData) => void;
  selectedCell: SelectedCell | null;
  onSelectCell: (viewId: WorksheetViewId, rowKey: string, column: string) => void;
  cellStyle: (viewId: WorksheetViewId, rowKey: string, column: string) => CSSProperties;
  teamName: (id: string) => string;
}) {
  const item = data.checklist.find((c) => c.id === row.itemId);
  const canEdit = data.canWrite && Boolean(item);
  const [category, setCategory] = useState(row.category);
  const [label, setLabel] = useState(row.label);
  const [assignedTeamId, setAssignedTeamId] = useState(row.assignedTeamId);
  const [dueDate, setDueDate] = useState(row.dueDate);
  const [status, setStatus] = useState(normalizeMilestoneStatus(row));

  useEffect(() => {
    setCategory(row.category);
    setLabel(row.label);
    setAssignedTeamId(row.assignedTeamId);
    setDueDate(row.dueDate);
    setStatus(normalizeMilestoneStatus(row));
  }, [row]);

  function notesValue() {
    return worksheetData.notes[row.rowKey] ?? item?.notes ?? "";
  }

  function persist(patch: Partial<{ category: string; label: string; assignedTeamId: string; dueDate: string; status: VbsMilestoneStatus; notes: string }>) {
    if (!canEdit || !item) {
      return;
    }
    onRun(() =>
      api.saveVbsChecklistItem(orgId, {
        id: item.id,
        category: patch.category ?? category,
        label: patch.label ?? (label.trim() || item.label),
        assignedTeamId: patch.assignedTeamId ?? assignedTeamId,
        dueDate: patch.dueDate ?? dueDate,
        notes: patch.notes ?? item.notes,
        status: patch.status ?? status,
      }),
    );
  }

  function saveNotes(nextNotes: string) {
    updateWorksheet((current) => ({
      ...current,
      notes: { ...current.notes, [row.rowKey]: nextNotes },
    }));
    if (!canEdit || !item) {
      return;
    }
    onRun(() =>
      api.saveVbsChecklistItem(orgId, {
        id: item.id,
        category: item.category,
        label: item.label,
        assignedTeamId: item.assignedTeamId,
        dueDate: item.dueDate,
        notes: nextNotes,
        status: normalizeMilestoneStatus(item),
      }),
    );
  }

  const done = milestoneIsDone({ status, done: status === "done" });

  return (
    <tr className={done ? "vbs-spreadsheet-row readonly" : "vbs-spreadsheet-row"}>
      <td className="vbs-worksheet-row-num muted">{index}</td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "category")}
        style={cellStyle(viewId, row.rowKey, "category")}
        onClick={() => onSelectCell(viewId, row.rowKey, "category")}
      >
        {canEdit ? (
          <input type="text" value={category} disabled={busy} onChange={(e) => setCategory(e.target.value)} onBlur={() => persist({ category })} />
        ) : (
          category
        )}
      </td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "label")}
        style={cellStyle(viewId, row.rowKey, "label")}
        onClick={() => onSelectCell(viewId, row.rowKey, "label")}
      >
        {canEdit ? (
          <input type="text" className="vbs-spreadsheet-title-input" value={label} disabled={busy} onChange={(e) => setLabel(e.target.value)} onBlur={() => persist({ label })} />
        ) : (
          label
        )}
      </td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "team")}
        style={cellStyle(viewId, row.rowKey, "team")}
        onClick={() => onSelectCell(viewId, row.rowKey, "team")}
      >
        {canEdit ? (
          <select value={assignedTeamId} disabled={busy} onChange={(e) => { setAssignedTeamId(e.target.value); persist({ assignedTeamId: e.target.value }); }}>
            <option value="">—</option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : (
          row.assignedTeamId ? teamName(row.assignedTeamId) : "—"
        )}
      </td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "due")}
        style={cellStyle(viewId, row.rowKey, "due")}
        onClick={() => onSelectCell(viewId, row.rowKey, "due")}
      >
        {canEdit ? (
          <input type="date" value={dueDate} disabled={busy} onChange={(e) => setDueDate(e.target.value)} onBlur={() => persist({ dueDate })} />
        ) : (
          dueDate || "—"
        )}
      </td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "status")}
        style={cellStyle(viewId, row.rowKey, "status")}
        onClick={() => onSelectCell(viewId, row.rowKey, "status")}
      >
        {canEdit ? (
          <select
            value={status}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as VbsMilestoneStatus;
              setStatus(next);
              persist({ status: next });
            }}
          >
            {(Object.keys(MILESTONE_STATUS_LABELS) as VbsMilestoneStatus[]).map((key) => (
              <option key={key} value={key}>
                {MILESTONE_STATUS_LABELS[key]}
              </option>
            ))}
          </select>
        ) : (
          MILESTONE_STATUS_LABELS[normalizeMilestoneStatus(item ?? { status, done: false })]
        )}
      </td>
      <td
        className={cellClass(selectedCell, viewId, row.rowKey, "notes")}
        style={cellStyle(viewId, row.rowKey, "notes")}
        onClick={() => onSelectCell(viewId, row.rowKey, "notes")}
      >
        {canEdit ? (
          <textarea className="vbs-worksheet-notes" rows={1} defaultValue={notesValue()} disabled={busy} onBlur={(e) => saveNotes(e.target.value)} />
        ) : (
          notesValue() || "—"
        )}
      </td>
    </tr>
  );
}
