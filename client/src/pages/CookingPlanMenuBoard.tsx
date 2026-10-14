import { useMemo, useState } from "react";
import { SNACK_MENU_DAYS } from "@vbs-snacks-menu-days";
import type { CookingPlanDocument, SnackMenuItem } from "../types-cooking-plan";

type DragPayload = { itemId: string; fromDayId: string };

function MenuItemCard({
  item,
  dayId,
  selected,
  onToggleSelect,
  onDragStart,
  canDrag,
}: {
  item: SnackMenuItem;
  dayId: string;
  selected: boolean;
  onToggleSelect: () => void;
  onDragStart: () => void;
  canDrag: boolean;
}) {
  return (
    <div
      className={`vbs-cooking-menu-item${selected ? " is-selected" : ""}${item.kind === "allergy-alt" ? " is-alt" : ""}`}
      draggable={canDrag}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
    >
      <label className="vbs-cooking-menu-item-select">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} />
        <span className="sr-only">Replace on generate</span>
      </label>
      <div className="vbs-cooking-menu-item-body">
        <strong>{item.title}</strong>
        {item.kind === "allergy-alt" && item.allergyLabel ? (
          <span className="vbs-cooking-menu-item-tag">Alt · {item.allergyLabel}</span>
        ) : (
          <span className="vbs-cooking-menu-item-tag">Main</span>
        )}
        {item.details ? <p className="muted">{item.details}</p> : null}
      </div>
    </div>
  );
}

export function CookingPlanMenuBoard({
  plan,
  onPlanChange,
  selectedIds,
  setSelectedIds,
  busy,
}: {
  plan: CookingPlanDocument;
  onPlanChange: (next: CookingPlanDocument) => void;
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  busy: boolean;
}) {
  const [drag, setDrag] = useState<DragPayload | null>(null);

  const itemCount = useMemo(
    () => SNACK_MENU_DAYS.reduce((sum, day) => sum + plan.days[day.id].items.length, 0),
    [plan],
  );

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  function moveItem(itemId: string, fromDayId: string, toDayId: string) {
    if (fromDayId === toDayId) {
      return;
    }
    const next: CookingPlanDocument = JSON.parse(JSON.stringify(plan)) as CookingPlanDocument;
    const fromItems = next.days[fromDayId as keyof typeof next.days].items;
    const index = fromItems.findIndex((i) => i.id === itemId);
    if (index < 0) {
      return;
    }
    const [item] = fromItems.splice(index, 1);
    if (!item) {
      return;
    }
    next.days[toDayId as keyof typeof next.days].items.push(item);
    onPlanChange(next);
  }

  return (
    <section className="vbs-panel vbs-cooking-menu-board">
      <header className="vbs-cooking-menu-board-head">
        <h2 className="vbs-plan-section-title">Week menu</h2>
        <p className="muted">
          {plan.strategy === "mixed" ? "Mixed plan" : "Unified plan"}
          {plan.strategyNote ? ` — ${plan.strategyNote}` : ""}
        </p>
        <p className="muted vbs-cooking-menu-board-hint">
          Drag items between days. Check items you want replaced with a <em>different</em> option, then Generate.
          {itemCount === 0 ? " Empty plan — Generate builds the full week." : ""}
        </p>
      </header>
      <div className="vbs-cooking-menu-columns">
        {SNACK_MENU_DAYS.map((day) => (
          <div
            key={day.id}
            className="vbs-cooking-menu-day"
            onDragOver={(e) => {
              if (drag) {
                e.preventDefault();
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag) {
                moveItem(drag.itemId, drag.fromDayId, day.id);
                setDrag(null);
              }
            }}
          >
            <h3>{day.label}</h3>
            <div className="vbs-cooking-menu-drop">
              {plan.days[day.id].items.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  dayId={day.id}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  canDrag={!busy}
                  onDragStart={() => setDrag({ itemId: item.id, fromDayId: day.id })}
                />
              ))}
              {plan.days[day.id].items.length === 0 ? (
                <p className="muted vbs-cooking-menu-empty">Drop or generate</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
