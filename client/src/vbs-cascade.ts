import type { Publisher, ShareProgram } from "./types";

/** Every distinct year in the catalog (not narrowed by publisher). */
export function vbsYearOptions(programs: ShareProgram[], extraYears: number[] = []): number[] {
  return [...new Set([...programs.map((program) => program.year), ...extraYears])].sort(
    (a, b) => b - a,
  );
}

/** Publishers that offer a program in the selected year; all publishers when year is open. */
export function vbsPublisherOptions(
  publishers: Publisher[],
  programs: ShareProgram[],
  yearFilter: string,
): Publisher[] {
  if (yearFilter === "all" || yearFilter === "") {
    return publishers;
  }
  const year = Number(yearFilter);
  if (!Number.isFinite(year)) {
    return publishers;
  }
  const ids = new Set(programs.filter((program) => program.year === year).map((program) => program.publisherId));
  return publishers.filter((publisher) => ids.has(publisher.id));
}

export function isSpecificVbsFilter(value: string): boolean {
  return value !== "all" && value !== "";
}

/** Curriculum titles matching publisher and year selections (either may be “all”). */
export function vbsTitleOptions(
  programs: ShareProgram[],
  publisherFilter: string,
  yearFilter: string,
): string[] {
  const themes = programs
    .filter((program) => {
      if (isSpecificVbsFilter(publisherFilter) && program.publisherId !== publisherFilter) {
        return false;
      }
      if (isSpecificVbsFilter(yearFilter) && program.year !== Number(yearFilter)) {
        return false;
      }
      return true;
    })
    .map((program) => program.theme);
  return [...new Set(themes)].sort((a, b) => a.localeCompare(b));
}

/** Title list for Share/Setup filters — only when year and publisher are both chosen. */
export function vbsTitleOptionsForListFilter(
  programs: ShareProgram[],
  publisherFilter: string,
  yearFilter: string,
): string[] {
  if (!isSpecificVbsFilter(publisherFilter) || !isSpecificVbsFilter(yearFilter)) {
    return [];
  }
  return vbsTitleOptions(programs, publisherFilter, yearFilter);
}

export function vbsProgramsMatching(
  programs: ShareProgram[],
  publisherId: string,
  year: string | number,
): ShareProgram[] {
  const yearNum = typeof year === "number" ? year : Number(year);
  return programs.filter((program) => {
    if (publisherId && program.publisherId !== publisherId) {
      return false;
    }
    if (year !== "" && Number.isFinite(yearNum) && program.year !== yearNum) {
      return false;
    }
    return true;
  });
}

export function coerceListTitleFilter(titleFilter: string, options: string[]): string {
  if (titleFilter === "all") {
    return titleFilter;
  }
  return options.includes(titleFilter) ? titleFilter : "all";
}

export function coerceListPublisherFilter(publisherFilter: string, options: Publisher[]): string {
  if (publisherFilter === "all") {
    return publisherFilter;
  }
  return options.some((publisher) => publisher.id === publisherFilter) ? publisherFilter : "all";
}

export function pickTitleAfterCascade(currentTitle: string, options: string[]): string {
  if (currentTitle === "all" || currentTitle === "") {
    return currentTitle;
  }
  return options.includes(currentTitle) ? currentTitle : "all";
}
