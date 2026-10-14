import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { BrandLogo } from "../BrandLogo";
import type { PublicRegistrationForm } from "../types";
import {
  ageFromBirthMonthYear,
  birthMonthOptions,
  birthYearOptions,
} from "../vbs-registration-utils";

type Draft = {
  childFullName: string;
  birthMonth: number;
  birthYear: number;
  allergiesCommon: string[];
  allergiesOther: string;
  comments: string;
  specialRequests: string;
  contact1Name: string;
  contact1Phone: string;
  contact2Name: string;
  contact2Phone: string;
  attendMon: boolean;
  attendTue: boolean;
  attendWed: boolean;
  attendThu: boolean;
  attendFri: boolean;
  tshirtSize: string;
  privacyConsent: boolean;
  website: string;
};

function emptyDraft(): Draft {
  const now = new Date();
  return {
    childFullName: "",
    birthMonth: now.getMonth() + 1,
    birthYear: now.getFullYear() - 6,
    allergiesCommon: [],
    allergiesOther: "",
    comments: "",
    specialRequests: "",
    contact1Name: "",
    contact1Phone: "",
    contact2Name: "",
    contact2Phone: "",
    attendMon: true,
    attendTue: true,
    attendWed: true,
    attendThu: true,
    attendFri: true,
    tshirtSize: "",
    privacyConsent: false,
    website: "",
  };
}

export default function ParentRegisterPage() {
  const { token = "" } = useParams();
  const [form, setForm] = useState<PublicRegistrationForm | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ childFullName: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .publicRegistrationForm(token)
      .then((data) => {
        if (!cancelled) {
          setForm(data);
          setError("");
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const draftAge = ageFromBirthMonthYear(draft.birthMonth, draft.birthYear);

  function toggleAllergy(label: string) {
    setDraft((current) => {
      const set = new Set(current.allergiesCommon);
      if (set.has(label)) {
        set.delete(label);
      } else {
        set.add(label);
      }
      return { ...current, allergiesCommon: [...set] };
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.privacyConsent) {
      setError("Please confirm the privacy notice.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await api.submitPublicRegistration(token, {
        ...draft,
        privacyConsent: true,
      });
      setDone({ childFullName: result.childFullName });
      setDraft(emptyDraft());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit registration");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="public-register-shell">
        <p className="status">Loading registration…</p>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="public-register-shell">
        <header className="public-register-head">
          <BrandLogo />
        </header>
        <p className="status">{error}</p>
        <p className="muted">
          Ask your church for an updated registration link, or{" "}
          <Link to="/login">sign in</Link> if you volunteer on VBS Resources.
        </p>
      </div>
    );
  }

  if (!form) {
    return null;
  }

  if (done) {
    return (
      <div className="public-register-shell">
        <header className="public-register-head">
          <BrandLogo />
          <h1>Thank you!</h1>
        </header>
        <section className="vbs-panel public-register-success">
          <p>
            <strong>{done.childFullName}</strong> is registered with {form.organizationName}.
          </p>
          <p className="muted">
            If you need to change anything, contact the church office — online edits are not available
            without an account.
          </p>
          <button type="button" className="vbs-plan-save" onClick={() => setDone(null)}>
            Register another child
          </button>
        </section>
      </div>
    );
  }

  const monthOptions = birthMonthOptions();
  const yearOptions = birthYearOptions(18);

  return (
    <div className="public-register-shell">
      <header className="public-register-head">
        <BrandLogo />
        <h1>VBS registration</h1>
        <p className="tagline">
          {form.organizationName}
          {form.programLabel ? ` · ${form.programLabel}` : ""}
        </p>
        <p className="muted public-register-lead">
          Parents and guardians can register here — no account required. Church staff review submissions in
          VBS Resources.
        </p>
      </header>

      {error ? <p className="status">{error}</p> : null}

      <form className="vbs-panel vbs-registration-form public-register-form" onSubmit={onSubmit}>
        {form.paymentNote ? (
          <div className="vbs-plan-callout public-register-payment">
            <h2 className="vbs-plan-section-title">Payment</h2>
            <p>{form.paymentNote}</p>
          </div>
        ) : null}

        <div className="vbs-plan-callout public-register-privacy">
          <h2 className="vbs-plan-section-title">Privacy</h2>
          <p>{form.privacyNotice}</p>
          <label className="vbs-registration-check">
            <input
              type="checkbox"
              required
              checked={draft.privacyConsent}
              onChange={(e) => setDraft({ ...draft, privacyConsent: e.target.checked })}
            />
            I understand and agree
          </label>
        </div>

        <input
          type="text"
          name="website"
          value={draft.website}
          onChange={(e) => setDraft({ ...draft, website: e.target.value })}
          className="public-register-honeypot"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        <div className="vbs-plan-overview-block">
          <h2 className="vbs-plan-section-title">Child</h2>
          <label className="vbs-plan-field">
            Full name
            <input
              required
              disabled={submitting}
              value={draft.childFullName}
              onChange={(e) => setDraft({ ...draft, childFullName: e.target.value })}
            />
          </label>
          <div className="vbs-plan-field-row">
            <label className="vbs-plan-field">
              Birth month
              <select
                required
                disabled={submitting}
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
                disabled={submitting}
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
              <span className="vbs-plan-field-readonly-label">Age (today)</span>
              <strong className="vbs-plan-field-readonly-value">{draftAge}</strong>
            </div>
          </div>
          <label className="vbs-plan-field">
            T-shirt size
            <select
              disabled={submitting}
              value={draft.tshirtSize}
              onChange={(e) => setDraft({ ...draft, tshirtSize: e.target.value })}
            >
              <option value="">Select size…</option>
              {form.tshirtSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="vbs-plan-overview-block">
          <h2 className="vbs-plan-section-title">Allergies</h2>
          <fieldset className="vbs-registration-allergies" disabled={submitting}>
            <legend className="muted">Common allergies</legend>
            <ul className="vbs-registration-allergy-grid">
              {form.commonAllergies.map((label) => (
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
            Other allergies
            <textarea
              rows={2}
              disabled={submitting}
              value={draft.allergiesOther}
              onChange={(e) => setDraft({ ...draft, allergiesOther: e.target.value })}
            />
          </label>
        </div>

        <div className="vbs-plan-overview-block">
          <h2 className="vbs-plan-section-title">Contacts</h2>
          <div className="vbs-plan-field-row">
            <label className="vbs-plan-field">
              Primary contact full name
              <input
                required
                disabled={submitting}
                value={draft.contact1Name}
                onChange={(e) => setDraft({ ...draft, contact1Name: e.target.value })}
              />
            </label>
            <label className="vbs-plan-field">
              Primary contact phone
              <input
                type="tel"
                required
                disabled={submitting}
                value={draft.contact1Phone}
                onChange={(e) => setDraft({ ...draft, contact1Phone: e.target.value })}
              />
            </label>
          </div>
          <div className="vbs-plan-field-row">
            <label className="vbs-plan-field">
              Second contact full name
              <input
                disabled={submitting}
                value={draft.contact2Name}
                onChange={(e) => setDraft({ ...draft, contact2Name: e.target.value })}
              />
            </label>
            <label className="vbs-plan-field">
              Second contact phone
              <input
                type="tel"
                disabled={submitting}
                value={draft.contact2Phone}
                onChange={(e) => setDraft({ ...draft, contact2Phone: e.target.value })}
              />
            </label>
          </div>
        </div>

        <div className="vbs-plan-overview-block">
          <h2 className="vbs-plan-section-title">Expected attendance (Mon–Fri)</h2>
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
                    disabled={submitting}
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
              disabled={submitting}
              value={draft.specialRequests}
              onChange={(e) => setDraft({ ...draft, specialRequests: e.target.value })}
            />
          </label>
          <label className="vbs-plan-field">
            Comments (optional)
            <textarea
              rows={2}
              disabled={submitting}
              value={draft.comments}
              onChange={(e) => setDraft({ ...draft, comments: e.target.value })}
            />
          </label>
        </div>

        <div className="vbs-plan-form-actions">
          <button type="submit" className="vbs-plan-save" disabled={submitting}>
            Submit registration
          </button>
        </div>
      </form>
    </div>
  );
}
