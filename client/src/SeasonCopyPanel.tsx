import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { AddActionButton } from "./CollapsibleForm";
import { useOrgVbs } from "./org-vbs";
import { vbsProgramsMatching, vbsPublisherOptions, vbsYearOptions } from "./vbs-cascade";

export type SeasonCopyOptions = {
  activeVbsYear: number;
  planYear: number | null;
  sourceYears: number[];
  registrationOnlyYears: number[];
  suggestedTargetYear: number;
};

function parseIsoParts(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return null;
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function addDaysIso(iso: string, days: number) {
  const parts = parseIsoParts(iso);
  if (!parts) {
    return iso;
  }
  const date = new Date(parts.year, parts.month - 1, parts.day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isoDayOffset(fromIso: string, toIso: string) {
  const from = parseIsoParts(fromIso);
  const to = parseIsoParts(toIso);
  if (!from || !to) {
    return null;
  }
  const start = Date.UTC(from.year, from.month - 1, from.day);
  const end = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((end - start) / 86_400_000);
}

function fridayOfWeek(iso: string) {
  const parts = parseIsoParts(iso);
  if (!parts) {
    return iso;
  }
  const date = new Date(parts.year, parts.month - 1, parts.day);
  date.setDate(date.getDate() + (5 - date.getDay()));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function eventYearFromStart(start: string, fallback: number) {
  const parts = parseIsoParts(start);
  return parts?.year ?? fallback;
}

function defaultEndFromStart(start: string, sourceStart: string, sourceEnd: string) {
  const span = sourceStart && sourceEnd ? isoDayOffset(sourceStart, sourceEnd) : null;
  if (span !== null && span >= 0) {
    return addDaysIso(start, span);
  }
  return fridayOfWeek(start);
}

export function SeasonCopyPanel({
  orgId,
  onCopied,
}: {
  orgId: string;
  onCopied?: () => void;
}) {
  const { events, viewingEvent, publishers, programs, defaultYear } = useOrgVbs();
  const [options, setOptions] = useState<SeasonCopyOptions | null>(null);
  const [fromEventId, setFromEventId] = useState("");
  const [curriculumYear, setCurriculumYear] = useState<number | "">("");
  const [publisherId, setPublisherId] = useState("");
  const [programTitle, setProgramTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const sourceEvent = events.find((event) => event.id === fromEventId) ?? viewingEvent ?? events[0] ?? null;

  const yearChoices = useMemo(
    () => vbsYearOptions(programs, [defaultYear, options?.suggestedTargetYear ?? defaultYear, sourceEvent?.year ?? 0].filter(Boolean)),
    [defaultYear, options?.suggestedTargetYear, programs, sourceEvent?.year],
  );
  const yearFilter = curriculumYear === "" ? "" : String(curriculumYear);
  const publisherChoices = useMemo(
    () => vbsPublisherOptions(publishers, programs, yearFilter),
    [programs, publishers, yearFilter],
  );
  const titleChoices = useMemo(
    () =>
      vbsProgramsMatching(programs, publisherId, curriculumYear === "" ? "" : curriculumYear).map(
        (program) => program.theme,
      ),
    [programs, publisherId, curriculumYear],
  );

  const applyCurriculumDefaults = useCallback(
    (year: number, nextPublisher = "", nextTitle = "") => {
      const pubs = vbsPublisherOptions(publishers, programs, String(year));
      const publisher = pubs.some((item) => item.id === nextPublisher)
        ? nextPublisher
        : (pubs[0]?.id ?? "");
      const titles = vbsProgramsMatching(programs, publisher, year).map((program) => program.theme);
      const title = titles.includes(nextTitle) ? nextTitle : (titles[0] ?? "");
      setPublisherId(publisher);
      setProgramTitle(title);
    },
    [programs, publishers],
  );

  const reload = useCallback(async () => {
    const next = await api.seasonCopyOptions(orgId);
    setOptions(next);
    setError("");
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    api
      .seasonCopyOptions(orgId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setOptions(next);
        const source = viewingEvent ?? events[0] ?? null;
        if (source) {
          setFromEventId(source.id);
        }
        const year = next.suggestedTargetYear;
        setCurriculumYear(year);
        applyCurriculumDefaults(year, source?.publisherId ?? "", source?.programTitle ?? "");
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyCurriculumDefaults, events, orgId, viewingEvent]);

  function onSourceChange(eventId: string) {
    setFromEventId(eventId);
    const source = events.find((event) => event.id === eventId);
    if (!source || curriculumYear === "") {
      return;
    }
    applyCurriculumDefaults(curriculumYear, source.publisherId, source.programTitle);
    if (startDate) {
      setEndDate(defaultEndFromStart(startDate, source.startDate, source.endDate));
    }
  }

  function onCurriculumYearChange(yearValue: number | "") {
    setCurriculumYear(yearValue);
    if (yearValue === "") {
      return;
    }
    applyCurriculumDefaults(yearValue, publisherId, programTitle);
  }

  function onStartChange(nextStart: string) {
    setStartDate(nextStart);
    if (!nextStart) {
      return;
    }
    setEndDate(defaultEndFromStart(nextStart, sourceEvent?.startDate ?? "", sourceEvent?.endDate ?? ""));
  }

  async function saveSnapshot() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.saveSeasonSnapshot(orgId);
      setMessage(`Saved reusable template for VBS ${result.seasonYear}.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save snapshot");
    } finally {
      setBusy(false);
    }
  }

  async function submitCopy(event: FormEvent) {
    event.preventDefault();
    const source = sourceEvent;
    if (!source || curriculumYear === "") {
      return;
    }
    const eventYear = eventYearFromStart(startDate.trim(), curriculumYear);
    const confirmed = window.confirm(
      `Copy ${source.name || source.label} into a new ${eventYear} project${sessionName.trim() ? ` named ${sessionName.trim()}` : ""}? This copies the plan, schedule, tasks, classes, and staff setup. Dates keep the same weekday relative to the new start (for example, the Friday before a Monday start stays the Friday before). Student registrations are not copied.`,
    );
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.copyVbsSeason(orgId, {
        fromYear: source.year,
        fromEventId: source.id,
        toYear: eventYear,
        name: sessionName.trim() || undefined,
        startDate: startDate.trim() || undefined,
        endDate: endDate.trim() || undefined,
        publisherId: publisherId || undefined,
        programTitle: programTitle.trim() || undefined,
      });
      setMessage(
        `A new VBS ${result.toYear} project is ready — copied ${result.copied.tasks} tasks, ${result.copied.scheduleSlots} schedule blocks, ${result.copied.registrationClasses} classes, and more from ${source.name || `VBS ${result.fromYear}`}. Dates follow the new week. The source project is unchanged.`,
      );
      onCopied?.();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy season");
    } finally {
      setBusy(false);
    }
  }

  if (error && !options) {
    return <p className="status">{error}</p>;
  }
  if (!options) {
    return <p className="muted">Loading season copy options…</p>;
  }

  const canCopy = Boolean(sourceEvent) && curriculumYear !== "";

  return (
    <section className="vbs-panel vbs-season-copy">
      <h2 className="vbs-task-team-section-title">Start another VBS</h2>
      <p className="muted vbs-task-field-hint">
        Active season: <strong>VBS {options.activeVbsYear}</strong>
        {options.planYear !== null ? ` · Plan year: VBS ${options.planYear}` : ""}. Copy everything from a saved
        project into a new week. Task, schedule, and workbook dates keep the same weekday offset from start — the
        Friday before a Monday start stays the Friday before the new start. Parent and student records are not copied.
        Leave the name blank to save it as the week dates.
      </p>
      {events.length === 0 && options.sourceYears.length === 0 ? (
        <p className="vbs-plan-callout vbs-plan-callout-readonly">
          Save a template from your current plan first, then you can copy it into the next year.
        </p>
      ) : null}
      <div className="vbs-task-add-actions" style={{ marginBottom: "1rem" }}>
        <AddActionButton
          label="Save current plan as template"
          disabled={busy}
          onClick={() => void saveSnapshot()}
        />
      </div>
      <form className="vbs-task-meta-grid" onSubmit={(event) => void submitCopy(event)}>
        <label className="vbs-task-field">
          <span className="vbs-task-field-label">Copy setup from</span>
          <select
            value={fromEventId}
            onChange={(e) => onSourceChange(e.target.value)}
            disabled={busy || events.length === 0}
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.year} · {event.name || event.label}
              </option>
            ))}
          </select>
        </label>
        <label className="vbs-task-field">
          <span className="vbs-task-field-label">Session name</span>
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="optional — uses week dates"
            disabled={busy}
          />
        </label>
        <div className="vbs-plan-field-row vbs-season-copy-dates">
          <label className="vbs-task-field">
            <span className="vbs-task-field-label">Week start</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartChange(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="vbs-task-field">
            <span className="vbs-task-field-label">Week end</span>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={busy}
            />
            <span className="muted vbs-task-field-hint">Defaults to the same week as start.</span>
          </label>
        </div>
        <p className="muted vbs-task-field-hint">
          The week dates set the VBS calendar year for the new project. Curriculum year only picks publisher and title
          from the catalog (for example 2024 Scuba while the week is in 2027).
        </p>
        <label className="vbs-task-field">
          <span className="vbs-task-field-label">Curriculum year</span>
          <select
            value={curriculumYear === "" ? "" : String(curriculumYear)}
            onChange={(e) => onCurriculumYearChange(e.target.value ? Number(e.target.value) : "")}
            disabled={busy}
          >
            {yearChoices.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className="vbs-task-field">
          <span className="vbs-task-field-label">Publisher</span>
          <select
            value={publisherId}
            onChange={(e) => {
              const next = e.target.value;
              setPublisherId(next);
              if (curriculumYear !== "") {
                const titles = vbsProgramsMatching(programs, next, curriculumYear).map((program) => program.theme);
                setProgramTitle((current) => (titles.includes(current) ? current : (titles[0] ?? "")));
              }
            }}
            disabled={busy || publisherChoices.length === 0}
          >
            {publisherChoices.map((publisher) => (
              <option key={publisher.id} value={publisher.id}>
                {publisher.name}
              </option>
            ))}
          </select>
        </label>
        <label className="vbs-task-field vbs-season-copy-title">
          <span className="vbs-task-field-label">VBS title</span>
          <select
            value={programTitle}
            onChange={(e) => setProgramTitle(e.target.value)}
            disabled={busy || titleChoices.length === 0}
          >
            {titleChoices.length === 0 ? <option value="">Select year and publisher</option> : null}
            {titleChoices.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <div className="vbs-task-add-actions">
          <AddActionButton
            type="submit"
            label={busy ? "Copying…" : "Copy into a new event"}
            disabled={busy || !canCopy}
          />
        </div>
      </form>
      {options.registrationOnlyYears.length > 0 ? (
        <p className="muted vbs-task-field-hint">
          Student records exist for VBS {options.registrationOnlyYears.join(", ")} but no saved plan template — use
          &ldquo;Save current plan as template&rdquo; while that year is active, or copy from a listed source year.
        </p>
      ) : null}
      {message ? <p className="status">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
