import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { OrgUserListInput } from "../OrgUserListInput";
import { orgPath, useOrgs } from "../orgs";
import type { OrgDetail, OrgRole } from "../types";

const roles: { id: OrgRole; label: string }[] = [
  { id: "org_admin", label: "org_admin" },
  { id: "org_write", label: "org_write" },
  { id: "org_read", label: "org_read" },
];

export default function OrgHomePage() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canAdmin, refreshOrgs, tenantId } = useOrgs();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<OrgRole>("org_read");
  const [emails, setEmails] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");

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
      const result = await api.inviteToOrganization(orgId, emails);
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

  async function changeRole(name: string, nextRole: OrgRole) {
    try {
      setDetail(await api.addOrganizationMember(orgId, name, nextRole));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change role");
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

  if (detail.organization.role !== "org_admin") {
    return <p className="status">Only org admins can manage this organization.</p>;
  }

  const org = detail.organization;
  return (
    <div className="reviews">
      <header className="page-head">
        <p className="eyebrow">Manage organization</p>
        <h1>{org.name}</h1>
        <p className="tagline">{org.address}</p>
        <p className="tagline">Contact: {org.contact}</p>
      </header>

      <nav className="org-features" aria-label="Organization">
        <Link to={orgPath(tenantId, "/reviews")}>Curriculum Reviews</Link>
        <Link to={orgPath(tenantId, "/share")}>Share VBS Resources</Link>
        <Link to={orgPath(tenantId, "/setup")}>Show Your Setup</Link>
        <Link to={orgPath(tenantId, "/messages")}>Direct Message</Link>
      </nav>

      <section className="org-members">
        <h2>Members</h2>
        <ul className="entry-list">
          {detail.members.map((member) => (
            <li key={member.username} className="entry">
              <div className="entry-meta">
                <span className="author">{member.username}</span>
                <span className="badge">{member.role}</span>
                <select
                  aria-label={`Role for ${member.username}`}
                  value={member.role}
                  onChange={(event) => void changeRole(member.username, event.target.value as OrgRole)}
                >
                  {roles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {canAdmin && member.username !== user?.username ? (
                  <button type="button" className="ghost" onClick={() => void removeMember(member.username)}>
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

        {canAdmin ? (
          <form className="review-form share-form" onSubmit={(event) => void sendInvites(event)}>
            <h3>Invite by email</h3>
            <p className="tagline">Invites join as org_write (can post; cannot manage members or teams).</p>
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
            <button type="submit">Send invite</button>
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
        {canAdmin ? (
          <form className="review-form share-form" onSubmit={(event) => void addMember(event)}>
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
            <button type="submit">Add member</button>
          </form>
        ) : null}

      {canAdmin ? (
        <button type="button" className="ghost danger" onClick={() => void onDelete()}>
          Delete organization
        </button>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
