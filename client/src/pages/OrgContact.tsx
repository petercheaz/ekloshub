import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import type { OrgContactOptions } from "../types";

export default function OrgContactPage() {
  const { orgId = "" } = useParams();
  const [options, setOptions] = useState<OrgContactOptions | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState<"organization" | "teams">("teams");
  const [teamIds, setTeamIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .orgContactOptions(orgId)
      .then((data) => {
        if (!cancelled) {
          setOptions(data);
          setScope(data.canContactWholeOrg ? "organization" : "teams");
          setTeamIds(data.teams.length === 1 ? [data.teams[0].id] : []);
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await api.sendOrgContact(orgId, {
        subject,
        message,
        scope,
        teamIds: scope === "teams" ? teamIds : [],
      });
      setStatus(
        `Message queued for ${result.recipientCount} member(s). Each person is notified by email and/or SMS only if they turned that on in their notification profile.`,
      );
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
    return <p className="status">Loading contact options…</p>;
  }

  return (
    <OrgWorkspacePage
      eyebrow="Organization outreach"
      title="Contact org & teams"
      tagline="Reach members using their notification profile (email and SMS toggles per org). org_write and org_read cannot use this page."
    >
      <form className="review-form share-form vbs-form-panel" onSubmit={(event) => void onSubmit(event)}>
        <p className="muted vbs-task-field-hint">
          Recipients also get an in-app notification. Email and SMS follow each member&apos;s choices under{" "}
          <strong>Notification profile</strong> for this organization.
        </p>

        {options.canContactWholeOrg ? (
          <fieldset className="share-targets">
            <legend>Audience</legend>
            <label className="checkbox-line">
              <input
                type="radio"
                name="scope"
                checked={scope === "organization"}
                onChange={() => setScope("organization")}
              />
              Whole organization ({options.memberCount} members)
            </label>
            <label className="checkbox-line">
              <input
                type="radio"
                name="scope"
                checked={scope === "teams"}
                onChange={() => setScope("teams")}
              />
              Selected team(s)
            </label>
          </fieldset>
        ) : (
          <p className="muted vbs-task-field-hint">As a team admin, you can contact members on your assigned teams.</p>
        )}

        {scope === "teams" ? (
          <fieldset className="share-targets">
            <legend>Teams</legend>
            {options.teams.length === 0 ? (
              <p className="muted">No teams available for you to contact.</p>
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
            {busy ? "Sending…" : "Send message"}
          </button>
        </div>
      </form>
      {status ? <p className="status">{status}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </OrgWorkspacePage>
  );
}
