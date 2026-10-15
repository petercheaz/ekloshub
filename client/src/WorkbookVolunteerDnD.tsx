import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { TruncationTooltip } from "./TruncationTooltip";
import type { OrgMember } from "./types";
import {
  assignmentLines,
  joinAssignmentLines,
  readWorkbookDrag,
  writeWorkbookDrag,
  type WorkbookAssignmentArea,
  type WorkbookDragPayload,
} from "./workbook-volunteer-dnd";

export function orgMemberWorkbookName(member: OrgMember) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
  return name || member.username;
}

function workbookNameTooltipText(name: string, login?: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return login?.trim() ?? "";
  }
  if (login?.trim() && login.trim().toLowerCase() !== trimmed.toLowerCase()) {
    return `${trimmed} (${login.trim()})`;
  }
  return trimmed;
}

function WorkbookChipName({ name, login }: { name: string; login?: string }) {
  const tooltip = workbookNameTooltipText(name, login);
  return (
    <TruncationTooltip className="vbs-reg-class-chip-name" text={tooltip} force>
      <span className="vbs-reg-class-chip-name-text">{name}</span>
    </TruncationTooltip>
  );
}

export function WorkbookVolunteerLayout({
  main,
  pool,
}: {
  main: ReactNode;
  pool: ReactNode;
}) {
  return (
    <div className="vbs-workbook-dnd-layout">
      <div className="vbs-workbook-dnd-main">{main}</div>
      {pool}
    </div>
  );
}

export function WorkbookVolunteerPool({
  members,
  canWrite,
  drag,
  setDrag,
}: {
  members: OrgMember[];
  canWrite: boolean;
  drag: WorkbookDragPayload | null;
  setDrag: (drag: WorkbookDragPayload | null) => void;
}) {
  const sorted = useMemo(
    () =>
      [...members].sort((a, b) =>
        orgMemberWorkbookName(a).localeCompare(orgMemberWorkbookName(b), undefined, { sensitivity: "base" }),
      ),
    [members],
  );

  return (
    <aside className="vbs-reg-side-pool vbs-workbook-volunteer-pool">
      <header className="vbs-reg-side-pool-head">
        <h3>Volunteers</h3>
        <span className="muted">{sorted.length}</span>
      </header>
      <p className="muted vbs-reg-side-pool-note">
        Drag into prayer or placement cells. Reorder within a cell or move between slots, roles, and dates.
      </p>
      <div className={`vbs-roster-sortable-list${drag ? " is-active" : ""}`}>
        {sorted.map((member) => {
          const name = orgMemberWorkbookName(member);
          return (
            <div
              key={member.username}
              className="vbs-reg-class-chip vbs-reg-class-chip-staff vbs-reg-class-chip-account vbs-roster-chip"
            >
              <span
                className="vbs-roster-chip-grip"
                aria-hidden={!canWrite}
                draggable={canWrite}
                onDragStart={(e) => {
                  const payload: WorkbookDragPayload = { source: "pool", name };
                  writeWorkbookDrag(e.dataTransfer, payload);
                  setDrag(payload);
                }}
                onDragEnd={() => setDrag(null)}
              >
                ⠿
              </span>
              <span className="vbs-reg-class-chip-text">
                <WorkbookChipName name={name} login={member.username} />
                <TruncationTooltip className="vbs-reg-class-chip-login muted" text={member.username} force>
                  <span className="vbs-reg-class-chip-login-text">{member.username}</span>
                </TruncationTooltip>
              </span>
            </div>
          );
        })}
        {sorted.length === 0 ? <p className="muted vbs-reg-drop-empty">No members yet.</p> : null}
      </div>
    </aside>
  );
}

function dropHandlers(
  canWrite: boolean,
  dragActive: boolean,
  onDropPayload: (payload: WorkbookDragPayload) => void,
  setOver: (over: boolean) => void,
) {
  return {
    onDragOver: (e: DragEvent) => {
      if (!canWrite || !dragActive) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      if (!canWrite) {
        return;
      }
      const payload = readWorkbookDrag(e.dataTransfer);
      if (payload) {
        onDropPayload(payload);
      }
    },
  };
}

export function WorkbookAssignmentBox({
  value,
  canWrite,
  dragActive,
  rowIndex,
  area,
  field,
  onChange,
  onDropAssign,
  setDrag,
  label,
  slotLabel,
}: {
  value: string;
  canWrite: boolean;
  dragActive: boolean;
  rowIndex: number;
  area: WorkbookAssignmentArea;
  field: string;
  onChange: (next: string) => void;
  onDropAssign: (payload: WorkbookDragPayload, toLineIndex?: number) => void;
  setDrag: (drag: WorkbookDragPayload | null) => void;
  /** Tooltip / accessible name for the cell */
  label?: string;
  /** Visible heading inside the cell (e.g. Person 1 on Prayer) */
  slotLabel?: string;
}) {
  const [over, setOver] = useState(false);
  const [dropLineIndex, setDropLineIndex] = useState<number | null>(null);
  const lines = assignmentLines(value);
  const handlers = dropHandlers(
    canWrite,
    dragActive,
    (payload) => onDropAssign(payload),
    setOver,
  );

  function removeLine(index: number) {
    onChange(joinAssignmentLines(lines.filter((_, i) => i !== index)));
  }

  function chipDropHandlers(index: number) {
    return {
      onDragOver: (e: DragEvent) => {
        if (!canWrite || !dragActive) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setOver(false);
        setDropLineIndex(index);
      },
      onDragLeave: (e: DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) {
          return;
        }
        setDropLineIndex(null);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropLineIndex(null);
        setOver(false);
        if (!canWrite) {
          return;
        }
        const payload = readWorkbookDrag(e.dataTransfer);
        if (payload) {
          onDropAssign(payload, index);
        }
      },
    };
  }

  return (
    <div
      className={`vbs-workbook-assignment-box${over ? " is-drop-over" : ""}`}
      {...handlers}
      onDragLeave={() => {
        setOver(false);
        setDropLineIndex(null);
      }}
      aria-label={label}
      title={label}
    >
      {slotLabel ? <span className="vbs-workbook-slot-label">{slotLabel}</span> : null}
      {lines.length === 0 ? (
        <p className="muted vbs-workbook-drop-empty">{canWrite ? "Drop volunteers here" : "—"}</p>
      ) : (
        <ul className="vbs-workbook-assignment-chips">
          {lines.map((name, index) => (
            <li
              key={`${name}-${index}`}
              className={dropLineIndex === index ? "is-drop-target" : undefined}
              {...chipDropHandlers(index)}
            >
              <div className="vbs-reg-class-chip vbs-reg-class-chip-staff vbs-roster-chip vbs-workbook-assigned-chip">
                {canWrite ? (
                  <span
                    className="vbs-roster-chip-grip"
                    draggable
                    aria-label={`Drag ${name} to reorder, another role, or day`}
                    onDragStart={(e) => {
                      const payload: WorkbookDragPayload = {
                        source: "assignment",
                        area,
                        name,
                        rowIndex,
                        field,
                        lineIndex: index,
                      };
                      writeWorkbookDrag(e.dataTransfer, payload);
                      setDrag(payload);
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setDropLineIndex(null);
                    }}
                  >
                    ⠿
                  </span>
                ) : null}
                <WorkbookChipName name={name} />
                {canWrite ? (
                  <button
                    type="button"
                    className="ghost vbs-task-remove vbs-roster-chip-remove"
                    aria-label={`Remove ${name}`}
                    onClick={() => removeLine(index)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
