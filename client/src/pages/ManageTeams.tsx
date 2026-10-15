import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { orgPath } from "../orgs";
import { api } from "../api";
import { useAuth } from "../auth";
import { OrgUserListInput } from "../OrgUserListInput";
import { splitListTokens } from "../listInput";
import { OrgUserTypeahead } from "../OrgUserTypeahead";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import type { OrgDetail, OrgTeam } from "../types";
import { CollapsibleFormActions, CollapsibleFormPanel, CollapsibleFormTrigger } from "../CollapsibleForm";
import { expandableRowHeaderProps } from "../expandable-row";

function normalizeMemberList(raw: string) {
  return raw
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("; ");
}

export default function ManageTeamsPage() {
  const { orgId = "" } = useParams();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [dirtyTeamIds, setDirtyTeamIds] = useState<Set<string>>(() => new Set());
  const [creatingTeam, setCreatingTeam] = useState(false);

  function confirmDiscardTeam(teamId: string) {
    if (!dirtyTeamIds.has(teamId)) {
      return true;
    }
    return window.confirm("Discard unsaved changes to this team?");
  }

  function setTeamDirty(teamId: string, dirty: boolean) {
    setDirtyTeamIds((current) => {
      const next = new Set(current);
      if (dirty) {
        next.add(teamId);
      } else {
        next.delete(teamId);
      }
      return next;
    });
  }

  function tryExpandTeam(teamId: string | null) {
    if (expandedTeamId && expandedTeamId !== teamId && !confirmDiscardTeam(expandedTeamId)) {
      return;
    }
    if (teamId && expandedTeamId === teamId) {
      if (!confirmDiscardTeam(teamId)) {
        return;
      }
      setTeamDirty(teamId, false);
      setExpandedTeamId(null);
      return;
    }
    setExpandedTeamId(teamId);
  }

  function openCreateTeam() {
    if (expandedTeamId && !confirmDiscardTeam(expandedTeamId)) {
      return;
    }
    setCreatingTeam(true);
    setExpandedTeamId(null);
    setStatus("");
  }

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

  if (error && !detail) {
    return <p className="status">{error}</p>;
  }
  if (!detail) {
    return <p className="status">Loading teams…</p>;
  }
  if (detail.organization.role !== "org_admin") {
    return <p className="status">Only org admins can manage teams.</p>;
  }

  const teams = detail.teams ?? [];

  return (
    <OrgWorkspacePage
      eyebrow="Manage teams"
      title="Teams"
      tagline="Build crew rosters from Members & invites, then use Plan → Workbook → Placements for daily roles and stations. Changes stay on your screen until you click Save team."
      actions={
        <CollapsibleFormTrigger
          label="Create team"
          disabled={creatingTeam}
          ariaExpanded={creatingTeam}
          onClick={openCreateTeam}
        />
      }
    >
      {status ? <p className="status">{status}</p> : null}

      {creatingTeam ? (
        <CollapsibleFormPanel title="Create team">
          <TeamEditor
            key="new"
            orgId={orgId}
            onCancel={() => setCreatingTeam(false)}
            onSaved={async (teamName) => {
              setDetail(await api.organization(orgId));
              setCreatingTeam(false);
              setError("");
              setStatus(`Created team “${teamName}”.`);
            }}
            onError={(message) => {
              setError(message);
              setStatus("");
            }}
          />
        </CollapsibleFormPanel>
      ) : null}

      <section className="vbs-panel org-members">
        <h2 className="vbs-task-team-section-title">Organization teams</h2>
        {teams.length === 0 ? (
          <p className="muted vbs-task-field-hint">No teams yet. Use Create team to add your first group.</p>
        ) : (
          <ul className="vbs-task-list org-member-list">
            {teams.map((team) => (
              <TeamRow
                key={team.id}
                team={team}
                orgId={orgId}
                expanded={expandedTeamId === team.id}
                dirty={dirtyTeamIds.has(team.id)}
                onRequestToggle={() => {
                  setStatus("");
                  tryExpandTeam(expandedTeamId === team.id ? null : team.id);
                }}
                onDirtyChange={(dirty) => setTeamDirty(team.id, dirty)}
                onSaved={async (teamName) => {
                  setDetail(await api.organization(orgId));
                  setTeamDirty(team.id, false);
                  setExpandedTeamId(null);
                  setError("");
                  setStatus(`Saved “${teamName}”.`);
                }}
                onError={(message) => {
                  setError(message);
                  setStatus("");
                }}
              />
            ))}
          </ul>
        )}
      </section>
      {error ? <p className="error">{error}</p> : null}
    </OrgWorkspacePage>
  );
}

function TeamRow({
  team,
  orgId,
  expanded,
  dirty,
  onRequestToggle,
  onDirtyChange,
  onSaved,
  onError,
}: {
  team: OrgTeam;
  orgId: string;
  expanded: boolean;
  dirty: boolean;
  onRequestToggle: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (teamName: string) => void;
  onError: (message: string) => void;
}) {
  const memberCount = team.members.split(/[,;]+/).filter((s) => s.trim()).length;

  return (
    <li className={expanded ? "vbs-task-card open" : "vbs-task-card"}>
      <div {...expandableRowHeaderProps(expanded, onRequestToggle, "vbs-task-summary-header")}>
        <div className="vbs-task-summary">
          <span className="vbs-task-summary-main">
            <span className="vbs-task-summary-title">{team.name}</span>
            <span className="vbs-task-assignee-pill">{memberCount} members</span>
            {expanded && dirty ? (
              <span className="vbs-task-assignee-pill" title="Unsaved edits">
                Unsaved
              </span>
            ) : null}
          </span>
          <span className="vbs-task-summary-meta muted">
            Admin: {team.teamAdminUsername || "—"}
            {team.members ? ` · ${team.members}` : ""}
          </span>
          <span className="vbs-task-chevron" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      </div>
      {expanded ? (
        <div className="vbs-task-body">
          <p className="vbs-task-field-hint">
            <Link to={orgPath(orgId, `/team/${team.id}`)}>Open team home</Link> — tasks, schedule, and board for this
            crew.
          </p>
          <TeamEditor
            orgId={orgId}
            team={team}
            onDirtyChange={onDirtyChange}
            onCancel={onRequestToggle}
            onSaved={onSaved}
            onError={onError}
          />
        </div>
      ) : null}
    </li>
  );
}

function TeamEditor({
  orgId,
  team,
  onDirtyChange,
  onCancel,
  onSaved,
  onError,
}: {
  orgId: string;
  team?: OrgTeam;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel: () => void;
  onSaved: (teamName: string) => void;
  onError: (message: string) => void;
}) {
  const { user } = useAuth();
  const savedName = team?.name ?? "";
  const savedMembers = team?.members ?? "";
  const savedAdmin = team?.teamAdminUsername ?? user?.username ?? "";
  const [busy, setBusy] = useState(false);
  const [teamName, setTeamName] = useState(savedName);
  const [teamMembers, setTeamMembers] = useState(savedMembers);
  const [teamAdmin, setTeamAdmin] = useState(savedAdmin);

  useEffect(() => {
    setTeamName(savedName);
    setTeamMembers(savedMembers);
    setTeamAdmin(team?.teamAdminUsername ?? user?.username ?? "");
  }, [team?.id, savedName, savedMembers, team?.teamAdminUsername, user?.username]);

  const dirty = useMemo(() => {
    if (!team) {
      return teamName.trim() !== "" || teamMembers.trim() !== "" || teamAdmin.trim() !== (user?.username ?? "");
    }
    return (
      teamName.trim() !== savedName.trim() ||
      normalizeMemberList(teamMembers) !== normalizeMemberList(savedMembers) ||
      teamAdmin.trim() !== savedAdmin.trim()
    );
  }, [team, teamName, teamMembers, teamAdmin, savedName, savedMembers, savedAdmin, user?.username]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function discard() {
    setTeamName(savedName);
    setTeamMembers(savedMembers);
    setTeamAdmin(savedAdmin);
    onDirtyChange?.(false);
    onCancel();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty && team) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      const name = teamName.trim();
      const members = teamMembers.trim();
      const admin = teamAdmin.trim();
      if (!admin) {
        onError("Choose a team admin");
        return;
      }
      if (team) {
        await api.updateTeam(orgId, team.id, name, members, admin);
      } else {
        await api.createTeam(orgId, name, members, admin);
      }
      onDirtyChange?.(false);
      onSaved(name);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save team");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="vbs-task-member-form" onSubmit={(event) => void save(event)}>
      {!team ? (
        <p className="muted vbs-task-field-hint">Nothing is stored until you click Create team.</p>
      ) : (
        <p className="muted vbs-task-field-hint">
          Picking someone from search only updates this form. Click <strong>Save team</strong> to update the
          organization.
        </p>
      )}
      <label className="vbs-task-field">
        <span className="vbs-task-field-label">Team name</span>
        <input
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          required
          disabled={busy}
        />
      </label>
      <label className="vbs-task-field">
        <span className="vbs-task-field-label">Members</span>
        <OrgUserListInput
          value={teamMembers}
          onChange={setTeamMembers}
          placeholder="Search org members by name or email…"
          required
          disabled={busy}
        />
        <span className="muted vbs-task-field-hint">Separate multiple people with commas or semicolons.</span>
      </label>
      <label className="vbs-task-field">
        <span className="vbs-task-field-label">Team admin</span>
        <OrgUserTypeahead
          orgId={orgId}
          value={teamAdmin}
          onChange={setTeamAdmin}
          memberListDraft={teamMembers}
          placeholder={
            splitListTokens(teamMembers).length === 0
              ? "Add members first…"
              : "Search someone on this team…"
          }
          disabled={busy || splitListTokens(teamMembers).length === 0}
        />
        <span className="muted vbs-task-field-hint">
          Must be one of the members above (defaults to you when creating a team). Team admins can contact this team
          via Contact org &amp; teams.
        </span>
      </label>
      <CollapsibleFormActions
        onCancel={discard}
        saveLabel={busy ? "Saving…" : "Save"}
        busy={busy}
        saveDisabled={!dirty && Boolean(team)}
      />
    </form>
  );
}
