import { randomUUID } from "node:crypto";
import { db } from "./db/pool.js";
import { REMINDER_OFFSETS_MINUTES } from "./vbs-calendar.js";

const PRAYER_DEFAULT_TIME = "08:00";

export type WorksheetPrayerRow = {
  id?: string;
  person1?: string;
  person2?: string;
  person3?: string;
  prayDate?: string;
  notifyEnabled?: boolean;
  notifyMinutesBefore?: number;
};

function assignmentLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function displayName(firstName: string | null, lastName: string | null, username: string) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || username;
}

async function usernamesForPrayerNames(orgId: string, names: string[]): Promise<string[]> {
  if (names.length === 0) {
    return [];
  }
  const result = await db().query<{ username: string; first_name: string | null; last_name: string | null }>(
    `SELECT u.username, u.first_name, u.last_name
     FROM organization_members om
     JOIN users u ON u.username = om.username
     WHERE om.organization_id = $1 AND om.removed_at IS NULL`,
    [orgId],
  );
  const found = new Set<string>();
  for (const rawName of names) {
    const lower = rawName.toLowerCase();
    for (const member of result.rows) {
      const display = displayName(member.first_name, member.last_name, member.username);
      if (display.toLowerCase() === lower || member.username.toLowerCase() === lower) {
        found.add(member.username);
      }
    }
  }
  return [...found];
}

function prayerVolunteerNames(row: WorksheetPrayerRow): string[] {
  return [
    ...assignmentLines(row.person1 ?? ""),
    ...assignmentLines(row.person2 ?? ""),
    ...assignmentLines(row.person3 ?? ""),
  ];
}

export function parsePrayerSchedule(raw: unknown): WorksheetPrayerRow[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((row) => row && typeof row === "object") as WorksheetPrayerRow[];
}

export function prayerEventAt(prayDate: string): Date | null {
  const trimmed = prayDate.trim();
  if (!trimmed) {
    return null;
  }
  const at = new Date(`${trimmed}T${PRAYER_DEFAULT_TIME}:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

export async function syncPrayerReminders(orgId: string, prayerSchedule: unknown) {
  const allowed = new Set<number>(REMINDER_OFFSETS_MINUTES);
  const rows = parsePrayerSchedule(prayerSchedule);

  await db().query(`DELETE FROM vbs_calendar_reminders WHERE organization_id = $1 AND item_type = 'prayer'`, [
    orgId,
  ]);

  for (const row of rows) {
    if (!row.notifyEnabled || !row.id?.trim() || !row.prayDate?.trim()) {
      continue;
    }
    const minutes = row.notifyMinutesBefore ?? 1440;
    if (!allowed.has(minutes)) {
      continue;
    }
    if (!prayerEventAt(row.prayDate)) {
      continue;
    }
    const names = prayerVolunteerNames(row);
    const usernames = await usernamesForPrayerNames(orgId, names);
    for (const username of usernames) {
      const prefs = await db().query<{ notify_email: boolean; notify_sms: boolean }>(
        `SELECT notify_email, notify_sms FROM organization_members WHERE organization_id = $1 AND username = $2`,
        [orgId, username],
      );
      const pref = prefs.rows[0];
      await db().query(
        `INSERT INTO vbs_calendar_reminders (
           id, organization_id, username, item_type, item_id, minutes_before, notify_email, notify_sms
         ) VALUES ($1,$2,$3,'prayer',$4,$5,$6,$7)
         ON CONFLICT (organization_id, username, item_type, item_id, minutes_before) DO UPDATE SET
           notify_email = EXCLUDED.notify_email,
           notify_sms = EXCLUDED.notify_sms,
           fired_at = NULL`,
        [
          randomUUID(),
          orgId,
          username,
          row.id.trim(),
          minutes,
          pref?.notify_email ?? true,
          pref?.notify_sms ?? false,
        ],
      );
    }
  }
}

export function prayerReminderTitle(row: WorksheetPrayerRow | undefined) {
  if (!row) {
    return "VBS prayer";
  }
  const names = prayerVolunteerNames(row);
  const date = row.prayDate?.trim();
  if (names.length && date) {
    return `VBS prayer (${date}): ${names.join(", ")}`;
  }
  if (date) {
    return `VBS prayer on ${date}`;
  }
  return "VBS prayer assignment";
}
