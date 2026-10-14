import { Children, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import type { OrgMember, VbsRegistrationClass, VbsRegistrationStudent, VbsRegistrationWorkspace } from "../types";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

function memberLabel(member: OrgMember) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
  return name || member.username;
}

function tshirtShort(size: string) {
  if (!size.trim()) {
    return "—";
  }
  return size.replace(/^Youth /, "Y").replace(/^Adult /, "A");
}

function StudentLeaf({ student }: { student: VbsRegistrationStudent }) {
  const first = student.childFullName.trim().split(/\s+/)[0] ?? student.childFullName;
  return (
    <li className="vbs-roster-tree-leaf" title={student.childFullName}>
      <span>{first}</span>
      <span className="vbs-roster-tree-leaf-meta" aria-hidden>
        {student.source === "public" ? <span className="vbs-reg-class-icon vbs-reg-class-icon-parent">P</span> : null}
        {student.paymentStatus === "pending" ? (
          <span className="vbs-reg-class-icon vbs-reg-class-icon-pay-pending">$</span>
        ) : null}
        <span className="vbs-reg-class-icon vbs-reg-class-icon-shirt">{tshirtShort(student.tshirtSize)}</span>
      </span>
    </li>
  );
}

function StaffLeaf({ label, role }: { label: string; role: "leader" | "teacher" | "helper" }) {
  return (
    <li className={`vbs-roster-tree-leaf vbs-roster-tree-leaf-staff is-${role}`}>
      <span>{label}</span>
      <span className="vbs-reg-class-chip-role">
        {role === "leader" ? "L" : role === "helper" ? "H" : "T"}
      </span>
    </li>
  );
}

function TreeNode({
  title,
  subtitle,
  variant,
  children,
}: {
  title: string;
  subtitle?: string;
  variant: "root" | "class" | "pool" | "group";
  children?: ReactNode;
}) {
  return (
    <div className={`vbs-roster-tree-node is-${variant}`}>
      <div className="vbs-roster-tree-node-card">
        <strong>{title}</strong>
        {subtitle ? <span className="muted vbs-roster-tree-node-sub">{subtitle}</span> : null}
      </div>
      {children ? (
        <>
          <div className="vbs-roster-tree-spine" aria-hidden />
          <div className="vbs-roster-tree-children">{children}</div>
        </>
      ) : null}
    </div>
  );
}

function LeafGroup({ title, children }: { title: string; children: ReactNode }) {
  const hasItems = Children.count(children) > 0;
  return (
    <div className="vbs-roster-tree-node is-group">
      <div className="vbs-roster-tree-node-card is-compact">
        <strong>{title}</strong>
      </div>
      {hasItems ? <ul className="vbs-roster-tree-leaves">{children}</ul> : <p className="muted vbs-roster-tree-empty">None</p>}
    </div>
  );
}

function ClassSubtree({
  cls,
  students,
  memberMap,
}: {
  cls: VbsRegistrationClass;
  students: VbsRegistrationStudent[];
  memberMap: Map<string, OrgMember>;
}) {
  const cap =
    cls.capacityMax > 0 ? `${cls.enrolledCount}/${cls.capacityMax}` : `${cls.enrolledCount} enrolled`;
  const subtitle = `Ages ${cls.minAge}–${cls.maxAge} · ${cap}${cls.registrationClosed ? " · closed" : ""}`;

  function staffName(username: string) {
    const member = memberMap.get(username);
    return member ? memberLabel(member) : username;
  }

  return (
    <TreeNode title={cls.name} subtitle={subtitle} variant="class">
      <div className="vbs-roster-tree-class-row">
        <LeafGroup title={`Leaders (${cls.leaders.length})`}>
          {cls.leaders.map((username) => (
            <StaffLeaf key={username} label={staffName(username)} role="leader" />
          ))}
        </LeafGroup>
        <LeafGroup title={`Teachers (${cls.teachers.length})`}>
          {cls.teachers.map((username) => (
            <StaffLeaf key={username} label={staffName(username)} role="teacher" />
          ))}
        </LeafGroup>
        <LeafGroup title={`Helpers (${cls.helpers.length})`}>
          {cls.helpers.map((username) => (
            <StaffLeaf key={username} label={staffName(username)} role="helper" />
          ))}
        </LeafGroup>
        <LeafGroup title={`Students (${students.length})`}>
          {students.map((student) => (
            <StudentLeaf key={student.id} student={student} />
          ))}
        </LeafGroup>
      </div>
    </TreeNode>
  );
}

export function VbsRegistrationRosterTree({
  orgId,
  orgName,
  data,
}: {
  orgId: string;
  orgName: string;
  data: VbsRegistrationWorkspace;
}) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 48, y: 32 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  useEffect(() => {
    let cancelled = false;
    api
      .organization(orgId)
      .then((detail) => {
        if (!cancelled) {
          setMembers(detail.members);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMembers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.username, m])), [members]);

  const { unassigned, byClass } = useMemo(() => {
    const map = new Map<string, VbsRegistrationStudent[]>();
    const loose: VbsRegistrationStudent[] = [];
    for (const student of data.students) {
      if (!student.classId) {
        loose.push(student);
        continue;
      }
      const list = map.get(student.classId) ?? [];
      list.push(student);
      map.set(student.classId, list);
    }
    return { unassigned: loose, byClass: map };
  }, [data.students]);

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage) {
      return;
    }
    const vp = viewport.getBoundingClientRect();
    const contentW = stage.offsetWidth;
    const contentH = stage.offsetHeight;
    if (contentW < 1 || contentH < 1) {
      return;
    }
    const padding = 48;
    const nextScale = clampZoom(Math.min((vp.width - padding) / contentW, (vp.height - padding) / contentH, 1));
    setScale(nextScale);
    setPan({
      x: Math.max(16, (vp.width - contentW * nextScale) / 2),
      y: Math.max(16, (vp.height - contentH * nextScale) / 2),
    });
  }, []);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => fitToView());
    return () => window.cancelAnimationFrame(id);
  }, [data.classes.length, data.students.length, fitToView]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      setScale((current) => clampZoom(current * factor));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest(".vbs-roster-tree-node-card")) {
      return;
    }
    setPanning(true);
    panStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!panning) {
      return;
    }
    setPan({
      x: panStart.current.panX + (event.clientX - panStart.current.x),
      y: panStart.current.panY + (event.clientY - panStart.current.y),
    });
  }

  function endPan(event: React.PointerEvent) {
    if (!panning) {
      return;
    }
    setPanning(false);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  const summary = `${data.summary.total} registered · ${data.summary.parentOnline} parent online · ${data.classes.length} classes`;

  return (
    <div className="vbs-roster-vizio">
      <div className="vbs-roster-vizio-toolbar" role="toolbar" aria-label="Diagram zoom">
        <button type="button" className="ghost" onClick={() => setScale((s) => clampZoom(s * 1.15))} title="Zoom in">
          +
        </button>
        <button type="button" className="ghost" onClick={() => setScale((s) => clampZoom(s / 1.15))} title="Zoom out">
          −
        </button>
        <button type="button" className="ghost" onClick={() => setScale(1)} title="100%">
          100%
        </button>
        <button type="button" className="ghost" onClick={() => fitToView()} title="Fit diagram">
          Fit
        </button>
        <span className="muted vbs-roster-vizio-zoom-label">{Math.round(scale * 100)}%</span>
      </div>
      <p className="muted vbs-roster-vizio-hint">Scroll to zoom · drag empty space to pan · read-only overview</p>

      <div
        ref={viewportRef}
        className={`vbs-roster-vizio-viewport${panning ? " is-panning" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div
          ref={stageRef}
          className="vbs-roster-vizio-stage"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          <div className="vbs-roster-tree" role="tree" aria-label="VBS roster hierarchy">
            <TreeNode title={orgName || "VBS roster"} subtitle={summary} variant="root">
              <div className="vbs-roster-tree-branches">
                {unassigned.length > 0 ? (
                  <TreeNode
                    title="Unassigned students"
                    subtitle={`${unassigned.length} waiting for a class`}
                    variant="pool"
                  >
                    <ul className="vbs-roster-tree-leaves">
                      {unassigned.map((student) => (
                        <StudentLeaf key={student.id} student={student} />
                      ))}
                    </ul>
                  </TreeNode>
                ) : null}
                {data.classes.map((cls) => (
                  <ClassSubtree
                    key={cls.id}
                    cls={cls}
                    students={byClass.get(cls.id) ?? []}
                    memberMap={memberMap}
                  />
                ))}
                {data.classes.length === 0 && unassigned.length === 0 ? (
                  <p className="muted vbs-roster-tree-placeholder">Add classes in Board view to build the tree.</p>
                ) : null}
              </div>
            </TreeNode>
          </div>
        </div>
      </div>
    </div>
  );
}
