import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { stationNameKey } from "@vbs-workbook-stations";
import type { OrgMember, VbsPlanWorkspace, VbsStation } from "./types";
import { api } from "./api";
import { AddActionButton, SectionAddActions } from "./CollapsibleForm";
import {
  newPrayerScheduleRow,
  PRAYER_NOTIFY_WHEN_OPTIONS,
  prayerNotifyWhenLabel,
} from "./vbs-prayer-schedule";
import {
  addVolunteerPlacementDay,
  defaultVolunteerPlacementDates,
  emptyVolunteerPlacements,
  removeVolunteerPlacementDay,
  renameVolunteerPlacementDay,
  suggestedNextVolunteerPlacementDay,
} from "./vbs-workbook-sheets";
import {
  addScheduleColumn,
  blankScheduleRow,
  emptyScheduleMatrix,
  normalizeScheduleMatrix,
  removeScheduleColumn,
} from "./vbs-schedule-matrix";
import { WORKBOOK_SECTIONS, workbookSectionMeta, type WorkbookSectionId } from "./vbs-plan-workbook";
import { WorkbookMemberField } from "./WorkbookMemberInput";
import {
  WorkbookAssignmentBox,
  WorkbookVolunteerLayout,
  WorkbookVolunteerPool,
} from "./WorkbookVolunteerDnD";
import {
  applyWorkbookCellDrop,
  type WorkbookAssignmentArea,
  type WorkbookDragPayload,
} from "./workbook-volunteer-dnd";
import {
  normalizePlanWorksheetData,
  type PlanWorksheetData,
  type PrayerScheduleRow,
  type ScheduleMatrixData,
  type StationNeedsRow,
  type StationNeedsSide,
  type VolunteerPlacementRow,
  type VolunteerTimelineRow,
} from "./vbs-worksheet-types";

type Props = {
  orgId: string;
  data: VbsPlanWorkspace;
  busy: boolean;
  canWrite: boolean;
  section: WorkbookSectionId;
  onSectionChange: (section: WorkbookSectionId) => void;
  onRun: (action: () => Promise<unknown>) => void;
  onSaved: () => void;
};

function cloneWorksheet(data: PlanWorksheetData): PlanWorksheetData {
  return JSON.parse(JSON.stringify(data)) as PlanWorksheetData;
}

function formatPlacementDayHeader(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" });
}

export function VbsPlanWorkbookTab({
  orgId,
  data,
  busy,
  canWrite,
  section,
  onSectionChange,
  onRun,
  onSaved,
}: Props) {
  const plan = data.plan;
  const baseline = useMemo(
    () => normalizePlanWorksheetData(plan?.worksheetData),
    [plan?.worksheetData],
  );
  const [draft, setDraft] = useState(() => cloneWorksheet(baseline));
  const [dirty, setDirty] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [memberDrag, setMemberDrag] = useState<WorkbookDragPayload | null>(null);
  const [placementDayMessage, setPlacementDayMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(cloneWorksheet(baseline));
    setDirty(false);
  }, [baseline]);

  useEffect(() => {
    let cancelled = false;
    api
      .organization(orgId)
      .then((detail) => {
        if (!cancelled) {
          setOrgMembers(detail.members.filter((member) => !member.removedAt));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOrgMembers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const placementDates = useMemo(() => {
    const fromDraft = draft.volunteerPlacements?.dayDates?.filter(Boolean);
    if (fromDraft?.length) {
      return fromDraft;
    }
    return defaultVolunteerPlacementDates(plan?.startDate ?? "", plan?.endDate ?? "");
  }, [draft.volunteerPlacements?.dayDates, plan?.endDate, plan?.startDate]);

  if (!plan) {
    return null;
  }

  function patch(next: PlanWorksheetData) {
    setDraft(next);
    setDirty(true);
  }

  function ensurePlacements(): VolunteerPlacementRow[] {
    const vp = draft.volunteerPlacements ?? emptyVolunteerPlacements(plan!.startDate ?? "", plan!.endDate ?? "");
    return vp.rows;
  }

  function patchSchedule(next: ScheduleMatrixData) {
    patch({ ...draft, scheduleMatrix: next });
  }

  function currentPlacements() {
    return { dayDates: placementDates, rows: placementRows };
  }

  function dropWorkbookCell(
    payload: WorkbookDragPayload,
    area: WorkbookAssignmentArea,
    toRowIndex: number,
    toField: string,
    toLineIndex?: number,
  ) {
    const { placementRows: nextPlacements, prayerRows: nextPrayer } = applyWorkbookCellDrop(
      placementRows,
      prayerRows,
      payload,
      area,
      toRowIndex,
      toField,
      toLineIndex,
    );
    patch({
      ...draft,
      volunteerPlacements: { dayDates: placementDates, rows: nextPlacements },
      prayerSchedule: nextPrayer,
    });
  }

  function save() {
    const payload: PlanWorksheetData = {
      ...draft,
      volunteerPlacements: {
        dayDates: placementDates,
        rows: draft.volunteerPlacements?.rows ?? [],
      },
    };
    onRun(async () => {
      await api.saveVbsWorksheet(orgId, payload as Record<string, unknown>);
      onSaved();
      setDirty(false);
    });
  }

  const prayerRows = draft.prayerSchedule ?? [];
  const stationRows = draft.stationNeeds ?? [];
  const scheduleMatrix = useMemo(
    () => normalizeScheduleMatrix(draft.scheduleMatrix) ?? emptyScheduleMatrix(),
    [draft.scheduleMatrix],
  );
  const timelineRows = draft.volunteerTimeline ?? [];
  const placementRows = draft.volunteerPlacements?.rows ?? ensurePlacements();
  const sectionMeta = workbookSectionMeta(section);
  const dragActive = memberDrag !== null;
  const volunteerPool = (
    <WorkbookVolunteerPool
      members={orgMembers}
      canWrite={canWrite}
      drag={memberDrag}
      setDrag={setMemberDrag}
    />
  );

  return (
    <div className="vbs-plan-workbook">
      <header className="vbs-plan-workbook-head">
        <div>
          <h2>Cornerstone workbook</h2>
          <p className="muted">
            One tab per Excel sheet. Changes apply to the whole workbook — save once before switching sections
            or exporting.
          </p>
        </div>
        {canWrite ? (
          <AddActionButton
            label={dirty ? "Save workbook" : "Saved"}
            disabled={busy || !dirty}
            onClick={() => save()}
          />
        ) : null}
      </header>

      <div className="vbs-prep-toolbar vbs-plan-workbook-toolbar">
        <div className="vbs-prep-views" role="tablist" aria-label="Workbook sections">
          {WORKBOOK_SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={section === id}
              className={section === id ? "vbs-prep-view-btn active" : "vbs-prep-view-btn"}
              onClick={() => onSectionChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <WorkbookSection title={sectionMeta.label} hint={sectionMeta.hint}>
      {section === "prayer" ? (
        <WorkbookVolunteerLayout
          pool={volunteerPool}
          main={
            <>
              <div className="vbs-workbook-prayer-rows">
                {prayerRows.map((row, index) => (
                  <article key={`prayer-${index}`} className="vbs-workbook-prayer-row">
                    <div className="vbs-workbook-prayer-slots">
                      {(
                        [
                          { field: "person1", label: "Person 1", value: row.person1 },
                          { field: "person2", label: "Person 2", value: row.person2 },
                          { field: "person3", label: "Person 3", value: row.person3 },
                        ] as const
                      ).map(({ field, label, value }) => (
                        <WorkbookAssignmentBox
                          key={field}
                          slotLabel={label}
                          label={
                            row.prayDate
                              ? `${label} · ${formatPlacementDayHeader(row.prayDate)}`
                              : label
                          }
                          value={value}
                          rowIndex={index}
                          area="prayer"
                          field={field}
                          canWrite={canWrite}
                          dragActive={dragActive}
                          setDrag={setMemberDrag}
                          onDropAssign={(payload, toLineIndex) =>
                            dropWorkbookCell(payload, "prayer", index, field, toLineIndex)
                          }
                          onChange={(next) => {
                            const rows = [...prayerRows];
                            rows[index] = { ...row, [field]: next };
                            patch({ ...draft, prayerSchedule: rows });
                          }}
                        />
                      ))}
                      <div className="vbs-workbook-prayer-date-col">
                        <label className="vbs-workbook-prayer-date">
                          <span className="vbs-workbook-slot-label">Date to pray</span>
                          {canWrite ? (
                            <input
                              type="date"
                              value={row.prayDate}
                              title={row.prayDate || undefined}
                              disabled={busy}
                              onChange={(event) => {
                                const rows = [...prayerRows];
                                rows[index] = { ...row, prayDate: event.target.value };
                                patch({ ...draft, prayerSchedule: rows });
                              }}
                            />
                          ) : (
                            <span title={row.prayDate || undefined}>
                              {row.prayDate ? formatPlacementDayHeader(row.prayDate) : "—"}
                            </span>
                          )}
                        </label>
                        <div className="vbs-workbook-prayer-notify">
                          {canWrite ? (
                            <>
                              <label className="vbs-workbook-prayer-notify-toggle">
                                <input
                                  type="checkbox"
                                  checked={row.notifyEnabled === true}
                                  disabled={busy}
                                  onChange={(event) => {
                                    const rows = [...prayerRows];
                                    rows[index] = { ...row, notifyEnabled: event.target.checked };
                                    patch({ ...draft, prayerSchedule: rows });
                                  }}
                                />
                                Send notification
                              </label>
                              <select
                                className="vbs-workbook-prayer-notify-when"
                                value={row.notifyMinutesBefore ?? 1440}
                                disabled={busy || row.notifyEnabled !== true}
                                aria-label="When to send prayer reminder"
                                onChange={(event) => {
                                  const rows = [...prayerRows];
                                  rows[index] = {
                                    ...row,
                                    notifyMinutesBefore: Number.parseInt(event.target.value, 10),
                                  };
                                  patch({ ...draft, prayerSchedule: rows });
                                }}
                              >
                                {PRAYER_NOTIFY_WHEN_OPTIONS.map((opt) => (
                                  <option key={opt.minutes} value={opt.minutes}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <span className="muted">
                              {row.notifyEnabled
                                ? `Reminder: ${prayerNotifyWhenLabel(row.notifyMinutesBefore)}`
                                : "Reminder: Off"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {canWrite ? (
                      <WorkbookRowRemoveButton
                        className="vbs-workbook-prayer-row-remove"
                        aria-label="Remove prayer row"
                        disabled={busy}
                        onClick={() => {
                          patch({ ...draft, prayerSchedule: prayerRows.filter((_, i) => i !== index) });
                        }}
                      />
                    ) : null}
                  </article>
                ))}
              </div>
              {canWrite ? (
                <SectionAddActions>
                  <AddActionButton
                    label="Add prayer row"
                    disabled={busy}
                    onClick={() => {
                      patch({ ...draft, prayerSchedule: [...prayerRows, newPrayerScheduleRow()] });
                    }}
                  />
                </SectionAddActions>
              ) : null}
            </>
          }
        />
      ) : null}

      {section === "placements" ? (
        <WorkbookVolunteerLayout
          pool={volunteerPool}
          main={
            <>
              <div className="vbs-spreadsheet-scroll vbs-workbook-placements-scroll">
                <table
                  className={
                    canWrite
                      ? "vbs-spreadsheet vbs-plan-workbook-table vbs-workbook-placements-table has-row-actions"
                      : "vbs-spreadsheet vbs-plan-workbook-table vbs-workbook-placements-table"
                  }
                  style={{ "--placement-day-count": placementDates.length } as CSSProperties}
                >
                  <colgroup>
                    <col className="vbs-workbook-placement-col-role" />
                    {placementDates.map((date) => (
                      <col key={date} className="vbs-workbook-placement-col-day" />
                    ))}
                    {canWrite ? <col className="vbs-workbook-placement-col-actions" /> : null}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Role</th>
                      {placementDates.map((date, colIndex) => (
                        <th key={date} className="vbs-workbook-placement-day-head vbs-workbook-col-head">
                          <div className="vbs-workbook-col-head-inner">
                            {canWrite ? (
                              <input
                                type="date"
                                className="vbs-workbook-col-date-input"
                                value={date}
                                title={`${formatPlacementDayHeader(date)} (${date})`}
                                aria-label={`Day column ${colIndex + 1}`}
                                disabled={busy}
                                onChange={(event) => {
                                  const toDate = event.target.value;
                                  if (!toDate || toDate === date) {
                                    return;
                                  }
                                  const result = renameVolunteerPlacementDay(currentPlacements(), date, toDate);
                                  if (!result.ok) {
                                    setPlacementDayMessage(result.message);
                                    return;
                                  }
                                  setPlacementDayMessage(null);
                                  patch({ ...draft, volunteerPlacements: result.data });
                                }}
                              />
                            ) : (
                              <span title={date}>{formatPlacementDayHeader(date)}</span>
                            )}
                            {canWrite ? (
                              <WorkbookRowRemoveButton
                                className="vbs-workbook-col-remove"
                                aria-label={`Delete column ${formatPlacementDayHeader(date)}`}
                                title="Delete column"
                                disabled={busy}
                                onClick={() => {
                                  setPlacementDayMessage(null);
                                  patch({
                                    ...draft,
                                    volunteerPlacements: removeVolunteerPlacementDay(currentPlacements(), date),
                                  });
                                }}
                              />
                            ) : null}
                          </div>
                        </th>
                      ))}
                      {canWrite ? (
                        <th
                          className="vbs-workbook-table-row-actions-head vbs-workbook-placement-actions-head"
                          aria-label="Remove row"
                        />
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {placementRows.map((row, index) => (
                      <tr key={`placement-${index}`}>
                        <td className="vbs-workbook-placement-role">
                          {canWrite ? (
                            <textarea
                              rows={3}
                              value={row.roleLabel}
                              disabled={busy}
                              onChange={(event) => {
                                const rows = [...placementRows];
                                rows[index] = { ...row, roleLabel: event.target.value };
                                patch({
                                  ...draft,
                                  volunteerPlacements: { dayDates: placementDates, rows },
                                });
                              }}
                            />
                          ) : (
                            row.roleLabel
                          )}
                        </td>
                        {placementDates.map((date) => (
                          <td key={date} className="vbs-workbook-placement-day">
                            <WorkbookAssignmentBox
                              label={`${row.roleLabel || "Role"} · ${formatPlacementDayHeader(date)}`}
                              value={row.assignmentsByDate[date] ?? ""}
                              rowIndex={index}
                              area="placement"
                              field={date}
                              canWrite={canWrite}
                              dragActive={dragActive}
                              setDrag={setMemberDrag}
                              onDropAssign={(payload, toLineIndex) =>
                                dropWorkbookCell(payload, "placement", index, date, toLineIndex)
                              }
                              onChange={(next) => {
                                const rows = [...placementRows];
                                rows[index] = {
                                  ...row,
                                  assignmentsByDate: { ...row.assignmentsByDate, [date]: next },
                                };
                                patch({
                                  ...draft,
                                  volunteerPlacements: { dayDates: placementDates, rows },
                                });
                              }}
                            />
                          </td>
                        ))}
                        {canWrite ? (
                          <td className="vbs-workbook-table-row-actions vbs-workbook-placement-actions">
                            <WorkbookRowRemoveButton
                              aria-label={`Remove row${row.roleLabel.trim() ? `: ${row.roleLabel.trim()}` : ""}`}
                              disabled={busy}
                              onClick={() => {
                                const rows = placementRows.filter((_, i) => i !== index);
                                patch({
                                  ...draft,
                                  volunteerPlacements: { dayDates: placementDates, rows },
                                });
                              }}
                            />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canWrite ? (
                <>
                  <SectionAddActions>
                    <AddActionButton
                      label="Add placement row"
                      disabled={busy}
                      onClick={() => {
                        const emptyDates = Object.fromEntries(placementDates.map((d) => [d, ""]));
                        const rows = [...placementRows, { roleLabel: "", assignmentsByDate: emptyDates }];
                        patch({ ...draft, volunteerPlacements: { dayDates: placementDates, rows } });
                      }}
                    />
                    <AddActionButton
                      label="Add day"
                      disabled={busy}
                      onClick={() => {
                        const nextDay = suggestedNextVolunteerPlacementDay(
                          placementDates,
                          plan?.startDate ?? "",
                        );
                        const result = addVolunteerPlacementDay(currentPlacements(), nextDay);
                        if (!result.ok) {
                          setPlacementDayMessage(result.message);
                          return;
                        }
                        setPlacementDayMessage(null);
                        patch({ ...draft, volunteerPlacements: result.data });
                      }}
                    />
                  </SectionAddActions>
                  {placementDayMessage ? (
                    <p className="form-error vbs-workbook-add-day-error" role="alert">
                      {placementDayMessage}
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          }
        />
      ) : null}

      {section === "stations" ? (
        <>
        <div className="vbs-spreadsheet-scroll">
          <table className="vbs-spreadsheet vbs-plan-workbook-table">
            <thead>
              <tr>
                <th colSpan={3}>Preschool</th>
                <th aria-hidden />
                <th colSpan={3}>Elementary</th>
                {canWrite ? <th className="vbs-workbook-table-row-actions-head" aria-label="Remove row" /> : null}
              </tr>
              <tr>
                <th>Station</th>
                <th>Volunteers</th>
                <th>Room / supplies</th>
                <th aria-hidden />
                <th>Station</th>
                <th>Volunteers</th>
                <th>Room / supplies</th>
                {canWrite ? <th className="vbs-workbook-table-row-actions-head" aria-label="Remove row" /> : null}
              </tr>
            </thead>
            <tbody>
              {stationRows.map((row, index) => (
                <StationNeedsEditorRow
                  key={`station-${index}`}
                  row={row}
                  stations={data.stations}
                  canWrite={canWrite}
                  onChange={(next) => {
                    const rows = [...stationRows];
                    rows[index] = next;
                    patch({ ...draft, stationNeeds: rows });
                  }}
                  onRemove={
                    canWrite
                      ? () => {
                          patch({ ...draft, stationNeeds: stationRows.filter((_, i) => i !== index) });
                        }
                      : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
        {canWrite ? (
          <SectionAddActions>
            <AddActionButton
              label="Add station pair"
              disabled={busy}
              onClick={() => {
                const blank: StationNeedsRow = {
                  preschool: { stationLabel: "", volunteersNeeded: "", roomSupplies: "" },
                  elementary: { stationLabel: "", volunteersNeeded: "", roomSupplies: "" },
                };
                patch({ ...draft, stationNeeds: [...stationRows, blank] });
              }}
            />
          </SectionAddActions>
        ) : null}
        </>
      ) : null}

      {section === "schedule" ? (
        <>
        <div className="vbs-spreadsheet-scroll vbs-workbook-schedule-scroll">
          <table
            className={
              canWrite
                ? "vbs-spreadsheet vbs-plan-workbook-table vbs-workbook-schedule-table has-row-actions"
                : "vbs-spreadsheet vbs-plan-workbook-table vbs-workbook-schedule-table"
            }
            style={{ "--schedule-col-count": scheduleMatrix.columns.length } as CSSProperties}
          >
            <colgroup>
              <col className="vbs-workbook-schedule-col-time" />
              {scheduleMatrix.columns.map((column) => (
                <col key={column.id} className="vbs-workbook-schedule-col-data" />
              ))}
              {canWrite ? <col className="vbs-workbook-schedule-col-actions" /> : null}
            </colgroup>
            <thead>
              <tr>
                <th className="vbs-workbook-schedule-time-head">Time</th>
                {scheduleMatrix.columns.map((column, colIndex) => (
                  <th key={column.id} className="vbs-workbook-schedule-col-head vbs-workbook-col-head">
                    <div className="vbs-workbook-col-head-inner">
                      {canWrite ? (
                        <input
                          type="text"
                          className="vbs-workbook-col-label-input"
                          value={column.label}
                          title={column.label}
                          aria-label={`Column ${colIndex + 1} heading`}
                          disabled={busy}
                          onChange={(event) => {
                            const columns = scheduleMatrix.columns.map((entry) =>
                              entry.id === column.id ? { ...entry, label: event.target.value } : entry,
                            );
                            patchSchedule({ ...scheduleMatrix, columns });
                          }}
                        />
                      ) : (
                        <span title={column.label}>{column.label}</span>
                      )}
                      {canWrite ? (
                        <WorkbookRowRemoveButton
                          className="vbs-workbook-col-remove"
                          aria-label={`Delete column ${column.label.trim() || column.id}`}
                          title="Delete column"
                          disabled={busy}
                          onClick={() => patchSchedule(removeScheduleColumn(scheduleMatrix, column.id))}
                        />
                      ) : null}
                    </div>
                  </th>
                ))}
                {canWrite ? <th className="vbs-workbook-table-row-actions-head" aria-label="Remove row" /> : null}
              </tr>
            </thead>
            <tbody>
              {scheduleMatrix.rows.map((row, index) => (
                <tr key={`sched-${index}`}>
                  <td className="vbs-workbook-schedule-time-cell">
                    {canWrite ? (
                      <textarea
                        rows={1}
                        value={row.time}
                        disabled={busy}
                        onChange={(event) => {
                          const rows = [...scheduleMatrix.rows];
                          rows[index] = { ...row, time: event.target.value };
                          patchSchedule({ ...scheduleMatrix, rows });
                        }}
                      />
                    ) : (
                      row.time
                    )}
                  </td>
                  {scheduleMatrix.columns.map((column) => (
                    <td key={column.id} className="vbs-workbook-schedule-data-cell">
                      {canWrite ? (
                        <textarea
                          rows={3}
                          value={row.cells[column.id] ?? ""}
                          disabled={busy}
                          onChange={(event) => {
                            const rows = [...scheduleMatrix.rows];
                            rows[index] = {
                              ...row,
                              cells: { ...row.cells, [column.id]: event.target.value },
                            };
                            patchSchedule({ ...scheduleMatrix, rows });
                          }}
                        />
                      ) : (
                        row.cells[column.id] ?? ""
                      )}
                    </td>
                  ))}
                  {canWrite ? (
                    <td className="vbs-workbook-table-row-actions">
                      <WorkbookRowRemoveButton
                        aria-label={`Remove schedule row${row.time.trim() ? `: ${row.time.trim()}` : ""}`}
                        disabled={busy}
                        onClick={() => {
                          patchSchedule({
                            ...scheduleMatrix,
                            rows: scheduleMatrix.rows.filter((_, i) => i !== index),
                          });
                        }}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canWrite ? (
          <SectionAddActions>
            <AddActionButton
              label="Add schedule row"
              disabled={busy}
              onClick={() => {
                patchSchedule({
                  ...scheduleMatrix,
                  rows: [...scheduleMatrix.rows, blankScheduleRow(scheduleMatrix.columns)],
                });
              }}
            />
            <AddActionButton
              label="Add column"
              disabled={busy}
              onClick={() => patchSchedule(addScheduleColumn(scheduleMatrix))}
            />
          </SectionAddActions>
        ) : null}
        </>
      ) : null}

      {section === "timeline" ? (
        <>
        <div className="vbs-spreadsheet-scroll">
          <table className="vbs-spreadsheet vbs-plan-workbook-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Description</th>
                <th>Who</th>
                <th>Location</th>
                {canWrite ? <th className="vbs-workbook-table-row-actions-head" aria-label="Remove row" /> : null}
              </tr>
            </thead>
            <tbody>
              {timelineRows.map((row, index) => (
                <tr key={`vt-${index}`}>
                  {(["date", "time", "description", "who", "location"] as const).map((field) => (
                    <td key={field}>
                      {canWrite ? (
                        field === "who" ? (
                          <WorkbookMemberField
                            value={row[field]}
                            disabled={busy}
                            placeholder="Members or “All volunteers”…"
                            onChange={(next) => {
                              const rows = [...timelineRows];
                              rows[index] = { ...row, [field]: next };
                              patch({ ...draft, volunteerTimeline: rows });
                            }}
                          />
                        ) : (
                          <input
                            type="text"
                            value={row[field]}
                            onChange={(event) => {
                              const rows = [...timelineRows];
                              rows[index] = { ...row, [field]: event.target.value };
                              patch({ ...draft, volunteerTimeline: rows });
                            }}
                          />
                        )
                      ) : (
                        row[field]
                      )}
                    </td>
                  ))}
                  {canWrite ? (
                    <td className="vbs-workbook-table-row-actions">
                      <WorkbookRowRemoveButton
                        aria-label={`Remove timeline row${
                          row.description.trim()
                            ? `: ${row.description.trim()}`
                            : row.date.trim()
                              ? `: ${row.date.trim()}`
                              : ""
                        }`}
                        disabled={busy}
                        onClick={() => {
                          patch({
                            ...draft,
                            volunteerTimeline: timelineRows.filter((_, i) => i !== index),
                          });
                        }}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canWrite ? (
          <SectionAddActions>
            <AddActionButton
              label="Add timeline row"
              disabled={busy}
              onClick={() => {
                const row: VolunteerTimelineRow = {
                  date: "",
                  time: "",
                  description: "",
                  who: "",
                  location: "",
                };
                patch({ ...draft, volunteerTimeline: [...timelineRows, row] });
              }}
            />
          </SectionAddActions>
        ) : null}
        </>
      ) : null}

      {section === "notes" ? (
        <>
          {canWrite ? (
            <textarea
              className="vbs-plan-workbook-notes"
              rows={12}
              value={draft.notesForNextYear ?? ""}
              onChange={(event) => patch({ ...draft, notesForNextYear: event.target.value })}
            />
          ) : (
            <pre className="vbs-plan-workbook-notes-readonly">{draft.notesForNextYear ?? ""}</pre>
          )}
        </>
      ) : null}
      </WorkbookSection>
    </div>
  );
}

function WorkbookRowRemoveButton({
  "aria-label": ariaLabel,
  className,
  disabled,
  onClick,
  title,
}: {
  "aria-label": string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`ghost vbs-task-remove vbs-workbook-table-row-remove${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      ×
    </button>
  );
}

function WorkbookSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="vbs-plan-workbook-section">
      <h3>{title}</h3>
      <p className="muted">{hint}</p>
      {children}
    </section>
  );
}

function resolveStationSelectValue(side: StationNeedsSide, stations: VbsStation[]): string {
  if (side.stationId && stations.some((station) => station.id === side.stationId)) {
    return side.stationId;
  }
  const key = stationNameKey(side.stationLabel);
  if (!key) {
    return "";
  }
  return stations.find((station) => stationNameKey(station.name) === key)?.id ?? "";
}

function StationNeedsEditorRow({
  row,
  stations,
  canWrite,
  onChange,
  onRemove,
}: {
  row: StationNeedsRow;
  stations: VbsStation[];
  canWrite: boolean;
  onChange: (row: StationNeedsRow) => void;
  onRemove?: () => void;
}) {
  function patchSide(side: "preschool" | "elementary", next: StationNeedsSide) {
    onChange({ ...row, [side]: next });
  }

  function sideCells(side: "preschool" | "elementary") {
    const value = row[side];
    const selectedId = resolveStationSelectValue(value, stations);
    const matched = stations.find((station) => station.id === selectedId);
    const showCustomLabel =
      !selectedId ||
      value.stationLabel.trim() !== (matched?.name ?? "").trim();

    return (
      <>
        <td key={`${side}-station`}>
          {canWrite ? (
            <div className="vbs-plan-workbook-station-cell">
              <select
                value={selectedId}
                onChange={(event) => {
                  const stationId = event.target.value;
                  if (!stationId) {
                    patchSide(side, { ...value, stationId: undefined });
                    return;
                  }
                  const station = stations.find((item) => item.id === stationId);
                  patchSide(side, {
                    ...value,
                    stationId,
                    stationLabel: station?.name ?? value.stationLabel,
                  });
                }}
              >
                <option value="">Select station…</option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
              {showCustomLabel ? (
                <textarea
                  rows={2}
                  placeholder="Custom label (optional)"
                  value={value.stationLabel}
                  onChange={(event) =>
                    patchSide(side, {
                      ...value,
                      stationId: undefined,
                      stationLabel: event.target.value,
                    })
                  }
                />
              ) : null}
            </div>
          ) : (
            value.stationLabel || stations.find((s) => s.id === value.stationId)?.name
          )}
        </td>
        <td key={`${side}-volunteers`}>
          {canWrite ? (
            <textarea
              rows={3}
              value={value.volunteersNeeded}
              onChange={(event) =>
                patchSide(side, { ...value, volunteersNeeded: event.target.value })
              }
            />
          ) : (
            value.volunteersNeeded
          )}
        </td>
        <td key={`${side}-supplies`}>
          {canWrite ? (
            <textarea
              rows={4}
              value={value.roomSupplies}
              onChange={(event) => patchSide(side, { ...value, roomSupplies: event.target.value })}
            />
          ) : (
            value.roomSupplies
          )}
        </td>
      </>
    );
  }

  return (
    <tr>
      {sideCells("preschool")}
      <td aria-hidden />
      {sideCells("elementary")}
      {canWrite && onRemove ? (
        <td className="vbs-workbook-table-row-actions">
          <WorkbookRowRemoveButton aria-label="Remove station pair row" onClick={onRemove} />
        </td>
      ) : null}
    </tr>
  );
}
