import { useMemo, useRef } from "react";
import type { VbsPlanWorkspace } from "./types";
import { applyImportedRows, exportPlanWorkbook, parseWorkbookFile } from "./vbs-worksheet-io";
import { reimbursementRowsFromPlan, type WorkbookExportBundle } from "./vbs-workbook-sheets";
import type { WorksheetViewContext } from "./vbs-plan-worksheet-views";
import { normalizePlanWorksheetData } from "./vbs-worksheet-types";
import { api } from "./api";
import { AddActionButton } from "./CollapsibleForm";

type Props = {
  orgId: string;
  data: VbsPlanWorkspace;
  username: string;
  seesAllTeams: boolean;
  teamName: (id: string) => string;
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => void;
};

export function VbsPlanExcelExport({ orgId, data, username, seesAllTeams, teamName, busy, onRun }: Props) {
  const ctx = useMemo(
    (): WorksheetViewContext => ({ data, username, seesAllTeams, teamName }),
    [data, username, seesAllTeams, teamName],
  );
  const worksheetData = useMemo(
    () => normalizePlanWorksheetData(data.plan?.worksheetData),
    [data.plan?.worksheetData],
  );
  const importRef = useRef<HTMLInputElement>(null);

  if (!data.plan) {
    return null;
  }

  async function onExport() {
    const reimb = reimbursementRowsFromPlan(data.tasks);
    const extra: WorkbookExportBundle = {
      registration: null,
      cooking: null,
      reimbursementOpen: reimb.open,
      reimbursementArchived: reimb.archived,
      compliance: null,
    };
    try {
      extra.registration = await api.vbsRegistration(orgId);
    } catch {
      extra.registration = null;
    }
    try {
      extra.cooking = await api.cookingPlan(orgId);
    } catch {
      extra.cooking = null;
    }
    try {
      extra.compliance = (await api.volunteerCompliance(orgId)).volunteers;
    } catch {
      extra.compliance = null;
    }
    await exportPlanWorkbook(ctx, worksheetData, data.plan?.title ?? "VBS plan", extra);
  }

  function onImportFile(file: File) {
    void parseWorkbookFile(file).then((imported) => {
      if (imported.length === 0) {
        return;
      }
      onRun(async () => {
        await applyImportedRows(imported, orgId, data, api);
      });
    });
  }

  return (
    <div className="vbs-plan-excel-actions" aria-label="Excel export and import">
      <div className="vbs-plan-excel-actions-buttons">
        <AddActionButton label="Export to Excel" disabled={busy} onClick={() => void onExport()} />
        {data.canWrite ? (
          <>
            <AddActionButton
              label="Import timeline"
              disabled={busy}
              onClick={() => importRef.current?.click()}
            />
            <input
              ref={importRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  onImportFile(file);
                }
              }}
            />
          </>
        ) : null}
      </div>
      <p className="vbs-plan-excel-actions-hint muted">
        Download the Cornerstone-style VBS workbook (Timeline, ToDos, Schedule, Purchases, Volunteers, and more).
        Import updates rows from the <em>Timeline</em> sheet only.
      </p>
      <details className="vbs-plan-excel-actions-details">
        <summary className="muted">Sheets included in export</summary>
        <ul className="muted">
          <li>Timeline, VolunteerTimeline, ToDos, Schedule, Station Needs, Volunteer Placements</li>
          <li>Prayer, Volunteers (background check), Purchases, Notes for Next Year</li>
          <li>Registration & classes when allowed; reimbursements when submitted</li>
        </ul>
      </details>
    </div>
  );
}
