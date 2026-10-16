import crypto from "node:crypto";
import { db } from "./db/pool.js";
import { canManageRegistration, getMembership } from "./orgs.js";
import { listTeams } from "./teams.js";
import { isPlatformAdmin } from "./users.js";
import {
  COMMON_REGISTRATION_ALLERGIES,
  TSHIRT_SIZES,
  ageFromBirthMonthYear,
  parseRegistrationPayload,
  presentRegistrationStudent,
  registrationRowReturnSql,
  suggestTeamId,
  type RegistrationRow,
} from "./vbs-registration.js";
import { pickClassForPublicRegistration } from "./vbs-registration-classes.js";
import { notifyRegistrationAdmins } from "./vbs-registration-notify.js";
import { seasonYearForNewRegistration } from "./vbs-org-season.js";

export const PUBLIC_REGISTRATION_PRIVACY = `We collect your child's registration information only to run Vacation Bible School for this church (scheduling, safety, allergies, and T-shirt sizing). We do not sell this information. Church staff and authorized volunteers may access it for VBS planning. Contact the church if you need to correct or remove an entry.`;

const MAX_SUBMISSIONS_PER_HOUR = 8;
const rateLimitBuckets = new Map<string, number[]>();

function clientIp(input: { ip?: string; forwarded?: string }) {
  const forwarded = input.forwarded?.split(",")[0]?.trim();
  return forwarded || input.ip || "unknown";
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const hits = (rateLimitBuckets.get(key) ?? []).filter((time) => now - time < windowMs);
  if (hits.length >= MAX_SUBMISSIONS_PER_HOUR) {
    return false;
  }
  hits.push(now);
  rateLimitBuckets.set(key, hits);
  return true;
}

type PublicSurface = "registration" | "family";

const PUBLIC_SURFACE: Record<
  PublicSurface,
  { urlPath: string; enabledColumn: string; tokenColumn: string }
> = {
  registration: {
    urlPath: "register",
    enabledColumn: "public_registration_enabled",
    tokenColumn: "public_registration_token",
  },
  family: {
    urlPath: "family",
    enabledColumn: "public_family_enabled",
    tokenColumn: "public_family_token",
  },
};

function appPublicUrl(pathSegment: string, token: string) {
  const base = (process.env.APP_PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
  return `${base}/${pathSegment}/${token}`;
}

async function orgByPublicToken(surface: PublicSurface, token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const cfg = PUBLIC_SURFACE[surface];
  const result = await db().query<{
    id: string;
    name: string;
    enabled: boolean;
    token: string;
  }>(
    `SELECT id, name, ${cfg.enabledColumn} AS enabled, ${cfg.tokenColumn} AS token
     FROM organizations WHERE ${cfg.tokenColumn} = $1`,
    [trimmed],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return { id: row.id, name: row.name, enabled: row.enabled, token: row.token };
}

type SettingsAccessError =
  | { error: "Not a member of this organization" }
  | { error: "You do not have permission to manage registration settings" };

async function requireRegistrationSettingsAccess(
  organizationId: string,
  username: string,
): Promise<SettingsAccessError | undefined> {
  const platformAdmin = await isPlatformAdmin(username);
  const membership = await getMembership(organizationId, username);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" };
  }
  const role = membership?.role ?? "org_admin";
  if (!canManageRegistration(role) && !platformAdmin) {
    return { error: "You do not have permission to manage registration settings" };
  }
  return undefined;
}

async function readPublicLinkSettings(organizationId: string, surface: PublicSurface) {
  const cfg = PUBLIC_SURFACE[surface];
  const result = await db().query<{ enabled: boolean; token: string; name: string }>(
    `SELECT ${cfg.enabledColumn} AS enabled, ${cfg.tokenColumn} AS token, name
     FROM organizations WHERE id = $1`,
    [organizationId],
  );
  return result.rows[0] ?? null;
}

async function ensurePublicToken(organizationId: string, surface: PublicSurface, existing: string) {
  let token = existing.trim();
  if (!token) {
    token = crypto.randomUUID();
    const cfg = PUBLIC_SURFACE[surface];
    await db().query(`UPDATE organizations SET ${cfg.tokenColumn} = $2 WHERE id = $1`, [
      organizationId,
      token,
    ]);
  }
  return token;
}

export async function getPublicRegistrationForm(token: string) {
  const org = await orgByPublicToken("registration", token);
  if (!org || !org.enabled) {
    return { error: "Registration is not available" as const };
  }
  const plan = await db().query<{ title: string; program_title: string }>(
    `SELECT title, program_title FROM vbs_plans WHERE organization_id = $1 LIMIT 1`,
    [org.id],
  );
  const planRow = plan.rows[0];
  return {
    organizationName: org.name,
    programLabel: planRow?.program_title?.trim() || planRow?.title?.trim() || "",
    privacyNotice: PUBLIC_REGISTRATION_PRIVACY,
    commonAllergies: [...COMMON_REGISTRATION_ALLERGIES],
    tshirtSizes: [...TSHIRT_SIZES],
    paymentNote:
      "Registration fees are paid offline at the church (cash, check, or in-person). We do not charge your card online.",
  };
}

export async function submitPublicRegistration(
  token: string,
  input: Record<string, unknown>,
  meta: { ip?: string; forwarded?: string },
) {
  const org = await orgByPublicToken("registration", token);
  if (!org || !org.enabled) {
    return { error: "Registration is not available" as const };
  }
  const honeypot = typeof input.website === "string" ? input.website.trim() : "";
  if (honeypot) {
    return { ok: true as const, confirmationId: "received" };
  }
  if (input.privacyConsent !== true) {
    return { error: "Please confirm the privacy notice before submitting" as const };
  }
  const ip = clientIp(meta);
  if (!checkRateLimit(`${org.id}:${ip}`)) {
    return { error: "Too many submissions from this connection. Try again later or contact the church." as const };
  }
  if (typeof input.id === "string" && input.id.trim()) {
    return { error: "Online registration is for new sign-ups only" as const };
  }

  const parsed = parseRegistrationPayload(input, { requirePrimaryContact: true });
  if ("error" in parsed) {
    return parsed;
  }

  const teams = await listTeams(org.id);
  const age = ageFromBirthMonthYear(parsed.birthMonth, parsed.birthYear);
  const assignedTeamId = suggestTeamId(age, teams, parsed.specialRequests);
  const classId = await pickClassForPublicRegistration(
    org.id,
    parsed.birthMonth,
    parsed.birthYear,
    parsed.specialRequests,
  );

  const id = crypto.randomUUID();
  const now = new Date();
  const { getActiveVbsEvent } = await import("./vbs-event-context.js");
  const activeEvent = await getActiveVbsEvent(org.id);
  const registrationSeason = activeEvent?.year ?? (await seasonYearForNewRegistration(org.id));
  const inserted = await db().query<RegistrationRow>(
    `INSERT INTO vbs_registrations (
      id, organization_id, child_full_name, child_gender, birth_month, birth_year, allergies_common, allergies_other,
      comments, special_requests, contact1_name, contact1_phone, contact1_email, contact2_name, contact2_phone,
      contact2_email,
      attend_mon, attend_tue, attend_wed, attend_thu, attend_fri, tshirt_size, assigned_team_id, class_id,
      payment_status, nametag_extra_instructions, created_by, source, created_at, updated_at, vbs_season_year, vbs_event_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'pending','',NULL,'public',$25,$25,$26,$27)
    RETURNING ${registrationRowReturnSql}`,
    [
      id,
      org.id,
      parsed.childFullName,
      parsed.childGender,
      parsed.birthMonth,
      parsed.birthYear,
      parsed.allergiesCommon,
      parsed.allergiesOther,
      parsed.comments,
      parsed.specialRequests,
      parsed.contact1Name,
      parsed.contact1Phone,
      parsed.contact1Email,
      parsed.contact2Name,
      parsed.contact2Phone,
      parsed.contact2Email,
      parsed.attendMon,
      parsed.attendTue,
      parsed.attendWed,
      parsed.attendThu,
      parsed.attendFri,
      parsed.tshirtSize,
      assignedTeamId || null,
      classId || null,
      now,
      registrationSeason,
      activeEvent?.id ?? null,
    ],
  );
  const row = inserted.rows[0]!;
  if (classId) {
    const { addStudentToClass, checkCapacityAlerts } = await import("./vbs-registration-classes.js");
    await addStudentToClass(org.id, id, classId);
    await checkCapacityAlerts(org.id, classId);
  }
  const teamName = assignedTeamId ? (teams.find((t) => t.id === assignedTeamId)?.name ?? "") : "";
  const student = presentRegistrationStudent(row, teamName);
  await notifyRegistrationAdmins(
    org.id,
    `New parent registration: ${parsed.childFullName}`,
    `${parsed.childFullName} was registered online. Payment is pending until collected offline.`,
    `/org/${org.id}/registration?tab=classes`,
  );
  return { ok: true as const, confirmationId: student.id, childFullName: student.childFullName };
}

async function getPublicLinkSettings(organizationId: string, username: string, surface: PublicSurface) {
  const denied = await requireRegistrationSettingsAccess(organizationId, username);
  if (denied) {
    return denied;
  }
  const org = await readPublicLinkSettings(organizationId, surface);
  if (!org) {
    return { error: "Organization not found" as const };
  }
  const token = await ensurePublicToken(organizationId, surface, org.token);
  const cfg = PUBLIC_SURFACE[surface];
  return {
    enabled: org.enabled,
    link: appPublicUrl(cfg.urlPath, token),
    token,
    organizationName: org.name,
  };
}

async function updatePublicLinkSettings(
  organizationId: string,
  username: string,
  surface: PublicSurface,
  input: { enabled?: boolean; regenerateToken?: boolean },
) {
  const current = await getPublicLinkSettings(organizationId, username, surface);
  if ("error" in current) {
    return current;
  }
  let token = current.token;
  if (input.regenerateToken) {
    token = crypto.randomUUID();
  }
  const enabled = input.enabled ?? current.enabled;
  const cfg = PUBLIC_SURFACE[surface];
  await db().query(
    `UPDATE organizations SET ${cfg.enabledColumn} = $2, ${cfg.tokenColumn} = $3 WHERE id = $1`,
    [organizationId, enabled, token],
  );
  return {
    enabled,
    link: appPublicUrl(cfg.urlPath, token),
    token,
    organizationName: current.organizationName,
  };
}

export async function getPublicRegistrationSettings(organizationId: string, username: string) {
  return getPublicLinkSettings(organizationId, username, "registration");
}

export async function updatePublicRegistrationSettings(
  organizationId: string,
  username: string,
  input: { enabled?: boolean; regenerateToken?: boolean },
) {
  return updatePublicLinkSettings(organizationId, username, "registration", input);
}

function formatPlanDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export async function getPublicFamilyPage(token: string) {
  const org = await orgByPublicToken("family", token);
  if (!org || !org.enabled) {
    return { error: "This page is not available" as const };
  }
  const plan = await db().query<{
    title: string;
    program_title: string;
    location: string;
    start_date: Date | null;
    end_date: Date | null;
    daily_start: string;
    daily_end: string;
    family_public_notes: string;
  }>(
    `SELECT title, program_title, location, start_date, end_date, daily_start, daily_end, family_public_notes
     FROM vbs_plans WHERE organization_id = $1 LIMIT 1`,
    [org.id],
  );
  const row = plan.rows[0];
  return {
    organizationName: org.name,
    programLabel: row?.program_title?.trim() || row?.title?.trim() || "Vacation Bible School",
    location: row?.location?.trim() ?? "",
    startDate: formatPlanDate(row?.start_date ?? null),
    endDate: formatPlanDate(row?.end_date ?? null),
    dailyStart: row?.daily_start ?? "",
    dailyEnd: row?.daily_end ?? "",
    familyNotes: row?.family_public_notes?.trim() ?? "",
    paymentNote:
      "Registration fees, if any, are handled offline at the church. This page does not collect payments.",
  };
}

export async function getPublicFamilySettings(organizationId: string, username: string) {
  return getPublicLinkSettings(organizationId, username, "family");
}

export async function updatePublicFamilySettings(
  organizationId: string,
  username: string,
  input: { enabled?: boolean; regenerateToken?: boolean },
) {
  return updatePublicLinkSettings(organizationId, username, "family", input);
}
