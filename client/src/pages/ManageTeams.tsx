import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { OrgUserListInput } from "../OrgUserListInput";
import { OrgBanner } from "../orgs";
import type { OrgDetail } from "../types";

export default function ManageTeamsPage() {
  const { orgId = "" } = useParams();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [error, setError] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamMembers, setTeamMembers] = useState("");
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .organization(orgId)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
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

  async function saveTeam(event: FormEvent) {
    event.preventDefault();
    try {
      if (editingTeamId) {
        await api.updateTeam(orgId, editingTeamId, teamName, teamMembers);
      } else {
        await api.createTeam(orgId, teamName, teamMembers);
      }
      setDetail(await api.organization(orgId));
      setTeamName("");
      setTeamMembers("");
      setEditingTeamId(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save team");
    }
  }

  if (error && !detail) {
    return <p className="status">{error}</p>;
  }
  if (!detail) {
    return <p className="status">Loading teams…</p>;
  }
  if (detail.organization.role !== "org_admin") {
    return <p className="status">Only org admins can manage teams.</p>;
  }

  return (
    <div className="reviews">
      <header className="page-head">
        <p className="eyebrow">Manage teams</p>
        <h1>Teams</h1>
        <OrgBanner />
        <p className="tagline">Create groups of org members. Separate users with commas or semicolons.</p>
      </header>

      <section className="org-members">
        {(detail.teams ?? []).length === 0 ? <p className="muted">No teams yet.</p> : null}
        <ul className="entry-list">
          {(detail.teams ?? []).map((team) => (
            <li key={team.id} className="entry">
              <div className="entry-meta">
                <span className="author">{team.name}</span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setEditingTeamId(team.id);
                    setTeamName(team.name);
                    setTeamMembers(team.members);
                  }}
                >
                  Edit
                </button>
              </div>
              <p className="entry-preview">{team.members}</p>
            </li>
          ))}
        </ul>
        <form className="review-form share-form" onSubmit={(event) => void saveTeam(event)}>
          <h3>{editingTeamId ? "Edit team" : "Create team"}</h3>
          <label htmlFor="team-name">Team name</label>
          <input id="team-name" value={teamName} onChange={(event) => setTeamName(event.target.value)} required />
          <label htmlFor="team-members">Users (comma or semicolon separated)</label>
          <OrgUserListInput
            id="team-members"
            value={teamMembers}
            onChange={setTeamMembers}
            placeholder="Search org members by name or email…"
            required
          />
          <button type="submit">{editingTeamId ? "Save team" : "Create team"}</button>
          {editingTeamId ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setEditingTeamId(null);
                setTeamName("");
                setTeamMembers("");
              }}
            >
              Cancel
            </button>
          ) : null}
        </form>
      </section>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
