import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AddActionButton } from "../CollapsibleForm";
import { api } from "../api";
import { useOrgVbs } from "../org-vbs";
import { vbsProgramsMatching, vbsYearOptions } from "../vbs-cascade";
import type { Publisher, ShareProgram, VbsRegistrationWorkspace } from "../types";
import { SNACK_MENU_DAYS, type SnackDayMode, type SnackMenuDayId } from "@vbs-snacks-menu-days";

type MenuDay = { id: string; label: string; body: string };

type CookingWorkspace = {
  cookingTeamId: string;
  teams: { id: string; name: string }[];
  canConfigureCooking: boolean;
  extraInstructions: string;
  menuText: string;
  menuUpdatedAt: string;
  menuDays?: MenuDay[];
};

function defaultDayModes(menuDays: MenuDay[]): Record<SnackMenuDayId, SnackDayMode> {
  const hasMenu = menuDays.some((day) => day.body.trim());
  const modes = {} as Record<SnackMenuDayId, SnackDayMode>;
  for (const day of SNACK_MENU_DAYS) {
    const body = menuDays.find((d) => d.id === day.id)?.body ?? "";
    modes[day.id] = hasMenu && body.trim() ? "keep" : "regenerate";
  }
  return modes;
}

export function VbsRegistrationCookingPanel({
  orgId,
  registration,
}: {
  orgId: string;
  registration: VbsRegistrationWorkspace;
}) {
  const { filterDefault, working, prefsReady } = useOrgVbs();
  const [cooking, setCooking] = useState<CookingWorkspace | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [cookingTeamId, setCookingTeamId] = useState("");
  const [publisherId, setPublisherId] = useState("");
  const [year, setYear] = useState("");
  const [themeTitle, setThemeTitle] = useState("");
  const [menuText, setMenuText] = useState("");
  const [dayModes, setDayModes] = useState<Record<SnackMenuDayId, SnackDayMode>>(() =>
    defaultDayModes([]),
  );
  const [dayHints, setDayHints] = useState<Partial<Record<SnackMenuDayId, string>>>({});

  const menuDays = useMemo(() => {
    if (cooking?.menuDays?.length) {
      return cooking.menuDays;
    }
    return SNACK_MENU_DAYS.map((day) => ({ ...day, body: "" }));
  }, [cooking?.menuDays]);

  const reload = useCallback(async () => {
    const data = await api.vbsRegistrationCooking(orgId);
    setCooking(data);
    setExtraInstructions(data.extraInstructions);
    setCookingTeamId(data.cookingTeamId);
    setMenuText(data.menuText);
    setDayModes(defaultDayModes(data.menuDays ?? []));
    setError("");
  }, [orgId]);

  useEffect(() => {
    void reload().catch((err: Error) => setError(err.message));
  }, [reload]);

  useEffect(() => {
    if (!registration.publishers.length) {
      return;
    }
    setPublisherId((current) => current || registration.publishers[0]?.id || "");
    setYear((current) => current || String(registration.defaultYear));
  }, [registration.publishers, registration.defaultYear]);

  const years = useMemo(() => vbsYearOptions(registration.programs), [registration.programs]);
  const titles = useMemo(
    () =>
      vbsProgramsMatching(registration.programs, publisherId, year).map((program: ShareProgram) => program.theme),
    [registration.programs, publisherId, year],
  );

  useEffect(() => {
    const pick = working?.programTitle && working.programTitle !== "all" ? working : filterDefault;
    if (!prefsReady || !pick?.programTitle || pick.programTitle === "all" || pick.allFilters) {
      return;
    }
    setPublisherId(pick.publisherId);
    setYear(String(pick.year));
    setThemeTitle(pick.programTitle);
  }, [prefsReady, filterDefault, working]);

  useEffect(() => {
    if (!themeTitle && titles.length === 1) {
      setThemeTitle(titles[0] ?? "");
    }
  }, [titles, themeTitle]);

  const regenerateDays = useMemo(
    () => SNACK_MENU_DAYS.filter((day) => dayModes[day.id] === "regenerate").map((day) => day.id),
    [dayModes],
  );

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const result = await api.saveVbsRegistrationCooking(orgId, {
        extraInstructions,
        ...(cooking?.canConfigureCooking ? { cookingTeamId } : {}),
      });
      setCooking(result);
      setMenuText(result.menuText);
      setStatus("Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  function setAllModes(mode: SnackDayMode) {
    const next = {} as Record<SnackMenuDayId, SnackDayMode>;
    for (const day of SNACK_MENU_DAYS) {
      next[day.id] = mode;
    }
    setDayModes(next);
  }

  async function generateMenu() {
    if (regenerateDays.length === 0) {
      setStatus("Choose at least one day to get new ideas (or use “All new” for a full week).");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await api.saveVbsRegistrationCooking(orgId, { extraInstructions });
      const hints: Record<string, string> = {};
      for (const id of regenerateDays) {
        const hint = dayHints[id]?.trim();
        if (hint) {
          hints[id] = hint;
        }
      }
      const result = await api.generateVbsRegistrationSnacksMenu(orgId, {
        publisherId,
        year: Number(year),
        title: themeTitle,
        regenerateDays,
        dayHints: hints,
      });
      setMenuText(result.menuText);
      const label = result.partial
        ? `Updated ${result.regeneratedDays.length} day(s); kept the rest unchanged.`
        : "Full week generated.";
      setStatus(`${label} Review before serving.`);
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not generate menu");
    } finally {
      setBusy(false);
    }
  }

  if (error && !cooking) {
    return <p className="status">{error}</p>;
  }
  if (!cooking) {
    return <p className="status">Loading cooking workspace…</p>;
  }

  return (
    <div className="vbs-registration-cooking">
      <section className="vbs-panel">
        <h2 className="vbs-plan-section-title">Cooking & snacks team</h2>
        <p className="muted vbs-registration-view-lead">
          Allergy-safe snack planning for Mon–Fri VBS. Regenerate only the days you want — kept days are merged on
          the server and never sent back to the model for rewriting.
        </p>

        <form className="vbs-registration-cooking-form" onSubmit={(e) => void saveSettings(e)}>
          {cooking.canConfigureCooking ? (
            <label className="vbs-plan-field">
              Cooking team (org team — admin and roster get allergy + this tab)
              <select
                disabled={busy}
                value={cookingTeamId}
                onChange={(e) => setCookingTeamId(e.target.value)}
              >
                <option value="">Auto-detect name with “Snack”, “Cook”, or “Kitchen”</option>
                {cooking.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="muted">
              Cooking team:{" "}
              {cooking.teams.find((t) => t.id === cookingTeamId)?.name || "Auto-detected from team name"}
            </p>
          )}

          <label className="vbs-plan-field">
            Extra instructions for the menu (budget, store, prep, theme)
            <textarea
              rows={4}
              disabled={busy}
              value={extraInstructions}
              onChange={(e) => setExtraInstructions(e.target.value)}
              placeholder="e.g. Nut-free only in prep area; Costco run Sunday; tie snacks to ocean theme…"
            />
          </label>
          <div className="vbs-plan-form-actions">
            <AddActionButton type="submit" label="Save notes" disabled={busy} />
          </div>
        </form>
      </section>

      <section className="vbs-panel vbs-registration-cooking-generate">
        <h3 className="vbs-plan-section-title">Generate snacks menu</h3>
        <div className="vbs-snacks-day-toolbar">
          <button type="button" className="ghost" disabled={busy} onClick={() => setAllModes("keep")}>
            Keep all days
          </button>
          <button type="button" className="ghost" disabled={busy} onClick={() => setAllModes("regenerate")}>
            All new (full week)
          </button>
        </div>

        <ul className="vbs-snacks-day-plan">
          {menuDays.map((day) => {
            const dayId = day.id as SnackMenuDayId;
            const mode = dayModes[dayId];
            return (
              <li key={day.id} className={`vbs-snacks-day-row${mode === "keep" ? " is-keep" : " is-regen"}`}>
                <div className="vbs-snacks-day-row-head">
                  <strong>{day.label}</strong>
                  <div className="vbs-snacks-day-modes" role="radiogroup" aria-label={`${day.label} menu action`}>
                    <label className="vbs-registration-check">
                      <input
                        type="radio"
                        name={`day-mode-${day.id}`}
                        checked={mode === "keep"}
                        disabled={busy || !day.body.trim()}
                        onChange={() => setDayModes((current) => ({ ...current, [dayId]: "keep" }))}
                      />
                      Keep
                    </label>
                    <label className="vbs-registration-check">
                      <input
                        type="radio"
                        name={`day-mode-${day.id}`}
                        checked={mode === "regenerate"}
                        disabled={busy}
                        onChange={() => setDayModes((current) => ({ ...current, [dayId]: "regenerate" }))}
                      />
                      New ideas
                    </label>
                  </div>
                </div>
                {mode === "keep" && day.body.trim() ? (
                  <pre className="vbs-snacks-day-preview">{day.body}</pre>
                ) : null}
                {mode === "regenerate" ? (
                  <label className="vbs-plan-field vbs-snacks-day-hint">
                    Hint for this day only (optional)
                    <input
                      type="text"
                      disabled={busy}
                      value={dayHints[dayId] ?? ""}
                      onChange={(e) => setDayHints((current) => ({ ...current, [dayId]: e.target.value }))}
                      placeholder="e.g. no grapes; pref packaged; tie to Day 3 Bible story"
                    />
                  </label>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="vbs-plan-field-row">
          <label className="vbs-plan-field">
            Publisher
            <select disabled={busy} value={publisherId} onChange={(e) => setPublisherId(e.target.value)}>
              {registration.publishers.map((pub: Publisher) => (
                <option key={pub.id} value={pub.id}>
                  {pub.name}
                </option>
              ))}
            </select>
          </label>
          <label className="vbs-plan-field">
            Year
            <select disabled={busy} value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="vbs-plan-field">
            VBS title
            <select disabled={busy} value={themeTitle} onChange={(e) => setThemeTitle(e.target.value)}>
              <option value="">Select…</option>
              {titles.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <AddActionButton
          label={
            regenerateDays.length === SNACK_MENU_DAYS.length
              ? "Generate full week"
              : `Generate ${regenerateDays.length} selected day(s)`
          }
          disabled={busy || !themeTitle}
          onClick={() => void generateMenu()}
        />
        {status ? <p className="tagline">{status}</p> : null}
      </section>

      {menuText ? (
        <section className="vbs-panel vbs-registration-cooking-menu">
          <h3 className="vbs-plan-section-title">Current menu</h3>
          {cooking.menuUpdatedAt ? (
            <p className="muted">Last updated {new Date(cooking.menuUpdatedAt).toLocaleString()}</p>
          ) : null}
          <div className="vbs-registration-menu-markdown">{menuText}</div>
        </section>
      ) : null}
    </div>
  );
}
