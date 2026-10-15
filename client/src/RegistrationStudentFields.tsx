import { ChildGenderField } from "./ChildGenderField";
import type { VbsRegistrationPaymentStatus, VbsRegistrationWorkspace } from "./types";
import { birthMonthOptions, birthYearOptions } from "./vbs-registration-utils";
import type { RegistrationStudentDraft } from "./registration-student-draft";

type Props = {
  draft: RegistrationStudentDraft;
  setDraft: (value: RegistrationStudentDraft | ((current: RegistrationStudentDraft) => RegistrationStudentDraft)) => void;
  draftAge: number;
  data: VbsRegistrationWorkspace;
  busy: boolean;
  canWrite: boolean;
  toggleAllergy: (label: string) => void;
};

export function RegistrationStudentFields({
  draft,
  setDraft,
  draftAge,
  data,
  busy,
  canWrite,
  toggleAllergy,
}: Props) {
  const monthOptions = birthMonthOptions();
  const yearOptions = birthYearOptions(18);
  const disabled = !canWrite || busy;

  return (
    <>
      <div className="vbs-plan-overview-block">
        <h3 className="vbs-plan-section-title">Child</h3>
        <label className="vbs-plan-field">
          Full name
          <input
            required
            disabled={disabled}
            value={draft.childFullName}
            onChange={(e) => setDraft({ ...draft, childFullName: e.target.value })}
          />
        </label>
        <ChildGenderField
          value={draft.childGender}
          disabled={disabled}
          onChange={(childGender) => setDraft({ ...draft, childGender })}
        />
        <div className="vbs-plan-field-row">
          <label className="vbs-plan-field">
            Birth month
            <select
              required
              disabled={disabled}
              value={draft.birthMonth}
              onChange={(e) => setDraft({ ...draft, birthMonth: Number(e.target.value) })}
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="vbs-plan-field">
            Birth year
            <select
              required
              disabled={disabled}
              value={draft.birthYear}
              onChange={(e) => setDraft({ ...draft, birthYear: Number(e.target.value) })}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <div className="vbs-plan-field vbs-plan-field-readonly">
            <span className="vbs-plan-field-readonly-label">Age at VBS</span>
            <strong className="vbs-plan-field-readonly-value">{draftAge}</strong>
          </div>
        </div>
        <label className="vbs-plan-field">
          T-shirt size
          <select disabled={disabled} value={draft.tshirtSize} onChange={(e) => setDraft({ ...draft, tshirtSize: e.target.value })}>
            <option value="">Select size…</option>
            {data.tshirtSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label className="vbs-plan-field">
          Assigned team / crew
          <select
            disabled={disabled}
            value={draft.assignedTeamId}
            onChange={(e) => setDraft({ ...draft, assignedTeamId: e.target.value })}
          >
            <option value="">Suggest from age on save…</option>
            {data.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        {draft.classId && draft.id ? (
          <p className="muted vbs-task-field-hint">
            Station class: <strong>{data.classes.find((c) => c.id === draft.classId)?.name ?? "Assigned"}</strong> —
            change on Classes & roster (drag-and-drop).
          </p>
        ) : (
          <p className="muted vbs-task-field-hint">
            Station class assignment is on <strong>Classes & roster</strong> — drag this student onto a rotation class
            after saving.
          </p>
        )}
        <label className="vbs-plan-field">
          Payment (offline)
          <select
            disabled={disabled}
            value={draft.paymentStatus}
            onChange={(e) => setDraft({ ...draft, paymentStatus: e.target.value as VbsRegistrationPaymentStatus })}
          >
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
          </select>
        </label>
      </div>

      <div className="vbs-plan-overview-block">
        <h3 className="vbs-plan-section-title">Allergies</h3>
        <fieldset className="vbs-registration-allergies" disabled={disabled}>
          <legend className="muted">Common allergies</legend>
          <ul className="vbs-registration-allergy-grid">
            {data.commonAllergies.map((label) => (
              <li key={label}>
                <label className="vbs-registration-check">
                  <input
                    type="checkbox"
                    checked={draft.allergiesCommon.includes(label)}
                    onChange={() => toggleAllergy(label)}
                  />
                  {label}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <label className="vbs-plan-field">
          Other allergies (type any not listed)
          <textarea
            rows={2}
            disabled={disabled}
            value={draft.allergiesOther}
            onChange={(e) => setDraft({ ...draft, allergiesOther: e.target.value })}
            placeholder="e.g. red dye, cats, bee stings"
          />
        </label>
      </div>

      <div className="vbs-plan-overview-block">
        <h3 className="vbs-plan-section-title">Parent / guardian</h3>
        <p className="muted vbs-task-field-hint">Primary parent or guardian is required for pickup and VBS updates.</p>
        <div className="vbs-plan-field-row">
          <label className="vbs-plan-field">
            Primary parent/guardian full name
            <input
              required
              disabled={disabled}
              value={draft.contact1Name}
              onChange={(e) => setDraft({ ...draft, contact1Name: e.target.value })}
            />
          </label>
          <label className="vbs-plan-field">
            Primary phone
            <input
              type="tel"
              required
              disabled={disabled}
              value={draft.contact1Phone}
              onChange={(e) => setDraft({ ...draft, contact1Phone: e.target.value })}
            />
          </label>
          <label className="vbs-plan-field">
            Primary email
            <input
              type="email"
              required
              autoComplete="email"
              disabled={disabled}
              value={draft.contact1Email}
              onChange={(e) => setDraft({ ...draft, contact1Email: e.target.value })}
              placeholder="For VBS updates"
            />
          </label>
        </div>
        <div className="vbs-plan-field-row">
          <label className="vbs-plan-field">
            Second contact full name (optional)
            <input disabled={disabled} value={draft.contact2Name} onChange={(e) => setDraft({ ...draft, contact2Name: e.target.value })} />
          </label>
          <label className="vbs-plan-field">
            Second contact phone
            <input
              type="tel"
              disabled={disabled}
              value={draft.contact2Phone}
              onChange={(e) => setDraft({ ...draft, contact2Phone: e.target.value })}
            />
          </label>
          <label className="vbs-plan-field">
            Second contact email
            <input
              type="email"
              autoComplete="email"
              disabled={disabled}
              value={draft.contact2Email}
              onChange={(e) => setDraft({ ...draft, contact2Email: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="vbs-plan-overview-block">
        <h3 className="vbs-plan-section-title">Expected attendance (Mon–Fri)</h3>
        <ul className="vbs-registration-weekdays">
          {(
            [
              ["attendMon", "Monday"],
              ["attendTue", "Tuesday"],
              ["attendWed", "Wednesday"],
              ["attendThu", "Thursday"],
              ["attendFri", "Friday"],
            ] as const
          ).map(([key, label]) => (
            <li key={key}>
              <label className="vbs-registration-check">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                />
                {label}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="vbs-plan-overview-block">
        <label className="vbs-plan-field">
          Special requests (optional)
          <textarea
            rows={2}
            disabled={disabled}
            value={draft.specialRequests}
            onChange={(e) => setDraft({ ...draft, specialRequests: e.target.value })}
            placeholder="Buddy requests, accessibility, team preference…"
          />
        </label>
        <label className="vbs-plan-field">
          Comments (optional)
          <textarea
            rows={2}
            disabled={disabled}
            value={draft.comments}
            onChange={(e) => setDraft({ ...draft, comments: e.target.value })}
          />
        </label>
      </div>
    </>
  );
}
