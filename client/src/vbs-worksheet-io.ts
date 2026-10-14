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
import type { PlanWorksheetData, TimelineColumn } from "./vbs-worksheet-types";
import { resolveCellStyle, worksheetRowKey } from "./vbs-worksheet-types";
import {
  allergiesSheetRows,
  classesSheetRows,
  registrationSheetRows,
  type WorkbookExportBundle,
  volunteersSheetRows,
} from "./vbs-workbook-sheets";

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
    bold: style.bold ?? false,
    italic: style.italic ?? false,
    underline: style.underline ?? false,
  };
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
  const timeline = buildTimelineRows(ctx);
  const tasks = buildTaskRegisterRows(ctx);
  const readiness = buildReadinessRows(ctx);

  addTimelineSheet(workbook, timeline, worksheetData);
  addTaskRegisterSheet(workbook, tasks, worksheetData, ctx.teamName);
  addReadinessSheet(workbook, readiness, worksheetData, ctx.teamName);

  if (extra?.registration) {
    const reg = extra.registration;
    addObjectSheet(
      workbook,
      "Registration",
      registrationSheetRows(reg, reg.canViewContacts),
    );
    addObjectSheet(workbook, "Classes", classesSheetRows(reg));
    if (reg.canViewAllergies) {
      addObjectSheet(workbook, "Allergies", allergiesSheetRows(reg));
    }
    addObjectSheet(workbook, "Volunteers", volunteersSheetRows(reg, ctx.data));
  } else if (extra) {
    addObjectSheet(workbook, "Volunteers", volunteersSheetRows(null, ctx.data));
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
  link.download = `${planTitle.replace(/[^\w\s-]/g, "").trim() || "vbs-plan"}.xlsx`;
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
    const title = String(row.getCell(5).text ?? "").trim();
    if (!date && !title) {
      return;
    }
    rows.push({
      date,
      start: String(row.getCell(2).text ?? "").trim(),
      end: String(row.getCell(3).text ?? "").trim(),
      type: String(row.getCell(4).text ?? "").trim(),
      title,
      notes: String(row.getCell(7).text ?? row.getCell(6).text ?? "").trim(),
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
