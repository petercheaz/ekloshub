import { useEffect, useId, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { memberDisplayName } from "./org-member-display";
import { pickExactOrgUser, searchOrgUsers, workbookMemberToken } from "./org-user-search";
import type { UserSuggestion } from "./types";

type BaseProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

function takenDisplayNames(value: string, multiline: boolean) {
  const parts = multiline ? value.split("\n") : [value];
  return new Set(parts.map((line) => line.trim().toLowerCase()).filter(Boolean));
}

function filterHits(hits: UserSuggestion[], taken: Set<string>) {
  return hits.filter((hit) => !taken.has(memberDisplayName(hit).toLowerCase()));
}

function currentNeedle(value: string, multiline: boolean) {
  if (multiline) {
    const lines = value.split("\n");
    return (lines[lines.length - 1] ?? "").trim();
  }
  return value.trim();
}

function applyPick(value: string, replacement: string, multiline: boolean) {
  if (!multiline) {
    return replacement;
  }
  const lines = value.split("\n");
  if (lines.length === 0) {
    return `${replacement}\n`;
  }
  lines[lines.length - 1] = replacement;
  return `${lines.join("\n")}\n`;
}

function MemberTypeahead({
  value,
  onChange,
  disabled,
  placeholder,
  multiline,
  rows = 3,
}: BaseProps & { multiline: boolean; rows?: number }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);

  useEffect(() => {
    if (disabled) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const query = currentNeedle(value, multiline);
      if (!query) {
        setSuggestions([]);
        return;
      }
      const taken = takenDisplayNames(value, multiline);
      void searchOrgUsers(query, { includeSelf: true })
        .then((hits) => setSuggestions(filterHits(hits, taken).slice(0, 12)))
        .catch(() => setSuggestions([]));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [value, disabled, multiline]);

  function pick(hit: UserSuggestion) {
    const token = workbookMemberToken(hit);
    onChange(applyPick(value, token, multiline));
    setOpen(false);
  }

  function tryCompletePartial() {
    const query = currentNeedle(value, multiline);
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
  const hoverTitle = value.trim() || undefined;
  const shared = {
    value,
    required: false as const,
    disabled: Boolean(disabled),
    placeholder,
    title: hoverTitle,
    autoComplete: "off" as const,
    spellCheck: false,
    "aria-expanded": showList,
    "aria-controls": showList ? listId : undefined,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value);
      setOpen(true);
    },
    onFocus: () => setOpen(true),
    onBlur: () => {
      window.setTimeout(() => {
        tryCompletePartial();
        setOpen(false);
      }, 180);
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" && !multiline && suggestions.length > 0) {
        e.preventDefault();
        const exact = pickExactOrgUser(suggestions, currentNeedle(value, multiline));
        pick(exact ?? suggestions[0]);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    },
  };

  return (
    <div className="org-user-list-input workbook-member-input">
      {multiline ? <textarea rows={rows} {...shared} /> : <input type="text" {...shared} />}
      {showList ? (
        <ul className="autocomplete org-user-typeahead-list" id={listId} role="listbox">
          {suggestions.map((hit) => (
            <li key={hit.username} role="option">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(hit)}>
                {memberDisplayName(hit)}
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

/** Single name (prayer schedule, timeline). Free text still allowed for roles like “All volunteers”. */
export function WorkbookMemberField(props: BaseProps) {
  return <MemberTypeahead {...props} multiline={false} />;
}

/** One volunteer per line (placement grid cells). Matches the Excel workbook layout. */
export function WorkbookMemberCell(props: BaseProps & { rows?: number }) {
  return <MemberTypeahead {...props} multiline rows={props.rows ?? 3} />;
}
