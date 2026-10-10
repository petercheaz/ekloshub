import { useMemo, useState } from "react";
import { useOrgVbs } from "./org-vbs";

type Props = {
  yearFilter: string;
  publisherFilter: string;
  titleFilter: string;
};

/** When year and publisher are open, curriculum is treated as All for save/default logic. */
export function effectiveVbsTitleFilter(
  yearFilter: string,
  publisherFilter: string,
  titleFilter: string,
): string {
  const yearAll = yearFilter === "all" || yearFilter === "";
  const publisherAll = publisherFilter === "all" || publisherFilter === "";
  if (yearAll && publisherAll) {
    return "all";
  }
  return titleFilter;
}

export function isAllVbsFilters(yearFilter: string, publisherFilter: string, titleFilter: string) {
  const yearAll = yearFilter === "all" || yearFilter === "";
  const publisherAll = publisherFilter === "all" || publisherFilter === "";
  const title = effectiveVbsTitleFilter(yearFilter, publisherFilter, titleFilter);
  const titleAll = title === "all" || title.trim() === "";
  return yearAll && publisherAll && titleAll;
}

export function isSpecificVbsFilters(yearFilter: string, publisherFilter: string, titleFilter: string) {
  const title = effectiveVbsTitleFilter(yearFilter, publisherFilter, titleFilter);
  return (
    yearFilter !== "all" &&
    yearFilter !== "" &&
    publisherFilter !== "all" &&
    publisherFilter !== "" &&
    title !== "all" &&
    title.trim() !== ""
  );
}

export function VbsFilterDefaultNote() {
  const { filterSource, userDefault } = useOrgVbs();

  if (filterSource === "user" && userDefault?.allFilters) {
    return (
      <p className="vbs-filter-note muted">
        Started from your default: <strong>All years · All publishers · All curriculum</strong>. Change filters
        anytime, or save a new default below.
      </p>
    );
  }
  if (filterSource === "user" && userDefault) {
    return (
      <p className="vbs-filter-note muted">
        Started from your default VBS: {userDefault.publisherName} · {userDefault.year} ·{" "}
        {userDefault.programTitle}. Change filters anytime, or save a new default below.
      </p>
    );
  }
  return (
    <p className="vbs-filter-note muted">
      Pick year, publisher, and curriculum to narrow results—or set all three to <strong>All</strong> and save that
      as your default. Check <strong>Save as my default VBS</strong> to remember your choice on Share, Setup,
      Reviews, and your org plan.
    </p>
  );
}

export function VbsFilterSaveDefaultCheckbox({ yearFilter, publisherFilter, titleFilter }: Props) {
  const { userDefault, saveUserDefault } = useOrgVbs();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const allFilters = isAllVbsFilters(yearFilter, publisherFilter, titleFilter);
  const specificFilters = isSpecificVbsFilters(yearFilter, publisherFilter, titleFilter);

  const matchesUser = useMemo(() => {
    if (!userDefault) {
      return false;
    }
    if (userDefault.allFilters) {
      return allFilters;
    }
    if (allFilters) {
      return false;
    }
    return (
      String(userDefault.year) === yearFilter &&
      userDefault.publisherId === publisherFilter &&
      userDefault.programTitle === titleFilter
    );
  }, [userDefault, yearFilter, publisherFilter, titleFilter, allFilters]);

  const canSave = allFilters || specificFilters;

  async function toggle(checked: boolean) {
    if (!checked) {
      return;
    }
    if (!canSave) {
      setMessage("Choose All for every filter, or a specific year, publisher, and VBS title.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      if (allFilters) {
        await saveUserDefault({
          allFilters: true,
          year: 0,
          publisherId: "all",
          programTitle: "all",
        });
        setMessage("Saved: all years, publishers, and curriculum.");
      } else {
        await saveUserDefault({
          year: Number(yearFilter),
          publisherId: publisherFilter,
          programTitle: titleFilter,
        });
        setMessage("Saved as your personal default VBS.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vbs-filter-save">
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={matchesUser}
          disabled={saving || !canSave}
          onChange={(event) => void toggle(event.target.checked)}
        />
        <span>Save as my default VBS</span>
      </label>
      {message ? <p className="vbs-filter-note">{message}</p> : null}
    </div>
  );
}

export function applyVbsFilterDefault(
  filterDefault: { year: number; publisherId: string; programTitle: string; allFilters?: boolean } | null,
  siteDefaultYear: number,
): { yearFilter: string; publisherFilter: string; titleFilter: string } {
  if (filterDefault?.allFilters) {
    return {
      yearFilter: "all",
      publisherFilter: "all",
      titleFilter: "all",
    };
  }
  if (filterDefault?.programTitle && filterDefault.programTitle !== "all") {
    return {
      yearFilter: String(filterDefault.year),
      publisherFilter: filterDefault.publisherId,
      titleFilter: filterDefault.programTitle,
    };
  }
  return {
    yearFilter: "all",
    publisherFilter: "all",
    titleFilter: "all",
  };
}
