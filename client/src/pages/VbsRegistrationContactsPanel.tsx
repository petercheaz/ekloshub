import type { VbsRegistrationStudent } from "../types";
import { attendanceSummary } from "../vbs-registration-utils";

export function VbsRegistrationContactsPanel({ students }: { students: VbsRegistrationStudent[] }) {
  const withContact = students.filter((s) => s.contact1Name.trim() || s.contact1Phone.trim());

  return (
    <section className="vbs-panel vbs-registration-contacts" aria-label="Emergency contacts">
      <h2 className="vbs-plan-section-title">Contacts</h2>
      <p className="muted vbs-registration-view-lead">
        Pickup and emergency contacts for planners and registration staff. Not shown to the cooking team.
      </p>
      {withContact.length === 0 ? (
        <p className="muted">No contact details on file yet.</p>
      ) : (
        <div className="vbs-spreadsheet-scroll">
          <table className="vbs-spreadsheet vbs-registration-table">
            <thead>
              <tr>
                <th>Child</th>
                <th>Class</th>
                <th>Primary</th>
                <th>Phone</th>
                <th>Secondary</th>
                <th>Phone</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td>{student.childFullName}</td>
                  <td>{student.className || "—"}</td>
                  <td>{student.contact1Name || "—"}</td>
                  <td>
                    {student.contact1Phone ? (
                      <a href={`tel:${student.contact1Phone.replace(/\s/g, "")}`}>{student.contact1Phone}</a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{student.contact2Name || "—"}</td>
                  <td>
                    {student.contact2Phone ? (
                      <a href={`tel:${student.contact2Phone.replace(/\s/g, "")}`}>{student.contact2Phone}</a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{attendanceSummary(student)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
