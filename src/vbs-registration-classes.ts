import { db } from "./db/pool.js";
import { canManageRegistration, getMembership } from "./orgs.js";
import { findUser, isPlatformAdmin } from "./users.js";
import {
  DEFAULT_REGISTRATION_CLASS_DEFAULTS,
  formatRegistrationClassName,
  inferSectionLabelFromClassName,
  rotationBucket,
  VBS_ROTATION_STATION_NAMES,
} from "./vbs-rotation-stations.js";
import { ageFromBirthMonthYear } from "./vbs-registration.js";
import { notifyRegistrationAdmins } from "./vbs-registration-notify.js";
import { assertRegistrationWrite, registrationStudentVisible } from "./vbs-org-season.js";

export type ClassStaffRole = "leader" | "teacher" | "helper";

export type VbsRegistrationClass = {
  id: string;
  organizationId: string;
  name: string;
  rotationIndex: number | null;
  sectionLabel: string;
  stationName: string;
  minAge: number;
  maxAge: number;
  capacityMax: number;
  registrationClosed: boolean;
  sortOrder: number;
  boardOrder: number;
  enrolledCount: number;
  leaders: string[];
  teachers: string[];
  helpers: string[];
  studentIds: string[];
  vbsSeasonYear: number;
};

type ClassRow = {
  id: string;
  organization_id: string;
  name: string;
  rotation_index: number | null;
  section_label: string;
  min_age: number;
  max_age: number;
  capacity_max: number;
  registration_closed: boolean;
  sort_order: number;
  capacity_warn_notified_count: number;
  vbs_season_year: number;
  board_order: number;
};

const CLASS_ROW_COLUMNS = `id, organization_id, name, rotation_index, section_label, min_age, max_age, capacity_max,
  registration_closed, sort_order, COALESCE(vbs_season_year, EXTRACT(YEAR FROM NOW())::int) AS vbs_season_year,
  COALESCE(board_order, 0)::int AS board_order,
  COALESCE(capacity_warn_notified_count, 0)::int AS capacity_warn_notified_count`;

const CAPACITY_WARN_RATIO = 0.85;

async function requireRegistrationEditor(organizationId: string, username: string) {
  const platformAdmin = await isPlatformAdmin(username);
  const membership = await getMembership(organizationId, username);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" as const };
  }
  const role = membership?.role ?? "org_admin";
  if (!canManageRegistration(role) && !platformAdmin) {
    return { error: "You do not have permission to manage registration" as const };
  }
  const write = await assertRegistrationWrite(organizationId, username, platformAdmin);
  if ("error" in write) {
    return write;
  }
  return { ok: true as const, seasonAccess: write.access };
}

async function assertStudentSeasonEdit(
  organizationId: string,
  studentId: string,
  seasonAccess: Parameters<typeof registrationStudentVisible>[1],
) {
  const row = await db().query<{ vbs_season_year: number }>(
    `SELECT vbs_season_year FROM vbs_registrations WHERE id = $1 AND organization_id = $2`,
    [studentId, organizationId],
  );
  const seasonYear = row.rows[0]?.vbs_season_year;
  if (!seasonYear) {
    return { error: "Registration not found" as const };
  }
  if (!registrationStudentVisible(seasonYear, seasonAccess)) {
    return { error: "You cannot edit registrations from another VBS season" as const };
  }
  return { ok: true as const };
}

async function enrollmentCounts(organizationId: string, seasonYear: number) {
  const result = await db().query<{ class_id: string; count: number }>(
    `SELECT cs.class_id, COUNT(*)::int AS count
     FROM vbs_registration_class_students cs
     JOIN vbs_registrations r ON r.id = cs.student_id
     WHERE r.organization_id = $1 AND r.vbs_season_year = $2
     GROUP BY cs.class_id`,
    [organizationId, seasonYear],
  );
  return new Map(result.rows.map((row) => [row.class_id, row.count]));
}

async function studentsForClasses(classIds: string[]) {
  const map = new Map<string, string[]>();
  if (classIds.length === 0) {
    return map;
  }
  const result = await db().query<{ class_id: string; student_id: string }>(
    `SELECT cs.class_id, cs.student_id
     FROM vbs_registration_class_students cs
     WHERE cs.class_id = ANY($1)
     ORDER BY cs.class_id, cs.sort_order, cs.student_id`,
    [classIds],
  );
  for (const row of result.rows) {
    const list = map.get(row.class_id) ?? [];
    list.push(row.student_id);
    map.set(row.class_id, list);
  }
  return map;
}

async function syncPrimaryClassId(organizationId: string, studentId: string) {
  const primary = await db().query<{ class_id: string | null }>(
    `SELECT cs.class_id
     FROM vbs_registration_class_students cs
     JOIN vbs_registrations r ON r.id = cs.student_id
     WHERE cs.student_id = $1 AND r.organization_id = $2
     ORDER BY cs.sort_order, cs.class_id
     LIMIT 1`,
    [studentId, organizationId],
  );
  const classId = primary.rows[0]?.class_id ?? null;
  await db().query(
    `UPDATE vbs_registrations SET class_id = $3, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [studentId, organizationId, classId],
  );
}

export async function classIdsForStudents(organizationId: string, studentIds: string[]) {
  const map = new Map<string, string[]>();
  if (studentIds.length === 0) {
    return map;
  }
  const result = await db().query<{ student_id: string; class_id: string }>(
    `SELECT cs.student_id, cs.class_id
     FROM vbs_registration_class_students cs
     JOIN vbs_registrations r ON r.id = cs.student_id
     WHERE r.organization_id = $1 AND cs.student_id = ANY($2)
     ORDER BY cs.student_id, cs.sort_order, cs.class_id`,
    [organizationId, studentIds],
  );
  for (const row of result.rows) {
    const list = map.get(row.student_id) ?? [];
    list.push(row.class_id);
    map.set(row.student_id, list);
  }
  return map;
}

async function staffForClasses(classIds: string[]) {
  const map = new Map<string, { leaders: string[]; teachers: string[]; helpers: string[] }>();
  if (classIds.length === 0) {
    return map;
  }
  const result = await db().query<{ class_id: string; username: string; role: string }>(
    `SELECT class_id, username, role FROM vbs_registration_class_staff
     WHERE class_id = ANY($1)
     ORDER BY class_id, role, COALESCE(sort_order, 0), username`,
    [classIds],
  );
  for (const row of result.rows) {
    const entry = map.get(row.class_id) ?? { leaders: [], teachers: [], helpers: [] };
    if (row.role === "leader") {
      entry.leaders.push(row.username);
    } else if (row.role === "helper") {
      entry.helpers.push(row.username);
    } else {
      entry.teachers.push(row.username);
    }
    map.set(row.class_id, entry);
  }
  return map;
}

function stationNameForRow(row: ClassRow) {
  if (row.rotation_index !== null && row.rotation_index >= 0 && row.rotation_index < VBS_ROTATION_STATION_NAMES.length) {
    return VBS_ROTATION_STATION_NAMES[row.rotation_index]!;
  }
  const bucket = rotationBucket(row.name);
  return bucket !== null ? VBS_ROTATION_STATION_NAMES[bucket]! : "";
}

function presentClass(
  row: ClassRow,
  enrolled: number,
  staff: { leaders: string[]; teachers: string[]; helpers: string[] },
  studentIds: string[],
): VbsRegistrationClass {
  const rotationIndex =
    row.rotation_index !== null && row.rotation_index >= 0 && row.rotation_index < VBS_ROTATION_STATION_NAMES.length
      ? row.rotation_index
      : rotationBucket(row.name);
  const stationName = stationNameForRow(row);
  const sectionLabel = row.section_label.trim() || (rotationIndex !== null ? inferSectionLabelFromClassName(row.name, rotationIndex) : "");
  const name =
    rotationIndex !== null
      ? formatRegistrationClassName(rotationIndex, sectionLabel)
      : row.name;
  return {
    id: row.id,
    organizationId: row.organization_id,
    name,
    rotationIndex,
    sectionLabel,
    stationName,
    minAge: row.min_age,
    maxAge: row.max_age,
    capacityMax: row.capacity_max,
    registrationClosed: row.registration_closed,
    sortOrder: row.sort_order,
    boardOrder: row.board_order,
    enrolledCount: enrolled,
    leaders: staff.leaders,
    teachers: staff.teachers,
    helpers: staff.helpers,
    studentIds,
    vbsSeasonYear: row.vbs_season_year,
  };
}

function resolveRotationIndexForLegacyRow(row: ClassRow, rowIndex: number, rowCount: number): number {
  const fromName = rotationBucket(row.name);
  if (fromName !== null) {
    return fromName;
  }
  if (
    row.rotation_index !== null &&
    row.rotation_index >= 0 &&
    row.rotation_index < VBS_ROTATION_STATION_NAMES.length
  ) {
    return row.rotation_index;
  }
  if (row.sort_order >= 0 && row.sort_order < VBS_ROTATION_STATION_NAMES.length) {
    return row.sort_order;
  }
  if (rowCount <= VBS_ROTATION_STATION_NAMES.length) {
    return Math.min(rowIndex, VBS_ROTATION_STATION_NAMES.length - 1);
  }
  return rowIndex % VBS_ROTATION_STATION_NAMES.length;
}

/** Map every existing class to a VBS rotation station and canonical title. */
async function normalizeRegistrationClassesToStations(organizationId: string, seasonYear: number) {
  const result = await db().query<ClassRow>(
    `SELECT ${CLASS_ROW_COLUMNS}
     FROM vbs_registration_classes
     WHERE organization_id = $1 AND COALESCE(vbs_season_year, $2) = $2
     ORDER BY sort_order, name`,
    [organizationId, seasonYear],
  );
  const rows = result.rows;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const rotationIndex = resolveRotationIndexForLegacyRow(row, i, rows.length);
    const sectionLabel =
      row.section_label.trim() || inferSectionLabelFromClassName(row.name, rotationIndex);
    const name = formatRegistrationClassName(rotationIndex, sectionLabel);
    const sortOrder = rotationIndex * 100 + row.min_age;
    const needsUpdate =
      row.rotation_index !== rotationIndex ||
      row.section_label !== sectionLabel ||
      row.name !== name ||
      row.sort_order !== sortOrder;
    if (!needsUpdate) {
      continue;
    }
    await db().query(
      `UPDATE vbs_registration_classes
       SET rotation_index = $3, section_label = $4, name = $5, sort_order = $6, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [row.id, organizationId, rotationIndex, sectionLabel, name, sortOrder],
    );
  }
}

function parseClassStationInput(input: Record<string, unknown>) {
  if (input.rotationIndex !== undefined && input.rotationIndex !== null && input.rotationIndex !== "") {
    const rotationIndex = Number(input.rotationIndex);
    if (!Number.isInteger(rotationIndex) || rotationIndex < 0 || rotationIndex >= VBS_ROTATION_STATION_NAMES.length) {
      return { error: "Select a VBS rotation station" as const };
    }
    const sectionLabel =
      typeof input.sectionLabel === "string" ? input.sectionLabel.trim().slice(0, 16) : "";
    return {
      rotationIndex,
      sectionLabel,
      name: formatRegistrationClassName(rotationIndex, sectionLabel),
    };
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return { error: "Select a station and age range (or provide a class name)" as const };
  }
  const bucket = rotationBucket(name);
  if (bucket === null) {
    return { error: "Class name must match a VBS rotation station (or send rotationIndex)" as const };
  }
  const sectionLabel = inferSectionLabelFromClassName(name, bucket);
  return {
    rotationIndex: bucket,
    sectionLabel,
    name: formatRegistrationClassName(bucket, sectionLabel),
  };
}

export async function listRegistrationClasses(organizationId: string, seasonYearOverride?: number) {
  const { getActiveVbsYear } = await import("./vbs-org-season.js");
  const seasonYear = seasonYearOverride ?? (await getActiveVbsYear(organizationId));
  await normalizeRegistrationClassesToStations(organizationId, seasonYear);
  const result = await db().query<ClassRow>(
    `SELECT ${CLASS_ROW_COLUMNS}
     FROM vbs_registration_classes
     WHERE organization_id = $1 AND COALESCE(vbs_season_year, $2) = $2
     ORDER BY COALESCE(board_order, 0), COALESCE(rotation_index, 99), min_age, section_label, sort_order, name`,
    [organizationId, seasonYear],
  );
  const classIds = result.rows.map((row) => row.id);
  const counts = await enrollmentCounts(organizationId, seasonYear);
  const staffMap = await staffForClasses(classIds);
  const studentMap = await studentsForClasses(classIds);
  return result.rows.map((row) =>
    presentClass(
      row,
      counts.get(row.id) ?? 0,
      staffMap.get(row.id) ?? { leaders: [], teachers: [], helpers: [] },
      studentMap.get(row.id) ?? [],
    ),
  );
}

/** Backfill station index / section labels from legacy class names. Multiple classes per station are allowed. */
export async function syncRegistrationClassesWithRotations(organizationId: string) {
  const { getActiveVbsYear } = await import("./vbs-org-season.js");
  const seasonYear = await getActiveVbsYear(organizationId);
  await normalizeRegistrationClassesToStations(organizationId, seasonYear);
}

/** Seed rotation-aligned classes when an org has none; otherwise sync missing rotations. */
export async function ensureDefaultRegistrationClasses(organizationId: string) {
  const { getActiveVbsYear } = await import("./vbs-org-season.js");
  const seasonYear = await getActiveVbsYear(organizationId);
  const existing = await db().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM vbs_registration_classes
     WHERE organization_id = $1 AND COALESCE(vbs_season_year, $2) = $2`,
    [organizationId, seasonYear],
  );
  if ((existing.rows[0]?.count ?? 0) === 0) {
    const { minAge, maxAge, capacityMax } = DEFAULT_REGISTRATION_CLASS_DEFAULTS;
    for (let i = 0; i < VBS_ROTATION_STATION_NAMES.length; i += 1) {
      const name = VBS_ROTATION_STATION_NAMES[i]!;
      await db().query(
        `INSERT INTO vbs_registration_classes (
          id, organization_id, name, rotation_index, section_label, min_age, max_age, capacity_max, registration_closed, sort_order, vbs_season_year, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,'',$5,$6,$7,FALSE,$8,$9,NOW(),NOW())`,
        [crypto.randomUUID(), organizationId, name, i, minAge, maxAge, capacityMax, i, seasonYear],
      );
    }
    return;
  }
  await syncRegistrationClassesWithRotations(organizationId);
}

export function classFitsAge(cls: { minAge: number; maxAge: number }, age: number) {
  return age >= cls.minAge && age <= cls.maxAge;
}

function vbsSeasonAgeReferenceDate(seasonYear: number) {
  return new Date(seasonYear, 6, 15);
}

export function classHasRoom(cls: { capacityMax: number; enrolledCount: number; registrationClosed: boolean }) {
  if (cls.registrationClosed) {
    return false;
  }
  if (cls.capacityMax <= 0) {
    return true;
  }
  return cls.enrolledCount < cls.capacityMax;
}

export function suggestClassForStudent(
  classes: VbsRegistrationClass[],
  age: number,
  specialRequests: string,
) {
  const special = specialRequests.toLowerCase();
  for (const cls of classes) {
    if (special && special.includes(cls.name.toLowerCase()) && classHasRoom(cls)) {
      return cls.id;
    }
  }
  const ageMatches = classes.filter((cls) => classFitsAge(cls, age) && classHasRoom(cls));
  ageMatches.sort((a, b) => {
    if (a.enrolledCount !== b.enrolledCount) {
      return a.enrolledCount - b.enrolledCount;
    }
    return a.sortOrder - b.sortOrder;
  });
  if (ageMatches[0]) {
    return ageMatches[0].id;
  }
  for (const cls of classes) {
    if (classHasRoom(cls)) {
      return cls.id;
    }
  }
  return "";
}

export async function checkCapacityAlerts(organizationId: string, classId: string) {
  const row = await db().query<ClassRow>(
    `SELECT ${CLASS_ROW_COLUMNS}
     FROM vbs_registration_classes WHERE id = $1 AND organization_id = $2`,
    [classId, organizationId],
  );
  const cls = row.rows[0];
  if (!cls || cls.capacity_max <= 0) {
    return;
  }
  const countResult = await db().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM vbs_registration_class_students cs
     JOIN vbs_registrations r ON r.id = cs.student_id
     WHERE r.organization_id = $1 AND cs.class_id = $2`,
    [organizationId, classId],
  );
  const count = countResult.rows[0]?.count ?? 0;
  const max = cls.capacity_max;
  const link = `/org/${organizationId}/registration?tab=classes`;
  const warnAt = Math.ceil(max * CAPACITY_WARN_RATIO);
  if (count < warnAt && cls.capacity_warn_notified_count !== 0) {
    await db().query(
      `UPDATE vbs_registration_classes SET capacity_warn_notified_count = 0, updated_at = NOW() WHERE id = $1`,
      [classId],
    );
  }
  if (count >= max && !cls.registration_closed) {
    await db().query(
      `UPDATE vbs_registration_classes SET registration_closed = TRUE, capacity_warn_notified_count = $2, updated_at = NOW()
       WHERE id = $1`,
      [classId, count],
    );
    await notifyRegistrationAdmins(
      organizationId,
      `Class full: ${cls.name}`,
      `${cls.name} reached its maximum of ${max} students. Online assignment to this class is now closed.`,
      link,
    );
    return;
  }
  if (count >= warnAt && count < max) {
    if (cls.capacity_warn_notified_count === count) {
      return;
    }
    await notifyRegistrationAdmins(
      organizationId,
      `Class almost full: ${cls.name}`,
      `${count} of ${max} spots filled in ${cls.name}.`,
      link,
    );
    await db().query(
      `UPDATE vbs_registration_classes SET capacity_warn_notified_count = $2, updated_at = NOW() WHERE id = $1`,
      [classId, count],
    );
  }
}

export async function saveRegistrationClass(
  organizationId: string,
  username: string,
  input: Record<string, unknown>,
) {
  const access = await requireRegistrationEditor(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const station = parseClassStationInput(input);
  if ("error" in station) {
    return station;
  }
  const minAge = Math.max(0, Number(input.minAge) || 0);
  const maxAge = Math.max(minAge, Number(input.maxAge) || 18);
  const capacityMax = Math.max(0, Number(input.capacityMax) || 0);
  const registrationClosed = input.registrationClosed === true;
  const sortOrder = station.rotationIndex * 100 + minAge;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (id) {
    await db().query(
      `UPDATE vbs_registration_classes SET
        name = $3, rotation_index = $4, section_label = $5, min_age = $6, max_age = $7, capacity_max = $8,
        registration_closed = $9, sort_order = $10, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [
        id,
        organizationId,
        station.name,
        station.rotationIndex,
        station.sectionLabel,
        minAge,
        maxAge,
        capacityMax,
        registrationClosed,
        sortOrder,
      ],
    );
  } else {
    const { getActiveVbsYear } = await import("./vbs-org-season.js");
    const seasonYear = await getActiveVbsYear(organizationId);
    const newId = crypto.randomUUID();
    await db().query(
      `INSERT INTO vbs_registration_classes (
        id, organization_id, name, rotation_index, section_label, min_age, max_age, capacity_max, registration_closed, sort_order, vbs_season_year, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
      [
        newId,
        organizationId,
        station.name,
        station.rotationIndex,
        station.sectionLabel,
        minAge,
        maxAge,
        capacityMax,
        registrationClosed,
        sortOrder,
        seasonYear,
      ],
    );
  }
  const classes = await listRegistrationClasses(organizationId);
  return { classes };
}

export async function deleteRegistrationClass(organizationId: string, username: string, classId: string) {
  const access = await requireRegistrationEditor(organizationId, username);
  if ("error" in access) {
    return access;
  }
  await db().query(`DELETE FROM vbs_registration_classes WHERE id = $1 AND organization_id = $2`, [
    classId,
    organizationId,
  ]);
  return { ok: true as const };
}

export async function assignStudentClass(
  organizationId: string,
  username: string,
  studentId: string,
  classId: string | null,
) {
  const access = await requireRegistrationEditor(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const studentSeason = await assertStudentSeasonEdit(organizationId, studentId, access.seasonAccess);
  if ("error" in studentSeason) {
    return studentSeason;
  }
  if (classId) {
    const added = await addStudentToClass(organizationId, studentId, classId);
    if ("error" in added) {
      return added;
    }
    await checkCapacityAlerts(organizationId, classId);
  } else {
    await db().query(
      `DELETE FROM vbs_registration_class_students cs
       USING vbs_registrations r
       WHERE cs.student_id = r.id AND r.id = $1 AND r.organization_id = $2`,
      [studentId, organizationId],
    );
    await db().query(
      `UPDATE vbs_registrations SET class_id = NULL, class_roster_sort = 0, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [studentId, organizationId],
    );
  }
  return { ok: true as const };
}

export async function addStudentToClass(organizationId: string, studentId: string, classId: string) {
  const cls = await db().query<ClassRow>(
    `SELECT id FROM vbs_registration_classes WHERE id = $1 AND organization_id = $2`,
    [classId, organizationId],
  );
  if (!cls.rows[0]) {
    return { error: "Class not found" as const };
  }
  const nextSort = await db().query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM vbs_registration_class_students WHERE class_id = $1`,
    [classId],
  );
  const sortOrder = nextSort.rows[0]?.next ?? 0;
  await db().query(
    `INSERT INTO vbs_registration_class_students (class_id, student_id, sort_order)
     VALUES ($1, $2, $3)
     ON CONFLICT (class_id, student_id) DO NOTHING`,
    [classId, studentId, sortOrder],
  );
  await syncPrimaryClassId(organizationId, studentId);
  return { ok: true as const };
}

export async function removeStudentFromClass(
  organizationId: string,
  username: string,
  studentId: string,
  classId: string,
) {
  const access = await requireRegistrationEditor(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const studentSeason = await assertStudentSeasonEdit(organizationId, studentId, access.seasonAccess);
  if ("error" in studentSeason) {
    return studentSeason;
  }
  await db().query(
    `DELETE FROM vbs_registration_class_students cs
     USING vbs_registrations r
     WHERE cs.student_id = r.id AND cs.class_id = $3 AND cs.student_id = $1 AND r.organization_id = $2`,
    [studentId, organizationId, classId],
  );
  await syncPrimaryClassId(organizationId, studentId);
  await checkCapacityAlerts(organizationId, classId);
  return { ok: true as const };
}

export async function assignClassStaff(
  organizationId: string,
  username: string,
  classId: string,
  targetUsername: string,
  role: ClassStaffRole,
) {
  const access = await requireRegistrationEditor(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const resolved = await findUser(targetUsername.trim());
  if (!resolved) {
    return { error: "User not found" as const };
  }
  const membership = await getMembership(organizationId, resolved);
  if (!membership) {
    return { error: "User is not a member of this organization" as const };
  }
  const exists = await db().query(`SELECT 1 FROM vbs_registration_classes WHERE id = $1 AND organization_id = $2`, [
    classId,
    organizationId,
  ]);
  if ((exists.rowCount ?? 0) === 0) {
    return { error: "Class not found" as const };
  }
  const nextSort = await db().query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM vbs_registration_class_staff
     WHERE class_id = $1 AND role = $2`,
    [classId, role],
  );
  const sortOrder = nextSort.rows[0]?.next ?? 0;
  await db().query(
    `INSERT INTO vbs_registration_class_staff (class_id, username, role, sort_order)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (class_id, username) DO UPDATE SET role = EXCLUDED.role, sort_order = EXCLUDED.sort_order`,
    [classId, resolved, role, sortOrder],
  );
  return { ok: true as const };
}

export async function reorderRegistrationClasses(
  organizationId: string,
  username: string,
  classIds: string[],
) {
  const access = await requireRegistrationEditor(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const unique = [...new Set(classIds.filter((id) => id.trim()))];
  if (unique.length === 0) {
    return { ok: true as const };
  }
  for (let i = 0; i < unique.length; i += 1) {
    await db().query(
      `UPDATE vbs_registration_classes SET board_order = $3, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [unique[i], organizationId, i * 10],
    );
  }
  return { ok: true as const };
}

export async function reorderClassStudents(
  organizationId: string,
  username: string,
  classId: string | null,
  studentIds: string[],
) {
  const access = await requireRegistrationEditor(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const unique = [...new Set(studentIds.filter((id) => id.trim()))];
  if (classId === null) {
    for (let i = 0; i < unique.length; i += 1) {
      const studentId = unique[i]!;
      const season = await assertStudentSeasonEdit(organizationId, studentId, access.seasonAccess);
      if ("error" in season) {
        return season;
      }
      await db().query(
        `UPDATE vbs_registrations SET class_roster_sort = $3, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [studentId, organizationId, i * 10],
      );
    }
    return { ok: true as const };
  }
  const cls = await db().query(`SELECT 1 FROM vbs_registration_classes WHERE id = $1 AND organization_id = $2`, [
    classId,
    organizationId,
  ]);
  if ((cls.rowCount ?? 0) === 0) {
    return { error: "Class not found" as const };
  }
  for (let i = 0; i < unique.length; i += 1) {
    const studentId = unique[i]!;
    const season = await assertStudentSeasonEdit(organizationId, studentId, access.seasonAccess);
    if ("error" in season) {
      return season;
    }
    await db().query(
      `INSERT INTO vbs_registration_class_students (class_id, student_id, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (class_id, student_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
      [classId, studentId, i * 10],
    );
    await syncPrimaryClassId(organizationId, studentId);
  }
  await db().query(
    `DELETE FROM vbs_registration_class_students cs
     USING vbs_registrations r
     WHERE cs.student_id = r.id AND cs.class_id = $1 AND r.organization_id = $2
       AND NOT (cs.student_id = ANY($3::text[]))`,
    [classId, organizationId, unique],
  );
  await checkCapacityAlerts(organizationId, classId);
  return { ok: true as const };
}

export async function reorderClassStaff(
  organizationId: string,
  username: string,
  classId: string,
  role: ClassStaffRole,
  usernames: string[],
) {
  const access = await requireRegistrationEditor(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const unique = [...new Set(usernames.filter((u) => u.trim()))];
  for (let i = 0; i < unique.length; i += 1) {
    await db().query(
      `UPDATE vbs_registration_class_staff SET sort_order = $4
       WHERE class_id = $1 AND username = $2 AND role = $3`,
      [classId, unique[i], role, i * 10],
    );
  }
  return { ok: true as const };
}

export async function removeClassStaff(
  organizationId: string,
  username: string,
  classId: string,
  targetUsername: string,
) {
  const access = await requireRegistrationEditor(organizationId, username);
  if ("error" in access) {
    return access;
  }
  await db().query(`DELETE FROM vbs_registration_class_staff WHERE class_id = $1 AND username = $2`, [
    classId,
    targetUsername,
  ]);
  return { ok: true as const };
}

/** Place each editable student on every station class whose age range fits (rotation rosters). */
export async function autoAssignStudentsByAge(organizationId: string, username: string) {
  const access = await requireRegistrationEditor(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const rows = await db().query<{
    id: string;
    birth_month: number;
    birth_year: number;
    child_full_name: string;
    vbs_season_year: number;
  }>(
    `SELECT id, birth_month, birth_year, child_full_name, vbs_season_year
     FROM vbs_registrations
     WHERE organization_id = $1
     ORDER BY child_full_name ASC`,
    [organizationId],
  );
  const seasonYears = new Set<number>();
  for (const row of rows.rows) {
    seasonYears.add(row.vbs_season_year ?? new Date().getFullYear());
  }
  const classesBySeason = new Map<number, VbsRegistrationClass[]>();
  for (const year of seasonYears) {
    classesBySeason.set(year, await listRegistrationClasses(organizationId, year));
  }
  const unplaced: { name: string; age: number }[] = [];
  let placedStudents = 0;
  const touchedClassIds = new Set<string>();

  for (const row of rows.rows) {
    const seasonCheck = await assertStudentSeasonEdit(organizationId, row.id, access.seasonAccess);
    if ("error" in seasonCheck) {
      continue;
    }
    const seasonYear = row.vbs_season_year ?? new Date().getFullYear();
    const age = ageFromBirthMonthYear(
      row.birth_month,
      row.birth_year,
      vbsSeasonAgeReferenceDate(seasonYear),
    );
    const classes = classesBySeason.get(seasonYear) ?? [];
    const matching = classes
      .filter((cls) => classFitsAge(cls, age))
      .sort(
        (a, b) =>
          (a.rotationIndex ?? 99) - (b.rotationIndex ?? 99) ||
          (a.boardOrder ?? 0) - (b.boardOrder ?? 0) ||
          a.minAge - b.minAge ||
          a.name.localeCompare(b.name),
      );

    if (matching.length === 0) {
      unplaced.push({ name: row.child_full_name, age });
      await db().query(
        `DELETE FROM vbs_registration_class_students cs
         USING vbs_registrations r
         WHERE cs.student_id = r.id AND r.id = $1 AND r.organization_id = $2`,
        [row.id, organizationId],
      );
      await syncPrimaryClassId(organizationId, row.id);
      continue;
    }

    const matchingIds = matching.map((cls) => cls.id);
    await db().query(
      `DELETE FROM vbs_registration_class_students cs
       USING vbs_registrations r, vbs_registration_classes c
       WHERE cs.student_id = r.id AND cs.class_id = c.id
         AND r.id = $1 AND r.organization_id = $2
         AND NOT (cs.class_id = ANY($3::text[]))`,
      [row.id, organizationId, matchingIds],
    );

    for (const cls of matching) {
      const added = await addStudentToClass(organizationId, row.id, cls.id);
      if ("error" in added) {
        return added;
      }
      touchedClassIds.add(cls.id);
    }
    placedStudents += 1;
  }

  for (const classId of touchedClassIds) {
    await checkCapacityAlerts(organizationId, classId);
  }

  return { ok: true as const, placedStudents, unplaced };
}

export async function pickClassForPublicRegistration(
  organizationId: string,
  birthMonth: number,
  birthYear: number,
  specialRequests: string,
) {
  const classes = await listRegistrationClasses(organizationId);
  const age = ageFromBirthMonthYear(birthMonth, birthYear);
  return suggestClassForStudent(classes, age, specialRequests);
}
