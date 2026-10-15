import type {
  LegacyScheduleMatrixRow,
  ScheduleMatrixColumn,
  ScheduleMatrixData,
  ScheduleMatrixRow,
} from "./vbs-worksheet-types";

const LEGACY_SCHEDULE_COLUMN_IDS = [
  "preschool",
  "elementary",
  "rotationF",
  "rotationG",
  "rotationH",
] as const;

const DEFAULT_SCHEDULE_COLUMNS: ScheduleMatrixColumn[] = [
  { id: "preschool", label: "Preschool" },
  { id: "elementary", label: "Elementary" },
  { id: "rotationF", label: "Rotation F" },
  { id: "rotationG", label: "Rotation G" },
  { id: "rotationH", label: "Rotation H" },
];

function isLegacyScheduleRow(row: unknown): row is LegacyScheduleMatrixRow {
  return (
    !!row &&
    typeof row === "object" &&
    "time" in row &&
    "preschool" in row &&
    !("cells" in row)
  );
}

function legacyRowToCells(row: LegacyScheduleMatrixRow): Record<string, string> {
  return {
    preschool: row.preschool ?? "",
    elementary: row.elementary ?? "",
    rotationF: row.rotationF ?? "",
    rotationG: row.rotationG ?? "",
    rotationH: row.rotationH ?? "",
  };
}

function isScheduleMatrixData(raw: unknown): raw is ScheduleMatrixData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  const value = raw as ScheduleMatrixData;
  return Array.isArray(value.columns) && Array.isArray(value.rows);
}

export function emptyScheduleMatrix(): ScheduleMatrixData {
  return {
    columns: DEFAULT_SCHEDULE_COLUMNS.map((column) => ({ ...column })),
    rows: [],
  };
}

export function newScheduleColumnId(existing: ScheduleMatrixColumn[]): string {
  const used = new Set(existing.map((column) => column.id));
  let index = existing.length + 1;
  let id = `column${index}`;
  while (used.has(id)) {
    index += 1;
    id = `column${index}`;
  }
  return id;
}

export function normalizeScheduleMatrix(raw: unknown): ScheduleMatrixData | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (isScheduleMatrixData(raw)) {
    const columns = raw.columns
      .filter((column) => column && typeof column.id === "string" && column.id.trim())
      .map((column) => ({
        id: column.id.trim(),
        label: typeof column.label === "string" ? column.label : column.id.trim(),
      }));
    const rows = raw.rows.map((row) => ({
      time: typeof row.time === "string" ? row.time : "",
      cells: { ...(row.cells ?? {}) },
    }));
    return { columns, rows };
  }
  if (Array.isArray(raw)) {
    const legacyRows = raw.filter(isLegacyScheduleRow);
    if (legacyRows.length === 0) {
      return { columns: DEFAULT_SCHEDULE_COLUMNS.map((column) => ({ ...column })), rows: [] };
    }
    return {
      columns: DEFAULT_SCHEDULE_COLUMNS.map((column) => ({ ...column })),
      rows: legacyRows.map((row) => ({
        time: row.time ?? "",
        cells: legacyRowToCells(row),
      })),
    };
  }
  return undefined;
}

export function blankScheduleRow(columns: ScheduleMatrixColumn[]): ScheduleMatrixRow {
  const cells: Record<string, string> = {};
  for (const column of columns) {
    cells[column.id] = "";
  }
  return { time: "", cells };
}

export function addScheduleColumn(data: ScheduleMatrixData, label?: string): ScheduleMatrixData {
  const id = newScheduleColumnId(data.columns);
  const column: ScheduleMatrixColumn = { id, label: label?.trim() || "New column" };
  return {
    columns: [...data.columns, column],
    rows: data.rows.map((row) => ({
      ...row,
      cells: { ...row.cells, [id]: "" },
    })),
  };
}

export function removeScheduleColumn(data: ScheduleMatrixData, columnId: string): ScheduleMatrixData {
  return {
    columns: data.columns.filter((column) => column.id !== columnId),
    rows: data.rows.map((row) => {
      const cells = { ...row.cells };
      delete cells[columnId];
      return { ...row, cells };
    }),
  };
}
