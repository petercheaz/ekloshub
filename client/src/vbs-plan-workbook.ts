export type WorkbookSectionId =
  | "prayer"
  | "placements"
  | "stations"
  | "schedule"
  | "timeline"
  | "notes";

export const WORKBOOK_SECTIONS: { id: WorkbookSectionId; label: string; hint: string }[] = [
  {
    id: "prayer",
    label: "Prayer",
    hint: "Assign volunteers, set Date to pray, and optionally Send notification with timing (matches calendar reminders). Save workbook to schedule reminders.",
  },
  {
    id: "placements",
    label: "Placements",
    hint: "Drag volunteers into each day under each role. Edit day dates in the header, delete columns with ×, or Add day (Volunteer Placements sheet).",
  },
  {
    id: "stations",
    label: "Station needs",
    hint: "Preschool and elementary supplies side by side (Station Needs sheet).",
  },
  {
    id: "schedule",
    label: "Schedule",
    hint: "Rotation matrix by time — edit column headings in place, add columns, and fill cells (Schedule sheet).",
  },
  {
    id: "timeline",
    label: "Volunteer timeline",
    hint: "Pre-VBS volunteer calendar (VolunteerTimeline sheet).",
  },
  { id: "notes", label: "Notes", hint: "Notes for next year — one line per row in export." },
];

const WORKBOOK_SECTION_IDS = new Set(WORKBOOK_SECTIONS.map((s) => s.id));

export function workbookSectionFromSearch(params: URLSearchParams): WorkbookSectionId {
  const raw = params.get("workbook");
  if (raw && WORKBOOK_SECTION_IDS.has(raw as WorkbookSectionId)) {
    return raw as WorkbookSectionId;
  }
  return "prayer";
}

export function workbookSectionMeta(id: WorkbookSectionId) {
  return WORKBOOK_SECTIONS.find((section) => section.id === id) ?? WORKBOOK_SECTIONS[0]!;
}
