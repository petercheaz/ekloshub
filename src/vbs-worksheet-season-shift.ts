import crypto from "node:crypto";

function parseIsoUtc(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    return null;
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function isoDayOffset(fromIso: string, toIso: string) {
  const from = parseIsoUtc(fromIso);
  const to = parseIsoUtc(toIso);
  if (from === null || to === null) {
    return null;
  }
  return Math.round((to - from) / 86_400_000);
}

export function addIsoDays(iso: string, days: number) {
  const from = parseIsoUtc(iso);
  if (from === null) {
    return iso;
  }
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Move a date by the same day-of-week offset it had from the source start. */
export function shiftIsoRelativeToStart(iso: string, sourceStart: string, newStart: string) {
  const offset = isoDayOffset(sourceStart, iso);
  if (offset === null) {
    return iso;
  }
  return addIsoDays(newStart, offset);
}

/** Same month/day in `year`, then nudge so the weekday matches the source date. */
export function sameWeekdayInYear(iso: string, year: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match || !Number.isInteger(year) || year < 2000) {
    return iso;
  }
  const target = `${year}-${match[2]}-${match[3]}`;
  const sourceUtc = parseIsoUtc(iso);
  const targetUtc = parseIsoUtc(target);
  if (sourceUtc === null || targetUtc === null) {
    return target;
  }
  const sourceDow = new Date(sourceUtc).getUTCDay();
  const targetDow = new Date(targetUtc).getUTCDay();
  return addIsoDays(target, sourceDow - targetDow);
}

function defaultPlacementDayDates(planStart: string, planEnd: string): string[] {
  if (!planStart || !planEnd) {
    return [];
  }
  const dates: string[] = [];
  const start = new Date(`${planStart}T12:00:00`);
  const end = new Date(`${planEnd}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }
  for (let cursor = start; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function sortDayDates(dayDates: string[]) {
  return [...dayDates].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

type LooseRecord = Record<string, unknown>;

function shiftDateString(iso: string, sourceStart: string, newStart: string) {
  if (!sourceStart || !newStart) {
    return iso;
  }
  return shiftIsoRelativeToStart(iso, sourceStart, newStart);
}

function shiftPrayerSchedule(raw: unknown, sourceStart: string, newStart: string): unknown {
  if (!Array.isArray(raw)) {
    return raw;
  }
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    const row = entry as LooseRecord;
    const prayDate =
      typeof row.prayDate === "string" ? shiftDateString(row.prayDate, sourceStart, newStart) : row.prayDate;
    return {
      ...row,
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : row.id,
      prayDate,
    };
  });
}

function shiftVolunteerPlacements(
  raw: unknown,
  sourceStart: string,
  newStart: string,
  planStart: string,
  planEnd: string,
): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const data = raw as { dayDates?: unknown; rows?: unknown };
  const rows = Array.isArray(data.rows) ? data.rows : [];
  let dayDates = Array.isArray(data.dayDates)
    ? data.dayDates.filter((d): d is string => typeof d === "string" && Boolean(d.trim()))
    : [];

  if (dayDates.length === 0) {
    dayDates = defaultPlacementDayDates(planStart, planEnd);
  } else {
    const map = new Map<string, string>();
    for (const oldDate of dayDates) {
      map.set(oldDate, shiftDateString(oldDate, sourceStart, newStart));
    }
    dayDates = sortDayDates([...map.values()]);
    const shiftedRows = rows.map((entry) => {
      if (!entry || typeof entry !== "object") {
        return entry;
      }
      const row = entry as { roleLabel?: string; assignmentsByDate?: Record<string, string> };
      const oldCells = row.assignmentsByDate ?? {};
      const cells: Record<string, string> = {};
      for (const [oldDate, mapped] of map.entries()) {
        cells[mapped] = oldCells[oldDate] ?? oldCells[mapped] ?? "";
      }
      for (const date of dayDates) {
        if (cells[date] === undefined) {
          cells[date] = "";
        }
      }
      return { ...row, assignmentsByDate: cells };
    });
    return { dayDates, rows: shiftedRows };
  }

  const emptyDates = Object.fromEntries(dayDates.map((date) => [date, ""]));
  const normalizedRows = rows.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    const row = entry as { roleLabel?: string; assignmentsByDate?: Record<string, string> };
    return {
      ...row,
      assignmentsByDate: { ...emptyDates, ...(row.assignmentsByDate ?? {}) },
    };
  });
  return { dayDates, rows: normalizedRows };
}

function shiftVolunteerTimeline(raw: unknown, sourceStart: string, newStart: string): unknown {
  if (!Array.isArray(raw)) {
    return raw;
  }
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    const row = entry as { date?: string };
    if (typeof row.date !== "string" || !row.date.trim()) {
      return entry;
    }
    return { ...row, date: shiftDateString(row.date, sourceStart, newStart) };
  });
}

/** Shift date-bearing workbook fields so they keep the same weekday offset from VBS start. */
export function shiftPlanWorksheetForSeasonCopy(
  worksheetData: unknown,
  sourceStart: string,
  newStart: string,
  planEnd: string,
): Record<string, unknown> {
  if (!worksheetData || typeof worksheetData !== "object" || Array.isArray(worksheetData)) {
    return {};
  }
  const source = worksheetData as Record<string, unknown>;
  return {
    ...source,
    prayerSchedule: shiftPrayerSchedule(source.prayerSchedule, sourceStart, newStart),
    volunteerPlacements: shiftVolunteerPlacements(
      source.volunteerPlacements,
      sourceStart,
      newStart,
      newStart,
      planEnd,
    ),
    volunteerTimeline: shiftVolunteerTimeline(source.volunteerTimeline, sourceStart, newStart),
  };
}
