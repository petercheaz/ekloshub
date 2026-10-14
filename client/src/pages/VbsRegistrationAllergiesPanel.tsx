import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import type { VbsRegistrationStudent } from "../types";
import { allergiesLabel } from "../vbs-registration-utils";

export function VbsRegistrationAllergiesPanel({
  students,
  commonAllergies,
  sharedWithCooking,
}: {
  students: VbsRegistrationStudent[];
  commonAllergies: string[];
  sharedWithCooking: boolean;
}) {
  const { orgId = "" } = useParams();
  const byAllergen = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const label of commonAllergies) {
      map.set(label, []);
    }
    map.set("Other / notes", []);
    for (const student of students) {
      for (const label of student.allergiesCommon) {
        const list = map.get(label) ?? [];
        list.push(student.childFullName);
        map.set(label, list);
      }
      if (student.allergiesOther.trim()) {
        const list = map.get("Other / notes") ?? [];
        list.push(`${student.childFullName}: ${student.allergiesOther.trim()}`);
        map.set("Other / notes", list);
      }
    }
    return map;
  }, [students, commonAllergies]);

  const withAny = students.filter(
    (s) => s.allergiesCommon.length > 0 || s.allergiesOther.trim().length > 0,
  );

  return (
    <section className="vbs-panel vbs-registration-allergies-view" aria-label="Allergy roster">
      <h2 className="vbs-plan-section-title">Allergies</h2>
      <p className="muted vbs-registration-view-lead">
        {sharedWithCooking
          ? "Shared with your cooking team. Build the week in "
          : "Registration and coordinators can see this view. Snack planning lives in "}
        <Link to={`/org/${orgId}/cooking-plan`}>Cooking Plan</Link>.
      </p>

      <div className="vbs-registration-allergy-summary-grid">
        {commonAllergies.map((label) => {
          const names = byAllergen.get(label) ?? [];
          return (
            <article key={label} className={`vbs-registration-allergy-card${names.length ? " has-hit" : ""}`}>
              <h3>{label}</h3>
              <p className="vbs-registration-allergy-count">
                <strong>{names.length}</strong> {names.length === 1 ? "child" : "children"}
              </p>
              {names.length ? <p className="vbs-registration-allergy-names">{names.join(", ")}</p> : null}
            </article>
          );
        })}
        <article
          className={`vbs-registration-allergy-card${(byAllergen.get("Other / notes") ?? []).length ? " has-hit" : ""}`}
        >
          <h3>Other / notes</h3>
          <ul className="vbs-registration-allergy-other-list">
            {(byAllergen.get("Other / notes") ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>
      </div>

      <h3 className="vbs-plan-section-title">By student</h3>
      {withAny.length === 0 ? (
        <p className="muted">No allergies reported yet.</p>
      ) : (
        <div className="vbs-spreadsheet-scroll">
          <table className="vbs-spreadsheet vbs-registration-table">
            <thead>
              <tr>
                <th>Child</th>
                <th>Class</th>
                <th>Age</th>
                <th>Allergies</th>
              </tr>
            </thead>
            <tbody>
              {withAny.map((student) => (
                <tr key={student.id}>
                  <td>{student.childFullName}</td>
                  <td>{student.className || "—"}</td>
                  <td>{student.ageYears}</td>
                  <td>{allergiesLabel(student.allergiesCommon, student.allergiesOther)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
