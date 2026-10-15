import { FormEvent, useCallback, useEffect, useState } from "react";
import { orgMemberFocusElementId, scrollDetailIntoView } from "../scroll-detail-into-view";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { orgPath } from "../orgs";
import { api } from "../api";
import { useAuth } from "../auth";
import { OrgUserListInput } from "../OrgUserListInput";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import { useOrgs } from "../orgs";
import { defaultVbsPassword } from "../vbs-password";
import { inviteableRoles, orgRoleLabels } from "@org-permissions";
import type { OrgDetail, OrgMember, OrgRole } from "../types";
import { CollapsibleForm, CollapsibleFormTrigger } from "../CollapsibleForm";
import { expandableRowHeaderProps } from "../expandable-row";

const roles: { id: OrgRole; label: string }[] = (
  Object.entries(orgRoleLabels) as [OrgRole, string][]
).map(([id, label]) => ({ id, label }));

function memberDisplayName(member: OrgMember) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
  return name || member.username;
}

function memberSubtitle(member: OrgMember, activeVbsYear: number) {
  const parts = [member.username];
  if (member.email && member.email.toLowerCase() !== member.username.toLowerCase()) {
    parts.push(member.email);
  }
  if (member.phone) {
    parts.push(member.phone);
  }
  parts.push(`VBS ${member.vbsSeasonYear}`);
  if (member.removedAt) {
    parts.push("Past member");
  } else if (member.vbsSeasonYear !== activeVbsYear) {
    parts.push("Prior season");
  }
  return parts.join(" · ");
}

export default function OrgHomePage() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [memberForm, setMemberForm] = useState<"invite" | "add" | null>(null);

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

  const focusMember = useCallback(
    (username: string | null, options?: { syncUrl?: boolean }) => {
      setExpandedMember(username);
      if (username) {
        setMemberForm(null);
      }
      if (options?.syncUrl === false) {
        return;
      }
      const params = new URLSearchParams(searchParams);
      if (username) {
        params.set("member", username);
      } else {
        params.delete("member");
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (!detail) {
      return;
    }
    const username = searchParams.get("member")?.trim();
    if (!username) {
      return;
    }
    if (!detail.members.some((member) => member.username === username)) {
      return;
    }
    focusMember(username, { syncUrl: false });
  }, [searchParams, detail, focusMember]);

  useEffect(() => {
    if (!expandedMember) {
      return;
    }
    scrollDetailIntoView(document.getElementById(orgMemberFocusElementId(expandedMember)));
  }, [expandedMember]);

  async function sendInvites(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await api.inviteToOrganization(orgId, emails, inviteRole);
      setDetail(await api.organization(orgId));
      setEmails("");
      setMemberForm(null);
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
      setMemberForm(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add member");
    }
  }

  async function removeMember(name: string) {
    try {
      setDetail(await api.removeOrganizationMember(orgId, name));
      if (expandedMember === name) {
        focusMember(null);
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
          Volunteers and staff from your planning workbook belong here — not on the student registration roster.
          Assign them to <Link to={orgPath(orgId, "/teams")}>teams</Link>, then place them in roles on the{" "}
          <Link to={orgPath(orgId, "/vbs-plan?tab=workbook&workbook=placements")}>plan workbook · Placements</Link>{" "}
          tab.
          Active season: <strong>VBS {detail.activeVbsYear}</strong>. Default password for unset accounts:{" "}
          <strong>{defaultPasswordLabel}</strong>.
        </p>
        <ul className="vbs-task-list org-member-list">
          {detail.members.map((member) => (
            <OrgMemberRow
              key={member.username}
              member={member}
              orgId={orgId}
              teams={detail.teams ?? []}
              activeVbsYear={detail.activeVbsYear}
              canEditSeason={
                Boolean(user?.platformAdmin) || detail.organization.role === "org_admin"
              }
              defaultPasswordLabel={defaultPasswordLabel}
              canRemove={canManageMembers && member.username !== user?.username}
              expanded={expandedMember === member.username}
              onToggle={() =>
                focusMember(expandedMember === member.username ? null : member.username)
              }
              onSaved={(next) => {
                setDetail(next);
                focusMember(null);
                setError("");
              }}
              onError={(message) => setError(message)}
              onRemove={() => void removeMember(member.username)}
            />
          ))}
        </ul>
      </section>

      {canManageMembers ? (
        <div className="vbs-registration-form-head org-members-form-triggers">
          <CollapsibleFormTrigger
            label="Send invite"
            ariaExpanded={memberForm === "invite"}
            disabled={memberForm !== null && memberForm !== "invite"}
            onClick={() => setMemberForm("invite")}
          />
          <CollapsibleFormTrigger
            label="Add member"
            ariaExpanded={memberForm === "add"}
            disabled={memberForm !== null && memberForm !== "add"}
            onClick={() => setMemberForm("add")}
          />
        </div>
      ) : null}
      {memberForm === "invite" && canManageMembers ? (
        <CollapsibleForm
          title="Invite by email"
          busy={false}
          saveLabel="Save"
          onCancel={() => {
            setMemberForm(null);
            setEmails("");
          }}
          onSubmit={(event) => void sendInvites(event)}
        >
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
          {inviteStatus ? <p className="tagline">{inviteStatus}</p> : null}
        </CollapsibleForm>
      ) : null}
      {canManageMembers && (detail.invitations ?? []).length > 0 ? (
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
      {memberForm === "add" && canManageMembers ? (
        <CollapsibleForm
          title="Add existing user"
          saveLabel="Save"
          onCancel={() => {
            setMemberForm(null);
            setUsername("");
          }}
          onSubmit={(event) => void addMember(event)}
        >
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
        </CollapsibleForm>
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
  activeVbsYear,
  canEditSeason,
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
  activeVbsYear: number;
  canEditSeason: boolean;
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
        vbsSeasonYear: canEditSeason ? draft.vbsSeasonYear : undefined,
        restoreMember: canEditSeason && Boolean(member.removedAt) ? true : undefined,
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
    <li
      id={orgMemberFocusElementId(member.username)}
      className={expanded ? "vbs-task-card open" : "vbs-task-card"}
    >
      <div {...expandableRowHeaderProps(expanded, onToggle, "vbs-task-summary-header")}>
        <div className="vbs-task-summary">
          <span className="vbs-task-summary-main">
            <span className="vbs-task-summary-title">{memberDisplayName(member)}</span>
            <span className="vbs-task-assignee-pill">{member.role}</span>
            {member.verified ? <span className="badge verified">Verified</span> : null}
            {member.usesDefaultPassword ? (
              <span className="vbs-task-assignee-pill" title="Default VBS password">
                {defaultPasswordLabel}
              </span>
            ) : null}
            {member.removedAt ? <span className="vbs-task-assignee-pill">Past</span> : null}
            {!member.removedAt && member.vbsSeasonYear !== activeVbsYear ? (
              <span className="vbs-task-assignee-pill">VBS {member.vbsSeasonYear}</span>
            ) : null}
          </span>
          <span className="vbs-task-summary-meta muted">{memberSubtitle(member, activeVbsYear)}</span>
          <span className="vbs-task-chevron" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      </div>

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
              {canEditSeason ? (
                <label className="vbs-task-field">
                  <span className="vbs-task-field-label">VBS season access</span>
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={draft.vbsSeasonYear}
                    onChange={(e) =>
                      setDraft({ ...draft, vbsSeasonYear: Number(e.target.value) || draft.vbsSeasonYear })
                    }
                    disabled={busy}
                  />
                  <span className="muted vbs-task-field-hint">
                    Which VBS year this person can view (non-admins). Active org season: VBS {activeVbsYear}.
                  </span>
                </label>
              ) : null}
            </div>
            {member.removedAt && canEditSeason ? (
              <p className="vbs-plan-callout vbs-plan-callout-readonly">
                Past member — save to restore access for VBS {draft.vbsSeasonYear}.
              </p>
            ) : null}
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
            <div className="vbs-collapsible-form-actions org-member-form-actions">
              <button type="button" className="ghost" disabled={busy} onClick={onToggle}>
                Cancel
              </button>
              <button type="submit" className="vbs-plan-save" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              {canRemove ? (
                <button
                  type="button"
                  className="ghost danger"
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
