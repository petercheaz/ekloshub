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

function publicLink(token: string) {
  const base = (process.env.APP_PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
  return `${base}/register/${token}`;
}

async function orgByPublicToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const result = await db().query<{
    id: string;
    name: string;
    public_registration_enabled: boolean;
    public_registration_token: string;
  }>(
    `SELECT id, name, public_registration_enabled, public_registration_token
     FROM organizations
     WHERE public_registration_token = $1`,
    [trimmed],
  );
  return result.rows[0] ?? null;
}

export async function getPublicRegistrationForm(token: string) {
  const org = await orgByPublicToken(token);
  if (!org || !org.public_registration_enabled) {
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
  const org = await orgByPublicToken(token);
  if (!org || !org.public_registration_enabled) {
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
  const inserted = await db().query<RegistrationRow>(
    `INSERT INTO vbs_registrations (
      id, organization_id, child_full_name, birth_month, birth_year, allergies_common, allergies_other,
      comments, special_requests, contact1_name, contact1_phone, contact2_name, contact2_phone,
      attend_mon, attend_tue, attend_wed, attend_thu, attend_fri, tshirt_size, assigned_team_id, class_id,
      payment_status, nametag_extra_instructions, created_by, source, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'pending','',NULL,'public',$22,$22)
    RETURNING ${registrationRowReturnSql}`,
    [
      id,
      org.id,
      parsed.childFullName,
      parsed.birthMonth,
      parsed.birthYear,
      parsed.allergiesCommon,
      parsed.allergiesOther,
      parsed.comments,
      parsed.specialRequests,
      parsed.contact1Name,
      parsed.contact1Phone,
      parsed.contact2Name,
      parsed.contact2Phone,
      parsed.attendMon,
      parsed.attendTue,
      parsed.attendWed,
      parsed.attendThu,
      parsed.attendFri,
      parsed.tshirtSize,
      assignedTeamId || null,
      classId || null,
      now,
    ],
  );
  const row = inserted.rows[0]!;
  if (classId) {
    const { checkCapacityAlerts } = await import("./vbs-registration-classes.js");
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

export async function getPublicRegistrationSettings(organizationId: string, username: string) {
  const platformAdmin = await isPlatformAdmin(username);
  const membership = await getMembership(organizationId, username);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" as const };
  }
  const role = membership?.role ?? "org_admin";
  if (!canManageRegistration(role) && !platformAdmin) {
    return { error: "You do not have permission to manage registration settings" as const };
  }
  const result = await db().query<{
    public_registration_enabled: boolean;
    public_registration_token: string;
    name: string;
  }>(`SELECT public_registration_enabled, public_registration_token, name FROM organizations WHERE id = $1`, [
    organizationId,
  ]);
  const org = result.rows[0];
  if (!org) {
    return { error: "Organization not found" as const };
  }
  let token = org.public_registration_token?.trim() ?? "";
  if (!token) {
    token = crypto.randomUUID();
    await db().query(`UPDATE organizations SET public_registration_token = $2 WHERE id = $1`, [
      organizationId,
      token,
    ]);
  }
  return {
    enabled: org.public_registration_enabled,
    link: publicLink(token),
    token,
    organizationName: org.name,
  };
}

export async function updatePublicRegistrationSettings(
  organizationId: string,
  username: string,
  input: { enabled?: boolean; regenerateToken?: boolean },
) {
  const current = await getPublicRegistrationSettings(organizationId, username);
  if ("error" in current) {
    return current;
  }
  let token = current.token;
  if (input.regenerateToken) {
    token = crypto.randomUUID();
  }
  const enabled = input.enabled ?? current.enabled;
  await db().query(
    `UPDATE organizations SET public_registration_enabled = $2, public_registration_token = $3 WHERE id = $1`,
    [organizationId, enabled, token],
  );
  return {
    enabled,
    link: publicLink(token),
    token,
    organizationName: current.organizationName,
  };
}
