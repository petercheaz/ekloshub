export const SNACK_MENU_DAYS = [
  { id: "mon", label: "Monday", heading: "Monday" },
  { id: "tue", label: "Tuesday", heading: "Tuesday" },
  { id: "wed", label: "Wednesday", heading: "Wednesday" },
  { id: "thu", label: "Thursday", heading: "Thursday" },
  { id: "fri", label: "Friday", heading: "Friday" },
] as const;

export type SnackMenuDayId = (typeof SNACK_MENU_DAYS)[number]["id"];

export type SnackDayMode = "keep" | "regenerate";

const headingPattern = /^##\s*(Monday|Tuesday|Wednesday|Thursday|Friday)\s*$/gim;

export function parseSnacksMenuByDay(menuText: string): Record<SnackMenuDayId, string> {
  const empty = (): Record<SnackMenuDayId, string> => ({
    mon: "",
    tue: "",
    wed: "",
    thu: "",
    fri: "",
  });
  const trimmed = menuText.trim();
  if (!trimmed) {
    return empty();
  }
  const matches = [...trimmed.matchAll(headingPattern)];
  if (matches.length === 0) {
    return empty();
  }
  const result = empty();
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]!;
    const name = match[1]!.toLowerCase();
    const id = SNACK_MENU_DAYS.find((day) => day.heading.toLowerCase() === name)?.id;
    if (!id) {
      continue;
    }
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : trimmed.length;
    result[id] = trimmed.slice(start, end).trim();
  }
  return result;
}

export function mergeSnacksMenu(days: Record<SnackMenuDayId, string>) {
  return SNACK_MENU_DAYS.map((day) => {
    const body = days[day.id].trim();
    if (!body) {
      return "";
    }
    return `## ${day.heading}\n\n${body}`;
  })
    .filter(Boolean)
    .join("\n\n");
}

export function normalizeRegenerateDays(input: unknown): SnackMenuDayId[] {
  if (!Array.isArray(input)) {
    return [...SNACK_MENU_DAYS.map((d) => d.id)];
  }
  const allowed = new Set<SnackMenuDayId>(SNACK_MENU_DAYS.map((d) => d.id));
  const picked = input.filter((item): item is SnackMenuDayId => typeof item === "string" && allowed.has(item as SnackMenuDayId));
  return picked.length > 0 ? picked : [...SNACK_MENU_DAYS.map((d) => d.id)];
}
