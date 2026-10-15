import { api } from "./api";
import { memberDisplayName } from "./org-member-display";
import type { UserSuggestion } from "./types";

export type OrgUserSearchOptions = {
  /** Search all platform users (e.g. invites). Default: org members only via tenant header. */
  scopeAll?: boolean;
  includeSelf?: boolean;
};

export async function searchOrgUsers(query: string, options: OrgUserSearchOptions = {}) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [] as UserSuggestion[];
  }
  return api.searchUsers(trimmed, {
    all: options.scopeAll,
    includeSelf: options.includeSelf ?? true,
  });
}

export function pickExactOrgUser(hits: UserSuggestion[], needle: string) {
  const lower = needle.trim().toLowerCase();
  if (!lower) {
    return null;
  }
  return (
    hits.find((hit) => {
      if (hit.username.toLowerCase() === lower) {
        return true;
      }
      if (hit.email && hit.email.toLowerCase() === lower) {
        return true;
      }
      return memberDisplayName(hit).toLowerCase() === lower;
    }) ?? null
  );
}

export function suggestionToken(hit: UserSuggestion, preferEmail: boolean) {
  if (preferEmail) {
    return hit.email?.trim() || hit.username;
  }
  return hit.username;
}

/** Workbook placements and prayer rows use display names like the Excel sheet. */
export function workbookMemberToken(hit: UserSuggestion) {
  return memberDisplayName(hit);
}
