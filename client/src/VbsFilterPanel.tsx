import type { Publisher, ShareProgram } from "./types";
import { VbsFilterFields, type VbsFilterState } from "./VbsFilterFields";
import { VbsFilterDefaultNote, VbsFilterSaveDefaultCheckbox } from "./vbs-filters";

type ListProps = {
  mode?: "list";
  programs: ShareProgram[];
  publishers: Publisher[];
  extraYears?: number[];
  value: VbsFilterState;
  onChange: (next: VbsFilterState) => void;
  ariaLabel?: string;
  showSaveDefault?: boolean;
  compact?: boolean;
  disabled?: boolean;
};

type PickProps = {
  mode: "pick";
  programs: ShareProgram[];
  publishers: Publisher[];
  extraYears?: number[];
  value: VbsFilterState;
  onChange: (next: VbsFilterState) => void;
  ariaLabel?: string;
  showSaveDefault?: boolean;
  compact?: boolean;
  disabled?: boolean;
};

export type VbsFilterPanelProps = ListProps | PickProps;

export function VbsFilterPanel(props: VbsFilterPanelProps) {
  const {
    programs,
    publishers,
    extraYears,
    value,
    onChange,
    ariaLabel = "VBS filters",
    showSaveDefault = true,
    compact = false,
  } = props;
  const mode = props.mode ?? "list";
  const disabled = props.disabled ?? false;

  return (
    <div className={compact ? "vbs-filter-panel vbs-filter-panel-compact" : "vbs-filter-panel"}>
      <VbsFilterFields
        mode={mode}
        programs={programs}
        publishers={publishers}
        extraYears={extraYears}
        value={value}
        onChange={onChange}
        ariaLabel={ariaLabel}
        disabled={disabled}
        hideAllOptions={mode === "pick" ? { year: true, publisher: true, title: true } : { year: false }}
      />
      {showSaveDefault && mode === "list" ? (
        <div className="vbs-filter-panel-footer">
          <VbsFilterDefaultNote />
          <VbsFilterSaveDefaultCheckbox
            yearFilter={value.yearFilter}
            publisherFilter={value.publisherFilter}
            titleFilter={value.titleFilter}
          />
        </div>
      ) : null}
      {showSaveDefault && mode === "pick" ? (
        <div className="vbs-filter-panel-footer">
          <VbsFilterSaveDefaultCheckbox
            yearFilter={String(value.yearFilter)}
            publisherFilter={value.publisherFilter}
            titleFilter={value.titleFilter}
          />
        </div>
      ) : null}
    </div>
  );
}
