import { VBS_ROTATION_STATION_NAMES } from "./vbs-rotation-stations.js";

/** Default VBS daily schedule activity names (org list is seeded from this). */
export const DEFAULT_VBS_SCHEDULE_ACTIVITIES = [
  "Pre-registration",
  "Registration",
  "Songs",
  "Announcements",
  ...VBS_ROTATION_STATION_NAMES,
  "Short break 1",
  "Short break 2",
  "Closing songs",
  "Closing words",
  "Altar call",
  "Message",
  "Parent pickup",
  "Staff setup",
  "Staff debrief",
] as const;

export type VbsScheduleSlotDraft = {
  startsAt: string;
  endsAt: string;
  label: string;
};

function parseTimeToMinutes(value: string) {
  const [h, m] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return 9 * 60;
  }
  return h * 60 + m;
}

function formatMinutes(total: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, total));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type Segment = {
  label: string;
  minutes: number;
  include?: (dayIndex: number, totalDays: number) => boolean;
  outside?: "before" | "after";
};

const STAFF_SETUP_MIN = 45;
const STAFF_DEBRIEF_MIN = 30;

const PROGRAM_SEGMENTS: Segment[] = [
  { label: "Pre-registration", minutes: 15, include: (day) => day === 0 },
  { label: "Registration", minutes: 12, include: (day) => day === 0 },
  { label: "Registration", minutes: 8, include: (day) => day > 0 },
  { label: "Songs", minutes: 10 },
  { label: "Announcements", minutes: 5 },
  { label: VBS_ROTATION_STATION_NAMES[0], minutes: 25 },
  { label: "Short break 1", minutes: 5 },
  { label: VBS_ROTATION_STATION_NAMES[1], minutes: 25 },
  { label: "Short break 2", minutes: 5 },
  { label: VBS_ROTATION_STATION_NAMES[4], minutes: 12 },
  { label: VBS_ROTATION_STATION_NAMES[3], minutes: 22 },
  { label: VBS_ROTATION_STATION_NAMES[2], minutes: 25 },
  { label: "Closing songs", minutes: 8 },
  { label: "Closing words", minutes: 5 },
  { label: "Altar call", minutes: 5 },
  { label: "Message", minutes: 8 },
  { label: "Parent pickup", minutes: 10 },
];

function segmentsForDay(dayIndex: number, totalDays: number) {
  const inside: Segment[] = [];
  for (const segment of PROGRAM_SEGMENTS) {
    if (segment.outside) {
      continue;
    }
    if (segment.include && !segment.include(dayIndex, totalDays)) {
      continue;
    }
    inside.push(segment);
  }
  return inside;
}

function scaleMinutes(segments: Segment[], budget: number) {
  const total = segments.reduce((sum, s) => sum + s.minutes, 0);
  if (total <= 0 || total <= budget) {
    return segments.map((s) => s.minutes);
  }
  const factor = budget / total;
  return segments.map((s) => Math.max(3, Math.round(s.minutes * factor)));
}

/** Build timed slots for one VBS day using overview daily hours. */
export function buildVbsDayScheduleSlots(
  dailyStart: string,
  dailyEnd: string,
  dayIndex: number,
  totalDays: number,
): VbsScheduleSlotDraft[] {
  const startMin = parseTimeToMinutes(dailyStart || "09:00");
  const endMin = parseTimeToMinutes(dailyEnd || "12:00");
  const budget = Math.max(30, endMin - startMin);
  const segments = segmentsForDay(dayIndex, totalDays);
  const minutes = scaleMinutes(segments, budget);

  const slots: VbsScheduleSlotDraft[] = [];

  slots.push({
    startsAt: formatMinutes(startMin - STAFF_SETUP_MIN),
    endsAt: formatMinutes(startMin),
    label: "Staff setup",
  });

  let cursor = startMin;
  for (let i = 0; i < segments.length; i += 1) {
    const dur = minutes[i];
    const end = cursor + dur;
    slots.push({
      startsAt: formatMinutes(cursor),
      endsAt: formatMinutes(Math.min(end, endMin)),
      label: segments[i].label,
    });
    cursor = end;
  }

  slots.push({
    startsAt: formatMinutes(Math.max(cursor, endMin)),
    endsAt: formatMinutes(Math.max(cursor, endMin) + STAFF_DEBRIEF_MIN),
    label: "Staff debrief",
  });

  return slots.filter((slot) => slot.startsAt < slot.endsAt);
}

export function enumerateIsoDays(startDate: string, endDate: string) {
  if (!startDate || !endDate) {
    return [] as string[];
  }
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }
  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function buildFullVbsSchedule(
  startDate: string,
  endDate: string,
  dailyStart: string,
  dailyEnd: string,
): { dayDate: string; slots: VbsScheduleSlotDraft[] }[] {
  const days = enumerateIsoDays(startDate, endDate);
  return days.map((dayDate, dayIndex) => ({
    dayDate,
    slots: buildVbsDayScheduleSlots(dailyStart, dailyEnd, dayIndex, days.length),
  }));
}
