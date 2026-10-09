import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { completeListToken, currentListToken, splitListTokens } from "../listInput";
import { orgPath, useOrgs } from "../orgs";
import type { OrgDetail, OrgRole, UserSuggestion } from "../types";

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
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [emailSuggestions, setEmailSuggestions] = useState<UserSuggestion[]>([]);
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = currentListToken(username);
      if (!query) {
        setSuggestions([]);
        return;
      }
      const taken = new Set(splitListTokens(username).map((item) => item.toLowerCase()));
      void api
        .searchUsers(query, { all: true })
        .then((hits) =>
          setSuggestions(
            hits.filter(
              (hit) =>
                !taken.has(hit.username.toLowerCase()) &&
                !(hit.email && taken.has(hit.email.toLowerCase())),
            ),
          ),
        )
        .catch(() => setSuggestions([]));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [username]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = currentListToken(emails);
      if (!query) {
        setEmailSuggestions([]);
        return;
      }
      const taken = new Set(splitListTokens(emails).map((item) => item.toLowerCase()));
      void api
        .searchUsers(query, { all: true })
        .then((hits) =>
          setEmailSuggestions(
            hits.filter((hit) => {
              const value = (hit.email || hit.username).toLowerCase();
              return value.includes("@") && !taken.has(value);
            }),
          ),
        )
        .catch(() => setEmailSuggestions([]));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [emails]);

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
            <label htmlFor="invite-emails">Emails (comma or semicolon separated)</label>
            <textarea
              id="invite-emails"
              rows={3}
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
              placeholder="one@church.org; two@church.org, three@church.org"
              autoComplete="off"
              required
            />
            {emailSuggestions.length > 0 ? (
              <ul className="autocomplete">
                {emailSuggestions.slice(0, 8).map((hit) => {
                  const value = hit.email || hit.username;
                  return (
                    <li key={hit.username}>
                      <button type="button" onClick={() => setEmails(completeListToken(emails, value))}>
                        {value}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
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
            <textarea
              id="member-username"
              rows={3}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="maria.santos; lily.chen, pastor.reed"
              autoComplete="off"
              required
            />
            {suggestions.length > 0 ? (
              <ul className="autocomplete">
                {suggestions.slice(0, 8).map((hit) => (
                  <li key={hit.username}>
                    <button type="button" onClick={() => setUsername(completeListToken(username, hit.username))}>
                      {hit.username}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
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
