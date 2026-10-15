import { REMINDER_OFFSETS } from "./vbs-plan-calendar";
import type { PrayerScheduleRow } from "./vbs-worksheet-types";

export const PRAYER_NOTIFY_WHEN_OPTIONS = REMINDER_OFFSETS;

export function defaultPrayerNotifyMinutesBefore() {
  return 1440;
}

export function newPrayerScheduleRow(): PrayerScheduleRow {
  return {
    id: crypto.randomUUID(),
    person1: "",
    person2: "",
    person3: "",
    prayDate: "",
    notifyEnabled: false,
    notifyMinutesBefore: defaultPrayerNotifyMinutesBefore(),
  };
}

export function normalizePrayerScheduleRow(row: PrayerScheduleRow): PrayerScheduleRow {
  const minutes = row.notifyMinutesBefore ?? defaultPrayerNotifyMinutesBefore();
  const allowed = PRAYER_NOTIFY_WHEN_OPTIONS.some((opt) => opt.minutes === minutes);
  return {
    ...row,
    id: row.id?.trim() || crypto.randomUUID(),
    notifyEnabled: row.notifyEnabled === true,
    notifyMinutesBefore: allowed ? minutes : defaultPrayerNotifyMinutesBefore(),
  };
}

export function normalizePrayerSchedule(rows: PrayerScheduleRow[] | undefined): PrayerScheduleRow[] {
  return (rows ?? []).map(normalizePrayerScheduleRow);
}

export function prayerNotifyWhenLabel(minutes: number | undefined) {
  const hit = PRAYER_NOTIFY_WHEN_OPTIONS.find((opt) => opt.minutes === minutes);
  return hit?.label ?? PRAYER_NOTIFY_WHEN_OPTIONS[PRAYER_NOTIFY_WHEN_OPTIONS.length - 1]!.label;
}
