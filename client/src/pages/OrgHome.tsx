import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { OrgUserListInput } from "../OrgUserListInput";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import { useOrgs } from "../orgs";
import { defaultVbsPassword } from "../vbs-password";
import { inviteableRoles, orgRoleLabels } from "@org-permissions";
import type { OrgDetail, OrgMember, OrgRole } from "../types";

const roles: { id: OrgRole; label: string }[] = (
  Object.entries(orgRoleLabels) as [OrgRole, string][]
).map(([id, label]) => ({ id, label }));

function memberDisplayName(member: OrgMember) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
  return name || member.username;
}

function memberSubtitle(member: OrgMember) {
  const parts = [member.username];
  if (member.email && member.email.toLowerCase() !== member.username.toLowerCase()) {
    parts.push(member.email);
  }
  if (member.phone) {
    parts.push(member.phone);
  }
  return parts.join(" · ");
}

export default function OrgHomePage() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canAdmin, canManageMembers, refreshOrgs } = useOrgs();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<OrgRole>("org_read");
  const [emails, setEmails] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("org_read");
  const [inviteStatus, setInviteStatus] = useState("");
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

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

  async function sendInvites(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await api.inviteToOrganization(orgId, emails, inviteRole);
      setDetail(await api.organization(orgId));
      setEmails("");
      setInviteStatus(
        result.invites
          .map((invite) => `${invite.email}: keyword ${invite.keyword}`)
          .join(" · "),
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invites");
    }
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    try {
      setDetail(await api.addOrganizationMember(orgId, username, role));
      setUsername("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add member");
    }
  }

  async function removeMember(name: string) {
    try {
      setDetail(await api.removeOrganizationMember(orgId, name));
      if (expandedMember === name) {
        setExpandedMember(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member");
    }
  }

  async function onDelete() {
    if (!window.confirm(`Delete ${detail?.organization.name}? This removes organization-only content.`)) {
      return;
    }
    try {
      await api.deleteOrganization(orgId);
      await refreshOrgs();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete organization");
    }
  }

  if (error && !detail) {
    return <p className="status">{error}</p>;
  }
  if (!detail) {
    return <p className="status">Loading organization…</p>;
  }

  const canManage =
    Boolean(user?.platformAdmin) ||
    canManageMembers ||
    detail.organization.role === "org_admin" ||
    detail.organization.role === "registration_admin";
  if (!canManage) {
    return <p className="status">Only org admins or registration admins can manage members.</p>;
  }

  const org = detail.organization;
  const defaultPasswordLabel = detail.vbsDefaultPassword ?? defaultVbsPassword();
  return (
    <OrgWorkspacePage
      eyebrow="Manage organization"
      title={org.name}
      tagline={
        <>
          {org.address}
          {org.contact ? (
            <>
              <br />
              Contact: {org.contact}
            </>
          ) : null}
        </>
      }
    >
      <section className="vbs-panel org-members">
        <h2 className="vbs-task-team-section-title">Members</h2>
        <p className="muted vbs-task-field-hint">
          Expand a member to edit profile, access, and password. Default password for unset accounts:{" "}
          <strong>{defaultPasswordLabel}</strong> (VBS year: before September = this calendar year, September onward =
          next year).
        </p>
        <ul className="vbs-task-list org-member-list">
          {detail.members.map((member) => (
            <OrgMemberRow
              key={member.username}
              member={member}
              orgId={orgId}
              teams={detail.teams ?? []}
              defaultPasswordLabel={defaultPasswordLabel}
              canRemove={canManageMembers && member.username !== user?.username}
              expanded={expandedMember === member.username}
              onToggle={() =>
                setExpandedMember((current) => (current === member.username ? null : member.username))
              }
              onSaved={(next) => {
                setDetail(next);
                setError("");
              }}
              onError={(message) => setError(message)}
              onRemove={() => void removeMember(member.username)}
            />
          ))}
        </ul>
      </section>

      {canManageMembers ? (
        <form
          className="review-form share-form vbs-form-panel"
          onSubmit={(event) => void sendInvites(event)}
        >
          <h3>Invite by email</h3>
          <p className="muted vbs-task-field-hint">
            New invites default to viewer or coordinator. Promote to registration admin or org admin from Add
            member after they join.
          </p>
          <label htmlFor="invite-emails">Emails (comma or semicolon separated)</label>
          <OrgUserListInput
            id="invite-emails"
            value={emails}
            onChange={setEmails}
            preferEmail
            scopeAll
            placeholder="Type an email — suggestions from org and existing users…"
            required
          />
          <label htmlFor="invite-role">Access after they accept</label>
          <select
            id="invite-role"
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as OrgRole)}
          >
            {inviteableRoles.map((item) => (
              <option key={item} value={item}>
                {orgRoleLabels[item]}
              </option>
            ))}
          </select>
          <div className="vbs-form-actions">
            <button type="submit" className="vbs-plan-save">
              Send invite
            </button>
          </div>
          {inviteStatus ? <p className="tagline">{inviteStatus}</p> : null}
          {(detail.invitations ?? []).length > 0 ? (
            <ul className="entry-list">
              {detail.invitations.map((invite) => (
                <li key={invite.id} className="entry">
                  <div className="entry-meta">
                    <span className="author">{invite.email}</span>
                    <span className="badge">{invite.acceptedAt ? "Joined" : "Pending"}</span>
                  </div>
                  {invite.acceptedAt ? null : (
                    <p className="entry-preview">
                      Keyword {invite.keyword} · <a href={invite.link}>Invite link</a>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      ) : null}
      {canManageMembers ? (
        <form className="review-form share-form vbs-form-panel" onSubmit={(event) => void addMember(event)}>
          <h3>Add existing user</h3>
          <label htmlFor="member-username">Users (comma or semicolon separated)</label>
          <OrgUserListInput
            id="member-username"
            value={username}
            onChange={setUsername}
            placeholder="Search org members by name or email…"
            required
          />
          <label htmlFor="member-role">Access</label>
          <select id="member-role" value={role} onChange={(event) => setRole(event.target.value as OrgRole)}>
            {roles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="vbs-form-actions">
            <button type="submit" className="vbs-plan-save">
              Add member
            </button>
          </div>
        </form>
      ) : null}

      {canAdmin ? (
        <button type="button" className="ghost danger vbs-plan-save-danger" onClick={() => void onDelete()}>
          Delete organization
        </button>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </OrgWorkspacePage>
  );
}

function OrgMemberRow({
  member,
  orgId,
  teams,
  defaultPasswordLabel,
  canRemove,
  expanded,
  onToggle,
  onSaved,
  onError,
  onRemove,
}: {
  member: OrgMember;
  orgId: string;
  teams: OrgDetail["teams"];
  defaultPasswordLabel: string;
  canRemove: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSaved: (detail: OrgDetail) => void;
  onError: (message: string) => void;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(member);
  const [newPassword, setNewPassword] = useState("");
  const [resetPasswordToDefault, setResetPasswordToDefault] = useState(false);

  useEffect(() => {
    setDraft(member);
    setNewPassword("");
    setResetPasswordToDefault(false);
  }, [member]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const next = await api.updateOrganizationMember(orgId, member.username, {
        role: draft.role,
        firstName: draft.firstName,
        lastName: draft.lastName,
        phone: draft.phone,
        email: draft.email,
        verified: draft.verified,
        newPassword: resetPasswordToDefault ? "" : newPassword,
        resetPasswordToDefault,
        teamAdminTeamIds: draft.teamAdminTeamIds,
      });
      onSaved(next);
      setNewPassword("");
      setResetPasswordToDefault(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={expanded ? "vbs-task-card open" : "vbs-task-card"}>
      <button type="button" className="vbs-task-summary" aria-expanded={expanded} onClick={onToggle}>
        <span className="vbs-task-summary-main">
          <span className="vbs-task-summary-title">{memberDisplayName(member)}</span>
          <span className="vbs-task-assignee-pill">{member.role}</span>
          {member.verified ? <span className="badge verified">Verified</span> : null}
          {member.usesDefaultPassword ? (
            <span className="vbs-task-assignee-pill" title="Default VBS password">
              {defaultPasswordLabel}
            </span>
          ) : null}
        </span>
        <span className="vbs-task-summary-meta muted">{memberSubtitle(member)}</span>
        <span className="vbs-task-chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded ? (
        <div className="vbs-task-body">
          <form className="vbs-task-member-form" onSubmit={(event) => void save(event)}>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Login username</span>
              <input value={member.username} readOnly aria-readonly disabled />
              <span className="muted vbs-task-field-hint">Used to sign in; contact support to change.</span>
            </label>
            <div className="vbs-task-meta-grid">
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">First name</span>
                <input
                  value={draft.firstName}
                  onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                  autoComplete="given-name"
                  disabled={busy}
                />
              </label>
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Last name</span>
                <input
                  value={draft.lastName}
                  onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                  autoComplete="family-name"
                  disabled={busy}
                />
              </label>
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Email</span>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  autoComplete="email"
                  placeholder="Leave blank to use login@gmail.com"
                  disabled={busy}
                />
              </label>
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Phone</span>
                <input
                  type="tel"
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  autoComplete="tel"
                  placeholder="4255550100"
                  disabled={busy}
                />
              </label>
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Org access</span>
                <select
                  value={draft.role}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      role: e.target.value as OrgRole,
                      teamAdminTeamIds:
                        e.target.value === "org_team_admin" ? draft.teamAdminTeamIds : [],
                    })
                  }
                  disabled={busy}
                >
                  {roles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <span className="muted vbs-task-field-hint">
                  Team admins can contact assigned teams only. Write/read cannot use org contact.
                </span>
              </label>
            </div>
            {draft.role === "org_team_admin" ? (
              <fieldset className="share-targets vbs-task-field">
                <legend>Teams this admin can contact</legend>
                <p className="muted vbs-task-field-hint">
                  They must already be on each team&apos;s member list in Manage teams.
                </p>
                {teams.length === 0 ? <p className="muted">Create teams first under Manage teams.</p> : null}
                {teams.map((team) => (
                  <label key={team.id} className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={draft.teamAdminTeamIds.includes(team.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          teamAdminTeamIds: e.target.checked
                            ? [...draft.teamAdminTeamIds, team.id]
                            : draft.teamAdminTeamIds.filter((id) => id !== team.id),
                        })
                      }
                      disabled={busy}
                    />
                    {team.name}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="checkbox-line vbs-task-field">
              <input
                type="checkbox"
                checked={draft.verified}
                onChange={(e) => setDraft({ ...draft, verified: e.target.checked })}
                disabled={busy}
              />
              Verified account (can use org features that require verification)
            </label>
            <div className="vbs-task-meta-grid">
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (e.target.value) {
                      setResetPasswordToDefault(false);
                    }
                  }}
                  autoComplete="new-password"
                  placeholder="Leave blank to keep current"
                  disabled={busy || resetPasswordToDefault}
                />
                <span className="muted vbs-task-field-hint">
                  {member.usesDefaultPassword
                    ? `Currently using default (${defaultPasswordLabel}).`
                    : "Custom password is set."}
                </span>
              </label>
            </div>
            <label className="checkbox-line vbs-task-field">
              <input
                type="checkbox"
                checked={resetPasswordToDefault}
                onChange={(e) => {
                  setResetPasswordToDefault(e.target.checked);
                  if (e.target.checked) {
                    setNewPassword("");
                  }
                }}
                disabled={busy}
              />
              Reset password to default ({defaultPasswordLabel})
            </label>
            <div className="vbs-task-add-actions org-member-form-actions">
              <button type="submit" className="vbs-plan-save" disabled={busy}>
                {busy ? "Saving…" : "Save member"}
              </button>
              {canRemove ? (
                <button
                  type="button"
                  className="vbs-plan-save vbs-plan-save-danger"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Remove ${memberDisplayName(member)} from this organization?`)) {
                      onRemove();
                    }
                  }}
                >
                  Remove from org
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </li>
  );
}
