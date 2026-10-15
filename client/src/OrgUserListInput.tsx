import { useEffect, useId, useState } from "react";
import { completeListToken, currentListToken, splitListTokens } from "./listInput";
import { memberDisplayName } from "./org-member-display";
import { pickExactOrgUser, searchOrgUsers, suggestionToken } from "./org-user-search";
import type { UserSuggestion } from "./types";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Show email in dropdown and prefer email when picking (invite lists). */
  preferEmail?: boolean;
  scopeAll?: boolean;
  includeSelf?: boolean;
};

function takenTokens(value: string) {
  return new Set(splitListTokens(value).map((item) => item.toLowerCase()));
}

function filterHits(
  hits: UserSuggestion[],
  taken: Set<string>,
  preferEmail: boolean,
) {
  return hits.filter((hit) => {
    const username = hit.username.toLowerCase();
    const email = hit.email?.trim().toLowerCase() ?? "";
    if (taken.has(username)) {
      return false;
    }
    if (email && taken.has(email)) {
      return false;
    }
    if (preferEmail && !email && !username.includes("@")) {
      return false;
    }
    return true;
  });
}

export function OrgUserListInput({
  id,
  value,
  onChange,
  rows = 3,
  placeholder = "Search org members…",
  required = false,
  disabled = false,
  preferEmail = false,
  scopeAll = false,
  includeSelf = true,
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);

  useEffect(() => {
    if (disabled) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const query = currentListToken(value);
      if (!query) {
        setSuggestions([]);
        return;
      }
      const taken = takenTokens(value);
      void searchOrgUsers(query, { scopeAll, includeSelf })
        .then((hits) => setSuggestions(filterHits(hits, taken, preferEmail).slice(0, 12)))
        .catch(() => setSuggestions([]));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [value, disabled, scopeAll, includeSelf, preferEmail]);

  function pick(hit: UserSuggestion) {
    const token = suggestionToken(hit, preferEmail);
    onChange(completeListToken(value, token));
    setOpen(false);
  }

  function tryCompletePartial() {
    const query = currentListToken(value);
    if (!query || suggestions.length === 0) {
      return;
    }
    const exact = pickExactOrgUser(suggestions, query);
    if (exact) {
      pick(exact);
      return;
    }
    if (suggestions.length === 1) {
      pick(suggestions[0]);
    }
  }

  const showList = open && suggestions.length > 0 && !disabled;

  return (
    <div className="org-user-list-input">
      <textarea
        id={id}
        rows={rows}
        value={value}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            tryCompletePartial();
            setOpen(false);
          }, 180);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && suggestions.length > 0) {
            e.preventDefault();
            const exact = pickExactOrgUser(suggestions, currentListToken(value));
            pick(exact ?? suggestions[0]);
          }
          if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showList ? (
        <ul className="autocomplete org-user-typeahead-list" id={listId} role="listbox">
          {suggestions.map((hit) => {
            const token = suggestionToken(hit, preferEmail);
            return (
              <li key={hit.username} role="option">
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(hit)}>
                  {preferEmail ? token : memberDisplayName(hit)}
                  {!preferEmail && hit.username.toLowerCase() !== memberDisplayName(hit).toLowerCase() ? (
                    <span className="org-user-typeahead-email muted"> · {hit.username}</span>
                  ) : null}
                  {hit.email && hit.email.toLowerCase() !== hit.username.toLowerCase() && !preferEmail ? (
                    <span className="org-user-typeahead-email muted"> · {hit.email}</span>
                  ) : null}
                  {preferEmail && hit.email && hit.username.toLowerCase() !== hit.email.toLowerCase() ? (
                    <span className="org-user-typeahead-email muted"> · {hit.username}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
