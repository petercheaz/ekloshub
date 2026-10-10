import type { WorksheetViewId } from "./vbs-plan-worksheet-views";

/** Legacy timeline columns (also used for calendar-sync import/export). */
export type TimelineColumn = "date" | "start" | "end" | "type" | "title" | "team" | "notes";

export type WorksheetCellStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type PlanWorksheetData = {
  /** Keys from {@link worksheetCellKey}. Legacy timeline keys omit the view prefix. */
  styles: Record<string, WorksheetCellStyle>;
  /** Keys from {@link worksheetRowKey} or view row keys (e.g. task:id). */
  notes: Record<string, string>;
};

export function emptyWorksheetData(): PlanWorksheetData {
  return { styles: {}, notes: {} };
}

export function worksheetRowKey(itemType: string, itemId: string) {
  return `${itemType}:${itemId}`;
}

export function worksheetCellKey(viewId: WorksheetViewId, rowKey: string, column: string) {
  return `${viewId}:${rowKey}:${column}`;
}

export function resolveCellStyle(
  data: PlanWorksheetData,
  viewId: WorksheetViewId,
  rowKey: string,
  column: string,
): WorksheetCellStyle {
  const keyed = data.styles[worksheetCellKey(viewId, rowKey, column)];
  if (keyed) {
    return keyed;
  }
  if (viewId === "timeline") {
    return data.styles[`${rowKey}:${column}`] ?? {};
  }
  return {};
}
