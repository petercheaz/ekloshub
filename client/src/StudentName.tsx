import type { VbsRegistrationStudent } from "./types";

export function studentGenderSuffix(gender: string) {
  return gender === "M" || gender === "F" ? gender : "";
}

/** Plain text for selects and exports */
export function studentPlainName(
  student: Pick<VbsRegistrationStudent, "childFullName" | "childGender">,
  compact?: boolean,
) {
  const base = compact ? studentFirstName(student.childFullName) : student.childFullName;
  const suffix = studentGenderSuffix(student.childGender);
  return suffix ? `${base} ${suffix}` : base;
}

export function studentFirstName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

type StudentNameProps = {
  student: Pick<VbsRegistrationStudent, "childFullName" | "childGender">;
  compact?: boolean;
  className?: string;
  /** When false, omit inline M/F (e.g. roster chips that already show a gender badge). */
  showGender?: boolean;
};

export function StudentName({ student, compact, className, showGender = true }: StudentNameProps) {
  const display = compact ? studentFirstName(student.childFullName) : student.childFullName;
  const gender =
    showGender && (student.childGender === "M" || student.childGender === "F")
      ? student.childGender
      : null;
  return (
    <span className={className ?? "vbs-student-name-inline"}>
      <span className="vbs-student-name-text">{display}</span>
      {gender ? (
        <span
          className="vbs-student-gender"
          title={gender === "M" ? "Male" : "Female"}
          aria-label={gender === "M" ? "Male" : "Female"}
        >
          {gender}
        </span>
      ) : null}
    </span>
  );
}
