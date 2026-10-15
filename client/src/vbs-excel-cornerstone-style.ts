import type ExcelJS from "exceljs";

/** Colors from Cornerstone “VBS Planning” workbook (2026 reference). */
export const CORNERSTONE_EXCEL = {
  font: "Arial",
  greenHeader: "FF38761D",
  purpleTitle: "FF8E7CC3",
  purpleHeader: "FFD9D2E9",
  peachRow: "FFFCE5CD",
  preschoolHeader: "FFA4C2F4",
  elementaryHeader: "FF93C47D",
  volunteerHeader: "FFD9EAD3",
  scheduleAccent: "FFFFE599",
  white: "FFFFFFFF",
} as const;

export function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb }, bgColor: { argb } };
}

export function setCellFill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = solidFill(argb);
}

export function styleFont(
  cell: ExcelJS.Cell,
  opts: { bold?: boolean; colorArgb?: string; size?: number; wrap?: boolean; horizontal?: ExcelJS.Alignment["horizontal"] },
) {
  cell.font = {
    name: CORNERSTONE_EXCEL.font,
    size: opts.size ?? 11,
    bold: opts.bold ?? false,
    color: opts.colorArgb ? { argb: opts.colorArgb } : { theme: 1 },
  };
  cell.alignment = {
    vertical: "top",
    wrapText: opts.wrap ?? true,
    horizontal: opts.horizontal,
  };
}

export function styleHeaderBand(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  colCount: number,
  fillArgb: string,
  whiteText = false,
) {
  const row = sheet.getRow(rowNumber);
  for (let col = 1; col <= colCount; col += 1) {
    const cell = row.getCell(col);
    setCellFill(cell, fillArgb);
    styleFont(cell, { bold: true, colorArgb: whiteText ? CORNERSTONE_EXCEL.white : undefined, wrap: true });
  }
}

export function mergeTitleRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  fromCol: number,
  toCol: number,
  title: string,
  fillArgb: string,
  whiteText = true,
) {
  sheet.mergeCells(rowNumber, fromCol, rowNumber, toCol);
  const cell = sheet.getCell(rowNumber, fromCol);
  cell.value = title;
  setCellFill(cell, fillArgb);
  styleFont(cell, { bold: true, colorArgb: whiteText ? CORNERSTONE_EXCEL.white : undefined, horizontal: "center" });
}

/** Excel serial time (1899-12-30 base) from HH:mm. */
export function excelTimeValue(hhmm: string): Date | string {
  const trimmed = hhmm.trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return trimmed;
  }
  return new Date(Date.UTC(1899, 11, 30, hours, minutes, 0));
}

export function excelDateValue(iso: string): Date | string {
  const trimmed = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const [y, m, d] = trimmed.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
}

export function applyPeachDataRow(sheet: ExcelJS.Worksheet, rowNumber: number, colCount: number) {
  for (let col = 1; col <= colCount; col += 1) {
    setCellFill(sheet.getRow(rowNumber).getCell(col), CORNERSTONE_EXCEL.peachRow);
    styleFont(sheet.getRow(rowNumber).getCell(col), { wrap: true });
  }
}
