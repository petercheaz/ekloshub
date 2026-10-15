import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import type { OrgContactOptions } from "../types";

type Audience = "volunteers" | "parents";

export default function OrgContactPage() {
  const { orgId = "" } = useParams();
  const [options, setOptions] = useState<OrgContactOptions | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [audience, setAudience] = useState<Audience>("volunteers");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const [volScope, setVolScope] = useState<"organization" | "teams">("teams");
  const [teamIds, setTeamIds] = useState<string[]>([]);

  const [parentScope, setParentScope] = useState<"all" | "class">("all");
  const [parentClassId, setParentClassId] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .orgContactOptions(orgId)
      .then((data) => {
        if (!cancelled) {
          setOptions(data);
          setAudience(data.canContactVolunteers ? "volunteers" : "parents");
          setVolScope(data.canContactWholeOrg ? "organization" : "teams");
          setTeamIds(data.teams.length === 1 ? [data.teams[0].id] : []);
          setParentClassId(data.registrationClasses[0]?.id ?? "");
          setError("");
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const parentPreview = useMemo(() => {
    if (!options) {
      return { studentCount: 0, familyEmailCount: 0 };
    }
    if (parentScope === "class" && parentClassId) {
      const row = options.registrationClasses.find((c) => c.id === parentClassId);
      return row ?? { studentCount: 0, familyEmailCount: 0 };
    }
    return options.parentAll;
  }, [options, parentScope, parentClassId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!options) {
      return;
    }
    if (
      !window.confirm(
        audience === "parents"
          ? `Send this email to ${parentPreview.familyEmailCount} parent/guardian address(es)?`
          : "Send this message to the selected volunteers?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (audience === "volunteers") {
        const result = await api.sendOrgContact(orgId, {
          subject,
          message,
          scope: volScope,
          teamIds: volScope === "teams" ? teamIds : [],
        });
        setStatus(
          `Message queued for ${result.recipientCount} member(s). Email and SMS follow each person’s notification profile.`,
        );
      } else {
        const result = await api.sendParentContact(orgId, {
          subject,
          message,
          scope: parentScope,
          classId: parentScope === "class" ? parentClassId : undefined,
        });
        setStatus(
          `Email sent to ${result.recipientCount} parent/guardian address(es). Add contact emails on registrations to reach more families.`,
        );
      }
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setBusy(false);
    }
  }

  if (error && !options) {
    return <p className="status">{error}</p>;
  }
  if (!options) {
    return <p className="status">Loading…</p>;
  }

  const showAudiencePicker = options.canContactVolunteers && options.canContactParents;

  return (
    <OrgWorkspacePage
      eyebrow="Organization outreach"
      title="Communicate"
      tagline="Reach volunteers (in-app, email, SMS) or registered families (email on file)."
    >
      <form className="review-form share-form vbs-form-panel" onSubmit={(event) => void onSubmit(event)}>
        {showAudiencePicker ? (
          <fieldset className="share-targets">
            <legend>Who are you reaching?</legend>
            <label className="checkbox-line">
              <input
                type="radio"
                name="audience"
                checked={audience === "volunteers"}
                onChange={() => setAudience("volunteers")}
              />
              Volunteers & staff (logged-in members)
            </label>
            <label className="checkbox-line">
              <input
                type="radio"
                name="audience"
                checked={audience === "parents"}
                onChange={() => setAudience("parents")}
              />
              Registered families (parent/guardian email)
            </label>
          </fieldset>
        ) : null}

        {audience === "volunteers" && options.canContactVolunteers ? (
          <>
            <p className="muted vbs-task-field-hint">
              Recipients get an in-app notification. Email and SMS use each member&apos;s choices under{" "}
              <strong>Notification profile</strong> for this organization.
            </p>
            {options.canContactWholeOrg ? (
              <fieldset className="share-targets">
                <legend>Volunteer audience</legend>
                <label className="checkbox-line">
                  <input
                    type="radio"
                    name="volScope"
                    checked={volScope === "organization"}
                    onChange={() => setVolScope("organization")}
                  />
                  Whole organization ({options.memberCount} members)
                </label>
                <label className="checkbox-line">
                  <input
                    type="radio"
                    name="volScope"
                    checked={volScope === "teams"}
                    onChange={() => setVolScope("teams")}
                  />
                  Selected team(s)
                </label>
              </fieldset>
            ) : (
              <p className="muted vbs-task-field-hint">
                {options.role === "org_write"
                  ? "Coordinators can message one or more teams. Org admins can broadcast to the whole organization."
                  : "Select team(s) you administer."}
              </p>
            )}
            {volScope === "teams" ? (
              <fieldset className="share-targets">
                <legend>Teams</legend>
                {options.teams.length === 0 ? (
                  <p className="muted">No teams available.</p>
                ) : (
                  options.teams.map((team) => (
                    <label key={team.id} className="checkbox-line">
                      <input
                        type="checkbox"
                        checked={teamIds.includes(team.id)}
                        onChange={(e) =>
                          setTeamIds((current) =>
                            e.target.checked ? [...current, team.id] : current.filter((id) => id !== team.id),
                          )
                        }
                      />
                      {team.name} ({team.memberCount} on roster)
                    </label>
                  ))
                )}
              </fieldset>
            ) : null}
          </>
        ) : null}

        {audience === "parents" && options.canContactParents ? (
          <>
            <p className="muted vbs-task-field-hint">
              Emails go to primary/secondary contact addresses saved on each registration (deduplicated). Phone-only
              contacts are skipped — add an email on the student form or parent registration link.
            </p>
            <fieldset className="share-targets">
              <legend>Family audience</legend>
              <label className="checkbox-line">
                <input
                  type="radio"
                  name="parentScope"
                  checked={parentScope === "all"}
                  onChange={() => setParentScope("all")}
                />
                All registered students ({options.parentAll.studentCount} students ·{" "}
                {options.parentAll.familyEmailCount} emails)
              </label>
              <label className="checkbox-line">
                <input
                  type="radio"
                  name="parentScope"
                  checked={parentScope === "class"}
                  onChange={() => setParentScope("class")}
                />
                One class
              </label>
            </fieldset>
            {parentScope === "class" ? (
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Class</span>
                <select value={parentClassId} onChange={(e) => setParentClassId(e.target.value)} required>
                  {options.registrationClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.familyEmailCount} emails · {c.studentCount} students)
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <p className="muted">
              Ready to send: <strong>{parentPreview.familyEmailCount}</strong> unique email
              {parentPreview.familyEmailCount === 1 ? "" : "s"} for this selection.
            </p>
          </>
        ) : null}

        <label className="vbs-task-field">
          <span className="vbs-task-field-label">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required disabled={busy} />
        </label>
        <label className="vbs-task-field">
          <span className="vbs-task-field-label">Message</span>
          <textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} required disabled={busy} />
        </label>

        <div className="vbs-form-actions">
          <button type="submit" className="vbs-plan-save" disabled={busy}>
            {busy ? "Sending…" : audience === "parents" ? "Send email to families" : "Send to volunteers"}
          </button>
        </div>
      </form>
      {status ? <p className="status">{status}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </OrgWorkspacePage>
  );
}
