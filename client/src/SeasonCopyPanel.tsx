import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { AddActionButton } from "./CollapsibleForm";

export type SeasonCopyOptions = {
  activeVbsYear: number;
  planYear: number | null;
  sourceYears: number[];
  registrationOnlyYears: number[];
  suggestedTargetYear: number;
};

export function SeasonCopyPanel({
  orgId,
  onCopied,
}: {
  orgId: string;
  onCopied?: () => void;
}) {
  const [options, setOptions] = useState<SeasonCopyOptions | null>(null);
  const [fromYear, setFromYear] = useState<number | "">("");
  const [toYear, setToYear] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const next = await api.seasonCopyOptions(orgId);
    setOptions(next);
    setFromYear((current) => (current !== "" ? current : (next.sourceYears[0] ?? "")));
    setToYear((current) => (current !== "" ? current : next.suggestedTargetYear));
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
        setFromYear(next.sourceYears[0] ?? "");
        setToYear(next.suggestedTargetYear);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

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
    if (fromYear === "" || toYear === "") {
      return;
    }
    const confirmed = window.confirm(
      `Copy VBS ${fromYear} setup into VBS ${toYear}? This replaces the current plan, schedule, tasks, supplies, and ${toYear} class templates. Student registrations are not copied.`,
    );
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.copyVbsSeason(orgId, {
        fromYear,
        toYear,
        startDate: startDate.trim() || undefined,
        endDate: endDate.trim() || undefined,
      });
      setMessage(
        `VBS ${result.toYear} is ready — copied ${result.copied.tasks} tasks, ${result.copied.scheduleSlots} schedule blocks, ${result.copied.registrationClasses} classes, and more from VBS ${result.fromYear}. Review dates and curriculum on the plan overview.`,
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

  return (
    <section className="vbs-panel vbs-season-copy">
      <h2 className="vbs-task-team-section-title">Start a new VBS year</h2>
      <p className="muted vbs-task-field-hint">
        Active season: <strong>VBS {options.activeVbsYear}</strong>
        {options.planYear !== null ? ` · Plan year: VBS ${options.planYear}` : ""}. Copy last year&apos;s plan,
        schedule shape, milestones, supplies list, registration class templates, and the plan workbook (prayer,
        placements, schedule columns, timeline) so directors edit instead of rebuilding from zero. Workbook dates
        move with the new VBS week when you copy. Parent and student records stay in their original VBS year.
      </p>
      {options.sourceYears.length === 0 ? (
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
            value={fromYear === "" ? "" : String(fromYear)}
            onChange={(e) => setFromYear(e.target.value ? Number(e.target.value) : "")}
            disabled={busy || options.sourceYears.length === 0}
          >
            {options.sourceYears.map((year) => (
              <option key={year} value={year}>
                VBS {year}
                {year === options.planYear ? " (current plan)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="vbs-task-field">
          <span className="vbs-task-field-label">New VBS year</span>
          <input
            type="number"
            min={2000}
            max={2100}
            value={toYear === "" ? "" : toYear}
            onChange={(e) => setToYear(e.target.value ? Number(e.target.value) : "")}
            disabled={busy}
          />
        </label>
        <label className="vbs-task-field">
          <span className="vbs-task-field-label">Week start (optional)</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={busy} />
          <span className="muted vbs-task-field-hint">Leave blank to shift last year&apos;s dates forward.</span>
        </label>
        <label className="vbs-task-field">
          <span className="vbs-task-field-label">Week end (optional)</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={busy} />
        </label>
        <div className="vbs-task-add-actions">
          <AddActionButton
            type="submit"
            label={busy ? "Copying…" : "Copy into new year"}
            disabled={busy || options.sourceYears.length === 0 || fromYear === "" || toYear === ""}
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
