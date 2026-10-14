import type { VbsPlanWorkspace, VbsRegistrationStudent, VbsRegistrationWorkspace, VbsTask } from "./types";

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
  reimbursementOpen: WorkbookReimbursementRow[];
  reimbursementArchived: WorkbookReimbursementRow[];
};

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

export function registrationSheetRows(reg: VbsRegistrationWorkspace, includeContacts: boolean) {
  return reg.students.map((s) => {
    const base: Record<string, string | number> = {
      "Child name": s.childFullName,
      Age: s.ageYears,
      Class: s.className || "Unassigned",
      Team: s.assignedTeamName || "",
      "T-shirt": s.tshirtSize,
      Payment: s.paymentStatus,
      Source: s.source === "public" ? "Parent online" : "Staff",
      Attendance: attendanceDays(s),
    };
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
