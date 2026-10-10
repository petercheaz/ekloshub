import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { orgPath, useOrgs } from "../orgs";
import type { OrgNotificationSettings } from "../types";

export default function ProfilePage() {
  const { tenantId } = useOrgs();
  const [organizations, setOrganizations] = useState<OrgNotificationSettings[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(tenantId);

  useEffect(() => {
    void api
      .notificationProfile()
      .then((data) => {
        setOrganizations(data.organizations);
        setExpandedOrg((current) => current ?? data.organizations[0]?.organizationId ?? null);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function save(org: OrgNotificationSettings, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    const form = new FormData(event.currentTarget);
    const mutedRaw = String(form.get("mutedUsernames") ?? "");
    const mutedUsernames = mutedRaw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const subscribedTeamIds = org.teams
      .filter((team) => form.get(`team-${team.id}`) === "on")
      .map((team) => team.id);

    try {
      const result = await api.saveOrgNotificationProfile(org.organizationId, {
        notifyEmail: form.get("notifyEmail") === "on",
        notifySms: form.get("notifySms") === "on",
        notifyBoardInApp: form.get("notifyBoardInApp") === "on",
        notifyBoardEmail: form.get("notifyBoardEmail") === "on",
        notifyBoardSms: form.get("notifyBoardSms") === "on",
        boardSubscribeOrg: form.get("boardSubscribeOrg") === "on",
        subscribedTeamIds,
        mutedUsernames,
      });
      setOrganizations(result.organizations);
      setStatus(`Saved settings for ${org.organizationName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reviews profile-page">
      <header className="page-head">
        <p className="eyebrow">Account</p>
        <h1>Notification profile</h1>
        <p className="tagline">
          Choose how each organization reaches you for VBS tasks, the message board, and calendar reminders.
          Muted users can still post—you just will not get alerts from them.
        </p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {status ? <p className="status">{status}</p> : null}

      {organizations.length === 0 ? <p className="muted">Join an organization to configure notifications.</p> : null}

      <div className="profile-org-list">
        {organizations.map((org) => {
          const open = expandedOrg === org.organizationId;
          return (
            <section key={org.organizationId} className="vbs-panel profile-org-panel">
              <button
                type="button"
                className="profile-org-toggle"
                aria-expanded={open}
                onClick={() => setExpandedOrg(open ? null : org.organizationId)}
              >
                <strong>{org.organizationName}</strong>
                <span className="muted">{open ? "Hide" : "Edit"}</span>
              </button>
              {open ? (
                <form className="review-form profile-notify-form" onSubmit={(e) => void save(org, e)}>
                  <h2>Tasks &amp; assignments</h2>
                  <label className="checkbox-line">
                    <input type="checkbox" name="notifyEmail" defaultChecked={org.notifyEmail} />
                    Email me about task assignments and plan updates
                  </label>
                  <label className="checkbox-line">
                    <input type="checkbox" name="notifySms" defaultChecked={org.notifySms} />
                    Text me about urgent task updates
                  </label>

                  <h2>Message board</h2>
                  <p className="muted">
                    Team members are notified for their team&apos;s posts. Subscribe below for org-wide posts or
                    other teams.{" "}
                    <Link to={orgPath(org.organizationId, "/vbs-plan")}>Open VBS Plan board</Link>
                  </p>
                  <label className="checkbox-line">
                    <input type="checkbox" name="boardSubscribeOrg" defaultChecked={org.boardSubscribeOrg} />
                    Notify me for organization-wide board posts
                  </label>
                  <label className="checkbox-line">
                    <input type="checkbox" name="notifyBoardInApp" defaultChecked={org.notifyBoardInApp} />
                    In-app alerts for board posts and replies
                  </label>
                  <label className="checkbox-line">
                    <input type="checkbox" name="notifyBoardEmail" defaultChecked={org.notifyBoardEmail} />
                    Email for board posts and replies
                  </label>
                  <label className="checkbox-line">
                    <input type="checkbox" name="notifyBoardSms" defaultChecked={org.notifyBoardSms} />
                    SMS for board posts and replies
                  </label>

                  {org.teams.length > 0 ? (
                    <fieldset className="profile-team-subs">
                      <legend>Also notify me for these teams (even if I am not on the roster)</legend>
                      {org.teams.map((team) => (
                        <label key={team.id} className="checkbox-line">
                          <input
                            type="checkbox"
                            name={`team-${team.id}`}
                            defaultChecked={org.subscribedTeamIds.includes(team.id)}
                          />
                          {team.name}
                        </label>
                      ))}
                    </fieldset>
                  ) : null}

                  <label>
                    Muted users (no board alerts from these usernames)
                    <textarea
                      name="mutedUsernames"
                      rows={2}
                      placeholder="username1, username2"
                      defaultValue={org.mutedUsernames.join(", ")}
                    />
                  </label>

                  <button type="submit" disabled={busy}>
                    Save {org.organizationName}
                  </button>
                </form>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
