const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function birthMonthOptions() {
  return MONTH_NAMES.map((label, index) => ({ value: index + 1, label }));
}

export function birthYearOptions(yearsBack = 18) {
  const current = new Date().getFullYear();
  const options: number[] = [];
  for (let year = current; year >= current - yearsBack; year -= 1) {
    options.push(year);
  }
  return options;
}

export function ageFromBirthMonthYear(birthMonth: number, birthYear: number, asOf = new Date()) {
  let age = asOf.getFullYear() - birthYear;
  if (asOf.getMonth() + 1 < birthMonth) {
    age -= 1;
  }
  return Math.max(0, age);
}

export function attendanceSummary(student: {
  attendMon: boolean;
  attendTue: boolean;
  attendWed: boolean;
  attendThu: boolean;
  attendFri: boolean;
}) {
  const days: string[] = [];
  if (student.attendMon) days.push("Mon");
  if (student.attendTue) days.push("Tue");
  if (student.attendWed) days.push("Wed");
  if (student.attendThu) days.push("Thu");
  if (student.attendFri) days.push("Fri");
  return days.length ? days.join(", ") : "—";
}

export function allergiesLabel(common: string[], other: string) {
  const parts = [...common];
  if (other.trim()) {
    parts.push(other.trim());
  }
  return parts.length ? parts.join("; ") : "None";
}
