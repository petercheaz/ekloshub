import { SNACK_MENU_DAYS } from "@vbs-snacks-menu-days";
import type { CookingPlanWorkspace } from "./types-cooking-plan";
import type {
  VbsPlan,
  VbsPlanWorkspace,
  VbsRegistrationStudent,
  VbsRegistrationWorkspace,
  VbsScheduleSlot,
  VbsStation,
  VbsSupplyItem,
  VbsTask,
  VolunteerComplianceVolunteer,
} from "./types";
import type {
  PlanWorksheetData,
  PrayerScheduleRow,
  ScheduleMatrixData,
  StationNeedsRow,
  VolunteerPlacementsData,
  VolunteerTimelineRow,
} from "./vbs-worksheet-types";
import type { SpreadsheetRow } from "./vbs-plan-spreadsheet";
import { emptyScheduleMatrix } from "./vbs-schedule-matrix";
import { allergiesLabel } from "./vbs-registration-utils";

export type WorkbookReimbursementRow = {
  taskId: string;
  title: string;
  amount: number;
  assignedUsername: string;
  dueDate: string;
  status: string;
  archived: boolean;
};

export type WorkbookExportBundle = {
  registration: VbsRegistrationWorkspace | null;
  cooking: CookingPlanWorkspace | null;
  reimbursementOpen: WorkbookReimbursementRow[];
  reimbursementArchived: WorkbookReimbursementRow[];
  compliance: VolunteerComplianceVolunteer[] | null;
};

function taskStatusLabel(status: VbsTask["status"]) {
  if (status === "done") {
    return "Completed";
  }
  if (status === "in_progress") {
    return "In progress";
  }
  if (status === "blocked") {
    return "Blocked";
  }
  return "Not started";
}

export function cornerstoneTimelineSheetRows(
  timeline: SpreadsheetRow[],
  worksheetData: PlanWorksheetData,
) {
  return timeline.map((row) => {
    const key = row.key;
    return {
      Date: row.date,
      Task: row.title,
      Notes: worksheetData.notes[key] ?? row.subtitle,
      "What actually happened": worksheetData.postEventNotes?.[key] ?? "",
    };
  });
}

export function volunteerTimelineSheetRows(rows: VolunteerTimelineRow[] | undefined) {
  if (!rows?.length) {
    return [
      {
        "Upcoming Dates": "",
        Time: "",
        Description: "(Add rows in Workbook → Volunteer timeline)",
        Who: "",
        Location: "",
      },
    ];
  }
  return rows.map((row) => ({
    "Upcoming Dates": row.date,
    Time: row.time,
    Description: row.description,
    Who: row.who,
    Location: row.location,
  }));
}

export function toDosSheetRows(tasks: VbsTask[], teamName: (id: string) => string, worksheetData: PlanWorksheetData) {
  return [...tasks]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title))
    .map((task) => ({
      Task: task.title,
      Status: taskStatusLabel(task.status),
      Owner: task.assignedUsername || (task.assignedTeamId ? teamName(task.assignedTeamId) : ""),
      Stage: task.category,
      "Due date": task.dueDate,
      Notes: worksheetData.notes[`task:${task.id}`] ?? task.notes ?? task.description,
    }));
}

export function scheduleCornerstoneSheetRows(
  schedule: VbsScheduleSlot[],
  stations: VbsStation[],
  teamName: (teamId: string) => string,
) {
  const stationMap = new Map(stations.map((s) => [s.id, s.name]));
  return dailyScheduleSheetRows(schedule, stations, teamName).map((row) => ({
    Time: `${row.Start}–${row.End}`,
    Activity: row.Activity,
    Station: row.Station,
    Team: row.Team,
    Date: row.Date,
    Notes: row.Notes,
    Preschool: "",
    Elementary: row.Station,
  }));
}

export function stationNeedsSheetRows(stations: VbsStation[], teamName: (id: string) => string) {
  return stations.map((station) => ({
    Station: station.name,
    "Volunteers needed": station.defaultTeamId ? teamName(station.defaultTeamId) : "",
    "Room / supplies notes": station.description,
  }));
}

export function prayerScheduleSheetRows(rows: PrayerScheduleRow[] | undefined) {
  if (!rows?.length) {
    return [];
  }
  return rows.map((row) => ({
    "Person 1": row.person1,
    "Person 2": row.person2,
    "Person 3": row.person3,
    "Date to Pray": row.prayDate,
  }));
}

export function defaultVolunteerPlacementDates(planStart: string, planEnd: string): string[] {
  if (!planStart || !planEnd) {
    return [];
  }
  const dates: string[] = [];
  const start = new Date(`${planStart}T12:00:00`);
  const end = new Date(`${planEnd}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }
  for (let cursor = start; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

export function emptyVolunteerPlacements(planStart: string, planEnd: string): VolunteerPlacementsData {
  const dayDates = defaultVolunteerPlacementDates(planStart, planEnd);
  return { dayDates, rows: [] };
}

export function sortPlacementDayDates(dayDates: string[]): string[] {
  return [...dayDates].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function suggestedNextVolunteerPlacementDay(dayDates: string[], planStart?: string): string {
  const sorted = sortPlacementDayDates(dayDates);
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1]!;
    const next = new Date(`${last}T12:00:00`);
    if (!Number.isNaN(next.getTime())) {
      next.setDate(next.getDate() + 1);
      return next.toISOString().slice(0, 10);
    }
  }
  if (planStart?.trim()) {
    return planStart.trim();
  }
  return new Date().toISOString().slice(0, 10);
}

export function addVolunteerPlacementDay(
  data: VolunteerPlacementsData,
  date: string,
): { ok: true; data: VolunteerPlacementsData } | { ok: false; message: string } {
  const iso = date.trim();
  if (!iso) {
    return { ok: false, message: "Choose a date for the new day column." };
  }
  if (Number.isNaN(new Date(`${iso}T12:00:00`).getTime())) {
    return { ok: false, message: "Invalid date." };
  }
  if (data.dayDates.includes(iso)) {
    return { ok: false, message: "That day is already on the placements sheet." };
  }
  const dayDates = sortPlacementDayDates([...data.dayDates, iso]);
  const rows = data.rows.map((row) => ({
    ...row,
    assignmentsByDate: { ...row.assignmentsByDate, [iso]: row.assignmentsByDate[iso] ?? "" },
  }));
  return { ok: true, data: { dayDates, rows } };
}

export function renameVolunteerPlacementDay(
  data: VolunteerPlacementsData,
  fromDate: string,
  toDate: string,
): { ok: true; data: VolunteerPlacementsData } | { ok: false; message: string } {
  if (fromDate === toDate) {
    return { ok: true, data };
  }
  const iso = toDate.trim();
  if (!iso) {
    return { ok: false, message: "Choose a date for this column." };
  }
  if (Number.isNaN(new Date(`${iso}T12:00:00`).getTime())) {
    return { ok: false, message: "Invalid date." };
  }
  if (!data.dayDates.includes(fromDate)) {
    return { ok: false, message: "That column is no longer on the sheet." };
  }
  if (data.dayDates.includes(iso)) {
    return { ok: false, message: "That day is already on the placements sheet." };
  }
  const dayDates = sortPlacementDayDates(data.dayDates.map((day) => (day === fromDate ? iso : day)));
  const rows = data.rows.map((row) => {
    const cells = { ...row.assignmentsByDate };
    const value = cells[fromDate] ?? "";
    delete cells[fromDate];
    cells[iso] = value;
    return { ...row, assignmentsByDate: cells };
  });
  return { ok: true, data: { dayDates, rows } };
}

export function removeVolunteerPlacementDay(data: VolunteerPlacementsData, date: string): VolunteerPlacementsData {
  const dayDates = data.dayDates.filter((day) => day !== date);
  const rows = data.rows.map((row) => {
    const cells = { ...row.assignmentsByDate };
    delete cells[date];
    return { ...row, assignmentsByDate: cells };
  });
  return { dayDates, rows };
}

export function scheduleMatrixFallbackData(
  schedule: VbsScheduleSlot[],
  stations: VbsStation[],
  teamName: (teamId: string) => string,
): ScheduleMatrixData {
  const base = emptyScheduleMatrix();
  return {
    ...base,
    rows: scheduleCornerstoneSheetRows(schedule, stations, teamName).map((row) => ({
      time: String(row.Time ?? ""),
      cells: {
        preschool: "",
        elementary: String(row.Activity ?? ""),
        rotationF: String(row.Station ?? ""),
        rotationG: String(row.Team ?? ""),
        rotationH: String(row.Notes ?? ""),
      },
    })),
  };
}

export function purchasesSheetRows(supplies: VbsSupplyItem[], budgetAmount?: number) {
  const budgetLabel = budgetAmount && budgetAmount > 0 ? `Budget ${budgetAmount}` : "Budget";
  return supplies.map((item) => ({
    Item: item.name,
    Vendor: "",
    Price: item.estimatedCost,
    QTY: item.quantity,
    "Total with tax": item.estimatedCost,
    "purchased by": "",
    "Order Date": "",
    "Reimbursed?": item.purchased ? "Yes" : "",
    Category: "",
    [budgetLabel]: "",
    Notes: item.notes,
  }));
}

export function complianceVolunteersSheetRows(
  compliance: VolunteerComplianceVolunteer[] | null,
  reg: VbsRegistrationWorkspace | null,
  plan: VbsPlanWorkspace,
) {
  const base = volunteersSheetRows(reg, plan);
  const statusByUser = new Map(
    (compliance ?? []).map((v) => [
      v.username,
      v.backgroundCheckStatus === "cleared"
        ? "Cleared"
        : v.backgroundCheckStatus === "pending"
          ? "Pending"
          : "Not started",
    ]),
  );
  return base.map((row) => {
    const complianceRow = (compliance ?? []).find((v) => v.username === row.Username);
    const displayName = complianceRow
      ? [complianceRow.firstName, complianceRow.lastName].filter(Boolean).join(" ").trim() || row.Username
      : row.Username;
    const bg = statusByUser.get(row.Username);
    let backgroundLabel = "Not started";
    if (bg === "Cleared") {
      backgroundLabel = "Cleared";
    } else if (bg === "Pending") {
      backgroundLabel = "Pending";
    } else if (!bg) {
      backgroundLabel = "Does not need";
    }
    return {
      Role: row.Teams.split(",")[0]?.trim() || row["Class roles"].split(";")[0]?.trim() || "",
      Name: displayName,
      Email: complianceRow?.email ?? "",
      "Background Checks": backgroundLabel,
      Notes: [row.Teams, row["Class roles"]].filter(Boolean).join(" · "),
    };
  });
}

export function notesForNextYearSheetRows(notes: string | undefined) {
  const text = notes?.trim() || "(Add notes in the plan worksheet for next year.)";
  return text.split("\n").filter(Boolean).map((line) => ({ Note: line }));
}

export function planSummarySheetRows(plan: VbsPlan, data: VbsPlanWorkspace) {
  const publisher = data.publishers.find((p) => p.id === plan.publisherId)?.name ?? plan.publisherId;
  const rows: Record<string, string | number>[] = [
    { Field: "Plan title", Value: plan.title || "VBS plan" },
    { Field: "Year", Value: plan.year || "" },
    { Field: "Publisher", Value: publisher },
    { Field: "Curriculum / program", Value: plan.programTitle || "" },
    { Field: "Location", Value: plan.location || "" },
    { Field: "Start date", Value: plan.startDate || "" },
    { Field: "End date", Value: plan.endDate || "" },
    { Field: "Daily hours", Value: `${plan.dailyStart || "—"} – ${plan.dailyEnd || "—"}` },
    { Field: "Expected kids", Value: plan.expectedKids || "" },
    { Field: "Budget", Value: plan.budgetAmount ?? 0 },
    { Field: "Expenses recorded", Value: plan.expensesAmount ?? 0 },
    { Field: "Coordinator notes", Value: plan.coordinatorNotes || "" },
    { Field: "Rotation stations", Value: data.stations.length },
    { Field: "Org teams", Value: data.teams.length },
    { Field: "Open tasks", Value: data.tasks.filter((t) => t.status !== "done").length },
    { Field: "Schedule blocks", Value: data.schedule.length },
  ];
  return rows;
}

export function dailyScheduleSheetRows(
  schedule: VbsScheduleSlot[],
  stations: VbsStation[],
  teamName: (teamId: string) => string,
) {
  const stationMap = new Map(stations.map((s) => [s.id, s.name]));
  return [...schedule]
    .sort(
      (a, b) =>
        a.dayDate.localeCompare(b.dayDate) ||
        a.startsAt.localeCompare(b.startsAt) ||
        a.label.localeCompare(b.label),
    )
    .map((slot) => ({
      Date: slot.dayDate,
      Start: slot.startsAt,
      End: slot.endsAt,
      Activity: slot.label,
      Station: slot.stationId ? (stationMap.get(slot.stationId) ?? slot.stationId) : "",
      Team: slot.teamId ? teamName(slot.teamId) : "",
      Notes: slot.notes,
    }));
}

export function stationsSheetRows(stations: VbsStation[], teamName: (teamId: string) => string) {
  return [...stations]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((station) => ({
      Station: station.name,
      "Default team": station.defaultTeamId ? teamName(station.defaultTeamId) : "",
      Description: station.description,
      "Sort order": station.sortOrder,
    }));
}

export function cookingSnacksSheetRows(cooking: CookingPlanWorkspace) {
  const rows: Record<string, string>[] = [
    { Day: "(plan)", Item: "Strategy", Kind: cooking.plan.strategy, Details: cooking.plan.strategyNote },
    { Day: "(plan)", Item: "Allergy summary", Kind: "", Details: cooking.allergySummary },
  ];
  for (const day of SNACK_MENU_DAYS) {
    const items = cooking.plan.days[day.id]?.items ?? [];
    if (items.length === 0) {
      rows.push({ Day: day.label, Item: "(none)", Kind: "", Details: "" });
      continue;
    }
    for (const item of items) {
      rows.push({
        Day: day.label,
        Item: item.title,
        Kind: item.kind === "allergy-alt" ? "Allergy alt" : "Main",
        Details: [item.allergyLabel, item.details].filter(Boolean).join(" — "),
      });
    }
  }
  return rows;
}

export function reimbursementRowsFromPlan(tasks: VbsTask[]): {
  open: WorkbookReimbursementRow[];
  archived: WorkbookReimbursementRow[];
} {
  const open: WorkbookReimbursementRow[] = [];
  const archived: WorkbookReimbursementRow[] = [];
  for (const task of tasks) {
    if (task.reimbursementStatus === "submitted" && !task.reimbursementArchived) {
      open.push({
        taskId: task.id,
        title: task.title,
        amount: task.expenseAmount ?? 0,
        assignedUsername: task.assignedUsername,
        dueDate: task.dueDate,
        status: "Submitted",
        archived: false,
      });
    } else if (task.reimbursementStatus === "reimbursed" && task.reimbursementArchived) {
      archived.push({
        taskId: task.id,
        title: task.title,
        amount: task.expenseAmount ?? 0,
        assignedUsername: task.assignedUsername,
        dueDate: task.dueDate,
        status: "Reimbursed (archived)",
        archived: true,
      });
    } else if (task.reimbursementStatus === "reimbursed" && !task.reimbursementArchived) {
      open.push({
        taskId: task.id,
        title: task.title,
        amount: task.expenseAmount ?? 0,
        assignedUsername: task.assignedUsername,
        dueDate: task.dueDate,
        status: "Reimbursed (awaiting cycle close)",
        archived: false,
      });
    }
  }
  open.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
  archived.sort((a, b) => a.title.localeCompare(b.title));
  return { open, archived };
}

function attendanceDays(student: VbsRegistrationStudent) {
  const days: string[] = [];
  if (student.attendMon) days.push("Mon");
  if (student.attendTue) days.push("Tue");
  if (student.attendWed) days.push("Wed");
  if (student.attendThu) days.push("Thu");
  if (student.attendFri) days.push("Fri");
  return days.join(", ");
}

export function registrationSheetRows(
  reg: VbsRegistrationWorkspace,
  includeContacts: boolean,
  includeAllergies: boolean,
) {
  return reg.students.map((s) => {
    const base: Record<string, string | number> = {
      "Child name": s.childFullName,
      Gender: s.childGender || "",
      Age: s.ageYears,
      Class: s.className || "Unassigned",
      Team: s.assignedTeamName || "",
      "T-shirt": s.tshirtSize,
      Payment: s.paymentStatus,
      Source: s.source === "public" ? "Parent online" : "Staff",
      Attendance: attendanceDays(s),
    };
    if (includeAllergies) {
      base.Allergies = allergiesLabel(s.allergiesCommon, s.allergiesOther);
    }
    if (includeContacts) {
      base["Contact 1"] = s.contact1Name;
      base["Phone 1"] = s.contact1Phone;
      base["Contact 2"] = s.contact2Name;
      base["Phone 2"] = s.contact2Phone;
    }
    base.Comments = s.comments;
    base["Special requests"] = s.specialRequests;
    return base;
  });
}

export function classesSheetRows(reg: VbsRegistrationWorkspace) {
  return reg.classes.map((cls) => ({
    Class: cls.name,
    Station: cls.stationName || "",
    Section: cls.sectionLabel || "",
    "Age min": cls.minAge,
    "Age max": cls.maxAge,
    Capacity: cls.capacityMax || "Open",
    Enrolled: cls.enrolledCount,
    Closed: cls.registrationClosed ? "Yes" : "No",
    Leaders: cls.leaders.join(", "),
    Teachers: cls.teachers.join(", "),
    Helpers: cls.helpers.join(", "),
  }));
}

export function allergiesSheetRows(reg: VbsRegistrationWorkspace) {
  return reg.students
    .filter((s) => s.allergiesCommon.length > 0 || s.allergiesOther.trim())
    .map((s) => ({
      "Child name": s.childFullName,
      Class: s.className || "Unassigned",
      Allergies: [...s.allergiesCommon, s.allergiesOther.trim()].filter(Boolean).join("; "),
      "Special requests": s.specialRequests,
    }));
}

export function volunteersSheetRows(reg: VbsRegistrationWorkspace | null, plan: VbsPlanWorkspace) {
  const rows: { Username: string; Teams: string; "Class roles": string }[] = [];
  const classRoles = new Map<string, string[]>();
  if (reg) {
    for (const cls of reg.classes) {
      for (const u of cls.leaders) {
        const list = classRoles.get(u) ?? [];
        list.push(`${cls.name} (leader)`);
        classRoles.set(u, list);
      }
      for (const u of cls.teachers) {
        const list = classRoles.get(u) ?? [];
        list.push(`${cls.name} (teacher)`);
        classRoles.set(u, list);
      }
      for (const u of cls.helpers) {
        const list = classRoles.get(u) ?? [];
        list.push(`${cls.name} (helper)`);
        classRoles.set(u, list);
      }
    }
  }
  const teamMap = new Map<string, string[]>();
  for (const team of plan.teams) {
    for (const u of team.memberUsernames) {
      const list = teamMap.get(u) ?? [];
      list.push(team.name);
      teamMap.set(u, list);
    }
  }
  const usernames = new Set([...teamMap.keys(), ...classRoles.keys()]);
  for (const username of [...usernames].sort()) {
    rows.push({
      Username: username,
      Teams: (teamMap.get(username) ?? []).join(", "),
      "Class roles": (classRoles.get(username) ?? []).join("; "),
    });
  }
  return rows;
}
