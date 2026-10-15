import { defaultCurriculumYear, programs, publishers, type PublisherId } from "./curriculum.js";
import { db } from "./db/pool.js";
import { objectUrl, putObject } from "./db/s3.js";
import { buildRegNameTagPrompt, generateThemedGraphic } from "./llm-images.js";
import { canManageRegistration, getMembership, type OrgRole } from "./orgs.js";
import {
  isCookingTeamParticipant,
  registrationViewFlags,
  resolveCookingTeamId,
  sanitizeRegistrationStudent,
} from "./vbs-registration-access.js";
import { listTeamsForViewer } from "./teams.js";
import { publisherName } from "./setup.js";
import { isPlatformAdmin } from "./users.js";
import {
  assertRegistrationWrite,
  registrationStudentVisible,
  resolveRegistrationViewerSeason,
  seasonYearForNewRegistration,
} from "./vbs-org-season.js";

export const COMMON_REGISTRATION_ALLERGIES = [
  "Peanuts",
  "Tree nuts",
  "Milk / dairy",
  "Eggs",
  "Wheat / gluten",
  "Soy",
  "Shellfish",
  "Fish",
  "Sesame",
  "Latex",
] as const;

export const TSHIRT_SIZES = [
  "Youth XS",
  "Youth S",
  "Youth M",
  "Youth L",
  "Youth XL",
  "Adult S",
  "Adult M",
  "Adult L",
  "Adult XL",
] as const;

export type ChildGender = "M" | "F";

export type VbsRegistrationStudent = {
  id: string;
  organizationId: string;
  childFullName: string;
  childGender: ChildGender | "";
  birthMonth: number;
  birthYear: number;
  ageYears: number;
  allergiesCommon: string[];
  allergiesOther: string;
  comments: string;
  specialRequests: string;
  contact1Name: string;
  contact1Phone: string;
  contact1Email: string;
  contact2Name: string;
  contact2Phone: string;
  contact2Email: string;
  attendMon: boolean;
  attendTue: boolean;
  attendWed: boolean;
  attendThu: boolean;
  attendFri: boolean;
  tshirtSize: string;
  assignedTeamId: string;
  assignedTeamName: string;
  classId: string;
  classIds: string[];
  className: string;
  paymentStatus: "pending" | "paid" | "waived";
  nametagImageKey: string;
  nametagImageUrl: string;
  nametagExtraInstructions: string;
  createdBy: string;
  source: "staff" | "public";
  vbsSeasonYear: number;
  classRosterSort: number;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationRow = {
  id: string;
  organization_id: string;
  child_full_name: string;
  child_gender: string;
  birth_month: number;
  birth_year: number;
  allergies_common: string[];
  allergies_other: string;
  comments: string;
  special_requests: string;
  contact1_name: string;
  contact1_phone: string;
  contact1_email: string;
  contact2_name: string;
  contact2_phone: string;
  contact2_email: string;
  attend_mon: boolean;
  attend_tue: boolean;
  attend_wed: boolean;
  attend_thu: boolean;
  attend_fri: boolean;
  tshirt_size: string;
  assigned_team_id: string | null;
  class_id: string | null;
  payment_status: string;
  nametag_image_key: string;
  nametag_extra_instructions: string;
  created_by: string | null;
  source: string;
  created_at: Date;
  updated_at: Date;
  vbs_season_year: number;
  class_roster_sort: number;
};

export const registrationRowReturnSql = `id, organization_id, child_full_name, child_gender, birth_month, birth_year, allergies_common, allergies_other,
  comments, special_requests, contact1_name, contact1_phone, contact1_email, contact2_name, contact2_phone, contact2_email,
  attend_mon, attend_tue, attend_wed, attend_thu, attend_fri, tshirt_size, assigned_team_id,
  nametag_image_key, nametag_extra_instructions, created_by, source, created_at, updated_at, class_id, payment_status,
  vbs_season_year, COALESCE(class_roster_sort, 0)::int AS class_roster_sort`;

const REGISTRATION_ROW_RETURN = registrationRowReturnSql;

const publisherIds = new Set(publishers.map((publisher) => publisher.id));

function isPublisher(id: string): id is PublisherId {
  return publisherIds.has(id as PublisherId);
}

function canEditRegistration(role: OrgRole) {
  return canManageRegistration(role);
}

export function ageFromBirthMonthYear(birthMonth: number, birthYear: number, asOf = new Date()) {
  let age = asOf.getFullYear() - birthYear;
  if (asOf.getMonth() + 1 < birthMonth) {
    age -= 1;
  }
  return Math.max(0, age);
}

export function formatAllergiesSummary(common: string[], other: string) {
  const parts = [...common.map((item) => item.trim()).filter(Boolean)];
  const extra = other.trim();
  if (extra) {
    parts.push(extra);
  }
  return parts.length ? parts.join("; ") : "None listed";
}

export function suggestTeamId(
  age: number,
  teams: { id: string; name: string }[],
  specialRequests: string,
): string {
  if (teams.length === 0) {
    return "";
  }
  const special = specialRequests.toLowerCase();
  for (const team of teams) {
    if (special && special.includes(team.name.toLowerCase())) {
      return team.id;
    }
  }
  const band =
    age <= 4 ? "preschool" : age <= 6 ? "kinder" : age <= 9 ? "elementary" : age <= 12 ? "preteen" : "teen";
  const patterns: Record<string, RegExp> = {
    preschool: /pre-?k|preschool|3.?4|4.?5|little|littles/i,
    kinder: /k-?1|kindergarten|5.?6|kinder/i,
    elementary: /1.?3|2.?3|3.?4|elementary|grades? 1|grades? 2|grades? 3/i,
    preteen: /4.?6|5.?6|preteen|tween|grades? 4|grades? 5|grades? 6/i,
    teen: /7.?8|teen|youth|grades? 7|grades? 8/i,
  };
  const pattern = patterns[band];
  if (pattern) {
    const match = teams.find((team) => pattern.test(team.name));
    if (match) {
      return match.id;
    }
  }
  return teams[0]?.id ?? "";
}

export function presentRegistrationStudent(
  row: RegistrationRow,
  teamName: string,
  className = "",
  classIds: string[] = [],
): VbsRegistrationStudent {
  const resolvedClassIds =
    classIds.length > 0 ? classIds : row.class_id ? [row.class_id] : [];
  const payment =
    row.payment_status === "paid" || row.payment_status === "waived" ? row.payment_status : "pending";
  return {
    id: row.id,
    organizationId: row.organization_id,
    childFullName: row.child_full_name,
    childGender: row.child_gender === "M" || row.child_gender === "F" ? row.child_gender : "",
    birthMonth: row.birth_month,
    birthYear: row.birth_year,
    ageYears: ageFromBirthMonthYear(row.birth_month, row.birth_year),
    allergiesCommon: row.allergies_common ?? [],
    allergiesOther: row.allergies_other,
    comments: row.comments,
    specialRequests: row.special_requests,
    contact1Name: row.contact1_name,
    contact1Phone: row.contact1_phone,
    contact1Email: row.contact1_email ?? "",
    contact2Name: row.contact2_name,
    contact2Phone: row.contact2_phone,
    contact2Email: row.contact2_email ?? "",
    attendMon: row.attend_mon,
    attendTue: row.attend_tue,
    attendWed: row.attend_wed,
    attendThu: row.attend_thu,
    attendFri: row.attend_fri,
    tshirtSize: row.tshirt_size,
    assignedTeamId: row.assigned_team_id ?? "",
    assignedTeamName: teamName,
    classId: resolvedClassIds[0] ?? row.class_id ?? "",
    classIds: resolvedClassIds,
    className,
    paymentStatus: payment,
    nametagImageKey: row.nametag_image_key,
    nametagImageUrl: row.nametag_image_key ? objectUrl(row.nametag_image_key) : "",
    nametagExtraInstructions: row.nametag_extra_instructions,
    createdBy: row.created_by ?? "",
    source: row.source === "public" ? "public" : "staff",
    vbsSeasonYear: row.vbs_season_year ?? new Date().getFullYear(),
    classRosterSort: row.class_roster_sort ?? 0,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const MAX_NAME = 200;
const MAX_EMAIL = 254;

/** Basic validation for parent/guardian email stored on registrations. */
export function normalizeRegistrationEmail(raw: string) {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_EMAIL) {
    return "";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "";
  }
  return trimmed;
}
const MAX_PHONE = 40;
const MAX_TEXT = 2000;

function clipText(value: string, max: number) {
  return value.trim().slice(0, max);
}

export function parseRegistrationPayload(
  input: Record<string, unknown>,
  options: { requirePrimaryContact?: boolean } = {},
) {
  const childFullName = clipText(typeof input.childFullName === "string" ? input.childFullName : "", MAX_NAME);
  const birthMonth = Number(input.birthMonth);
  const birthYear = Number(input.birthYear);
  if (!childFullName) {
    return { error: "Student full name is required" as const };
  }
  const genderRaw =
    typeof input.childGender === "string" ? input.childGender.trim().toUpperCase().slice(0, 1) : "";
  if (genderRaw !== "M" && genderRaw !== "F") {
    return { error: "Select M (male) or F (female) for the child" as const };
  }
  const childGender = genderRaw as ChildGender;
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) {
    return { error: "Birth month must be 1–12" as const };
  }
  if (!Number.isInteger(birthYear) || birthYear < 1990 || birthYear > 2100) {
    return { error: "Birth year is required" as const };
  }
  const allergiesCommon = normalizeAllergiesCommon(input.allergiesCommon);
  const allergiesOther = clipText(typeof input.allergiesOther === "string" ? input.allergiesOther : "", MAX_TEXT);
  const comments = clipText(typeof input.comments === "string" ? input.comments : "", MAX_TEXT);
  const specialRequests = clipText(typeof input.specialRequests === "string" ? input.specialRequests : "", MAX_TEXT);
  const contact1Name = clipText(typeof input.contact1Name === "string" ? input.contact1Name : "", MAX_NAME);
  const contact1Phone = clipText(typeof input.contact1Phone === "string" ? input.contact1Phone : "", MAX_PHONE);
  const contact1Email = normalizeRegistrationEmail(
    typeof input.contact1Email === "string" ? input.contact1Email : "",
  );
  const contact2Name = clipText(typeof input.contact2Name === "string" ? input.contact2Name : "", MAX_NAME);
  const contact2Phone = clipText(typeof input.contact2Phone === "string" ? input.contact2Phone : "", MAX_PHONE);
  const contact2Email = normalizeRegistrationEmail(
    typeof input.contact2Email === "string" ? input.contact2Email : "",
  );
  if (options.requirePrimaryContact && (!contact1Name || !contact1Phone || !contact1Email)) {
    return {
      error: "Primary parent/guardian name, phone, and email are required" as const,
    };
  }
  const tshirtSize = clipText(typeof input.tshirtSize === "string" ? input.tshirtSize : "", 32);
  if (tshirtSize && !(TSHIRT_SIZES as readonly string[]).includes(tshirtSize)) {
    return { error: "Choose a T-shirt size from the list" as const };
  }
  const nametagExtraInstructions = clipText(
    typeof input.nametagExtraInstructions === "string" ? input.nametagExtraInstructions : "",
    MAX_TEXT,
  );
  return {
    childFullName,
    childGender,
    birthMonth,
    birthYear,
    allergiesCommon,
    allergiesOther,
    comments,
    specialRequests,
    contact1Name,
    contact1Phone,
    contact1Email,
    contact2Name,
    contact2Phone,
    contact2Email,
    tshirtSize,
    nametagExtraInstructions,
    attendMon: input.attendMon === true,
    attendTue: input.attendTue === true,
    attendWed: input.attendWed === true,
    attendThu: input.attendThu === true,
    attendFri: input.attendFri === true,
  };
}

async function requireMember(organizationId: string, username: string) {
  const platformAdmin = await isPlatformAdmin(username);
  const membership = await getMembership(organizationId, username);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" as const };
  }
  const effectiveRole: OrgRole = membership?.role ?? "org_admin";
  return {
    ok: true as const,
    membership: membership ?? { username, role: effectiveRole },
    platformAdmin,
  };
}

function normalizeAllergiesCommon(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const allowed = new Set<string>(COMMON_REGISTRATION_ALLERGIES);
  return [...new Set(input.filter((item): item is string => typeof item === "string").map((item) => item.trim()))].filter(
    (item) => allowed.has(item),
  );
}

function firstName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export async function getRegistrationWorkspace(organizationId: string, username: string) {
  const access = await requireMember(organizationId, username);
  if (!access.ok) {
    return { error: access.error };
  }
  const platformAdmin = access.platformAdmin;
  const cookingTeamParticipant = await isCookingTeamParticipant(organizationId, username);
  const view = registrationViewFlags(access.membership.role, platformAdmin, cookingTeamParticipant);
  const seasonAccess = await resolveRegistrationViewerSeason(organizationId, username, platformAdmin);
  if ("error" in seasonAccess) {
    return { error: seasonAccess.error };
  }
  const cookingTeamId = await resolveCookingTeamId(organizationId);
  const teams = await listTeamsForViewer(organizationId, username, platformAdmin);
  const teamMap = new Map(teams.map((team) => [team.id, team.name]));
  const { CORNERSTONE_ORG_ID_FOR_STUDENTS, ensureCornerstoneDemoStudents } = await import(
    "./db/seed-cornerstone-students.js",
  );
  if (organizationId === CORNERSTONE_ORG_ID_FOR_STUDENTS) {
    await ensureCornerstoneDemoStudents(organizationId);
  }
  const result = await db().query<RegistrationRow>(
    `SELECT ${registrationRowReturnSql}
     FROM vbs_registrations
     WHERE organization_id = $1
     ORDER BY vbs_season_year DESC, updated_at DESC, child_full_name ASC`,
    [organizationId],
  );
  const { ensureDefaultRegistrationClasses, listRegistrationClasses } = await import(
    "./vbs-registration-classes.js",
  );
  await ensureDefaultRegistrationClasses(organizationId);
  const visibleRows = result.rows.filter((row) =>
    registrationStudentVisible(row.vbs_season_year ?? new Date().getFullYear(), seasonAccess),
  );
  const classSeasonYears = new Set<number>([seasonAccess.activeSeason]);
  for (const row of visibleRows) {
    classSeasonYears.add(row.vbs_season_year ?? seasonAccess.activeSeason);
  }
  const classesById = new Map<string, Awaited<ReturnType<typeof listRegistrationClasses>>[number]>();
  for (const year of classSeasonYears) {
    for (const cls of await listRegistrationClasses(organizationId, year)) {
      classesById.set(cls.id, cls);
    }
  }
  const classes = [...classesById.values()].sort(
    (a, b) =>
      a.vbsSeasonYear - b.vbsSeasonYear ||
      (a.rotationIndex ?? 99) - (b.rotationIndex ?? 99) ||
      a.minAge - b.minAge ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name),
  );
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const staffMembersResult = await db().query<{
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    role: OrgRole;
  }>(
    `SELECT m.username, u.first_name, u.last_name, u.email, m.role
     FROM organization_members m
     JOIN users u ON u.username = m.username
     WHERE m.organization_id = $1 AND m.removed_at IS NULL
     ORDER BY LOWER(COALESCE(NULLIF(u.last_name, ''), m.username)), LOWER(u.first_name), m.username`,
    [organizationId],
  );
  const staffMembers = staffMembersResult.rows.map((row) => ({
    username: row.username,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    email: row.email ?? "",
    role: row.role,
  }));
  const registrationSeasons = [
    ...new Set(result.rows.map((row) => row.vbs_season_year ?? new Date().getFullYear())),
  ].sort((a, b) => b - a);
  const canWriteSeason =
    view.canWrite &&
    (seasonAccess.viewAllSeasons || seasonAccess.viewSeason === seasonAccess.activeSeason);
  const { classIdsForStudents } = await import("./vbs-registration-classes.js");
  const classAssignments = await classIdsForStudents(
    organizationId,
    visibleRows.map((row) => row.id),
  );
  const students = visibleRows
    .map((row) => {
      const classIds =
        classAssignments.get(row.id) ?? (row.class_id ? [row.class_id] : []);
      const className = classIds
        .map((id) => classMap.get(id))
        .filter((name): name is string => Boolean(name))
        .join(", ");
      return presentRegistrationStudent(
        row,
        row.assigned_team_id ? (teamMap.get(row.assigned_team_id) ?? "") : "",
        className,
        classIds,
      );
    })
    .map((student) => sanitizeRegistrationStudent(student, view));
  const { getPublicRegistrationSettings, getPublicFamilySettings } = await import(
    "./vbs-public-registration.js"
  );
  const publicRegistration =
    canEditRegistration(access.membership.role) || access.platformAdmin
      ? await getPublicRegistrationSettings(organizationId, username)
      : null;
  const publicFamily =
    canEditRegistration(access.membership.role) || access.platformAdmin
      ? await getPublicFamilySettings(organizationId, username)
      : null;

  return {
    students,
    staffMembers,
    teams: teams.map((team) => ({ id: team.id, name: team.name })),
    activeVbsYear: seasonAccess.activeSeason,
    viewAllSeasons: seasonAccess.viewAllSeasons,
    viewSeason: seasonAccess.viewAllSeasons ? null : seasonAccess.viewSeason,
    registrationSeasons: seasonAccess.viewAllSeasons ? registrationSeasons : [seasonAccess.viewSeason],
    canWrite: canWriteSeason,
    canViewContacts: view.canViewContacts,
    canViewAllergies: view.canViewAllergies,
    canConfigureCooking: view.canConfigureCooking,
    cookingTeamId,
    commonAllergies: [...COMMON_REGISTRATION_ALLERGIES],
    tshirtSizes: [...TSHIRT_SIZES],
    defaultYear: defaultCurriculumYear(),
    publishers,
    programs: programs.map((program) => ({
      id: program.id,
      year: program.year,
      publisherId: program.publisherId,
      theme: program.theme,
    })),
    publicRegistration:
      publicRegistration && !("error" in publicRegistration)
        ? {
            enabled: publicRegistration.enabled,
            link: publicRegistration.link,
          }
        : null,
    publicFamily:
      publicFamily && !("error" in publicFamily)
        ? {
            enabled: publicFamily.enabled,
            link: publicFamily.link,
          }
        : null,
    classes,
    summary: {
      total: students.length,
      parentOnline: students.filter((s) => s.source === "public").length,
      staffEntered: students.filter((s) => s.source === "staff").length,
      unassigned: students.filter((s) => s.classIds.length === 0).length,
      paymentPending: students.filter((s) => s.paymentStatus === "pending").length,
    },
    paymentNote: "VBS fees are collected offline by the church (cash, check, or in-person card). Online registration does not charge a card.",
  };
}

export async function saveRegistrationStudent(
  organizationId: string,
  username: string,
  input: Record<string, unknown>,
) {
  const access = await requireMember(organizationId, username);
  if (!access.ok) {
    return { error: access.error };
  }
  if (!canEditRegistration(access.membership.role) && !access.platformAdmin) {
    return { error: "You do not have permission to edit registrations" as const };
  }
  const writeAccess = await assertRegistrationWrite(organizationId, username, access.platformAdmin);
  if ("error" in writeAccess) {
    return writeAccess;
  }
  const parsed = parseRegistrationPayload(input, { requirePrimaryContact: true });
  if ("error" in parsed) {
    return parsed;
  }
  const platformAdmin = await isPlatformAdmin(username);
  const teams = await listTeamsForViewer(organizationId, username, platformAdmin);
  const teamIds = new Set(teams.map((team) => team.id));
  let assignedTeamId = typeof input.assignedTeamId === "string" ? input.assignedTeamId.trim() : "";
  const age = ageFromBirthMonthYear(parsed.birthMonth, parsed.birthYear);
  if (!assignedTeamId || !teamIds.has(assignedTeamId)) {
    assignedTeamId = suggestTeamId(age, teams, parsed.specialRequests);
  }
  const { listRegistrationClasses, checkCapacityAlerts } = await import("./vbs-registration-classes.js");
  const classes = await listRegistrationClasses(organizationId);
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const existingId = typeof input.id === "string" ? input.id.trim() : "";
  if (existingId) {
    const existingRow = await db().query<{ vbs_season_year: number }>(
      `SELECT vbs_season_year FROM vbs_registrations WHERE id = $1 AND organization_id = $2`,
      [existingId, organizationId],
    );
    const seasonYear = existingRow.rows[0]?.vbs_season_year;
    if (!seasonYear) {
      return { error: "Registration not found" as const };
    }
    if (
      !registrationStudentVisible(seasonYear, writeAccess.access) &&
      !writeAccess.access.viewAllSeasons
    ) {
      return { error: "You cannot edit registrations from another VBS season" as const };
    }
  }
  let classId = typeof input.classId === "string" ? input.classId.trim() : "";
  if (classId && !classes.some((c) => c.id === classId)) {
    classId = "";
  }
  // Staff enter children on the Students tab; class/station assignment is on Classes & roster (drag-and-drop).
  // Public online registration assigns classes in vbs-public-registration.ts.
  const rawPayment = typeof input.paymentStatus === "string" ? input.paymentStatus : "pending";
  const paymentStatus =
    rawPayment === "paid" || rawPayment === "waived" || rawPayment === "pending" ? rawPayment : "pending";
  const now = new Date();
  const params = [
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
    paymentStatus,
    parsed.nametagExtraInstructions,
    now,
  ];
  if (existingId) {
    const updated = await db().query<RegistrationRow>(
      `UPDATE vbs_registrations SET
        child_full_name = $3, child_gender = $4, birth_month = $5, birth_year = $6, allergies_common = $7, allergies_other = $8,
        comments = $9, special_requests = $10, contact1_name = $11, contact1_phone = $12, contact1_email = $13,
        contact2_name = $14, contact2_phone = $15, contact2_email = $16, attend_mon = $17, attend_tue = $18,
        attend_wed = $19, attend_thu = $20, attend_fri = $21, tshirt_size = $22, assigned_team_id = $23,
        class_id = $24, payment_status = $25, nametag_extra_instructions = $26, updated_at = $27
       WHERE id = $1 AND organization_id = $2
       RETURNING ${REGISTRATION_ROW_RETURN}`,
      [existingId, organizationId, ...params.slice(0, -1), params[params.length - 1]!],
    );
    if (updated.rows.length === 0) {
      return { error: "Registration not found" as const };
    }
    const row = updated.rows[0]!;
    if (row.class_id) {
      await checkCapacityAlerts(organizationId, row.class_id);
    }
    const teamName = row.assigned_team_id ? (teams.find((t) => t.id === row.assigned_team_id)?.name ?? "") : "";
    return {
      student: presentRegistrationStudent(row, teamName, row.class_id ? (classMap.get(row.class_id) ?? "") : ""),
    };
  }
  const id = crypto.randomUUID();
  const insertedAt = params[params.length - 1]!;
  const registrationSeason = await seasonYearForNewRegistration(organizationId);
  const inserted = await db().query<RegistrationRow>(
    `INSERT INTO vbs_registrations (
      id, organization_id, child_full_name, child_gender, birth_month, birth_year, allergies_common, allergies_other,
      comments, special_requests, contact1_name, contact1_phone, contact1_email, contact2_name, contact2_phone,
      contact2_email, attend_mon, attend_tue, attend_wed, attend_thu, attend_fri, tshirt_size, assigned_team_id,
      class_id, payment_status, nametag_extra_instructions, created_by, source, created_at, updated_at, vbs_season_year
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,'staff',$28,$28,$29)
    RETURNING ${REGISTRATION_ROW_RETURN}`,
    [id, organizationId, ...params.slice(0, -1), username, insertedAt, registrationSeason],
  );
  const row = inserted.rows[0]!;
  if (row.class_id) {
    await checkCapacityAlerts(organizationId, row.class_id);
  }
  const teamName = row.assigned_team_id ? (teams.find((t) => t.id === row.assigned_team_id)?.name ?? "") : "";
  return {
    student: presentRegistrationStudent(row, teamName, row.class_id ? (classMap.get(row.class_id) ?? "") : ""),
  };
}

export async function deleteRegistrationStudent(organizationId: string, username: string, studentId: string) {
  const access = await requireMember(organizationId, username);
  if (!access.ok) {
    return { error: access.error };
  }
  if (!canEditRegistration(access.membership.role) && !access.platformAdmin) {
    return { error: "You do not have permission to edit registrations" as const };
  }
  const writeAccess = await assertRegistrationWrite(organizationId, username, access.platformAdmin);
  if ("error" in writeAccess) {
    return writeAccess;
  }
  const existingRow = await db().query<{ vbs_season_year: number }>(
    `SELECT vbs_season_year FROM vbs_registrations WHERE id = $1 AND organization_id = $2`,
    [studentId, organizationId],
  );
  const seasonYear = existingRow.rows[0]?.vbs_season_year;
  if (!seasonYear) {
    return { error: "Registration not found" as const };
  }
  if (!registrationStudentVisible(seasonYear, writeAccess.access)) {
    return { error: "You cannot delete registrations from another VBS season" as const };
  }
  await db().query(`DELETE FROM vbs_registrations WHERE id = $1 AND organization_id = $2`, [
    studentId,
    organizationId,
  ]);
  return { ok: true as const };
}

export async function generateRegistrationNametag(
  organizationId: string,
  username: string,
  studentId: string,
  input: {
    publisherId: string;
    year: number;
    title: string;
    extraInstructions?: string;
    assignedTeamId?: string;
  },
) {
  const access = await requireMember(organizationId, username);
  if (!access.ok) {
    return { error: access.error };
  }
  if (!canEditRegistration(access.membership.role) && !access.platformAdmin) {
    return { error: "You do not have permission to generate nametags" as const };
  }
  const writeAccess = await assertRegistrationWrite(organizationId, username, access.platformAdmin);
  if ("error" in writeAccess) {
    return writeAccess;
  }
  if (!isPublisher(input.publisherId) || !Number.isInteger(input.year) || !input.title.trim()) {
    return { error: "Publisher, year, and VBS title are required" as const };
  }
  const program = programs.find(
    (item) =>
      item.publisherId === input.publisherId && item.year === input.year && item.theme === input.title.trim(),
  );
  if (!program) {
    return { error: "Choose a VBS title that matches the publisher and year" as const };
  }
  const rowResult = await db().query<RegistrationRow>(
    `SELECT ${registrationRowReturnSql}
     FROM vbs_registrations WHERE id = $1 AND organization_id = $2`,
    [studentId, organizationId],
  );
  const row = rowResult.rows[0];
  if (!row) {
    return { error: "Registration not found" as const };
  }
  if (!registrationStudentVisible(row.vbs_season_year ?? new Date().getFullYear(), writeAccess.access)) {
    return { error: "You cannot edit registrations from another VBS season" as const };
  }
  const platformAdmin = await isPlatformAdmin(username);
  const teams = await listTeamsForViewer(organizationId, username, platformAdmin);
  let assignedTeamId =
    typeof input.assignedTeamId === "string" && input.assignedTeamId.trim()
      ? input.assignedTeamId.trim()
      : (row.assigned_team_id ?? "");
  if (assignedTeamId && !teams.some((team) => team.id === assignedTeamId)) {
    assignedTeamId = row.assigned_team_id ?? "";
  }
  const assignedTeamName = assignedTeamId ? (teams.find((team) => team.id === assignedTeamId)?.name ?? "") : "";
  const extraInstructions =
    (typeof input.extraInstructions === "string" ? input.extraInstructions.trim() : "") ||
    row.nametag_extra_instructions;
  const prompt = buildRegNameTagPrompt({
    publisher: publisherName(input.publisherId),
    year: input.year,
    title: input.title.trim(),
    firstName: firstName(row.child_full_name),
    fullName: row.child_full_name,
    assignedTeam: assignedTeamName || "Unassigned",
    allergies: formatAllergiesSummary(row.allergies_common ?? [], row.allergies_other),
    specialRequests: row.special_requests,
    extraInstructions,
  });
  try {
    const bytes = await generateThemedGraphic(prompt);
    const key = `vbs-registration/${organizationId}/nametags/${crypto.randomUUID()}.png`;
    await putObject(key, bytes, "image/png");
    const updated = await db().query<RegistrationRow>(
      `UPDATE vbs_registrations SET
        nametag_image_key = $3, nametag_extra_instructions = $4, assigned_team_id = $5, updated_at = $6
       WHERE id = $1 AND organization_id = $2
       RETURNING ${REGISTRATION_ROW_RETURN}`,
      [studentId, organizationId, key, extraInstructions, assignedTeamId || null, new Date()],
    );
    const updatedRow = updated.rows[0]!;
    const { listRegistrationClasses } = await import("./vbs-registration-classes.js");
    const classes = await listRegistrationClasses(organizationId);
    const className = updatedRow.class_id ? (classes.find((c) => c.id === updatedRow.class_id)?.name ?? "") : "";
    const teamName = updatedRow.assigned_team_id
      ? (teams.find((team) => team.id === updatedRow.assigned_team_id)?.name ?? "")
      : "";
    return {
      student: presentRegistrationStudent(updatedRow, teamName, className),
      image: { key, url: objectUrl(key) },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not generate nametag" };
  }
}
