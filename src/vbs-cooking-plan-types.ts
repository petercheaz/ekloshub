import { SNACK_MENU_DAYS, type SnackMenuDayId } from "./vbs-snacks-menu-days.js";

export type SnackMenuItemKind = "main" | "allergy-alt";

export type SnackMenuItem = {
  id: string;
  title: string;
  details: string;
  kind: SnackMenuItemKind;
  allergyLabel: string;
};

export type CookingPlanDocument = {
  version: 1;
  strategy: "unified" | "mixed";
  strategyNote: string;
  days: Record<SnackMenuDayId, { items: SnackMenuItem[] }>;
};

export function emptyCookingPlan(): CookingPlanDocument {
  const days = {} as CookingPlanDocument["days"];
  for (const day of SNACK_MENU_DAYS) {
    days[day.id] = { items: [] };
  }
  return {
    version: 1,
    strategy: "unified",
    strategyNote: "",
    days,
  };
}

export function normalizeCookingPlan(raw: unknown): CookingPlanDocument {
  const base = emptyCookingPlan();
  if (!raw || typeof raw !== "object") {
    return base;
  }
  const doc = raw as Partial<CookingPlanDocument>;
  if (doc.strategy === "mixed" || doc.strategy === "unified") {
    base.strategy = doc.strategy;
  }
  if (typeof doc.strategyNote === "string") {
    base.strategyNote = doc.strategyNote.slice(0, 2000);
  }
  if (doc.days && typeof doc.days === "object") {
    for (const day of SNACK_MENU_DAYS) {
      const entry = (doc.days as Record<string, { items?: unknown }>)[day.id];
      if (!entry || !Array.isArray(entry.items)) {
        continue;
      }
      base.days[day.id].items = entry.items
        .map((item) => normalizeItem(item))
        .filter((item): item is SnackMenuItem => item !== null);
    }
  }
  return base;
}

function normalizeItem(raw: unknown): SnackMenuItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as Partial<SnackMenuItem>;
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (!title) {
    return null;
  }
  const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : crypto.randomUUID();
  const kind = item.kind === "allergy-alt" ? "allergy-alt" : "main";
  return {
    id,
    title: title.slice(0, 200),
    details: typeof item.details === "string" ? item.details.slice(0, 2000) : "",
    kind,
    allergyLabel: typeof item.allergyLabel === "string" ? item.allergyLabel.slice(0, 200) : "",
  };
}

export function allMenuItems(plan: CookingPlanDocument) {
  const list: { dayId: SnackMenuDayId; item: SnackMenuItem }[] = [];
  for (const day of SNACK_MENU_DAYS) {
    for (const item of plan.days[day.id].items) {
      list.push({ dayId: day.id, item });
    }
  }
  return list;
}
