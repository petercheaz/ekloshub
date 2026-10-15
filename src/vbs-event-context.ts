import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";
import { db } from "./db/pool.js";
import { publishers } from "./curriculum.js";

const als = new AsyncLocalStorage<{ eventId?: string }>();

export type VbsEventRow = {
  id: string;
  organization_id: string;
  year: number;
  name: string;
  publisher_id: string;
  program_title: string;
};

export function attachVbsEvent(req: Request, _res: Response, next: NextFunction) {
  const header = req.get("x-vbs-event-id")?.trim() || "";
  const query = typeof req.query.eventId === "string" ? req.query.eventId.trim() : "";
  const eventId = header || query || undefined;
  als.run({ eventId }, () => next());
}

export function requestedVbsEventId(): string | undefined {
  const id = als.getStore()?.eventId?.trim();
  return id || undefined;
}

export function parseEventId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const id = value.trim();
  return id || undefined;
}

export function publisherNameFor(publisherId: string) {
  return publishers.find((item) => item.id === publisherId)?.name ?? publisherId;
}

export function eventLabel(year: number, programTitle: string, name: string) {
  const title = programTitle.trim();
  const session = name.trim();
  const theme = title ? `${year} · ${title}` : `VBS ${year}`;
  return session ? `${theme} · ${session}` : theme;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isoDay(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  return value.toISOString().slice(0, 10);
}

function parseIsoParts(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return null;
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function sessionNameFromDates(startDate?: string | Date | null, endDate?: string | Date | null) {
  const start = parseIsoParts(isoDay(startDate));
  if (!start) {
    return "";
  }
  const startLabel = `${SHORT_MONTHS[start.month - 1]} ${start.day}`;
  const end = parseIsoParts(isoDay(endDate));
  if (!end || (end.month === start.month && end.day === start.day)) {
    return startLabel;
  }
  if (end.month === start.month) {
    return `${SHORT_MONTHS[start.month - 1]} ${start.day}–${end.day}`;
  }
  return `${startLabel}–${SHORT_MONTHS[end.month - 1]} ${end.day}`;
}

export async function uniqueEventName(
  organizationId: string,
  year: number,
  preferred: string,
  excludeEventId?: string,
) {
  const taken = await db().query<{ name: string }>(
    `SELECT name FROM vbs_events
     WHERE organization_id = $1 AND year = $2 AND ($3::text IS NULL OR id <> $3)`,
    [organizationId, year, excludeEventId ?? null],
  );
  const used = new Set(taken.rows.map((row) => row.name.trim().toLowerCase()));
  const base = preferred.trim() || "Session";
  if (!used.has(base.toLowerCase())) {
    return base;
  }
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base} (${n})`;
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `${base} ${crypto.randomUUID().slice(0, 8)}`;
}

export async function ensureEventHasUniqueName(
  organizationId: string,
  event: { id: string; year: number; name: string; program_title: string },
  dates?: { startDate?: string | Date | null; endDate?: string | Date | null },
) {
  if (event.name.trim()) {
    return event.name.trim();
  }
  const preferred =
    sessionNameFromDates(dates?.startDate, dates?.endDate) || event.program_title.trim() || "Session";
  const name = await uniqueEventName(organizationId, event.year, preferred, event.id);
  await db().query(`UPDATE vbs_events SET name = $2, updated_at = NOW() WHERE id = $1`, [event.id, name]);
  return name;
}

export async function getVbsEvent(organizationId: string, eventId: string) {
  const result = await db().query<VbsEventRow>(
    `SELECT id, organization_id, year, name, publisher_id, program_title
     FROM vbs_events WHERE organization_id = $1 AND id = $2`,
    [organizationId, eventId],
  );
  return result.rows[0] ?? null;
}

export async function getActiveVbsEvent(organizationId: string) {
  const result = await db().query<VbsEventRow>(
    `SELECT e.id, e.organization_id, e.year, e.name, e.publisher_id, e.program_title
     FROM organizations o
     JOIN vbs_events e ON e.id = o.active_vbs_event_id
     WHERE o.id = $1`,
    [organizationId],
  );
  if (result.rows[0]) {
    return result.rows[0];
  }
  const fallback = await db().query<VbsEventRow>(
    `SELECT id, organization_id, year, name, publisher_id, program_title
     FROM vbs_events WHERE organization_id = $1
     ORDER BY year DESC, name ASC
     LIMIT 1`,
    [organizationId],
  );
  return fallback.rows[0] ?? null;
}

export async function resolveRequestedVbsEvent(organizationId: string) {
  const requested = requestedVbsEventId();
  if (requested) {
    const event = await getVbsEvent(organizationId, requested);
    if (event) {
      return event;
    }
  }
  return getActiveVbsEvent(organizationId);
}

export async function seedOrgVbsEvent(organizationId: string, year: number, username?: string) {
  const id = `evt-${organizationId}-${year}`;
  await db().query(
    `INSERT INTO vbs_events (id, organization_id, year, name, publisher_id, program_title, created_at, updated_at)
     VALUES ($1,$2,$3,'','','',NOW(),NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, organizationId, year],
  );
  await db().query(
    `UPDATE organizations
     SET active_vbs_event_id = COALESCE(active_vbs_event_id, $2), active_vbs_year = COALESCE(active_vbs_year, $3)
     WHERE id = $1`,
    [organizationId, id, year],
  );
  if (username) {
    await addMemberToVbsEvent(organizationId, username, id);
    await db().query(
      `UPDATE organization_members
       SET default_vbs_event_id = COALESCE(default_vbs_event_id, $3)
       WHERE organization_id = $1 AND username = $2`,
      [organizationId, username, id],
    );
  }
  return id;
}

export async function addMemberToVbsEvent(organizationId: string, username: string, eventId: string) {
  await db().query(
    `INSERT INTO vbs_event_members (event_id, username, organization_id)
     VALUES ($1,$2,$3)
     ON CONFLICT DO NOTHING`,
    [eventId, username, organizationId],
  );
}

export async function listMemberEventIds(organizationId: string, username: string) {
  const result = await db().query<{ event_id: string }>(
    `SELECT event_id FROM vbs_event_members WHERE organization_id = $1 AND username = $2`,
    [organizationId, username],
  );
  return result.rows.map((row) => row.event_id);
}

export async function setActiveVbsEvent(organizationId: string, eventId: string) {
  const event = await getVbsEvent(organizationId, eventId);
  if (!event) {
    return { error: "VBS event not found" as const };
  }
  await db().query(
    `UPDATE organizations SET active_vbs_event_id = $2, active_vbs_year = $3 WHERE id = $1`,
    [organizationId, eventId, event.year],
  );
  return { ok: true as const, event };
}

export async function syncEventCurriculum(
  eventId: string,
  fields: { year?: number; publisherId?: string; programTitle?: string; name?: string },
) {
  await db().query(
    `UPDATE vbs_events SET
       year = COALESCE($2, year),
       publisher_id = COALESCE($3, publisher_id),
       program_title = COALESCE($4, program_title),
       name = COALESCE($5, name),
       updated_at = NOW()
     WHERE id = $1`,
    [
      eventId,
      fields.year ?? null,
      fields.publisherId ?? null,
      fields.programTitle ?? null,
      fields.name ?? null,
    ],
  );
}
