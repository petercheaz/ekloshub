import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

/** Primary action (save, add row, add column, open add form). Matches {@link CollapsibleFormTrigger}. */
export function AddActionButton({
  label,
  onClick,
  disabled,
  ariaExpanded,
  type = "button",
  className,
  compact,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  ariaExpanded?: boolean;
  type?: "button" | "submit";
  className?: string;
  /** Smaller padding and no min-width — tables and tight toolbars. */
  compact?: boolean;
}) {
  return (
    <button
      type={type}
      className={["vbs-plan-save", "vbs-add-action", compact ? "vbs-plan-save-compact" : "", className]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      aria-expanded={ariaExpanded}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Row of primary add actions below a table or list. */
export function SectionAddActions({ children }: { children: ReactNode }) {
  return <div className="vbs-section-add-actions">{children}</div>;
}

/** Primary navigation control styled like {@link AddActionButton}. */
export function PlanActionLink({
  to,
  label,
  className,
  compact,
}: {
  to: string;
  label: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      to={to}
      className={["vbs-plan-save", "vbs-add-action", "vbs-plan-action-link", compact ? "vbs-plan-save-compact" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </Link>
  );
}

/** Secondary navigation control (matches form Cancel / utility actions). */
export function PlanSecondaryLink({ to, label, className }: { to: string; label: string; className?: string }) {
  return (
    <Link to={to} className={["ghost", "vbs-plan-secondary-link", className].filter(Boolean).join(" ")}>
      {label}
    </Link>
  );
}

/** Primary control to open a hidden add/create form (disabled while the form is open). */
export function CollapsibleFormTrigger({
  label,
  onClick,
  disabled,
  ariaExpanded,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  ariaExpanded?: boolean;
}) {
  return (
    <AddActionButton
      label={label}
      disabled={disabled}
      ariaExpanded={ariaExpanded}
      onClick={onClick}
      className="vbs-collapsible-form-trigger"
    />
  );
}

export function CollapsibleFormPanel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `vbs-collapsible-form-panel ${className}` : "vbs-collapsible-form-panel"}>
      {title ? <h3 className="vbs-plan-section-title vbs-collapsible-form-title">{title}</h3> : null}
      {children}
    </div>
  );
}

export function CollapsibleFormActions({
  onCancel,
  saveLabel,
  busy,
  saveDisabled,
}: {
  onCancel: () => void;
  saveLabel: string;
  busy?: boolean;
  saveDisabled?: boolean;
}) {
  return (
    <div className="vbs-collapsible-form-actions">
      <button type="button" className="ghost" disabled={busy} onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="vbs-plan-save" disabled={busy || saveDisabled}>
        {saveLabel}
      </button>
    </div>
  );
}

/** Wrap fields + {@link CollapsibleFormActions} in a consistent panel form. */
export function CollapsibleForm({
  title,
  className,
  busy,
  saveLabel,
  saveDisabled,
  onCancel,
  onSubmit,
  children,
}: {
  title: string;
  className?: string;
  busy?: boolean;
  saveLabel: string;
  saveDisabled?: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <CollapsibleFormPanel title={title} className={className}>
      <form className="vbs-collapsible-form" onSubmit={onSubmit}>
        {children}
        <CollapsibleFormActions
          onCancel={onCancel}
          saveLabel={saveLabel}
          busy={busy}
          saveDisabled={saveDisabled}
        />
      </form>
    </CollapsibleFormPanel>
  );
}
