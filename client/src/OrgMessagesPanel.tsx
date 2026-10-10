import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import { useMessages } from "./messages";
import { orgPath, useOrgs } from "./orgs";
import { searchOrgUsers } from "./org-user-search";
import type { DirectMessage, MessageThread, OrgTeam, UserSuggestion } from "./types";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString();
}

function MessageBody({ text }: { text: string }) {
  const parts = text.split(/(\/files\/\S+)/g);
  return (
    <div className="message-body">
      {parts.map((part, index) =>
        part.startsWith("/files/") ? (
          <img key={`${part}-${index}`} src={part} alt="" />
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </div>
  );
}

type Props = {
  /** When true, omit page chrome and use plan panel styling. */
  embedded?: boolean;
  /** Optional team list (e.g. from VBS plan workspace). */
  teams?: OrgTeam[];
};

export function OrgMessagesPanel({ embedded = false, teams: teamsProp }: Props) {
  const { user } = useAuth();
  const { refreshUnread } = useMessages();
  const { tenantId, canWrite } = useOrgs();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<OrgTeam[]>([]);
  const [teams, setTeams] = useState<OrgTeam[]>(teamsProp ?? []);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [teamSuggestions, setTeamSuggestions] = useState<OrgTeam[]>([]);
  const [composeBody, setComposeBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const selected = useMemo(
    () => threads.find((thread) => thread.threadId === selectedId) ?? null,
    [threads, selectedId],
  );

  async function loadThreads() {
    const next = await api.messageThreads();
    setThreads(next);
    await refreshUnread();
  }

  useEffect(() => {
    if (teamsProp) {
      setTeams(teamsProp);
      return;
    }
    if (!tenantId) {
      setTeams([]);
      return;
    }
    void api
      .teams()
      .then((data) => setTeams(data.teams))
      .catch(() => setTeams([]));
  }, [tenantId, teamsProp]);

  useEffect(() => {
    void loadThreads().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = recipientQuery.trim().toLowerCase();
      if (!query) {
        setSuggestions([]);
        setTeamSuggestions([]);
        return;
      }
      if (tenantId) {
        setTeamSuggestions(
          teams.filter(
            (team) =>
              team.name.toLowerCase().includes(query) && !selectedTeams.some((selected) => selected.id === team.id),
          ),
        );
      } else {
        setTeamSuggestions([]);
      }
      void searchOrgUsers(recipientQuery, { includeSelf: true })
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [recipientQuery, teams, selectedTeams, tenantId]);

  async function openThread(threadId: string) {
    setError("");
    setStatus("");
    setSelectedId(threadId);
    setMessages([]);
    const thread = await api.messageThread(threadId);
    setMessages(thread);
    if (thread.some((message) => message.unread)) {
      const marked = await api.markThreadRead(threadId);
      setMessages(marked);
    }
    await loadThreads();
  }

  async function sendNew(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.sendMessage(recipients, composeBody, selectedTeams.map((team) => team.id));
      setRecipients([]);
      setSelectedTeams([]);
      setRecipientQuery("");
      setComposeBody("");
      setStatus("Message sent.");
      await loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    }
  }

  async function reply(all: boolean) {
    if (!selectedId) {
      return;
    }
    setError("");
    try {
      await api.replyMessage(selectedId, replyBody, all);
      setReplyBody("");
      setStatus(all ? "Reply all sent." : "Reply sent.");
      await openThread(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reply");
    }
  }

  async function markUnread() {
    if (!selectedId) {
      return;
    }
    await api.markThreadUnread(selectedId);
    setStatus("Marked unread.");
    await loadThreads();
    const thread = await api.messageThread(selectedId);
    setMessages(thread);
  }

  async function removeThread() {
    if (!selectedId) {
      return;
    }
    await api.deleteThread(selectedId);
    setSelectedId(null);
    setMessages([]);
    setStatus("Conversation deleted.");
    await loadThreads();
  }

  function addRecipient(name: string) {
    if (!recipients.includes(name)) {
      setRecipients([...recipients, name]);
    }
    setRecipientQuery("");
  }

  const intro = tenantId
    ? "Search a username or team. Only members of this organization can message its teams."
    : "Only the people you add receive the message. Search usernames to add several recipients.";

  const body = (
    <div className={embedded ? "messages messages-embedded" : "messages"}>
      {embedded ? (
        <p className="muted">{intro}</p>
      ) : (
        <p className="tagline">{intro}</p>
      )}

      {error ? <p className="error">{error}</p> : null}
      {status ? <p className="status">{status}</p> : null}

      {canWrite ? (
        <form className="compose" onSubmit={(event) => void sendNew(event)}>
          <h2>New message</h2>
          <label>
            To
            <div className="recipient-field">
              {selectedTeams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className="chip"
                  onClick={() => setSelectedTeams(selectedTeams.filter((item) => item.id !== team.id))}
                >
                  Team: {team.name} ×
                </button>
              ))}
              {recipients.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="chip"
                  onClick={() => setRecipients(recipients.filter((item) => item !== name))}
                >
                  {name} ×
                </button>
              ))}
              <input
                value={recipientQuery}
                onChange={(event) => setRecipientQuery(event.target.value)}
                placeholder={tenantId ? "Type a username or team" : "Type a username"}
                autoComplete="off"
              />
            </div>
          </label>
          {teamSuggestions.length > 0 || suggestions.length > 0 ? (
            <ul className="autocomplete">
              {teamSuggestions.slice(0, 6).map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeams([...selectedTeams, team]);
                      setRecipientQuery("");
                      setTeamSuggestions([]);
                    }}
                  >
                    Team: {team.name}
                  </button>
                </li>
              ))}
              {suggestions
                .filter((hit) => !recipients.includes(hit.username))
                .slice(0, 8)
                .map((hit) => (
                  <li key={hit.username}>
                    <button type="button" onClick={() => addRecipient(hit.username)}>
                      {hit.username}
                      {hit.email && hit.email.toLowerCase() !== hit.username.toLowerCase() ? (
                        <span className="org-user-typeahead-email muted"> · {hit.email}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
            </ul>
          ) : null}
          <label>
            Message
            <textarea value={composeBody} onChange={(event) => setComposeBody(event.target.value)} rows={4} required />
          </label>
          <button type="submit">Send</button>
        </form>
      ) : null}

      <div className="inbox">
        <aside className="thread-list">
          <h2>Conversations</h2>
          {threads.length === 0 ? <p className="muted">No messages yet.</p> : null}
          {threads.map((thread) => (
            <button
              key={thread.threadId}
              type="button"
              className={`thread-item${thread.threadId === selectedId ? " selected" : ""}${thread.unread ? " unread" : ""}`}
              onClick={() => void openThread(thread.threadId)}
            >
              <strong>
                {thread.teamName
                  ? `Team: ${thread.teamName}`
                  : thread.participants.filter((name) => name !== user?.username).join(", ") || "You"}
              </strong>
              <span>{thread.latest.body}</span>
              <time>{formatWhen(thread.latest.createdAt)}</time>
            </button>
          ))}
        </aside>
        <section className="thread-view">
          {selected ? (
            <>
              <header>
                <h2>
                  {selected.teamName
                    ? `Team: ${selected.teamName}`
                    : selected.participants.filter((name) => name !== user?.username).join(", ")}
                </h2>
                <div className="thread-actions">
                  <button type="button" className="ghost" onClick={() => void markUnread()}>
                    Mark unread
                  </button>
                  <button type="button" className="ghost" onClick={() => void removeThread()}>
                    Delete
                  </button>
                </div>
              </header>
              <ol className="thread-messages">
                {messages.map((message) => (
                  <li key={message.id} className={message.from === user?.username ? "mine" : ""}>
                    <p>
                      <strong>{message.from}</strong>
                      <span> to {message.to.join(", ")}</span>
                      {message.unread ? <em> unread</em> : null}
                    </p>
                    <MessageBody text={message.body} />
                    <time>{formatWhen(message.createdAt)}</time>
                  </li>
                ))}
              </ol>
              {canWrite ? (
                <form
                  className="reply-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void reply(false);
                  }}
                >
                  <label>
                    Reply
                    <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} rows={3} required />
                  </label>
                  <div className="reply-actions">
                    <button type="submit">Reply</button>
                    <button type="button" onClick={() => void reply(true)}>
                      Reply all
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          ) : (
            <p className="muted">Select a conversation.</p>
          )}
        </section>
      </div>

      {embedded && tenantId ? (
        <p className="muted vbs-messages-full-link">
          <Link to={orgPath(tenantId, "/messages")} className="ghost">
            Open full inbox page
          </Link>
        </p>
      ) : null}
    </div>
  );

  if (embedded) {
    return <section className="vbs-panel vbs-messages-panel">{body}</section>;
  }
  return body;
}
