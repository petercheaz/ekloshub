import { useSearchParams } from "react-router-dom";
import type { VbsRegistrationWorkspace } from "../types";
import { VbsRegistrationClassesBoard } from "./VbsRegistrationClassesBoard";
import { VbsRegistrationRosterTree } from "./VbsRegistrationRosterTree";

export type RosterPlanView = "board" | "tree";

function viewFromSearch(params: URLSearchParams): RosterPlanView {
  return params.get("view") === "tree" ? "tree" : "board";
}

export function VbsRegistrationRosterPlanning({
  orgId,
  orgName,
  data,
  canWrite,
  onReload,
}: {
  orgId: string;
  orgName: string;
  data: VbsRegistrationWorkspace;
  canWrite: boolean;
  onReload: () => Promise<void>;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = viewFromSearch(searchParams);

  function setView(next: RosterPlanView) {
    const params = new URLSearchParams(searchParams);
    if (next === "board") {
      params.delete("view");
    } else {
      params.set("view", "tree");
    }
    params.set("tab", "classes");
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="vbs-roster-planning">
      <div className="vbs-roster-planning-views" role="tablist" aria-label="Roster layout">
        <button
          type="button"
          role="tab"
          className={view === "board" ? "vbs-roster-planning-view active" : "vbs-roster-planning-view"}
          aria-selected={view === "board"}
          onClick={() => setView("board")}
        >
          Board
        </button>
        <button
          type="button"
          role="tab"
          className={view === "tree" ? "vbs-roster-planning-view active" : "vbs-roster-planning-view"}
          aria-selected={view === "tree"}
          onClick={() => setView("tree")}
        >
          Tree diagram
        </button>
      </div>

      {view === "board" ? (
        <VbsRegistrationClassesBoard orgId={orgId} data={data} canWrite={canWrite} onReload={onReload} />
      ) : (
        <VbsRegistrationRosterTree orgId={orgId} orgName={orgName} data={data} />
      )}
    </div>
  );
}
