import crypto from "node:crypto";

function shiftIsoYear(iso: string, yearDelta: number): string {
  const trimmed = iso.trim();
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const [year, month, day] = trimmed.split("-").map(Number);
  if (!year || !month || !day) {
    return trimmed;
  }
  return `${year + yearDelta}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

function shiftPrayerSchedule(raw: unknown, yearDelta: number): unknown {
  if (!Array.isArray(raw)) {
    return raw;
  }
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    const row = entry as LooseRecord;
    const prayDate = typeof row.prayDate === "string" ? shiftIsoYear(row.prayDate, yearDelta) : row.prayDate;
    return {
      ...row,
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : row.id,
      prayDate,
    };
  });
}

function shiftVolunteerPlacements(raw: unknown, yearDelta: number, planStart: string, planEnd: string): unknown {
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
      map.set(oldDate, shiftIsoYear(oldDate, yearDelta));
    }
    dayDates = sortDayDates([...map.values()]);
    const shiftedRows = rows.map((entry) => {
      if (!entry || typeof entry !== "object") {
        return entry;
      }
      const row = entry as { roleLabel?: string; assignmentsByDate?: Record<string, string> };
      const oldCells = row.assignmentsByDate ?? {};
      const cells: Record<string, string> = {};
      for (const [oldDate, newDate] of map.entries()) {
        cells[newDate] = oldCells[oldDate] ?? oldCells[newDate] ?? "";
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

function shiftVolunteerTimeline(raw: unknown, yearDelta: number): unknown {
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
    return { ...row, date: shiftIsoYear(row.date, yearDelta) };
  });
}

/** Shift date-bearing workbook fields when copying a VBS season to a new year. */
export function shiftPlanWorksheetForSeasonCopy(
  worksheetData: unknown,
  yearDelta: number,
  planStart: string,
  planEnd: string,
): Record<string, unknown> {
  if (!worksheetData || typeof worksheetData !== "object" || Array.isArray(worksheetData)) {
    return {};
  }
  const source = worksheetData as Record<string, unknown>;
  return {
    ...source,
    prayerSchedule: shiftPrayerSchedule(source.prayerSchedule, yearDelta),
    volunteerPlacements: shiftVolunteerPlacements(source.volunteerPlacements, yearDelta, planStart, planEnd),
    volunteerTimeline: shiftVolunteerTimeline(source.volunteerTimeline, yearDelta),
  };
}
