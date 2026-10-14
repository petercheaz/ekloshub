import { db } from "./db/pool.js";
import { canManageRegistration, getMembership } from "./orgs.js";
import { findUser, isPlatformAdmin } from "./users.js";
import { ageFromBirthMonthYear } from "./vbs-registration.js";
import { notifyRegistrationAdmins } from "./vbs-registration-notify.js";

export type ClassStaffRole = "leader" | "teacher" | "helper";

export type VbsRegistrationClass = {
  id: string;
  organizationId: string;
  name: string;
  minAge: number;
  maxAge: number;
  capacityMax: number;
  registrationClosed: boolean;
  sortOrder: number;
  enrolledCount: number;
  leaders: string[];
  teachers: string[];
  helpers: string[];
};

type ClassRow = {
  id: string;
  organization_id: string;
  name: string;
  min_age: number;
  max_age: number;
  capacity_max: number;
  registration_closed: boolean;
  sort_order: number;
  capacity_warn_notified_count: number;
};

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
  return { ok: true as const };
}

async function enrollmentCounts(organizationId: string) {
  const result = await db().query<{ class_id: string; count: number }>(
    `SELECT class_id, COUNT(*)::int AS count
     FROM vbs_registrations
     WHERE organization_id = $1 AND class_id IS NOT NULL
     GROUP BY class_id`,
    [organizationId],
  );
  return new Map(result.rows.map((row) => [row.class_id, row.count]));
}

async function staffForClasses(classIds: string[]) {
  const map = new Map<string, { leaders: string[]; teachers: string[]; helpers: string[] }>();
  if (classIds.length === 0) {
    return map;
  }
  const result = await db().query<{ class_id: string; username: string; role: string }>(
    `SELECT class_id, username, role FROM vbs_registration_class_staff WHERE class_id = ANY($1)`,
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

function presentClass(
  row: ClassRow,
  enrolled: number,
  staff: { leaders: string[]; teachers: string[]; helpers: string[] },
): VbsRegistrationClass {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    minAge: row.min_age,
    maxAge: row.max_age,
    capacityMax: row.capacity_max,
    registrationClosed: row.registration_closed,
    sortOrder: row.sort_order,
    enrolledCount: enrolled,
    leaders: staff.leaders,
    teachers: staff.teachers,
    helpers: staff.helpers,
  };
}

export async function listRegistrationClasses(organizationId: string) {
  const result = await db().query<ClassRow>(
    `SELECT id, organization_id, name, min_age, max_age, capacity_max, registration_closed, sort_order,
            COALESCE(capacity_warn_notified_count, 0)::int AS capacity_warn_notified_count
     FROM vbs_registration_classes
     WHERE organization_id = $1
     ORDER BY sort_order, name`,
    [organizationId],
  );
  const counts = await enrollmentCounts(organizationId);
  const staffMap = await staffForClasses(result.rows.map((row) => row.id));
  return result.rows.map((row) =>
    presentClass(row, counts.get(row.id) ?? 0, staffMap.get(row.id) ?? { leaders: [], teachers: [], helpers: [] }),
  );
}

export function classFitsAge(cls: { minAge: number; maxAge: number }, age: number) {
  return age >= cls.minAge && age <= cls.maxAge;
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
  for (const cls of classes) {
    if (classFitsAge(cls, age) && classHasRoom(cls)) {
      return cls.id;
    }
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
    `SELECT id, organization_id, name, min_age, max_age, capacity_max, registration_closed, sort_order,
            COALESCE(capacity_warn_notified_count, 0)::int AS capacity_warn_notified_count
     FROM vbs_registration_classes WHERE id = $1 AND organization_id = $2`,
    [classId, organizationId],
  );
  const cls = row.rows[0];
  if (!cls || cls.capacity_max <= 0) {
    return;
  }
  const countResult = await db().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM vbs_registrations WHERE organization_id = $1 AND class_id = $2`,
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
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return { error: "Class name is required" as const };
  }
  const minAge = Math.max(0, Number(input.minAge) || 0);
  const maxAge = Math.max(minAge, Number(input.maxAge) || 18);
  const capacityMax = Math.max(0, Number(input.capacityMax) || 0);
  const registrationClosed = input.registrationClosed === true;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (id) {
    await db().query(
      `UPDATE vbs_registration_classes SET
        name = $3, min_age = $4, max_age = $5, capacity_max = $6, registration_closed = $7, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId, name, minAge, maxAge, capacityMax, registrationClosed],
    );
  } else {
    const sort = await db().query<{ max: number }>(
      `SELECT COALESCE(MAX(sort_order), -1)::int AS max FROM vbs_registration_classes WHERE organization_id = $1`,
      [organizationId],
    );
    const newId = crypto.randomUUID();
    await db().query(
      `INSERT INTO vbs_registration_classes (
        id, organization_id, name, min_age, max_age, capacity_max, registration_closed, sort_order, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
      [newId, organizationId, name, minAge, maxAge, capacityMax, registrationClosed, (sort.rows[0]?.max ?? -1) + 1],
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
  await db().query(
    `UPDATE vbs_registrations SET class_id = NULL, updated_at = NOW()
     WHERE organization_id = $1 AND class_id = $2`,
    [organizationId, classId],
  );
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
  if (classId) {
    const cls = await db().query<ClassRow>(
      `SELECT id FROM vbs_registration_classes WHERE id = $1 AND organization_id = $2`,
      [classId, organizationId],
    );
    if (!cls.rows[0]) {
      return { error: "Class not found" as const };
    }
  }
  await db().query(
    `UPDATE vbs_registrations SET class_id = $3, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [studentId, organizationId, classId],
  );
  if (classId) {
    await checkCapacityAlerts(organizationId, classId);
  }
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
  await db().query(
    `INSERT INTO vbs_registration_class_staff (class_id, username, role)
     VALUES ($1,$2,$3)
     ON CONFLICT (class_id, username) DO UPDATE SET role = EXCLUDED.role`,
    [classId, resolved, role],
  );
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
