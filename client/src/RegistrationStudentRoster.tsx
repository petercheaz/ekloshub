import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import { scrollDetailIntoView, studentDetailElementId } from "./scroll-detail-into-view";
import { CollapsibleFormActions, CollapsibleFormTrigger } from "./CollapsibleForm";
import { expandableRowHeaderProps } from "./expandable-row";
import { RegistrationStudentFields } from "./RegistrationStudentFields";
import {
  registrationStudentDraftFromStudent,
  toggleRegistrationAllergy,
  type RegistrationStudentDraft,
} from "./registration-student-draft";
import { StudentName } from "./StudentName";
import type { VbsRegistrationStudent, VbsRegistrationWorkspace } from "./types";
import { ageFromBirthMonthYear, allergiesLabel, attendanceSummary } from "./vbs-registration-utils";

const ROSTER_COLUMNS = 11;

function RegistrationStudentDetailPanel({
  student,
  data,
  canWrite,
  busy,
  onSave,
  onCancel,
  vbsAgeOn,
}: {
  student: VbsRegistrationStudent;
  data: VbsRegistrationWorkspace;
  vbsAgeOn: Date;
  canWrite: boolean;
  busy: boolean;
  onSave: (draft: RegistrationStudentDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => registrationStudentDraftFromStudent(student));
  const draftAge = ageFromBirthMonthYear(draft.birthMonth, draft.birthYear, vbsAgeOn);

  useEffect(() => {
    setDraft(registrationStudentDraftFromStudent(student));
  }, [student]);

  function toggleAllergy(label: string) {
    setDraft((current) => toggleRegistrationAllergy(current, label));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) {
      return;
    }
    await onSave(draft);
    onCancel();
  }

  return (
    <form className="vbs-registration-roster-detail" onSubmit={(e) => void handleSave(e)}>
      <RegistrationStudentFields
        draft={draft}
        setDraft={setDraft}
        draftAge={draftAge}
        data={data}
        busy={busy}
        canWrite={canWrite}
        toggleAllergy={toggleAllergy}
      />
      {canWrite ? (
        <div className="vbs-collapsible-form-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="vbs-plan-save" disabled={busy}>
            Save
          </button>
        </div>
      ) : null}
    </form>
  );
}

export function RegistrationStudentRoster({
  students,
  data,
  canWrite,
  busy,
  expandedStudentId,
  onExpandedStudentIdChange,
  onSave,
  onDelete,
  onAddStudent,
  addStudentFormOpen,
  vbsAgeOn,
}: {
  students: VbsRegistrationStudent[];
  data: VbsRegistrationWorkspace;
  vbsAgeOn: Date;
  canWrite: boolean;
  busy: boolean;
  expandedStudentId: string | null;
  onExpandedStudentIdChange: (id: string | null) => void;
  onSave: (draft: RegistrationStudentDraft) => Promise<void>;
  onDelete: (student: VbsRegistrationStudent) => void;
  onAddStudent?: () => void;
  addStudentFormOpen?: boolean;
}) {
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  useEffect(() => {
    if (!expandedStudentId) {
      return;
    }
    scrollDetailIntoView(document.getElementById(studentDetailElementId(expandedStudentId)));
  }, [expandedStudentId]);

  return (
    <section className="vbs-panel vbs-registration-roster" aria-label="Registered students">
      <div className="vbs-registration-form-head">
        <h2 className="vbs-plan-section-title">Students</h2>
        {canWrite && onAddStudent ? (
          <CollapsibleFormTrigger
            label="Add student"
            disabled={busy || addStudentFormOpen}
            ariaExpanded={addStudentFormOpen}
            onClick={onAddStudent}
          />
        ) : null}
      </div>
      <p className="muted vbs-registration-roster-hint">
        Click a row to view or edit details. Use <span aria-hidden="true">×</span> on the row to remove a student.
      </p>
      {students.length === 0 ? (
        <p className="muted">No students registered yet.</p>
      ) : (
        <div className="vbs-spreadsheet-scroll">
          <table className="vbs-spreadsheet vbs-registration-table vbs-registration-roster-table">
            <colgroup>
              <col className="vbs-registration-roster-col-name" />
              <col className="vbs-registration-roster-col-season" />
              <col className="vbs-registration-roster-col-source" />
              <col className="vbs-registration-roster-col-age" />
              <col className="vbs-registration-roster-col-team" />
              <col className="vbs-registration-roster-col-class" />
              <col className="vbs-registration-roster-col-pay" />
              <col className="vbs-registration-roster-col-allergies" />
              <col className="vbs-registration-roster-col-attendance" />
              <col className="vbs-registration-roster-col-shirt" />
              <col className="vbs-registration-roster-col-remove" />
            </colgroup>
            <thead>
              <tr>
                <th className="vbs-registration-roster-col-name">Name</th>
                <th className="vbs-registration-roster-col-season">Season</th>
                <th className="vbs-registration-roster-col-source">Source</th>
                <th className="vbs-registration-roster-col-age">Age</th>
                <th className="vbs-registration-roster-col-team">Team</th>
                <th className="vbs-registration-roster-col-class">Class</th>
                <th className="vbs-registration-roster-col-pay">Pay</th>
                <th className="vbs-registration-roster-col-allergies">Allergies</th>
                <th className="vbs-registration-roster-col-attendance">Attendance</th>
                <th className="vbs-registration-roster-col-shirt">Shirt</th>
                <th className="vbs-registration-roster-col-remove" aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const expanded = expandedStudentId === student.id;
                const toggle = () => onExpandedStudentIdChange(expanded ? null : student.id);
                return (
                  <Fragment key={student.id}>
                    <tr
                      {...expandableRowHeaderProps(
                        expanded,
                        toggle,
                        expanded ? "vbs-registration-roster-row open" : "vbs-registration-roster-row",
                        `${student.childFullName}, registration summary`,
                      )}
                    >
                      <td className="vbs-registration-roster-col-name">
                        <span className="vbs-registration-roster-chevron" aria-hidden="true">
                          {expanded ? "▾" : "▸"}
                        </span>{" "}
                        <StudentName student={student} />
                      </td>
                      <td className="vbs-registration-roster-col-season">VBS {student.vbsSeasonYear}</td>
                      <td className="vbs-registration-roster-col-source">
                        <span className="vbs-registration-source">
                          {student.source === "public" ? "Parent online" : "Staff"}
                        </span>
                      </td>
                      <td className="vbs-registration-roster-col-age">{student.ageYears}</td>
                      <td className="vbs-registration-roster-col-team" title={student.assignedTeamName || undefined}>
                        {student.assignedTeamName || "—"}
                      </td>
                      <td className="vbs-registration-roster-col-class" title={student.className || undefined}>
                        {student.className || "—"}
                      </td>
                      <td className="vbs-registration-roster-col-pay">{student.paymentStatus}</td>
                      <td
                        className="vbs-registration-roster-col-allergies"
                        title={allergiesLabel(student.allergiesCommon, student.allergiesOther)}
                      >
                        {allergiesLabel(student.allergiesCommon, student.allergiesOther)}
                      </td>
                      <td className="vbs-registration-roster-col-attendance">{attendanceSummary(student)}</td>
                      <td className="vbs-registration-roster-col-shirt">{student.tshirtSize || "—"}</td>
                      <td className="vbs-registration-roster-col-remove">
                        {canWrite ? (
                          <button
                            type="button"
                            className="ghost vbs-task-remove vbs-registration-row-remove"
                            data-no-row-toggle
                            disabled={busy}
                            aria-label={`Remove ${student.childFullName}`}
                            onClick={() => onDelete(student)}
                          >
                            ×
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {expanded ? (
                      <tr
                        className="vbs-registration-roster-detail-row"
                        id={studentDetailElementId(student.id)}
                      >
                        <td colSpan={ROSTER_COLUMNS}>
                          <RegistrationStudentDetailPanel
                            student={studentById.get(student.id) ?? student}
                            data={data}
                            vbsAgeOn={vbsAgeOn}
                            canWrite={canWrite}
                            busy={busy}
                            onSave={onSave}
                            onCancel={() => onExpandedStudentIdChange(null)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
