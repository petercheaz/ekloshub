import { normalizePrayerSchedule } from "./vbs-prayer-schedule";
import { normalizeScheduleMatrix } from "./vbs-schedule-matrix";
import type { WorksheetViewId } from "./vbs-plan-worksheet-views";

/** Legacy timeline columns (also used for calendar-sync import/export). */
export type TimelineColumn = "date" | "start" | "end" | "type" | "title" | "team" | "notes";

export type WorksheetCellStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type VolunteerTimelineRow = {
  date: string;
  time: string;
  description: string;
  who: string;
  location: string;
};

export type PrayerRequestRow = {
  name: string;
  request: string;
};

/** Cornerstone “Prayer” sheet — daily prayer pairs. */
export type PrayerScheduleRow = {
  id?: string;
  person1: string;
  person2: string;
  person3: string;
  prayDate: string;
  /** When true, assigned volunteers get a reminder before {@link notifyMinutesBefore}. */
  notifyEnabled?: boolean;
  notifyMinutesBefore?: number;
};

export type StationNeedsSide = {
  /** Plan rotation station linked from the Stations tab. */
  stationId?: string;
  stationLabel: string;
  volunteersNeeded: string;
  roomSupplies: string;
};

export type StationNeedsRow = {
  preschool: StationNeedsSide;
  elementary: StationNeedsSide;
};

export type VolunteerPlacementRow = {
  roleLabel: string;
  assignmentsByDate: Record<string, string>;
};

export type VolunteerPlacementsData = {
  dayDates: string[];
  rows: VolunteerPlacementRow[];
};

export type ScheduleMatrixColumn = {
  id: string;
  label: string;
};

export type ScheduleMatrixRow = {
  time: string;
  cells: Record<string, string>;
};

export type ScheduleMatrixData = {
  columns: ScheduleMatrixColumn[];
  rows: ScheduleMatrixRow[];
};

/** @deprecated Stored on older plans before dynamic columns. */
export type LegacyScheduleMatrixRow = {
  time: string;
  preschool: string;
  elementary: string;
  rotationF: string;
  rotationG: string;
  rotationH: string;
};

export type PlanWorksheetData = {
  /** Keys from {@link worksheetCellKey}. Legacy timeline keys omit the view prefix. */
  styles: Record<string, WorksheetCellStyle>;
  /** Keys from {@link worksheetRowKey} or view row keys (e.g. task:id). */
  notes: Record<string, string>;
  /** Cornerstone-style volunteer calendar rows for Excel export. */
  volunteerTimeline?: VolunteerTimelineRow[];
  /** Legacy prayer list (superseded by {@link prayerSchedule}). */
  prayer?: PrayerRequestRow[];
  /** Cornerstone “Prayer” sheet rows. */
  prayerSchedule?: PrayerScheduleRow[];
  /** Cornerstone “Volunteer Placements” grid. */
  volunteerPlacements?: VolunteerPlacementsData;
  /** Cornerstone “Station Needs” dual-column layout. */
  stationNeeds?: StationNeedsRow[];
  /** Cornerstone “Schedule” rotation matrix (legacy array rows migrate on load). */
  scheduleMatrix?: ScheduleMatrixData;
  /** Freeform post-event notes keyed by timeline row key. */
  postEventNotes?: Record<string, string>;
  /** Notes for next year (multi-line). */
  notesForNextYear?: string;
};

export function emptyWorksheetData(): PlanWorksheetData {
  return { styles: {}, notes: {} };
}

export function normalizePlanWorksheetData(raw: unknown): PlanWorksheetData {
  if (!raw || typeof raw !== "object") {
    return emptyWorksheetData();
  }
  const value = raw as PlanWorksheetData;
  return {
    styles: value.styles ?? {},
    notes: value.notes ?? {},
    volunteerTimeline: value.volunteerTimeline,
    prayer: value.prayer,
    prayerSchedule: normalizePrayerSchedule(value.prayerSchedule),
    volunteerPlacements: value.volunteerPlacements,
    stationNeeds: value.stationNeeds,
    scheduleMatrix: normalizeScheduleMatrix(value.scheduleMatrix),
    postEventNotes: value.postEventNotes,
    notesForNextYear: value.notesForNextYear,
  };
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
