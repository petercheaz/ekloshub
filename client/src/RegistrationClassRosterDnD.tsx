import type { DragEvent, ReactNode } from "react";
import { StudentName } from "./StudentName";
import { TruncationTooltip } from "./TruncationTooltip";
import type { VbsRegistrationStaffMember, VbsRegistrationStudent } from "./types";
import { ageFromBirthMonthYear } from "./vbs-registration-utils";

export type StaffRole = "leader" | "teacher" | "helper";

export type RosterDrag =
  | { kind: "student"; studentId: string; fromClassId: string | null }
  | { kind: "staff"; username: string; fromClassId: string | null; role: StaffRole }
  | { kind: "class"; classId: string };

export type RosterDropTarget =
  | { kind: "student"; classId: string | null; beforeStudentId: string | null }
  | { kind: "staff"; classId: string; role: StaffRole; beforeUsername: string | null }
  | { kind: "class"; beforeClassId: string | null }
  | { kind: "staff-pool" };

export function rosterDropKey(target: RosterDropTarget) {
  return JSON.stringify(target);
}

function genderBadge(gender: string) {
  if (gender === "M") {
    return (
      <span className="vbs-roster-badge vbs-roster-badge-gender is-male" title="Boy">
        M
      </span>
    );
  }
  if (gender === "F") {
    return (
      <span className="vbs-roster-badge vbs-roster-badge-gender is-female" title="Girl">
        F
      </span>
    );
  }
  return (
    <span className="vbs-roster-badge vbs-roster-badge-gender is-unknown" title="Gender not set">
      —
    </span>
  );
}

export function StudentRosterChip({
  student,
  ageYears,
  canWrite,
  compact,
  dropActive,
  dropOver,
  onDragStart,
  onDragOverBefore,
  onDropBefore,
  onRemove,
  onOpenDetail,
}: {
  student: VbsRegistrationStudent;
  ageYears: number;
  canWrite: boolean;
  compact?: boolean;
  dropActive: boolean;
  dropOver: boolean;
  onDragStart: () => void;
  onDragOverBefore: (e: DragEvent) => void;
  onDropBefore: (e: DragEvent) => void;
  onRemove?: () => void;
  onOpenDetail?: () => void;
}) {
  return (
    <div
      className={`vbs-reg-class-chip vbs-reg-class-chip-student vbs-roster-chip${dropOver ? " is-drop-over" : ""}${dropActive ? " is-drop-active" : ""}`}
      onDragOver={onDragOverBefore}
      onDrop={onDropBefore}
    >
      <span
        className="vbs-roster-chip-grip"
        aria-hidden={!canWrite}
        aria-label={canWrite ? "Drag to move student" : undefined}
        draggable={canWrite}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
      >
        ⠿
      </span>
      <span className="vbs-roster-badge vbs-roster-badge-age">{ageYears}</span>
      {genderBadge(student.childGender)}
      <button
        type="button"
        className="vbs-roster-chip-open"
        onClick={() => onOpenDetail?.()}
        disabled={!onOpenDetail}
      >
        <TruncationTooltip
          className="vbs-reg-class-chip-name"
          text={`${student.childFullName}${student.childGender === "M" ? " · boy" : student.childGender === "F" ? " · girl" : ""} · age ${ageYears}`}
          force={Boolean(compact)}
        >
          <StudentName student={student} compact={compact} showGender={false} />
        </TruncationTooltip>
      </button>
      {canWrite && onRemove ? (
        <button
          type="button"
          className="ghost vbs-task-remove vbs-roster-chip-remove"
          aria-label={`Remove ${student.childFullName} from class`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function StaffRosterChip({
  label,
  login,
  role,
  canWrite,
  dropActive,
  dropOver,
  onDragStart,
  onDragOverBefore,
  onDropBefore,
  onRemove,
  onOpenDetail,
}: {
  label: string;
  login: string;
  role: StaffRole;
  canWrite: boolean;
  dropActive: boolean;
  dropOver: boolean;
  onDragStart: () => void;
  onDragOverBefore: (e: DragEvent) => void;
  onDropBefore: (e: DragEvent) => void;
  onRemove?: () => void;
  onOpenDetail?: () => void;
}) {
  const roleLetter = role === "leader" ? "L" : role === "helper" ? "H" : "T";
  return (
    <div
      className={`vbs-reg-class-chip vbs-reg-class-chip-staff vbs-reg-class-chip-${role} vbs-roster-chip${dropOver ? " is-drop-over" : ""}${dropActive ? " is-drop-active" : ""}`}
      onDragOver={onDragOverBefore}
      onDrop={onDropBefore}
    >
      <span
        className="vbs-roster-chip-grip"
        aria-hidden={!canWrite}
        draggable={canWrite}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
      >
        ⠿
      </span>
      <span className="vbs-reg-class-chip-role">{roleLetter}</span>
      <button
        type="button"
        className="vbs-roster-chip-open"
        onClick={() => onOpenDetail?.()}
        disabled={!onOpenDetail}
      >
        <TruncationTooltip className="vbs-reg-class-chip-text" text={`${label} (${login}) — ${role}`} force>
          <span className="vbs-reg-class-chip-name">{label}</span>
          <span className="vbs-reg-class-chip-login muted">{login}</span>
        </TruncationTooltip>
      </button>
      {canWrite && onRemove ? (
        <button
          type="button"
          className="ghost vbs-task-remove vbs-roster-chip-remove"
          aria-label={`Remove ${label} from class`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function StaffPoolChip({
  member,
  name,
  canWrite,
  onDragStart,
  onOpenDetail,
}: {
  member: VbsRegistrationStaffMember;
  name: string;
  canWrite: boolean;
  onDragStart: () => void;
  onOpenDetail?: () => void;
}) {
  return (
    <div className="vbs-reg-class-chip vbs-reg-class-chip-staff vbs-reg-class-chip-account vbs-roster-chip">
      <span
        className="vbs-roster-chip-grip"
        aria-hidden={!canWrite}
        draggable={canWrite}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
      >
        ⠿
      </span>
      <button
        type="button"
        className="vbs-roster-chip-open"
        onClick={() => onOpenDetail?.()}
        disabled={!onOpenDetail}
      >
        <TruncationTooltip className="vbs-reg-class-chip-text" text={`${name} (${member.username})`} force>
          <span className="vbs-reg-class-chip-name">{name}</span>
          <span className="vbs-reg-class-chip-login muted">{member.username}</span>
        </TruncationTooltip>
      </button>
    </div>
  );
}

export function RosterListTail({
  canWrite,
  dropActive,
  dropOver,
  onDragOver,
  onDrop,
  label,
}: {
  canWrite: boolean;
  dropActive: boolean;
  dropOver: boolean;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  label: string;
}) {
  if (!canWrite) {
    return null;
  }
  return (
    <div
      className={`vbs-roster-list-tail${dropOver ? " is-drop-over" : ""}${dropActive ? " is-drop-active" : ""}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {label}
    </div>
  );
}

export function classStudentStats(students: VbsRegistrationStudent[], ageYears: (s: VbsRegistrationStudent) => number) {
  let boys = 0;
  let girls = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const s of students) {
    if (s.childGender === "M") {
      boys += 1;
    } else if (s.childGender === "F") {
      girls += 1;
    }
    const age = ageYears(s);
    min = Math.min(min, age);
    max = Math.max(max, age);
  }
  const ageSpan =
    students.length === 0 ? "" : min === max ? `ages ${min}` : `ages ${min}–${max}`;
  return { boys, girls, ageSpan, total: students.length };
}

export function studentAgeAtVbs(student: VbsRegistrationStudent, vbsAgeOn: Date) {
  return ageFromBirthMonthYear(student.birthMonth, student.birthYear, vbsAgeOn);
}

export function RosterColumnShell({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="vbs-reg-class-row-cell">
      <div className="vbs-roster-column-head">
        <h4>{title}</h4>
        {meta ? <span className="muted vbs-roster-column-meta">{meta}</span> : null}
      </div>
      <div className="vbs-roster-sortable-list">{children}</div>
    </div>
  );
}
