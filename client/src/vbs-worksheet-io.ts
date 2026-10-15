import ExcelJS from "exceljs";
import type { VbsPlanWorkspace } from "./types";
import type { ReadinessRow, TaskRegisterRow, WorksheetViewContext } from "./vbs-plan-worksheet-views";
import { MILESTONE_STATUS_LABELS, normalizeMilestoneStatus } from "./vbs-milestone-status";
import {
  buildReadinessRows,
  buildTaskRegisterRows,
  buildTimelineRows,
} from "./vbs-plan-worksheet-views";
import type { SpreadsheetRow } from "./vbs-plan-spreadsheet";
import type {
  PlanWorksheetData,
  PrayerScheduleRow,
  ScheduleMatrixData,
  StationNeedsRow,
  TimelineColumn,
  VolunteerPlacementsData,
} from "./vbs-worksheet-types";
import { normalizeScheduleMatrix } from "./vbs-schedule-matrix";
import { resolveCellStyle, worksheetRowKey } from "./vbs-worksheet-types";
import {
  allergiesSheetRows,
  classesSheetRows,
  complianceVolunteersSheetRows,
  cornerstoneTimelineSheetRows,
  purchasesSheetRows,
  registrationSheetRows,
  emptyVolunteerPlacements,
  scheduleMatrixFallbackData,
  toDosSheetRows,
  volunteerTimelineSheetRows,
  type WorkbookExportBundle,
} from "./vbs-workbook-sheets";
import {
  applyPeachDataRow,
  CORNERSTONE_EXCEL,
  excelDateValue,
  excelTimeValue,
  mergeTitleRow,
  setCellFill,
  styleFont,
  styleHeaderBand,
} from "./vbs-excel-cornerstone-style";

const TIMELINE_HEADERS = ["Date", "Start", "End", "Type", "Title", "Team / owner", "Notes"] as const;
const TIMELINE_COLUMNS: TimelineColumn[] = ["date", "start", "end", "type", "title", "team", "notes"];

const TASK_HEADERS = ["Category", "Task", "Assigned to", "Team", "Due date", "Status", "Notes"] as const;
const TASK_COLUMNS = ["category", "title", "owner", "team", "due", "status", "notes"] as const;

const READINESS_HEADERS = ["Workstream", "Item", "Team", "Target date", "Status", "Notes"] as const;
const READINESS_COLUMNS = ["category", "label", "team", "due", "status", "notes"] as const;

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

function applyStyle(cell: ExcelJS.Cell, style: { bold?: boolean; italic?: boolean; underline?: boolean }) {
  cell.font = {
    name: CORNERSTONE_EXCEL.font,
    bold: style.bold ?? false,
    italic: style.italic ?? false,
    underline: style.underline ?? false,
  };
}

function setWorkbookDefaults(workbook: ExcelJS.Workbook) {
  workbook.creator = "VBS Resources";
  workbook.created = new Date();
}

function addCornerstoneTimelineSheet(
  workbook: ExcelJS.Workbook,
  rows: ReturnType<typeof cornerstoneTimelineSheetRows>,
  vbsYear: number | undefined,
) {
  const sheet = workbook.addWorksheet("Timeline");
  const title = vbsYear ? `VBS ${vbsYear} Timeline` : "VBS Timeline";
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 3).value = "Notes";
  sheet.getCell(1, 4).value = "What actually happened";
  styleFont(sheet.getCell(1, 1), { bold: true });
  styleFont(sheet.getCell(1, 3), { bold: true });
  styleFont(sheet.getCell(1, 4), { bold: true });
  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 63;
  sheet.getColumn(3).width = 17;
  sheet.getColumn(4).width = 28;
  let rowNumber = 2;
  for (const row of rows) {
    const added = sheet.getRow(rowNumber);
    added.getCell(1).value = excelDateValue(String(row.Date ?? ""));
    added.getCell(2).value = row.Task ?? "";
    added.getCell(3).value = row.Notes ?? "";
    added.getCell(4).value = row["What actually happened"] ?? "";
    for (let col = 1; col <= 4; col += 1) {
      styleFont(added.getCell(col), { wrap: true });
    }
    rowNumber += 1;
  }
}

function addCornerstoneVolunteerTimelineSheet(
  workbook: ExcelJS.Workbook,
  rows: ReturnType<typeof volunteerTimelineSheetRows>,
) {
  const sheet = workbook.addWorksheet("VolunteerTimeline");
  const headers = ["Upcoming Dates", "Time", "Description", "Who", "Location"] as const;
  sheet.addRow([...headers]);
  styleHeaderBand(sheet, 1, headers.length, CORNERSTONE_EXCEL.greenHeader, true);
  const widths = [14.13, 13.63, 47.88, 12.13, 16.63];
  headers.forEach((_, index) => {
    sheet.getColumn(index + 1).width = widths[index];
  });
  for (const row of rows) {
    const added = sheet.addRow([
      row["Upcoming Dates"],
      row.Time,
      row.Description,
      row.Who,
      row.Location,
    ]);
    for (let col = 1; col <= 5; col += 1) {
      styleFont(added.getCell(col), { wrap: true });
    }
  }
}

function addCornerstoneToDosSheet(workbook: ExcelJS.Workbook, rows: ReturnType<typeof toDosSheetRows>) {
  const sheet = workbook.addWorksheet("ToDos");
  const headers = ["Task", "Status", "Owner", "Stage", "Due date", "Notes"] as const;
  sheet.addRow([...headers]);
  for (let col = 1; col <= headers.length; col += 1) {
    styleFont(sheet.getRow(1).getCell(col), { bold: true, wrap: true });
  }
  const widths = [31.88, 17.63, 20.5, 16, 14.13, 47.75];
  headers.forEach((_, index) => {
    sheet.getColumn(index + 1).width = widths[index];
  });
  for (const row of rows) {
    const added = sheet.addRow([
      row.Task,
      row.Status,
      row.Owner,
      row.Stage,
      row["Due date"] ? excelDateValue(String(row["Due date"])) : "",
      row.Notes,
    ]);
    for (let col = 1; col <= 6; col += 1) {
      styleFont(added.getCell(col), { wrap: true });
    }
  }
}

function styleTimelineCell(data: PlanWorksheetData, row: SpreadsheetRow, column: TimelineColumn) {
  const key = worksheetRowKey(row.itemType, row.itemId);
  return resolveCellStyle(data, "timeline", key, column);
}

function addTimelineSheet(workbook: ExcelJS.Workbook, rows: SpreadsheetRow[], worksheetData: PlanWorksheetData) {
  const sheet = workbook.addWorksheet("Master timeline");
  sheet.columns = TIMELINE_HEADERS.map((header) => ({
    header,
    width: header === "Title" ? 36 : header === "Notes" ? 28 : 14,
  }));
  for (const row of rows) {
    const key = worksheetRowKey(row.itemType, row.itemId);
    const notes = worksheetData.notes[key] ?? "";
    const added = sheet.addRow([
      row.date,
      row.timeStart,
      row.timeEnd,
      row.subtitle,
      row.title,
      row.teamLabel,
      notes,
    ]);
    for (const [index, column] of TIMELINE_COLUMNS.entries()) {
      applyStyle(added.getCell(index + 1), styleTimelineCell(worksheetData, row, column));
    }
  }
  sheet.getRow(1).font = { bold: true };
}

function addTaskRegisterSheet(
  workbook: ExcelJS.Workbook,
  rows: TaskRegisterRow[],
  worksheetData: PlanWorksheetData,
  teamName: (id: string) => string,
) {
  const sheet = workbook.addWorksheet("Task register");
  sheet.columns = TASK_HEADERS.map((header) => ({
    header,
    width: header === "Task" || header === "Notes" ? 32 : 14,
  }));
  for (const row of rows) {
    const notes = worksheetData.notes[row.rowKey] ?? row.description;
    const added = sheet.addRow([
      row.category,
      row.title,
      row.assignedUsername,
      row.assignedTeamId ? teamName(row.assignedTeamId) : "",
      row.dueDate,
      STATUS_LABEL[row.status] ?? row.status,
      notes,
    ]);
    for (const [index, column] of TASK_COLUMNS.entries()) {
      applyStyle(added.getCell(index + 1), resolveCellStyle(worksheetData, "taskRegister", row.rowKey, column));
    }
  }
  sheet.getRow(1).font = { bold: true };
}

function addReadinessSheet(
  workbook: ExcelJS.Workbook,
  rows: ReadinessRow[],
  worksheetData: PlanWorksheetData,
  teamName: (id: string) => string,
) {
  const sheet = workbook.addWorksheet("Launch checklist");
  sheet.columns = READINESS_HEADERS.map((header) => ({
    header,
    width: header === "Item" || header === "Notes" ? 32 : 14,
  }));
  for (const row of rows) {
    const notes = worksheetData.notes[row.rowKey] ?? "";
    const added = sheet.addRow([
      row.category,
      row.label,
      row.assignedTeamId ? teamName(row.assignedTeamId) : "",
      row.dueDate,
      MILESTONE_STATUS_LABELS[normalizeMilestoneStatus(row)],
      notes,
    ]);
    for (const [index, column] of READINESS_COLUMNS.entries()) {
      applyStyle(added.getCell(index + 1), resolveCellStyle(worksheetData, "readiness", row.rowKey, column));
    }
  }
  sheet.getRow(1).font = { bold: true };
}

function addPrayerScheduleSheet(workbook: ExcelJS.Workbook, rows: PrayerScheduleRow[], vbsYear?: number) {
  const sheet = workbook.addWorksheet("Prayer");
  const title = vbsYear ? `VBS ${vbsYear} DAILY PRAYER SCHEDULE` : "VBS DAILY PRAYER SCHEDULE";
  mergeTitleRow(sheet, 1, 1, 4, title, CORNERSTONE_EXCEL.purpleTitle, true);
  const header = sheet.addRow(["Person 1", "Person 2", "Person 3", "Date to Pray"]);
  styleHeaderBand(sheet, 2, 4, CORNERSTONE_EXCEL.purpleHeader, false);
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 21.88;
  sheet.getColumn(3).width = 17.75;
  sheet.getColumn(4).width = 14;
  for (const row of rows) {
    const added = sheet.addRow([
      row.person1,
      row.person2,
      row.person3,
      row.prayDate ? excelDateValue(row.prayDate) : "",
    ]);
    for (let col = 1; col <= 4; col += 1) {
      styleFont(added.getCell(col), { wrap: true });
    }
  }
}

function addVolunteerPlacementsSheet(workbook: ExcelJS.Workbook, data: VolunteerPlacementsData) {
  const sheet = workbook.addWorksheet("Volunteer Placements");
  const headerRow = sheet.getRow(1);
  headerRow.getCell(1).value = "";
  data.dayDates.forEach((iso, index) => {
    const cell = headerRow.getCell(index + 2);
    cell.value = excelDateValue(iso);
    setCellFill(cell, CORNERSTONE_EXCEL.purpleHeader);
    styleFont(cell, { bold: true, wrap: true });
  });
  sheet.getColumn(1).width = 30;
  data.dayDates.forEach((_, index) => {
    sheet.getColumn(index + 2).width = 30;
  });
  let rowNumber = 2;
  for (const row of data.rows) {
    const added = sheet.getRow(rowNumber);
    added.getCell(1).value = row.roleLabel;
    data.dayDates.forEach((date, index) => {
      added.getCell(index + 2).value = row.assignmentsByDate[date] ?? "";
    });
    applyPeachDataRow(sheet, rowNumber, data.dayDates.length + 1);
    rowNumber += 1;
  }
}

function addStationNeedsMatrixSheet(workbook: ExcelJS.Workbook, rows: StationNeedsRow[]) {
  const sheet = workbook.addWorksheet("Station Needs");
  const header = sheet.addRow([
    "Preschool",
    "Volunteers needed",
    "Room/Space needs & Supplies",
    "",
    "Elementary",
    "Volunteers needed",
    "Room/Space needs & Supplies",
  ]);
  for (let col = 1; col <= 3; col += 1) {
    setCellFill(header.getCell(col), CORNERSTONE_EXCEL.preschoolHeader);
    styleFont(header.getCell(col), { bold: true, wrap: true });
  }
  for (let col = 5; col <= 7; col += 1) {
    setCellFill(header.getCell(col), CORNERSTONE_EXCEL.elementaryHeader);
    styleFont(header.getCell(col), { bold: true, wrap: true });
  }
  const widths = [23.13, 17.88, 30.75, 2, 22.5, 16.63, 35.63];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  let rowNumber = 2;
  for (const row of rows) {
    const added = sheet.addRow([
      row.preschool.stationLabel,
      row.preschool.volunteersNeeded,
      row.preschool.roomSupplies,
      "",
      row.elementary.stationLabel,
      row.elementary.volunteersNeeded,
      row.elementary.roomSupplies,
    ]);
    applyPeachDataRow(sheet, rowNumber, 7);
    rowNumber += 1;
    void added;
  }
}

const SCHEDULE_PRESCHOOL_COLS = 3;
const SCHEDULE_ELEMENTARY_COLS = 4;

function scheduleRowForCornerstone(data: ScheduleMatrixData, row: ScheduleMatrixData["rows"][number]) {
  const values = data.columns.map((column) => row.cells[column.id] ?? "");
  const preschool = values[0] ?? "";
  const elementary = values.slice(1);
  const cells: string[] = [];
  for (let i = 0; i < SCHEDULE_PRESCHOOL_COLS; i += 1) {
    cells.push(preschool);
  }
  for (let i = 0; i < SCHEDULE_ELEMENTARY_COLS; i += 1) {
    cells.push(elementary[i] ?? elementary[0] ?? "");
  }
  return cells;
}

function addScheduleMatrixSheet(workbook: ExcelJS.Workbook, data: ScheduleMatrixData) {
  const sheet = workbook.addWorksheet("Schedule");
  const totalCols = 1 + SCHEDULE_PRESCHOOL_COLS + SCHEDULE_ELEMENTARY_COLS;
  const header = sheet.getRow(1);
  header.getCell(1).value = "Time";
  styleFont(header.getCell(1), { bold: true });
  for (let i = 0; i < SCHEDULE_PRESCHOOL_COLS; i += 1) {
    const cell = header.getCell(2 + i);
    cell.value = "Preschool";
    setCellFill(cell, CORNERSTONE_EXCEL.preschoolHeader);
    styleFont(cell, { bold: true });
  }
  for (let i = 0; i < SCHEDULE_ELEMENTARY_COLS; i += 1) {
    const cell = header.getCell(2 + SCHEDULE_PRESCHOOL_COLS + i);
    cell.value = "Elementary";
    setCellFill(cell, CORNERSTONE_EXCEL.elementaryHeader);
    styleFont(cell, { bold: true });
  }
  sheet.getColumn(1).width = 6.75;
  for (let col = 2; col <= totalCols; col += 1) {
    sheet.getColumn(col).width = 17.38;
  }
  for (const row of data.rows) {
    const grid = scheduleRowForCornerstone(data, row);
    const added = sheet.addRow([excelTimeValue(row.time), ...grid]);
    setCellFill(added.getCell(1), CORNERSTONE_EXCEL.scheduleAccent);
    for (let col = 2; col <= totalCols; col += 1) {
      styleFont(added.getCell(col), { wrap: true });
    }
  }
}

function addCornerstoneVolunteersSheet(
  workbook: ExcelJS.Workbook,
  rows: ReturnType<typeof complianceVolunteersSheetRows>,
) {
  const sheet = workbook.addWorksheet("Volunteers");
  const headers = ["Role", "Name", "Email", "Background Checks", "Notes"] as const;
  sheet.addRow([...headers]);
  styleHeaderBand(sheet, 1, headers.length, CORNERSTONE_EXCEL.volunteerHeader, false);
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 25;
  sheet.getColumn(3).width = 26;
  sheet.getColumn(4).width = 25;
  sheet.getColumn(5).width = 25;
  for (const row of rows) {
    const added = sheet.addRow([row.Role, row.Name, row.Email, row["Background Checks"], row.Notes]);
    for (let col = 1; col <= 5; col += 1) {
      styleFont(added.getCell(col), { wrap: true });
    }
  }
}

function addCornerstonePurchasesSheet(
  workbook: ExcelJS.Workbook,
  rows: ReturnType<typeof purchasesSheetRows>,
) {
  const sheet = workbook.addWorksheet("Purchases");
  if (rows.length === 0) {
    sheet.addRow(["(no purchase rows yet)"]);
    return;
  }
  const keys = Object.keys(rows[0]!);
  const header = sheet.getRow(1);
  header.getCell(1).value = "";
  keys.forEach((key, index) => {
    const cell = header.getCell(index + 2);
    cell.value = key;
    setCellFill(cell, CORNERSTONE_EXCEL.purpleHeader);
    styleFont(cell, { bold: true, wrap: true });
  });
  for (const row of rows) {
    const values = keys.map((key) => {
      const value = row[key];
      if (key === "Order Date" && typeof value === "string" && value) {
        return excelDateValue(value);
      }
      return value ?? "";
    });
    sheet.addRow(["", ...values]);
  }
  sheet.getColumn(1).width = 4;
  keys.forEach((key, index) => {
    sheet.getColumn(index + 2).width = Math.min(38, Math.max(12, key.length + 4));
  });
}

function addCornerstoneNotesSheet(workbook: ExcelJS.Workbook, notes: string | undefined, planYear?: number) {
  const sheet = workbook.addWorksheet("Notes for Next Year");
  const nextYear = planYear ? planYear + 1 : new Date().getFullYear() + 1;
  sheet.getCell(1, 1).value = `Notes for ${nextYear}`;
  styleFont(sheet.getCell(1, 1), { bold: true });
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 72;
  const text = notes?.trim() || "";
  if (!text) {
    sheet.getCell(3, 2).value = "(Add notes in Plan → Workbook.)";
    return;
  }
  const lines = text.split("\n");
  let rowNumber = 3;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const tab = trimmed.indexOf("\t");
    const pipe = trimmed.indexOf(" | ");
    if (pipe > 0 && pipe < 40) {
      sheet.getCell(rowNumber, 1).value = trimmed.slice(0, pipe);
      sheet.getCell(rowNumber, 2).value = trimmed.slice(pipe + 3);
    } else if (tab > 0) {
      sheet.getCell(rowNumber, 1).value = trimmed.slice(0, tab);
      sheet.getCell(rowNumber, 2).value = trimmed.slice(tab + 1);
    } else {
      sheet.getCell(rowNumber, 2).value = trimmed;
    }
    rowNumber += 1;
  }
}

function addObjectSheet(workbook: ExcelJS.Workbook, name: string, rows: Record<string, string | number>[]) {
  const sheet = workbook.addWorksheet(name.slice(0, 31));
  if (rows.length === 0) {
    sheet.addRow(["(no rows)"]);
    return;
  }
  const headers = Object.keys(rows[0]!);
  sheet.columns = headers.map((header) => ({ header, width: Math.min(42, Math.max(12, header.length + 4)) }));
  for (const row of rows) {
    sheet.addRow(headers.map((header) => row[header] ?? ""));
  }
  sheet.getRow(1).font = { bold: true };
}

function addReimbursementSheets(workbook: ExcelJS.Workbook, bundle: WorkbookExportBundle) {
  const headers = ["Task", "Amount", "Assigned to", "Due date", "Status"] as const;
  const add = (sheetName: string, rows: WorkbookExportBundle["reimbursementOpen"]) => {
    const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
    sheet.columns = headers.map((header) => ({ header, width: header === "Task" ? 36 : 14 }));
    for (const row of rows) {
      sheet.addRow([row.title, row.amount, row.assignedUsername, row.dueDate, row.status]);
    }
    if (rows.length === 0) {
      sheet.addRow(["(none)", "", "", "", ""]);
    }
    sheet.getRow(1).font = { bold: true };
  };
  add("Reimbursements (open)", bundle.reimbursementOpen);
  add("Reimbursements (archived)", bundle.reimbursementArchived);
}

export async function exportPlanWorkbook(
  ctx: WorksheetViewContext,
  worksheetData: PlanWorksheetData,
  planTitle: string,
  extra?: WorkbookExportBundle | null,
) {
  const workbook = new ExcelJS.Workbook();
  setWorkbookDefaults(workbook);
  const timeline = buildTimelineRows(ctx);
  const plan = ctx.data.plan;
  const planYear = plan?.year;
  const fileTitle = planTitle.replace(/[^\w\s-]/g, "").trim() || "VBS plan";

  addCornerstoneTimelineSheet(
    workbook,
    cornerstoneTimelineSheetRows(timeline, worksheetData),
    planYear,
  );
  addCornerstoneVolunteerTimelineSheet(workbook, volunteerTimelineSheetRows(worksheetData.volunteerTimeline));
  addCornerstoneToDosSheet(workbook, toDosSheetRows(ctx.data.tasks, ctx.teamName, worksheetData));
  const scheduleSheet = normalizeScheduleMatrix(worksheetData.scheduleMatrix);
  if (scheduleSheet?.rows.length) {
    addScheduleMatrixSheet(workbook, scheduleSheet);
  } else {
    addScheduleMatrixSheet(
      workbook,
      scheduleMatrixFallbackData(ctx.data.schedule, ctx.data.stations, ctx.teamName),
    );
  }
  if (worksheetData.stationNeeds?.length) {
    addStationNeedsMatrixSheet(workbook, worksheetData.stationNeeds);
  } else {
    addStationNeedsMatrixSheet(workbook, []);
  }
  addCornerstoneVolunteersSheet(
    workbook,
    complianceVolunteersSheetRows(extra?.compliance ?? null, extra?.registration ?? null, ctx.data),
  );
  const prayerRows = worksheetData.prayerSchedule?.length
    ? worksheetData.prayerSchedule
    : worksheetData.prayer?.length
      ? worksheetData.prayer.map((row) => ({
          person1: row.name,
          person2: row.request,
          person3: "",
          prayDate: "",
        }))
      : [];
  if (prayerRows.length) {
    addPrayerScheduleSheet(workbook, prayerRows, planYear);
  }
  const placements =
    worksheetData.volunteerPlacements ??
    (plan?.startDate && plan.endDate ? emptyVolunteerPlacements(plan.startDate, plan.endDate) : null);
  if (placements && (placements.rows.length > 0 || placements.dayDates.length > 0)) {
    addVolunteerPlacementsSheet(workbook, placements);
  }
  addCornerstonePurchasesSheet(workbook, purchasesSheetRows(ctx.data.supplies, plan?.budgetAmount));
  addCornerstoneNotesSheet(workbook, worksheetData.notesForNextYear, planYear);

  if (extra?.registration) {
    const reg = extra.registration;
    addObjectSheet(
      workbook,
      "Registration",
      registrationSheetRows(reg, reg.canViewContacts, reg.canViewAllergies),
    );
    addObjectSheet(workbook, "Classes", classesSheetRows(reg));
    if (reg.canViewAllergies) {
      addObjectSheet(workbook, "Allergies", allergiesSheetRows(reg));
    }
  }

  if (extra) {
    addReimbursementSheets(workbook, extra);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileTitle}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export type ImportedWorksheetRow = {
  date: string;
  start: string;
  end: string;
  type: string;
  title: string;
  notes: string;
};

export async function parseWorkbookFile(file: File): Promise<ImportedWorksheetRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet =
    workbook.getWorksheet("Timeline") ??
    workbook.getWorksheet("Master timeline") ??
    workbook.worksheets.find((ws) => /timeline/i.test(ws.name)) ??
    workbook.worksheets[0];
  if (!sheet) {
    return [];
  }
  const rows: ImportedWorksheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const date = String(row.getCell(1).text ?? "").trim();
    const title = String(row.getCell(2).text ?? row.getCell(5).text ?? "").trim();
    if (!date && !title) {
      return;
    }
    rows.push({
      date,
      start: String(row.getCell(2).text ?? "").trim(),
      end: String(row.getCell(3).text ?? "").trim(),
      type: String(row.getCell(4).text ?? "").trim(),
      title,
      notes: String(row.getCell(3).text ?? row.getCell(7).text ?? row.getCell(6).text ?? "").trim(),
    });
  });
  return rows;
}

export function normalizeImportType(raw: string): "task" | "schedule" | "checklist" | null {
  const value = raw.toLowerCase();
  if (value.includes("schedule")) {
    return "schedule";
  }
  if (value.includes("checklist")) {
    return "checklist";
  }
  if (value.includes("task") || value.includes("plan")) {
    return value.includes("plan") ? null : "task";
  }
  if (!value) {
    return "task";
  }
  return "task";
}

export async function applyImportedRows(
  rows: ImportedWorksheetRow[],
  orgId: string,
  data: VbsPlanWorkspace,
  api: typeof import("./api").api,
) {
  for (const row of rows) {
    const kind = normalizeImportType(row.type);
    if (!kind || !row.title.trim()) {
      continue;
    }
    if (kind === "task") {
      await api.saveVbsTask(orgId, {
        title: row.title,
        description: row.notes,
        category: "planning",
        status: "todo",
        dueDate: row.date,
        assignedUsername: "",
        assignedTeamId: "",
      });
    } else if (kind === "schedule") {
      await api.saveVbsScheduleSlot(orgId, {
        dayDate: row.date,
        startsAt: row.start || data.plan?.dailyStart || "09:00",
        endsAt: row.end || data.plan?.dailyEnd || "12:00",
        label: row.title,
        teamId: "",
        stationId: "",
        notes: row.notes,
      });
    } else if (kind === "checklist") {
      await api.saveVbsChecklistItem(orgId, {
        category: "General",
        label: row.title,
        assignedTeamId: "",
        dueDate: row.date,
        notes: row.notes,
      });
    }
  }
}
