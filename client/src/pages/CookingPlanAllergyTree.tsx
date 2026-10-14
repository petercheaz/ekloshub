import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CookingPlanWorkspace } from "../types-cooking-plan";

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;

function TreeNode({
  title,
  subtitle,
  variant,
  children,
}: {
  title: string;
  subtitle?: string;
  variant: "root" | "allergen" | "group";
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

export function CookingPlanAllergyTree({ data }: { data: CookingPlanWorkspace }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.85);
  const [pan, setPan] = useState({ x: 32, y: 24 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const studentsByAllergen = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const label of data.commonAllergies) {
      map.set(label, []);
    }
    map.set("Other / notes", []);
    for (const student of data.allergyStudents) {
      let matched = false;
      for (const label of data.commonAllergies) {
        if (student.allergiesLabel.includes(label)) {
          map.get(label)!.push(student.childFullName);
          matched = true;
        }
      }
      if (!matched || student.allergiesLabel.includes(";")) {
        map.get("Other / notes")!.push(`${student.childFullName}: ${student.allergiesLabel}`);
      }
    }
    return map;
  }, [data.allergyStudents, data.commonAllergies]);

  const noAllergyCount = Math.max(0, data.studentCount - data.allergyStudents.length);

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage) {
      return;
    }
    const vp = viewport.getBoundingClientRect();
    const padding = 32;
    const nextScale = clampZoom(
      Math.min((vp.width - padding) / stage.offsetWidth, (vp.height - padding) / stage.offsetHeight, 1),
    );
    setScale(nextScale);
    setPan({ x: 20, y: 16 });
  }, []);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => fitToView());
    return () => window.cancelAnimationFrame(id);
  }, [data.studentCount, data.allergyStudents.length, fitToView]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setScale((current) => clampZoom(current * (event.deltaY > 0 ? 0.92 : 1.08)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <section className="vbs-cooking-allergy-tree vbs-panel">
      <header className="vbs-cooking-tree-head">
        <h2 className="vbs-plan-section-title">Allergy map</h2>
        <div className="vbs-roster-vizio-toolbar" role="toolbar" aria-label="Zoom">
          <button type="button" className="ghost" onClick={() => setScale((s) => clampZoom(s * 1.12))}>
            +
          </button>
          <button type="button" className="ghost" onClick={() => setScale((s) => clampZoom(s / 1.12))}>
            −
          </button>
          <button type="button" className="ghost" onClick={() => fitToView()}>
            Fit
          </button>
        </div>
      </header>
      <p className="muted vbs-roster-vizio-hint">Scroll to zoom · drag canvas to pan</p>
      <div
        ref={viewportRef}
        className={`vbs-roster-vizio-viewport vbs-cooking-tree-viewport${panning ? " is-panning" : ""}`}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest(".vbs-roster-tree-node-card")) {
            return;
          }
          setPanning(true);
          panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!panning) {
            return;
          }
          setPan({
            x: panStart.current.panX + (e.clientX - panStart.current.x),
            y: panStart.current.panY + (e.clientY - panStart.current.y),
          });
        }}
        onPointerUp={(e) => {
          setPanning(false);
          try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }}
      >
        <div
          ref={stageRef}
          className="vbs-roster-vizio-stage"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          <div className="vbs-roster-tree">
            <TreeNode
              title={data.organizationName || "VBS allergies"}
              subtitle={`${data.studentCount} registered · ${data.allergyStudents.length} with allergies listed`}
              variant="root"
            >
              <div className="vbs-roster-tree-branches">
                <TreeNode title="Main group" subtitle={`~${noAllergyCount} without listed allergens`} variant="group">
                  <p className="muted vbs-roster-tree-empty">Default snack line when plan is unified</p>
                </TreeNode>
                {data.commonAllergies.map((label) => {
                  const names = studentsByAllergen.get(label) ?? [];
                  const count = data.allergyByAllergen.find((a) => a.label === label)?.count ?? names.length;
                  return (
                    <TreeNode
                      key={label}
                      title={label}
                      subtitle={`${count} ${count === 1 ? "child" : "children"}`}
                      variant="allergen"
                    >
                      <ul className="vbs-roster-tree-leaves">
                        {names.map((name) => (
                          <li key={name} className="vbs-roster-tree-leaf">
                            {name.split(/\s+/)[0]}
                          </li>
                        ))}
                      </ul>
                    </TreeNode>
                  );
                })}
              </div>
            </TreeNode>
          </div>
        </div>
      </div>
    </section>
  );
}
