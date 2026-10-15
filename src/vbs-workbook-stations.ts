export type WorkbookStationNeedsSide = {
  stationId?: string;
  stationLabel: string;
  volunteersNeeded: string;
  roomSupplies: string;
};

export type WorkbookStationNeedsRow = {
  preschool: WorkbookStationNeedsSide;
  elementary: WorkbookStationNeedsSide;
};

export function stationLabelFirstLine(label: string): string {
  return label.split("\n")[0]?.trim() ?? "";
}

export function stationNameKey(name: string): string {
  return stationLabelFirstLine(name).toLowerCase();
}

export function shouldSkipWorkbookStationLabel(firstLine: string): boolean {
  const trimmed = firstLine.trim();
  if (!trimmed) {
    return true;
  }
  if (/^(preschool|elementary)$/i.test(trimmed)) {
    return true;
  }
  if (/notes$/i.test(trimmed)) {
    return true;
  }
  if (/^(crews|max |if \d|2 crews|\d+ )/i.test(trimmed)) {
    return true;
  }
  return false;
}

export type WorkbookStationCatalogEntry = {
  name: string;
  description: string;
};

/** Unique plan stations derived from workbook Station Needs labels (first line = name). */
export function buildStationCatalogFromWorkbookNeeds(
  rows: WorkbookStationNeedsRow[],
): WorkbookStationCatalogEntry[] {
  const byKey = new Map<string, WorkbookStationCatalogEntry>();
  const order: string[] = [];

  for (const row of rows) {
    for (const side of [row.preschool, row.elementary]) {
      const label = side.stationLabel.trim();
      if (!label) {
        continue;
      }
      const first = stationLabelFirstLine(label);
      if (shouldSkipWorkbookStationLabel(first)) {
        continue;
      }
      const key = stationNameKey(first);
      const detailParts = [label];
      if (side.volunteersNeeded.trim()) {
        detailParts.push(`Volunteers: ${side.volunteersNeeded.trim()}`);
      }
      if (side.roomSupplies.trim()) {
        detailParts.push(side.roomSupplies.trim());
      }
      const description = detailParts.join("\n\n");
      if (!byKey.has(key)) {
        byKey.set(key, { name: first, description });
        order.push(key);
        continue;
      }
      const existing = byKey.get(key)!;
      if (description.length > existing.description.length) {
        byKey.set(key, { name: first, description });
      }
    }
  }

  return order.map((key) => byKey.get(key)!);
}

export function attachStationIdsToWorkbookNeeds(
  rows: WorkbookStationNeedsRow[],
  nameToId: Map<string, string>,
): WorkbookStationNeedsRow[] {
  const attachSide = (side: WorkbookStationNeedsSide): WorkbookStationNeedsSide => {
    const key = stationNameKey(side.stationLabel);
    const id = key ? nameToId.get(key) : undefined;
    if (!id) {
      return side;
    }
    return { ...side, stationId: id };
  };
  return rows.map((row) => ({
    preschool: attachSide(row.preschool),
    elementary: attachSide(row.elementary),
  }));
}
