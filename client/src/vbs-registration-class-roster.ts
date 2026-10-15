import type { VbsRegistrationClass, VbsRegistrationStudent } from "./types";

function poolSort(a: VbsRegistrationStudent, b: VbsRegistrationStudent) {
  return (
    (a.classRosterSort ?? 0) - (b.classRosterSort ?? 0) ||
    a.childFullName.localeCompare(b.childFullName)
  );
}

/** Class rosters from class.studentIds; side pool lists every student (rotation copies). */
export function partitionStudentsByClass(
  students: VbsRegistrationStudent[],
  classes: VbsRegistrationClass[],
) {
  const studentById = new Map(students.map((student) => [student.id, student]));
  const map = new Map<string, VbsRegistrationStudent[]>();
  for (const cls of classes) {
    const list: VbsRegistrationStudent[] = [];
    for (const studentId of cls.studentIds ?? []) {
      const student = studentById.get(studentId);
      if (student) {
        list.push(student);
      }
    }
    map.set(cls.id, list);
  }
  const pool = [...students].sort(poolSort);
  return { map, unassigned: pool, pool };
}

export function insertIdBefore<T extends { id: string }>(list: T[], movedId: string, beforeId: string | null) {
  const moved = list.find((item) => item.id === movedId);
  if (!moved) {
    return list.map((item) => item.id);
  }
  const rest = list.filter((item) => item.id !== movedId);
  if (!beforeId) {
    return [...rest.map((item) => item.id), movedId];
  }
  const index = rest.findIndex((item) => item.id === beforeId);
  if (index === -1) {
    return [...rest.map((item) => item.id), movedId];
  }
  return [...rest.slice(0, index).map((item) => item.id), movedId, ...rest.slice(index).map((item) => item.id)];
}

export function insertUsernameBefore(list: string[], moved: string, beforeUsername: string | null) {
  const rest = list.filter((u) => u !== moved);
  if (!beforeUsername) {
    return [...rest, moved];
  }
  const index = rest.indexOf(beforeUsername);
  if (index === -1) {
    return [...rest, moved];
  }
  return [...rest.slice(0, index), moved, ...rest.slice(index)];
}

export function insertClassIdBefore(classIds: string[], movedId: string, beforeClassId: string | null) {
  const rest = classIds.filter((id) => id !== movedId);
  if (!beforeClassId) {
    return [...rest, movedId];
  }
  const index = rest.indexOf(beforeClassId);
  if (index === -1) {
    return [...rest, movedId];
  }
  return [...rest.slice(0, index), movedId, ...rest.slice(index)];
}
