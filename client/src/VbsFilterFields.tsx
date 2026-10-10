import { useMemo } from "react";
import type { Publisher, ShareProgram } from "./types";
import {
  coerceListPublisherFilter,
  coerceListTitleFilter,
  isSpecificVbsFilter,
  vbsPublisherOptions,
  vbsTitleOptions,
  vbsYearOptions,
} from "./vbs-cascade";

export type VbsFilterState = {
  yearFilter: string;
  publisherFilter: string;
  titleFilter: string;
};

type Action =
  | { type: "year"; value: string }
  | { type: "publisher"; value: string }
  | { type: "title"; value: string };

export function nextFilterState(
  programs: ShareProgram[],
  publishers: Publisher[],
  current: VbsFilterState,
  action: Action,
  mode: "list" | "pick" = "list",
): VbsFilterState {
  if (action.type === "title") {
    return { ...current, titleFilter: action.value };
  }
  if (action.type === "year") {
    const nextPublishers = vbsPublisherOptions(publishers, programs, action.value);
    const publisherFilter =
      mode === "pick"
        ? coerceListPublisherFilter(current.publisherFilter, nextPublishers) === "all"
          ? nextPublishers[0]?.id ?? ""
          : coerceListPublisherFilter(current.publisherFilter, nextPublishers)
        : coerceListPublisherFilter(current.publisherFilter, nextPublishers);
    const titleFilter = listTitleAfterParentChange(
      mode,
      action.value,
      publisherFilter,
      current.titleFilter,
      programs,
    );
    return {
      yearFilter: action.value,
      publisherFilter,
      titleFilter,
    };
  }
  const titleFilter = listTitleAfterParentChange(
    mode,
    current.yearFilter,
    action.value,
    current.titleFilter,
    programs,
  );
  return {
    ...current,
    publisherFilter: action.value,
    titleFilter,
  };
}

function listTitleAfterParentChange(
  mode: "list" | "pick",
  yearFilter: string,
  publisherFilter: string,
  currentTitle: string,
  programs: ShareProgram[],
): string {
  if (mode === "list" && (yearFilter === "all" || publisherFilter === "all")) {
    return "all";
  }
  const titleOptions = vbsTitleOptions(programs, publisherFilter, yearFilter);
  return mode === "pick"
    ? pickTitleAfterChange(currentTitle, titleOptions)
    : coerceListTitleFilter(currentTitle, titleOptions);
}

function pickTitleAfterChange(currentTitle: string, options: string[]): string {
  if (currentTitle && options.includes(currentTitle)) {
    return currentTitle;
  }
  return options.length === 1 ? options[0] : "";
}

type Props = {
  programs: ShareProgram[];
  publishers: Publisher[];
  extraYears?: number[];
  value: VbsFilterState;
  onChange: (next: VbsFilterState) => void;
  ariaLabel?: string;
  mode?: "list" | "pick";
  disabled?: boolean;
  hideAllOptions?: { year?: boolean; publisher?: boolean; title?: boolean };
};

export function VbsFilterFields({
  programs,
  publishers,
  extraYears = [],
  value,
  onChange,
  ariaLabel = "VBS filters",
  mode = "list",
  disabled = false,
  hideAllOptions = {},
}: Props) {
  const years = useMemo(() => vbsYearOptions(programs, extraYears), [programs, extraYears]);
  const filterPublishers = useMemo(
    () => vbsPublisherOptions(publishers, programs, value.yearFilter),
    [publishers, programs, value.yearFilter],
  );
  const titleOptions = useMemo(() => {
    if (mode === "pick") {
      return vbsTitleOptions(programs, value.publisherFilter, value.yearFilter);
    }
    return vbsTitleOptions(programs, value.publisherFilter, value.yearFilter);
  }, [programs, value.publisherFilter, value.yearFilter, mode]);

  const titlesReady =
    mode === "list" ||
    (isSpecificVbsFilter(value.yearFilter) && isSpecificVbsFilter(value.publisherFilter));

  function patch(action: Action) {
    onChange(nextFilterState(programs, publishers, value, action, mode));
  }

  const showYearAll = mode === "list" && !hideAllOptions.year;
  const showPublisherAll = mode === "list" && !hideAllOptions.publisher;
  const showTitleAll = mode === "list" && !hideAllOptions.title;

  return (
    <section className="vbs-filter-fields" aria-label={ariaLabel}>
      <div className="vbs-filter-field">
        <label htmlFor="vbs-filter-year">Year</label>
        <select
          id="vbs-filter-year"
          className="vbs-filter-control"
          value={value.yearFilter}
          disabled={disabled}
          onChange={(event) => patch({ type: "year", value: event.target.value })}
        >
          {showYearAll ? <option value="all">All years</option> : null}
          {years.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <div className="vbs-filter-field">
        <label htmlFor="vbs-filter-publisher">Publisher</label>
        <select
          id="vbs-filter-publisher"
          className="vbs-filter-control"
          value={value.publisherFilter}
          disabled={disabled}
          onChange={(event) => patch({ type: "publisher", value: event.target.value })}
        >
          {showPublisherAll ? <option value="all">All publishers</option> : null}
          {filterPublishers.map((publisher) => (
            <option key={publisher.id} value={publisher.id}>
              {publisher.name}
            </option>
          ))}
        </select>
      </div>
      <div className="vbs-filter-field">
        <label htmlFor="vbs-filter-title">Curriculum</label>
        <select
          id="vbs-filter-title"
          key={`${value.yearFilter}:${value.publisherFilter}`}
          className="vbs-filter-control"
          value={value.titleFilter}
          disabled={disabled || !titlesReady}
          onChange={(event) => patch({ type: "title", value: event.target.value })}
        >
          {showTitleAll ? <option value="all">All curriculum</option> : null}
          {mode === "pick" && titlesReady ? (
            <option value="">Select curriculum</option>
          ) : null}
          {titlesReady
            ? titleOptions.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))
            : null}
        </select>
        {!titlesReady && mode === "pick" ? (
          <p className="vbs-filter-hint">Choose year and publisher to list curriculum names.</p>
        ) : null}
      </div>
    </section>
  );
}
