import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type {
  OrgMember,
  VbsRegistrationClass,
  VbsRegistrationStudent,
  VbsRegistrationWorkspace,
} from "../types";

type StaffDrag = {
  kind: "staff";
  username: string;
  fromClassId: string | null;
  role: "leader" | "teacher" | "helper";
};
type StudentDrag = { kind: "student"; studentId: string; fromClassId: string | null };

function memberLabel(member: OrgMember) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
  return name || member.username;
}

function tshirtShort(size: string) {
  if (!size.trim()) {
    return "—";
  }
  return size.replace(/^Youth /, "Y").replace(/^Adult /, "A");
}

function StudentChip({
  student,
  canWrite,
  onDragStart,
}: {
  student: VbsRegistrationStudent;
  canWrite: boolean;
  onDragStart: () => void;
}) {
  const first = student.childFullName.trim().split(/\s+/)[0] ?? student.childFullName;
  return (
    <div
      className="vbs-reg-class-chip vbs-reg-class-chip-student"
      draggable={canWrite}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      title={`${student.childFullName}${student.source === "public" ? " · Parent online" : ""}`}
    >
      <span className="vbs-reg-class-chip-name">{first}</span>
      <span className="vbs-reg-class-chip-icons" aria-hidden>
        {student.source === "public" ? (
          <span className="vbs-reg-class-icon vbs-reg-class-icon-parent" title="Parent online">
            P
          </span>
        ) : null}
        {student.paymentStatus === "pending" ? (
          <span className="vbs-reg-class-icon vbs-reg-class-icon-pay-pending" title="Payment pending">
            $
          </span>
        ) : student.paymentStatus === "paid" ? (
          <span className="vbs-reg-class-icon vbs-reg-class-icon-pay-paid" title="Paid">
            ✓
          </span>
        ) : (
          <span className="vbs-reg-class-icon vbs-reg-class-icon-pay-waived" title="Waived">
            W
          </span>
        )}
        <span className="vbs-reg-class-icon vbs-reg-class-icon-shirt" title={student.tshirtSize || "No shirt size"}>
          {tshirtShort(student.tshirtSize)}
        </span>
      </span>
    </div>
  );
}

function StaffChip({
  username,
  label,
  role,
  canWrite,
  fromClassId,
  onDragStart,
}: {
  username: string;
  label: string;
  role: "leader" | "teacher" | "helper";
  canWrite: boolean;
  fromClassId: string | null;
  onDragStart: () => void;
}) {
  const roleLetter = role === "leader" ? "L" : role === "helper" ? "H" : "T";
  return (
    <div
      className={`vbs-reg-class-chip vbs-reg-class-chip-staff vbs-reg-class-chip-${role}`}
      draggable={canWrite}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      title={`${label} (${role})`}
    >
      <span className="vbs-reg-class-chip-name">{label}</span>
      <span className="vbs-reg-class-chip-role">{roleLetter}</span>
    </div>
  );
}

type ClassDraft = {
  id: string;
  name: string;
  minAge: number;
  maxAge: number;
  capacityMax: number;
  registrationClosed: boolean;
};

function emptyClassDraft(): ClassDraft {
  return { id: "", name: "", minAge: 4, maxAge: 11, capacityMax: 20, registrationClosed: false };
}

export function VbsRegistrationClassesBoard({
  orgId,
  data,
  canWrite,
  onReload,
}: {
  orgId: string;
  data: VbsRegistrationWorkspace;
  canWrite: boolean;
  onReload: () => Promise<void>;
}) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [classDraft, setClassDraft] = useState<ClassDraft>(() => emptyClassDraft());
  const [dragStudent, setDragStudent] = useState<StudentDrag | null>(null);
  const [dragStaff, setDragStaff] = useState<StaffDrag | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .organization(orgId)
      .then((detail) => {
        if (!cancelled) {
          setMembers(detail.members);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMembers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.username, m])), [members]);

  const studentsByClass = useMemo(() => {
    const map = new Map<string, VbsRegistrationStudent[]>();
    const unassigned: VbsRegistrationStudent[] = [];
    for (const student of data.students) {
      if (!student.classId) {
        unassigned.push(student);
        continue;
      }
      const list = map.get(student.classId) ?? [];
      list.push(student);
      map.set(student.classId, list);
    }
    return { map, unassigned };
  }, [data.students]);

  const assignedStaffUsernames = useMemo(() => {
    const set = new Set<string>();
    for (const cls of data.classes) {
      for (const u of cls.leaders) {
        set.add(u);
      }
      for (const u of cls.teachers) {
        set.add(u);
      }
      for (const u of cls.helpers) {
        set.add(u);
      }
    }
    return set;
  }, [data.classes]);

  const staffPool = useMemo(
    () => members.filter((m) => !assignedStaffUsernames.has(m.username)),
    [members, assignedStaffUsernames],
  );

  async function dropStudent(targetClassId: string | null) {
    if (!dragStudent || !canWrite) {
      return;
    }
    if (dragStudent.fromClassId === targetClassId) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await api.assignVbsRegistrationStudentClass(orgId, dragStudent.studentId, targetClassId);
      await onReload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not move student");
    } finally {
      setBusy(false);
      setDragStudent(null);
    }
  }

  async function dropStaff(targetClassId: string, role: "leader" | "teacher" | "helper") {
    if (!dragStaff || !canWrite) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      if (dragStaff.fromClassId && dragStaff.fromClassId !== targetClassId) {
        await api.removeVbsRegistrationClassStaff(orgId, dragStaff.fromClassId, dragStaff.username);
      } else if (dragStaff.fromClassId === targetClassId && dragStaff.role === role) {
        setBusy(false);
        setDragStaff(null);
        return;
      }
      await api.assignVbsRegistrationClassStaff(orgId, targetClassId, { username: dragStaff.username, role });
      await onReload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not assign staff");
    } finally {
      setBusy(false);
      setDragStaff(null);
    }
  }

  async function saveClass(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await api.saveVbsRegistrationClass(orgId, { ...classDraft });
      setClassDraft(emptyClassDraft());
      await onReload();
      setStatus(classDraft.id ? "Class updated." : "Class added.");
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
      await onReload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not delete class");
    } finally {
      setBusy(false);
    }
  }

  function editClass(cls: VbsRegistrationClass) {
    setClassDraft({
      id: cls.id,
      name: cls.name,
      minAge: cls.minAge,
      maxAge: cls.maxAge,
      capacityMax: cls.capacityMax,
      registrationClosed: cls.registrationClosed,
    });
  }

  function capacityLabel(cls: VbsRegistrationClass) {
    if (cls.capacityMax <= 0) {
      return `${cls.enrolledCount} enrolled`;
    }
    return `${cls.enrolledCount} / ${cls.capacityMax}`;
  }

  return (
    <div className="vbs-reg-classes">
      <p className="muted vbs-reg-classes-payment-note">{data.paymentNote}</p>

      {canWrite ? (
        <form className="vbs-panel vbs-reg-class-editor" onSubmit={(e) => void saveClass(e)}>
          <h3 className="vbs-plan-section-title">{classDraft.id ? "Edit class" : "Add class"}</h3>
          <div className="vbs-plan-field-row">
            <label className="vbs-plan-field">
              Class name
              <input
                required
                disabled={busy}
                value={classDraft.name}
                onChange={(e) => setClassDraft({ ...classDraft, name: e.target.value })}
              />
            </label>
            <label className="vbs-plan-field">
              Min age
              <input
                type="number"
                min={0}
                disabled={busy}
                value={classDraft.minAge}
                onChange={(e) => setClassDraft({ ...classDraft, minAge: Number(e.target.value) })}
              />
            </label>
            <label className="vbs-plan-field">
              Max age
              <input
                type="number"
                min={0}
                disabled={busy}
                value={classDraft.maxAge}
                onChange={(e) => setClassDraft({ ...classDraft, maxAge: Number(e.target.value) })}
              />
            </label>
            <label className="vbs-plan-field">
              Max students (0 = no limit)
              <input
                type="number"
                min={0}
                disabled={busy}
                value={classDraft.capacityMax}
                onChange={(e) => setClassDraft({ ...classDraft, capacityMax: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="vbs-registration-check">
            <input
              type="checkbox"
              disabled={busy}
              checked={classDraft.registrationClosed}
              onChange={(e) => setClassDraft({ ...classDraft, registrationClosed: e.target.checked })}
            />
            Closed to new online assignments
          </label>
          <div className="vbs-plan-form-actions">
            <button type="submit" className="vbs-plan-save" disabled={busy}>
              {classDraft.id ? "Save class" : "Add class"}
            </button>
            {classDraft.id ? (
              <button type="button" className="ghost" disabled={busy} onClick={() => setClassDraft(emptyClassDraft())}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="vbs-reg-classes-layout">
        <section
          className="vbs-reg-class-column vbs-reg-class-column-unassigned"
          onDragOver={(e) => {
            if (canWrite && dragStudent) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            void dropStudent(null);
          }}
        >
          <header className="vbs-reg-class-column-head">
            <h3>Unassigned</h3>
            <span className="muted">{studentsByClass.unassigned.length}</span>
          </header>
          <div className="vbs-reg-class-drop">
            {studentsByClass.unassigned.map((student) => (
              <StudentChip
                key={student.id}
                student={student}
                canWrite={canWrite && !busy}
                onDragStart={() => setDragStudent({ kind: "student", studentId: student.id, fromClassId: null })}
              />
            ))}
          </div>
        </section>

        <div className="vbs-reg-class-columns-scroll">
          {data.classes.map((cls) => (
            <ClassColumn
              key={cls.id}
              cls={cls}
              students={studentsByClass.map.get(cls.id) ?? []}
              memberMap={memberMap}
              canWrite={canWrite && !busy}
              onEdit={() => editClass(cls)}
              onDelete={() => void removeClass(cls.id, cls.name)}
              capacityLabel={capacityLabel(cls)}
              dragStudent={dragStudent}
              dragStaff={dragStaff}
              setDragStudent={setDragStudent}
              setDragStaff={setDragStaff}
              onDropStudent={() => void dropStudent(cls.id)}
              onDropStaff={(role) => void dropStaff(cls.id, role)}
            />
          ))}
        </div>

        <aside className="vbs-reg-class-staff-pool">
          <header className="vbs-reg-class-column-head">
            <h3>Volunteers</h3>
            <span className="muted">Drag to a class</span>
          </header>
          <div className="vbs-reg-class-drop">
            {staffPool.map((member) => (
              <StaffChip
                key={member.username}
                username={member.username}
                label={memberLabel(member)}
                role="teacher"
                canWrite={canWrite && !busy}
                fromClassId={null}
                onDragStart={() =>
                  setDragStaff({ kind: "staff", username: member.username, fromClassId: null, role: "teacher" })
                }
              />
            ))}
            {staffPool.length === 0 ? <p className="muted">All org members are assigned to a class.</p> : null}
          </div>
        </aside>
      </div>

      {status ? <p className="tagline">{status}</p> : null}
    </div>
  );
}

function ClassColumn({
  cls,
  students,
  memberMap,
  canWrite,
  onEdit,
  onDelete,
  capacityLabel,
  dragStudent,
  dragStaff,
  setDragStudent,
  setDragStaff,
  onDropStudent,
  onDropStaff,
}: {
  cls: VbsRegistrationClass;
  students: VbsRegistrationStudent[];
  memberMap: Map<string, OrgMember>;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  capacityLabel: string;
  dragStudent: StudentDrag | null;
  dragStaff: StaffDrag | null;
  setDragStudent: (value: StudentDrag | null) => void;
  setDragStaff: (value: StaffDrag | null) => void;
  onDropStudent: () => void;
  onDropStaff: (role: "leader" | "teacher" | "helper") => void;
}) {
  const nearFull =
    cls.capacityMax > 0 && cls.enrolledCount >= Math.ceil(cls.capacityMax * 0.85) && cls.enrolledCount < cls.capacityMax;
  const full = cls.capacityMax > 0 && cls.enrolledCount >= cls.capacityMax;

  function staffLabel(username: string) {
    const member = memberMap.get(username);
    return member ? memberLabel(member) : username;
  }

  return (
    <section className={`vbs-reg-class-column${cls.registrationClosed ? " is-closed" : ""}${full ? " is-full" : ""}`}>
      <header className="vbs-reg-class-column-head">
        <div>
          <h3>{cls.name}</h3>
          <p className="muted vbs-reg-class-meta">
            Ages {cls.minAge}–{cls.maxAge} · {capacityLabel}
            {cls.registrationClosed ? " · Closed" : null}
            {nearFull ? " · Almost full" : null}
          </p>
        </div>
        {canWrite ? (
          <div className="vbs-reg-class-column-actions">
            <button type="button" className="ghost" onClick={onEdit}>
              Edit
            </button>
            <button type="button" className="ghost danger" onClick={onDelete}>
              Delete
            </button>
          </div>
        ) : null}
      </header>

      <div
        className="vbs-reg-class-staff-zone"
        onDragOver={(e) => {
          if (canWrite && dragStaff) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropStaff("leader");
        }}
      >
        <h4>Leaders</h4>
        {cls.leaders.map((username) => (
          <StaffChip
            key={username}
            username={username}
            label={staffLabel(username)}
            role="leader"
            canWrite={canWrite}
            fromClassId={cls.id}
            onDragStart={() =>
              setDragStaff({ kind: "staff", username, fromClassId: cls.id, role: "leader" })
            }
          />
        ))}
      </div>

      <div
        className="vbs-reg-class-staff-zone"
        onDragOver={(e) => {
          if (canWrite && dragStaff) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropStaff("teacher");
        }}
      >
        <h4>Teachers</h4>
        {cls.teachers.map((username) => (
          <StaffChip
            key={username}
            username={username}
            label={staffLabel(username)}
            role="teacher"
            canWrite={canWrite}
            fromClassId={cls.id}
            onDragStart={() =>
              setDragStaff({ kind: "staff", username, fromClassId: cls.id, role: "teacher" })
            }
          />
        ))}
      </div>

      <div
        className="vbs-reg-class-staff-zone"
        onDragOver={(e) => {
          if (canWrite && dragStaff) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropStaff("helper");
        }}
      >
        <h4>Helpers</h4>
        {cls.helpers.map((username) => (
          <StaffChip
            key={username}
            username={username}
            label={staffLabel(username)}
            role="helper"
            canWrite={canWrite}
            fromClassId={cls.id}
            onDragStart={() =>
              setDragStaff({ kind: "staff", username, fromClassId: cls.id, role: "helper" })
            }
          />
        ))}
      </div>

      <div
        className="vbs-reg-class-drop vbs-reg-class-students"
        onDragOver={(e) => {
          if (canWrite && dragStudent) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropStudent();
        }}
      >
        {students.map((student) => (
          <StudentChip
            key={student.id}
            student={student}
            canWrite={canWrite}
            onDragStart={() =>
              setDragStudent({ kind: "student", studentId: student.id, fromClassId: cls.id })
            }
          />
        ))}
        {students.length === 0 ? <p className="muted">Drop students here</p> : null}
      </div>
    </section>
  );
}
