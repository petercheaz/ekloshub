import { FormEvent, useEffect, useMemo, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { orgPath } from "../orgs";
import { CollapsibleFormActions, CollapsibleFormPanel, CollapsibleFormTrigger } from "../CollapsibleForm";
import { expandableRowHeaderProps } from "../expandable-row";
import { api } from "../api";
import type {
  VbsRegistrationClass,
  VbsRegistrationStaffMember,
  VbsRegistrationStudent,
  VbsRegistrationWorkspace,
} from "../types";
import {
  formatRegistrationClassName,
  VBS_ROTATION_STATION_NAMES,
} from "@vbs-rotation-stations";
import {
  insertClassIdBefore,
  insertIdBefore,
  insertUsernameBefore,
  partitionStudentsByClass,
} from "../vbs-registration-class-roster";
import {
  classStudentStats,
  RosterColumnShell,
  RosterListTail,
  rosterDropKey,
  StaffPoolChip,
  StaffRosterChip,
  StudentRosterChip,
  studentAgeAtVbs,
  type RosterDrag,
  type RosterDropTarget,
  type StaffRole,
} from "../RegistrationClassRosterDnD";

function staffLabel(member: VbsRegistrationStaffMember) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
  return name || member.username;
}

function findStaffSlotForUsername(
  classes: VbsRegistrationClass[],
  username: string,
): { classId: string; role: "leader" | "teacher" | "helper" } | null {
  for (const c of classes) {
    if (c.leaders.includes(username)) {
      return { classId: c.id, role: "leader" };
    }
    if (c.teachers.includes(username)) {
      return { classId: c.id, role: "teacher" };
    }
    if (c.helpers.includes(username)) {
      return { classId: c.id, role: "helper" };
    }
  }
  return null;
}

type ClassDraft = {
  id: string;
  rotationIndex: number;
  sectionLabel: string;
  minAge: number;
  maxAge: number;
  capacityMax: number;
  registrationClosed: boolean;
};

function emptyClassDraft(): ClassDraft {
  return {
    id: "",
    rotationIndex: 0,
    sectionLabel: "",
    minAge: 4,
    maxAge: 7,
    capacityMax: 20,
    registrationClosed: false,
  };
}

function classDraftTitle(draft: ClassDraft) {
  return formatRegistrationClassName(draft.rotationIndex, draft.sectionLabel);
}

function classDraftFromClass(cls: VbsRegistrationClass): ClassDraft {
  return {
    id: cls.id,
    rotationIndex: cls.rotationIndex ?? 0,
    sectionLabel: cls.sectionLabel,
    minAge: cls.minAge,
    maxAge: cls.maxAge,
    capacityMax: cls.capacityMax,
    registrationClosed: cls.registrationClosed,
  };
}

function ClassEditorFields({
  draft,
  setDraft,
  busy,
}: {
  draft: ClassDraft;
  setDraft: (value: ClassDraft | ((current: ClassDraft) => ClassDraft)) => void;
  busy: boolean;
}) {
  return (
    <>
      <p className="muted vbs-reg-class-editor-lead">
        Title preview: <strong>{classDraftTitle(draft)}</strong>
      </p>
      <div className="vbs-plan-field-row">
        <label className="vbs-plan-field">
          Rotation station
          <select
            required
            disabled={busy}
            value={draft.rotationIndex}
            onChange={(e) => setDraft({ ...draft, rotationIndex: Number(e.target.value) })}
          >
            {VBS_ROTATION_STATION_NAMES.map((station, index) => (
              <option key={station} value={index}>
                {station}
              </option>
            ))}
          </select>
        </label>
        <label className="vbs-plan-field">
          Section (optional)
          <input
            disabled={busy}
            value={draft.sectionLabel}
            placeholder="I, II, A…"
            maxLength={16}
            onChange={(e) => setDraft({ ...draft, sectionLabel: e.target.value })}
          />
        </label>
      </div>
      <div className="vbs-plan-field-row">
        <label className="vbs-plan-field">
          Min age
          <input
            type="number"
            min={0}
            required
            disabled={busy}
            value={draft.minAge}
            onChange={(e) => setDraft({ ...draft, minAge: Number(e.target.value) })}
          />
        </label>
        <label className="vbs-plan-field">
          Max age
          <input
            type="number"
            min={0}
            required
            disabled={busy}
            value={draft.maxAge}
            onChange={(e) => setDraft({ ...draft, maxAge: Number(e.target.value) })}
          />
        </label>
        <label className="vbs-plan-field">
          Max students (0 = no limit)
          <input
            type="number"
            min={0}
            disabled={busy}
            value={draft.capacityMax}
            onChange={(e) => setDraft({ ...draft, capacityMax: Number(e.target.value) })}
          />
        </label>
      </div>
      <label className="vbs-registration-check">
        <input
          type="checkbox"
          disabled={busy}
          checked={draft.registrationClosed}
          onChange={(e) => setDraft({ ...draft, registrationClosed: e.target.checked })}
        />
        Closed to new online assignments
      </label>
    </>
  );
}

export function VbsRegistrationClassesBoard({
  orgId,
  data,
  vbsAgeOn,
  canWrite,
  onReload,
}: {
  orgId: string;
  data: VbsRegistrationWorkspace;
  vbsAgeOn: Date;
  canWrite: boolean;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [classDraft, setClassDraft] = useState<ClassDraft>(() => emptyClassDraft());
  const [showAddClassForm, setShowAddClassForm] = useState(false);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [drag, setDrag] = useState<RosterDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<RosterDropTarget | null>(null);
  const navigate = useNavigate();

  function openStudentDetail(studentId: string) {
    const params = new URLSearchParams();
    params.set("student", studentId);
    navigate(`${orgPath(orgId, "/registration")}?${params.toString()}`);
  }

  function openStaffDetail(username: string) {
    navigate(`${orgPath(orgId, "/manage")}?member=${encodeURIComponent(username)}`);
  }

  const staffMembers = data.staffMembers ?? [];
  const memberMap = useMemo(() => new Map(staffMembers.map((m) => [m.username, m])), [staffMembers]);

  const studentsByClass = useMemo(
    () => partitionStudentsByClass(data.students, data.classes),
    [data.students, data.classes],
  );

  const staffAssignmentByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    const push = (username: string, label: string) => {
      const list = map.get(username) ?? [];
      list.push(label);
      map.set(username, list);
    };
    for (const cls of data.classes) {
      for (const u of cls.leaders) {
        push(u, `Leader · ${cls.name}`);
      }
      for (const u of cls.teachers) {
        push(u, `Teacher · ${cls.name}`);
      }
      for (const u of cls.helpers) {
        push(u, `Helper · ${cls.name}`);
      }
    }
    return new Map([...map.entries()].map(([username, labels]) => [username, labels.join(" · ")]));
  }, [data.classes]);

  const sortedStaff = useMemo(
    () => [...staffMembers].sort((a, b) => staffLabel(a).localeCompare(staffLabel(b))),
    [staffMembers],
  );

  function clearDrag() {
    setDrag(null);
    setDropTarget(null);
  }

  const sortedClasses = useMemo(() => {
    return [...data.classes].sort((a, b) => {
      if ((a.boardOrder ?? 0) !== (b.boardOrder ?? 0)) {
        return (a.boardOrder ?? 0) - (b.boardOrder ?? 0);
      }
      const ai = a.rotationIndex ?? 99;
      const bi = b.rotationIndex ?? 99;
      if (ai !== bi) {
        return ai - bi;
      }
      if (a.minAge !== b.minAge) {
        return a.minAge - b.minAge;
      }
      return a.sectionLabel.localeCompare(b.sectionLabel, undefined, { numeric: true });
    });
  }, [data.classes]);

  function isDropOver(target: RosterDropTarget) {
    return dropTarget !== null && rosterDropKey(dropTarget) === rosterDropKey(target);
  }

  function dragOverTarget(target: RosterDropTarget) {
    return (e: DragEvent) => {
      if (!canWrite || !drag) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDropTarget(target);
    };
  }

  function dropOnTarget(target: RosterDropTarget) {
    return (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!canWrite || !drag) {
        return;
      }
      void applyDrop(target);
    };
  }

  async function applyDrop(target: RosterDropTarget) {
    if (!drag || !canWrite) {
      clearDrag();
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      if (drag.kind === "student" && target.kind === "student") {
        if (target.classId === null) {
          if (drag.fromClassId) {
            await api.removeVbsRegistrationClassStudent(orgId, drag.fromClassId, drag.studentId);
          } else {
            const pool = studentsByClass.pool;
            const studentIds = insertIdBefore(pool, drag.studentId, target.beforeStudentId);
            await api.reorderVbsRegistrationClassStudents(orgId, null, studentIds);
          }
        } else {
          let roster = [...(studentsByClass.map.get(target.classId) ?? [])];
          const student = data.students.find((s) => s.id === drag.studentId);
          if (student && !roster.some((s) => s.id === student.id)) {
            roster = [...roster, student];
          }
          const studentIds = insertIdBefore(roster, drag.studentId, target.beforeStudentId);
          await api.reorderVbsRegistrationClassStudents(orgId, target.classId, studentIds);
        }
      } else if (drag.kind === "staff" && target.kind === "staff") {
        const cls = data.classes.find((c) => c.id === target.classId);
        const roleList =
          target.role === "leader" ? cls?.leaders ?? [] : target.role === "helper" ? cls?.helpers ?? [] : cls?.teachers ?? [];
        const merged =
          drag.fromClassId === target.classId && drag.role === target.role
            ? roleList
            : [...roleList.filter((u) => u !== drag.username), drag.username];
        const usernames = insertUsernameBefore(merged, drag.username, target.beforeUsername);
        await api.assignVbsRegistrationClassStaff(orgId, target.classId, {
          username: drag.username,
          role: target.role,
        });
        await api.reorderVbsRegistrationClassStaff(orgId, target.classId, target.role, usernames);
      } else if (drag.kind === "staff" && target.kind === "staff-pool") {
        if (drag.fromClassId) {
          await api.removeVbsRegistrationClassStaff(orgId, drag.fromClassId, drag.username);
        }
      } else if (drag.kind === "class" && target.kind === "class") {
        const classIds = insertClassIdBefore(
          sortedClasses.map((c) => c.id),
          drag.classId,
          target.beforeClassId,
        );
        await api.reorderVbsRegistrationClasses(orgId, classIds);
      }
      await onReload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not update roster");
    } finally {
      setBusy(false);
      clearDrag();
    }
  }

  async function removeStudentFromClass(studentId: string, fromClassId: string) {
    if (!canWrite) {
      return;
    }
    setBusy(true);
    try {
      await api.removeVbsRegistrationClassStudent(orgId, fromClassId, studentId);
      await onReload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not remove student");
    } finally {
      setBusy(false);
    }
  }

  async function removeStaffFromClass(classId: string, username: string) {
    if (!canWrite) {
      return;
    }
    setBusy(true);
    try {
      await api.removeVbsRegistrationClassStaff(orgId, classId, username);
      await onReload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not remove staff");
    } finally {
      setBusy(false);
    }
  }

  function closeAddClassForm() {
    setClassDraft(emptyClassDraft());
    setShowAddClassForm(false);
  }

  function openAddClassForm() {
    setExpandedClassId(null);
    setClassDraft(emptyClassDraft());
    setShowAddClassForm(true);
  }

  function toggleClassExpand(classId: string) {
    setShowAddClassForm(false);
    setExpandedClassId((current) => (current === classId ? null : classId));
  }

  async function saveClassDraft(draft: ClassDraft, event?: FormEvent) {
    event?.preventDefault();
    if (!canWrite) {
      return;
    }
    const wasEdit = Boolean(draft.id);
    setBusy(true);
    setStatus("");
    try {
      await api.saveVbsRegistrationClass(orgId, { ...draft });
      if (wasEdit) {
        setExpandedClassId(null);
      } else {
        closeAddClassForm();
      }
      await onReload();
      setStatus(wasEdit ? "Class updated." : "Class added.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save class");
    } finally {
      setBusy(false);
    }
  }

  async function removeClass(classId: string, name: string) {
    if (!canWrite || !window.confirm(`Remove class “${name}”? Students will become unassigned.`)) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteVbsRegistrationClass(orgId, classId);
      setExpandedClassId((current) => (current === classId ? null : current));
      await onReload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not delete class");
    } finally {
      setBusy(false);
    }
  }

  function capacityLabel(cls: VbsRegistrationClass) {
    if (cls.capacityMax <= 0) {
      return `${cls.enrolledCount} enrolled`;
    }
    return `${cls.enrolledCount} / ${cls.capacityMax}`;
  }

  async function assignStudentsByAge() {
    if (!canWrite || data.students.length === 0 || data.classes.length === 0) {
      return;
    }
    if (
      !window.confirm(
        "Place each student on every station class that matches their VBS age? Students will be removed from classes outside that age range.",
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const result = await api.autoAssignVbsRegistrationStudentsByAge(orgId);
      await onReload();
      if (result.unplaced.length === 0) {
        setStatus(
          `Set ${result.placedStudents} student${result.placedStudents === 1 ? "" : "s"} on age-matching station classes.`,
        );
      } else {
        const names = result.unplaced.map((u) => `${u.name} (age ${u.age})`).join(", ");
        setStatus(
          `Placed ${result.placedStudents} student${result.placedStudents === 1 ? "" : "s"} by age. No matching class for: ${names}.`,
        );
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not assign students by age");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vbs-reg-classes">
      <p className="muted vbs-reg-classes-payment-note">{data.paymentNote}</p>
      <p className="muted vbs-reg-classes-drag-hint">
        <strong>Students</strong> (registered children from the Students tab) go on the left — drag them into a station
        class row. <strong>Volunteers & staff</strong> (church logins from Members & invites, not children) go on the
        right — drag onto a role column or <strong>drop on another person</strong> to swap order. Use{" "}
        <span aria-hidden="true">×</span> to remove from a class, or drag back to the staff pool. Drag class rows by the
        handle to reorder stations on the board.
      </p>

      {canWrite ? (
        <div className="vbs-registration-form-head">
          <h2 className="vbs-plan-section-title">Classes</h2>
          <div className="vbs-reg-classes-head-actions">
            <button
              type="button"
              className="vbs-plan-save vbs-collapsible-form-trigger"
              disabled={busy || data.students.length === 0 || data.classes.length === 0}
              onClick={() => void assignStudentsByAge()}
            >
              Set Students According To Age
            </button>
            <CollapsibleFormTrigger
              label="Add class"
              disabled={busy || showAddClassForm}
              ariaExpanded={showAddClassForm}
              onClick={openAddClassForm}
            />
          </div>
        </div>
      ) : null}

      {canWrite ? (
        <p className="muted vbs-reg-classes-row-hint">Click a class row to edit station, ages, and capacity.</p>
      ) : null}

      {showAddClassForm && canWrite ? (
        <CollapsibleFormPanel title="Add class" className="vbs-reg-class-editor">
          <form className="vbs-collapsible-form" onSubmit={(e) => void saveClassDraft(classDraft, e)}>
            <ClassEditorFields draft={classDraft} setDraft={setClassDraft} busy={busy} />
            <CollapsibleFormActions onCancel={closeAddClassForm} saveLabel="Save" busy={busy} />
          </form>
        </CollapsibleFormPanel>
      ) : null}

      <div className="vbs-reg-classes-layout vbs-reg-classes-layout-rows">
        <aside className="vbs-reg-side-pool vbs-reg-student-pool">
          <header className="vbs-reg-side-pool-head">
            <h3>Students</h3>
            <span className="muted">{data.students.length} registered</span>
          </header>
          <p className="muted vbs-reg-side-pool-note">
            Every student stays here for rotation — drag onto each station class as needed. Add or edit
            registrations on the Students tab.
          </p>
          <div className="vbs-roster-sortable-list vbs-reg-drop-zone">
            {studentsByClass.pool.map((student) => (
              <StudentRosterChip
                key={student.id}
                student={student}
                ageYears={studentAgeAtVbs(student, vbsAgeOn)}
                canWrite={canWrite && !busy}
                dropActive={drag?.kind === "student"}
                dropOver={isDropOver({ kind: "student", classId: null, beforeStudentId: student.id })}
                onDragStart={() =>
                  setDrag({ kind: "student", studentId: student.id, fromClassId: null })
                }
                onDragOverBefore={dragOverTarget({ kind: "student", classId: null, beforeStudentId: student.id })}
                onDropBefore={dropOnTarget({ kind: "student", classId: null, beforeStudentId: student.id })}
                onOpenDetail={() => openStudentDetail(student.id)}
              />
            ))}
            <RosterListTail
              canWrite={canWrite && !busy}
              dropActive={drag?.kind === "student"}
              dropOver={isDropOver({ kind: "student", classId: null, beforeStudentId: null })}
              onDragOver={dragOverTarget({ kind: "student", classId: null, beforeStudentId: null })}
              onDrop={dropOnTarget({ kind: "student", classId: null, beforeStudentId: null })}
              label={
                data.students.length === 0
                  ? "Drop students here"
                  : "Drop from a class to remove that station only · reorder list"
              }
            />
            {data.students.length === 0 && !canWrite ? (
              <p className="muted vbs-reg-drop-empty">No students registered yet.</p>
            ) : null}
          </div>
        </aside>

        <div className="vbs-reg-class-rows">
          {data.classes.length === 0 ? (
            <p className="muted">No classes yet. Click Add class to match your VBS rotation stations.</p>
          ) : null}
          {sortedClasses.map((cls) => (
            <ClassRow
              key={cls.id}
              cls={cls}
              students={studentsByClass.map.get(cls.id) ?? []}
              memberMap={memberMap}
              vbsAgeOn={vbsAgeOn}
              canWrite={canWrite && !busy}
              busy={busy}
              expanded={expandedClassId === cls.id}
              classDrag={drag}
              dropTarget={dropTarget}
              onToggleExpand={() => toggleClassExpand(cls.id)}
              onSave={(draft) => saveClassDraft(draft)}
              onRemove={() => void removeClass(cls.id, cls.name)}
              capacityLabel={capacityLabel(cls)}
              onClassDragStart={() => setDrag({ kind: "class", classId: cls.id })}
              onClassDragOverBefore={dropOnTarget}
              onClassDragOver={dragOverTarget}
              onRemoveStudent={(studentId) => void removeStudentFromClass(studentId, cls.id)}
              onRemoveStaff={(username) => void removeStaffFromClass(cls.id, username)}
              onStaffDragStart={(username, role) =>
                setDrag({ kind: "staff", username, fromClassId: cls.id, role })
              }
              onStudentDragStart={(studentId) =>
                setDrag({ kind: "student", studentId, fromClassId: cls.id })
              }
              onOpenStudent={openStudentDetail}
              onOpenStaff={openStaffDetail}
            />
          ))}
        </div>

        <aside className="vbs-reg-side-pool vbs-reg-account-pool">
          <header className="vbs-reg-side-pool-head">
            <h3>Volunteers & staff</h3>
            <span className="muted">{sortedStaff.length}</span>
          </header>
          <p className="muted vbs-reg-side-pool-note">
            Org members with logins (Manage org → Members & invites). Pending invites are not listed until they accept.
          </p>
          <div
            className={`vbs-roster-sortable-list vbs-reg-drop-zone${drag?.kind === "staff" ? " is-active" : ""}${isDropOver({ kind: "staff-pool" }) ? " is-over" : ""}`}
            onDragOver={drag?.kind === "staff" ? dragOverTarget({ kind: "staff-pool" }) : undefined}
            onDrop={drag?.kind === "staff" ? dropOnTarget({ kind: "staff-pool" }) : undefined}
          >
            {sortedStaff.map((member) => {
              const assignment = staffAssignmentByUser.get(member.username);
              const name = staffLabel(member);
              return (
                <div key={member.username} className="vbs-reg-account-pool-item">
                  <StaffPoolChip
                    member={member}
                    name={name}
                    canWrite={canWrite && !busy}
                    onDragStart={() =>
                      setDrag({
                        kind: "staff",
                        username: member.username,
                        fromClassId: null,
                        role: "teacher",
                      })
                    }
                    onOpenDetail={() => openStaffDetail(member.username)}
                  />
                  {assignment ? <span className="muted vbs-reg-account-assignment">{assignment}</span> : null}
                </div>
              );
            })}
            {sortedStaff.length === 0 ? (
              <p className="muted vbs-reg-drop-empty">
                No staff logins yet — invite volunteers under Manage org → Members & invites.
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {status ? <p className="tagline">{status}</p> : null}
    </div>
  );
}

function ClassRow({
  cls,
  students,
  memberMap,
  vbsAgeOn,
  canWrite,
  busy,
  expanded,
  classDrag,
  dropTarget,
  onToggleExpand,
  onSave,
  onRemove,
  capacityLabel,
  onClassDragStart,
  onClassDragOverBefore,
  onClassDragOver,
  onRemoveStudent,
  onRemoveStaff,
  onStaffDragStart,
  onStudentDragStart,
  onOpenStudent,
  onOpenStaff,
}: {
  cls: VbsRegistrationClass;
  students: VbsRegistrationStudent[];
  memberMap: Map<string, VbsRegistrationStaffMember>;
  vbsAgeOn: Date;
  canWrite: boolean;
  busy: boolean;
  expanded: boolean;
  classDrag: RosterDrag | null;
  dropTarget: RosterDropTarget | null;
  onToggleExpand: () => void;
  onSave: (draft: ClassDraft) => Promise<void>;
  onRemove: () => void;
  capacityLabel: string;
  onClassDragStart: () => void;
  onClassDragOverBefore: (target: RosterDropTarget) => (e: DragEvent) => void;
  onClassDragOver: (target: RosterDropTarget) => (e: DragEvent) => void;
  onRemoveStudent: (studentId: string) => void;
  onRemoveStaff: (username: string) => void;
  onStaffDragStart: (username: string, role: StaffRole) => void;
  onStudentDragStart: (studentId: string) => void;
  onOpenStudent: (studentId: string) => void;
  onOpenStaff: (username: string) => void;
}) {
  const [draft, setDraft] = useState(() => classDraftFromClass(cls));

  useEffect(() => {
    setDraft(classDraftFromClass(cls));
  }, [cls]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) {
      return;
    }
    await onSave(draft);
  }
  const nearFull =
    cls.capacityMax > 0 && cls.enrolledCount >= Math.ceil(cls.capacityMax * 0.85) && cls.enrolledCount < cls.capacityMax;
  const full = cls.capacityMax > 0 && cls.enrolledCount >= cls.capacityMax;

  function staffName(username: string) {
    const member = memberMap.get(username);
    return member ? staffLabel(member) : username;
  }

  function staffLogin(username: string) {
    return memberMap.get(username)?.username ?? username;
  }

  const isDropOver = (target: RosterDropTarget) =>
    dropTarget !== null && rosterDropKey(dropTarget) === rosterDropKey(target);

  const stats = classStudentStats(students, (s) => studentAgeAtVbs(s, vbsAgeOn));
  const studentMeta =
    stats.total === 0
      ? ""
      : `${stats.boys}M · ${stats.girls}F${stats.ageSpan ? ` · ${stats.ageSpan}` : ""}`;

  const staffZone = (role: StaffRole, title: string, usernames: string[]) => (
    <RosterColumnShell title={title} meta={usernames.length ? `${usernames.length} assigned` : undefined}>
      {usernames.map((username) => (
        <StaffRosterChip
          key={username}
          label={staffName(username)}
          login={staffLogin(username)}
          role={role}
          canWrite={canWrite}
          dropActive={classDrag?.kind === "staff"}
          dropOver={isDropOver({ kind: "staff", classId: cls.id, role, beforeUsername: username })}
          onDragStart={() => onStaffDragStart(username, role)}
          onDragOverBefore={onClassDragOver({ kind: "staff", classId: cls.id, role, beforeUsername: username })}
          onDropBefore={onClassDragOverBefore({ kind: "staff", classId: cls.id, role, beforeUsername: username })}
          onRemove={() => onRemoveStaff(username)}
          onOpenDetail={() => onOpenStaff(username)}
        />
      ))}
      <RosterListTail
        canWrite={canWrite}
        dropActive={classDrag?.kind === "staff"}
        dropOver={isDropOver({ kind: "staff", classId: cls.id, role, beforeUsername: null })}
        onDragOver={onClassDragOver({ kind: "staff", classId: cls.id, role, beforeUsername: null })}
        onDrop={onClassDragOverBefore({ kind: "staff", classId: cls.id, role, beforeUsername: null })}
        label={usernames.length === 0 ? "Drop volunteers here" : "Drop to place last"}
      />
    </RosterColumnShell>
  );

  const headerProps = canWrite
    ? expandableRowHeaderProps(
        expanded,
        onToggleExpand,
        `vbs-reg-class-row-head${expanded ? " open" : ""}`,
        `${cls.name}, class summary`,
      )
    : { className: "vbs-reg-class-row-head" };

  const classDropOver = isDropOver({ kind: "class", beforeClassId: cls.id });

  return (
    <div
      className={`vbs-reg-class-row-wrap${classDropOver ? " is-class-drop-over" : ""}`}
      onDragOver={
        classDrag?.kind === "class"
          ? onClassDragOver({ kind: "class", beforeClassId: cls.id })
          : undefined
      }
      onDrop={
        classDrag?.kind === "class"
          ? onClassDragOverBefore({ kind: "class", beforeClassId: cls.id })
          : undefined
      }
    >
      {canWrite ? (
        <button
          type="button"
          className="vbs-roster-class-grip"
          draggable
          aria-label={`Drag to reorder ${cls.name}`}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            onClassDragStart();
          }}
        >
          ⠿
        </button>
      ) : null}
      <section
        className={`vbs-reg-class-row${cls.registrationClosed ? " is-closed" : ""}${full ? " is-full" : ""}${expanded ? " is-expanded" : ""}`}
      >
      <header {...headerProps}>
        <div className="vbs-reg-class-row-head-main">
          {canWrite ? (
            <span className="vbs-registration-roster-chevron" aria-hidden="true">
              {expanded ? "▾" : "▸"}
            </span>
          ) : null}
          <div>
            <h3>{cls.name}</h3>
            <p className="muted vbs-reg-class-meta">
              Ages {cls.minAge}–{cls.maxAge} · {capacityLabel}
              {stats.total > 0 ? ` · ${stats.total} students (${studentMeta})` : null}
              {cls.registrationClosed ? " · Closed" : null}
              {nearFull ? " · Almost full" : null}
            </p>
          </div>
        </div>
        {canWrite ? (
          <button
            type="button"
            className="ghost vbs-task-remove vbs-registration-row-remove"
            data-no-row-toggle
            disabled={busy}
            aria-label={`Remove class ${cls.name}`}
            onClick={onRemove}
          >
            ×
          </button>
        ) : null}
      </header>

      {expanded && canWrite ? (
        <form className="vbs-reg-class-row-editor vbs-collapsible-form" onSubmit={(e) => void handleSave(e)}>
          <ClassEditorFields draft={draft} setDraft={setDraft} busy={busy} />
          <CollapsibleFormActions
            onCancel={onToggleExpand}
            saveLabel="Save"
            busy={busy}
          />
        </form>
      ) : null}

      <div className="vbs-reg-class-row-body">
        <div className="vbs-reg-class-row-grid vbs-reg-class-row-staff">
          {staffZone("leader", "Leaders", cls.leaders)}
          {staffZone("teacher", "Teachers", cls.teachers)}
          {staffZone("helper", "Helpers", cls.helpers)}
        </div>
        <div className="vbs-reg-class-row-students">
        <RosterColumnShell title={`Students (${students.length})`} meta={studentMeta || undefined}>
          {students.map((student) => (
            <StudentRosterChip
              key={student.id}
              student={student}
              ageYears={studentAgeAtVbs(student, vbsAgeOn)}
              canWrite={canWrite}
              dropActive={classDrag?.kind === "student"}
              dropOver={isDropOver({ kind: "student", classId: cls.id, beforeStudentId: student.id })}
              onDragStart={() => onStudentDragStart(student.id)}
              onDragOverBefore={onClassDragOver({
                kind: "student",
                classId: cls.id,
                beforeStudentId: student.id,
              })}
              onDropBefore={onClassDragOverBefore({
                kind: "student",
                classId: cls.id,
                beforeStudentId: student.id,
              })}
              onRemove={() => onRemoveStudent(student.id)}
              onOpenDetail={() => onOpenStudent(student.id)}
            />
          ))}
          <RosterListTail
            canWrite={canWrite}
            dropActive={classDrag?.kind === "student"}
            dropOver={isDropOver({ kind: "student", classId: cls.id, beforeStudentId: null })}
            onDragOver={onClassDragOver({ kind: "student", classId: cls.id, beforeStudentId: null })}
            onDrop={onClassDragOverBefore({ kind: "student", classId: cls.id, beforeStudentId: null })}
            label={students.length === 0 ? "Drop students here" : "Drop to place last"}
          />
        </RosterColumnShell>
        </div>
      </div>
    </section>
    </div>
  );
}
