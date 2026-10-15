import type { KeyboardEvent, MouseEvent } from "react";

const SKIP_TOGGLE = "select, input, textarea, button, a, label, [data-no-row-toggle]";

export function rowToggleClick(onToggle: () => void) {
  return (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest(SKIP_TOGGLE)) {
      return;
    }
    onToggle();
  };
}

export function rowToggleKeyDown(onToggle: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };
}

export function expandableRowHeaderProps(
  expanded: boolean,
  onToggle: () => void,
  className = "",
  ariaLabel?: string,
) {
  return {
    className: className ? `expandable-row-header ${className}` : "expandable-row-header",
    role: "button" as const,
    tabIndex: 0,
    "aria-expanded": expanded,
    ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
    onClick: rowToggleClick(onToggle),
    onKeyDown: rowToggleKeyDown(onToggle),
  };
}
