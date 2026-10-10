import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useAuth } from "./auth";
import { splitListTokens } from "./listInput";
import { pickExactOrgUser, searchOrgUsers } from "./org-user-search";
import type { UserSuggestion } from "./types";

type Props = {
  orgId: string;
  value: string;
  onChange: (username: string) => void;
  onCommit?: (username: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  showAssignMe?: boolean;
  compact?: boolean;
  /** When set, only people listed in this roster (comma/semicolon list) can be chosen. */
  memberListDraft?: string;
};

function hitMatchesMemberDraft(hit: UserSuggestion, tokens: string[]) {
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (hit.username.toLowerCase() === lower) {
      return true;
    }
    if (hit.email && hit.email.toLowerCase() === lower) {
      return true;
    }
  }
  return false;
}

function filterToMemberDraft(hits: UserSuggestion[], memberListDraft?: string) {
  if (memberListDraft === undefined) {
    return hits;
  }
  const tokens = splitListTokens(memberListDraft);
  if (tokens.length === 0) {
    return [];
  }
  return hits.filter((hit) => hitMatchesMemberDraft(hit, tokens));
}

export function usernameAllowedInMemberDraft(
  username: string,
  email: string | undefined,
  memberListDraft: string,
) {
  const tokens = splitListTokens(memberListDraft);
  const lower = username.toLowerCase();
  for (const token of tokens) {
    const t = token.toLowerCase();
    if (t === lower) {
      return true;
    }
    if (email && t === email.toLowerCase()) {
      return true;
    }
  }
  return false;
}

function pickSingleHit(hits: UserSuggestion[]) {
  if (hits.length === 1) {
    return hits[0].username;
  }
  return null;
}

async function resolveOrgAssignee(needle: string) {
  const trimmed = needle.trim();
  if (!trimmed) {
    return null;
  }
  const hits = await searchOrgUsers(trimmed, { includeSelf: true });
  const exact = pickExactOrgUser(hits, trimmed);
  if (exact) {
    return exact.username;
  }
  return pickSingleHit(hits);
}

export function OrgUserTypeahead({
  orgId,
  value,
  onChange,
  onCommit,
  disabled = false,
  placeholder = "Username or email…",
  id,
  showAssignMe = true,
  compact = false,
  memberListDraft,
}: Props) {
  const { user } = useAuth();
  const listId = useId();
  const blurTimer = useRef<number | null>(null);
  const resolving = useRef(false);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!orgId || disabled) {
      setSuggestions([]);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchOrgUsers(trimmed, { includeSelf: true })
        .then((hits) => setSuggestions(filterToMemberDraft(hits, memberListDraft).slice(0, 12)))
        .catch(() => setSuggestions([]));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [query, orgId, disabled, memberListDraft]);

  function commit(username: string, email?: string) {
    if (memberListDraft !== undefined && username && !usernameAllowedInMemberDraft(username, email, memberListDraft)) {
      setQuery(value);
      return;
    }
    setQuery(username);
    onChange(username);
    onCommit?.(username);
    setOpen(false);
  }

  function clearAssignee() {
    commit("");
  }

  async function commitFromQuery() {
    const needle = query.trim();
    if (!needle) {
      if (value) {
        commit("");
      }
      return;
    }
    const exact = pickExactOrgUser(suggestions, needle);
    if (exact) {
      commit(exact.username, exact.email);
      return;
    }
    const singleUsername = pickSingleHit(suggestions);
    if (singleUsername) {
      const hit = suggestions.find((h) => h.username === singleUsername);
      commit(singleUsername, hit?.email);
      return;
    }
    if (user) {
      const lower = needle.toLowerCase();
      if (user.username.toLowerCase() === lower) {
        commit(user.username);
        return;
      }
    }
    if (resolving.current) {
      return;
    }
    resolving.current = true;
    try {
      const username = await resolveOrgAssignee(needle);
      if (
        username &&
        (memberListDraft === undefined || usernameAllowedInMemberDraft(username, undefined, memberListDraft))
      ) {
        commit(username);
        return;
      }
      setQuery(value);
    } catch {
      setQuery(value);
    } finally {
      resolving.current = false;
    }
  }

  function handleBlur() {
    blurTimer.current = window.setTimeout(() => {
      void commitFromQuery();
      setOpen(false);
    }, 180);
  }

  function handleFocus() {
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current);
    }
    setOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (blurTimer.current) {
        window.clearTimeout(blurTimer.current);
      }
      void commitFromQuery();
      return;
    }
    if (event.key === "Escape") {
      setQuery(value);
      setOpen(false);
    }
  }

  const showList = open && suggestions.length > 0 && !disabled;

  return (
    <div className={compact ? "org-user-typeahead compact" : "org-user-typeahead"}>
      <div className="org-user-typeahead-input-row">
        <input
          id={id}
          type="text"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {showAssignMe && user && !disabled ? (
          <button
            type="button"
            className="ghost org-user-typeahead-me"
            onClick={() => commit(user.username)}
          >
            Me
          </button>
        ) : null}
        {value && !disabled ? (
          <button
            type="button"
            className="ghost org-user-typeahead-clear"
            aria-label="Clear assignee"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearAssignee}
          >
            ×
          </button>
        ) : null}
      </div>
      {showList ? (
        <ul className="autocomplete org-user-typeahead-list" id={listId} role="listbox">
          {suggestions.slice(0, 12).map((hit) => (
            <li key={hit.username} role="option">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(hit.username, hit.email)}
              >
                {hit.username}
                {hit.email && hit.email.toLowerCase() !== hit.username.toLowerCase() ? (
                  <span className="org-user-typeahead-email muted"> · {hit.email}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
