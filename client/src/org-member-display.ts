import type { UserSuggestion } from "./types";

export function memberDisplayName(hit: Pick<UserSuggestion, "firstName" | "lastName" | "username">) {
  const name = [hit.firstName, hit.lastName].filter(Boolean).join(" ").trim();
  return name || hit.username;
}
