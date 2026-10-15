import type { PrayerScheduleRow, VolunteerPlacementRow } from "./vbs-worksheet-types";

export type WorkbookAssignmentArea = "placement" | "prayer";

export type WorkbookDragPayload =
  | { source: "pool"; name: string }
  | {
      source: "assignment";
      area: WorkbookAssignmentArea;
      name: string;
      rowIndex: number;
      field: string;
      lineIndex: number;
    };

/** @deprecated use WorkbookDragPayload */
export type WorkbookVolunteerDrag = WorkbookDragPayload;

export const WORKBOOK_MEMBER_MIME = "application/x-vbs-workbook-member";
export const WORKBOOK_DRAG_MIME = "application/x-vbs-workbook-drag";

export function assignmentLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function joinAssignmentLines(lines: string[]): string {
  return lines.join("\n");
}

export function namesMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function removeNameFromAssignments(value: string, name: string): string {
  return joinAssignmentLines(assignmentLines(value).filter((line) => !namesMatch(line, name)));
}

export function addNameToAssignments(value: string, name: string): string {
  const lines = assignmentLines(value);
  if (lines.some((line) => namesMatch(line, name))) {
    return value;
  }
  return joinAssignmentLines([...lines, name.trim()]);
}

export function reorderAssignmentLines(value: string, fromIndex: number, toIndex: number): string {
  const lines = assignmentLines(value);
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= lines.length) {
    return value;
  }
  if (toIndex < 0 || toIndex >= lines.length) {
    return value;
  }
  const next = [...lines];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return joinAssignmentLines(next);
}

export function insertNameIntoAssignments(value: string, name: string, toIndex: number): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return value;
  }
  const lines = assignmentLines(value);
  if (lines.some((line) => namesMatch(line, trimmed))) {
    return value;
  }
  const at = Math.max(0, Math.min(toIndex, lines.length));
  const next = [...lines];
  next.splice(at, 0, trimmed);
  return joinAssignmentLines(next);
}

export function writeWorkbookDrag(dataTransfer: DataTransfer, payload: WorkbookDragPayload) {
  dataTransfer.setData(WORKBOOK_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.setData(WORKBOOK_MEMBER_MIME, payload.name);
  dataTransfer.setData("text/plain", payload.name);
  dataTransfer.effectAllowed = payload.source === "pool" ? "copy" : "move";
}

function normalizeAssignmentPayload(parsed: Record<string, unknown>): WorkbookDragPayload | null {
  if (typeof parsed.name !== "string" || !parsed.name.trim()) {
    return null;
  }
  if (typeof parsed.rowIndex !== "number" || typeof parsed.field !== "string") {
    return null;
  }
  const area = parsed.area === "prayer" ? "prayer" : parsed.area === "placement" ? "placement" : null;
  if (!area) {
    return null;
  }
  return {
    source: "assignment",
    area,
    name: parsed.name.trim(),
    rowIndex: parsed.rowIndex,
    field: parsed.field,
    lineIndex: typeof parsed.lineIndex === "number" ? parsed.lineIndex : 0,
  };
}

export function readWorkbookDrag(dataTransfer: DataTransfer): WorkbookDragPayload | null {
  const raw = dataTransfer.getData(WORKBOOK_DRAG_MIME).trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed?.source === "pool" && typeof parsed.name === "string" && parsed.name.trim()) {
        return { source: "pool", name: parsed.name.trim() };
      }
      if (parsed?.source === "assignment") {
        const normalized = normalizeAssignmentPayload(parsed);
        if (normalized) {
          return normalized;
        }
      }
      if (
        parsed?.source === "placement" &&
        typeof parsed.rowIndex === "number" &&
        typeof parsed.date === "string"
      ) {
        return {
          source: "assignment",
          area: "placement",
          name: String(parsed.name).trim(),
          rowIndex: parsed.rowIndex,
          field: parsed.date,
          lineIndex: typeof parsed.lineIndex === "number" ? parsed.lineIndex : 0,
        };
      }
    } catch {
      /* fall through */
    }
  }
  const name = dataTransfer.getData(WORKBOOK_MEMBER_MIME).trim() || dataTransfer.getData("text/plain").trim();
  if (name) {
    return { source: "pool", name };
  }
  return null;
}

export function readMemberFromDrag(dataTransfer: DataTransfer): string | null {
  const payload = readWorkbookDrag(dataTransfer);
  return payload?.name ?? null;
}

function readPrayerField(row: PrayerScheduleRow, field: string): string {
  if (field === "person1") {
    return row.person1;
  }
  if (field === "person2") {
    return row.person2;
  }
  if (field === "person3") {
    return row.person3;
  }
  return "";
}

function writePrayerField(row: PrayerScheduleRow, field: string, value: string): PrayerScheduleRow {
  if (field === "person1") {
    return { ...row, person1: value };
  }
  if (field === "person2") {
    return { ...row, person2: value };
  }
  if (field === "person3") {
    return { ...row, person3: value };
  }
  return row;
}

function readCell(
  area: WorkbookAssignmentArea,
  placementRows: VolunteerPlacementRow[],
  prayerRows: PrayerScheduleRow[],
  rowIndex: number,
  field: string,
): string {
  if (area === "placement") {
    return placementRows[rowIndex]?.assignmentsByDate[field] ?? "";
  }
  const row = prayerRows[rowIndex];
  return row ? readPrayerField(row, field) : "";
}

function writeCell(
  area: WorkbookAssignmentArea,
  placementRows: VolunteerPlacementRow[],
  prayerRows: PrayerScheduleRow[],
  rowIndex: number,
  field: string,
  value: string,
): { placementRows: VolunteerPlacementRow[]; prayerRows: PrayerScheduleRow[] } {
  if (area === "placement") {
    const next = placementRows.map((row, index) =>
      index === rowIndex
        ? { ...row, assignmentsByDate: { ...row.assignmentsByDate, [field]: value } }
        : row,
    );
    return { placementRows: next, prayerRows };
  }
  const next = prayerRows.map((row, index) =>
    index === rowIndex ? writePrayerField(row, field, value) : row,
  );
  return { placementRows, prayerRows: next };
}

function mergeIntoCell(
  current: string,
  payload: WorkbookDragPayload,
  sameCell: boolean,
  toLineIndex: number | undefined,
): string {
  if (payload.source === "assignment" && sameCell) {
    if (toLineIndex === undefined) {
      return current;
    }
    return reorderAssignmentLines(current, payload.lineIndex, toLineIndex);
  }
  if (toLineIndex !== undefined) {
    return insertNameIntoAssignments(current, payload.name, toLineIndex);
  }
  return addNameToAssignments(current, payload.name);
}

export function applyWorkbookCellDrop(
  placementRows: VolunteerPlacementRow[],
  prayerRows: PrayerScheduleRow[],
  payload: WorkbookDragPayload,
  toArea: WorkbookAssignmentArea,
  toRowIndex: number,
  toField: string,
  toLineIndex?: number,
): { placementRows: VolunteerPlacementRow[]; prayerRows: PrayerScheduleRow[] } {
  let pRows = placementRows.map((row) => ({
    ...row,
    assignmentsByDate: { ...row.assignmentsByDate },
  }));
  let prRows = prayerRows.map((row) => ({ ...row }));

  const sameCell =
    payload.source === "assignment" &&
    payload.area === toArea &&
    payload.rowIndex === toRowIndex &&
    payload.field === toField;

  if (payload.source === "assignment" && !sameCell) {
    const fromValue = readCell(payload.area, pRows, prRows, payload.rowIndex, payload.field);
    const removed = removeNameFromAssignments(fromValue, payload.name);
    const fromWritten = writeCell(payload.area, pRows, prRows, payload.rowIndex, payload.field, removed);
    pRows = fromWritten.placementRows;
    prRows = fromWritten.prayerRows;
  }

  const current = readCell(toArea, pRows, prRows, toRowIndex, toField);
  const nextValue = mergeIntoCell(current, payload, sameCell, toLineIndex);
  return writeCell(toArea, pRows, prRows, toRowIndex, toField, nextValue);
}

/** @deprecated use applyWorkbookCellDrop */
export function applyPlacementDrag(
  rows: VolunteerPlacementRow[],
  payload: WorkbookDragPayload,
  toRowIndex: number,
  toDate: string,
  toLineIndex?: number,
) {
  return applyWorkbookCellDrop(rows, [], payload, "placement", toRowIndex, toDate, toLineIndex).placementRows;
}
