import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { OrgUserTypeahead } from "./OrgUserTypeahead";
import type { VbsPlanWorkspace } from "./types";
import { formatIsoDay } from "./vbs-plan-spreadsheet";

type AddKind = "task" | "schedule" | "checklist";

type Props = {
  day: Date;
  data: VbsPlanWorkspace;
  orgId: string;
  disabled?: boolean;
  onRun: (action: () => Promise<unknown>) => void;
};

const MENU_MIN_WIDTH = 168;

export function VbsPlanDayAdd({ day, data, orgId, disabled, onRun }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AddKind | null>(null);
  const [title, setTitle] = useState("");
  const [assignedUsername, setAssignedUsername] = useState("");
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const iso = formatIsoDay(day);

  const positionMenu = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) {
      return;
    }
    const rect = btn.getBoundingClientRect();
    const menuEl = menuRef.current;
    const menuW = Math.max(menuEl?.offsetWidth ?? MENU_MIN_WIDTH, MENU_MIN_WIDTH);
    const menuH = menuEl?.offsetHeight ?? 120;
    let top = rect.bottom + 4;
    let left = rect.right - menuW;
    if (top + menuH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuH - 4);
    }
    if (left < 8) {
      left = 8;
    }
    if (left + menuW > window.innerWidth - 8) {
      left = window.innerWidth - menuW - 8;
    }
    setMenuStyle({
      position: "fixed",
      top,
      left,
      minWidth: MENU_MIN_WIDTH,
      visibility: "visible",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    positionMenu();
  }, [open, kind, positionMenu]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) {
        return;
      }
      if (menuRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest(".vbs-cal-modal-overlay")) {
        return;
      }
      setOpen(false);
      setKind(null);
    }
    function onReposition() {
      positionMenu();
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, positionMenu]);

  if (!data.canWrite || disabled) {
    return null;
  }

  function reset() {
    setTitle("");
    setAssignedUsername("");
    setKind(null);
    setOpen(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const label = title.trim();
    if (!label) {
      return;
    }
    if (kind === "task") {
      onRun(async () => {
        await api.saveVbsTask(orgId, {
          title: label,
          description: "",
          category: "planning",
          status: "todo",
          dueDate: iso,
          assignedUsername,
          assignedTeamId: "",
        });
        reset();
      });
      return;
    }
    if (kind === "schedule") {
      const starts = data.plan?.dailyStart ?? "09:00";
      const ends = data.plan?.dailyEnd ?? "12:00";
      onRun(async () => {
        await api.saveVbsScheduleSlot(orgId, {
          dayDate: iso,
          startsAt: starts,
          endsAt: ends,
          label,
          teamId: "",
          stationId: "",
          notes: "",
        });
        reset();
      });
      return;
    }
    if (kind === "checklist") {
      onRun(async () => {
        await api.saveVbsChecklistItem(orgId, {
          category: "General",
          label,
          assignedTeamId: "",
          dueDate: iso,
        });
        reset();
      });
    }
  }

  const menu = open ? (
    <div
      ref={menuRef}
      className="vbs-cal-day-add-menu"
      style={menuStyle}
      role="dialog"
      aria-label={`Add on ${iso}`}
    >
      {!kind ? (
        <ul className="vbs-cal-day-add-list">
          <li>
            <button type="button" onClick={() => setKind("task")}>
              Task
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setKind("schedule")}>
              Schedule block
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setKind("checklist")}>
              Milestone
            </button>
          </li>
        </ul>
      ) : (
        <form className="vbs-cal-day-add-form" onSubmit={submit}>
          <p className="vbs-cal-day-add-form-label muted">
            New {kind === "task" ? "task" : kind === "schedule" ? "schedule block" : "checklist item"} · {iso}
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            required
            autoFocus
          />
          {kind === "task" ? (
            <label className="vbs-cal-day-add-assign">
              <span className="muted">Assigned to</span>
              <OrgUserTypeahead
                orgId={orgId}
                value={assignedUsername}
                onChange={setAssignedUsername}
                compact
                placeholder="Optional"
              />
            </label>
          ) : null}
          <div className="vbs-cal-day-add-form-actions">
            <button type="submit">Add</button>
            <button type="button" className="ghost" onClick={() => setKind(null)}>
              Back
            </button>
          </div>
        </form>
      )}
    </div>
  ) : null;

  return (
    <div className="vbs-cal-day-add" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="vbs-cal-day-add-btn"
        aria-label={`Add item on ${iso}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setKind(null);
        }}
      >
        +
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
