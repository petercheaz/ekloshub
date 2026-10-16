import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useOrgs } from "../orgs";
import { useOrgVbs } from "../org-vbs";
import { vbsProgramsMatching, vbsYearOptions } from "../vbs-cascade";
import type { CookingPlanDocument, CookingPlanWorkspace } from "../types-cooking-plan";
import type { Publisher, ShareProgram } from "../types";
import { CookingPlanAllergyTree } from "./CookingPlanAllergyTree";
import { CookingPlanMenuBoard } from "./CookingPlanMenuBoard";

export default function CookingPlanPage() {
  const { orgId = "" } = useParams();
  const { current: org } = useOrgs();
  const { filterDefault, working, prefsReady, viewingYear, viewingEventId, eventsReady, orgEventEpoch } = useOrgVbs();
  const [data, setData] = useState<CookingPlanWorkspace | null>(null);
  const [plan, setPlan] = useState<CookingPlanDocument | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [cookingTeamId, setCookingTeamId] = useState("");
  const [publisherId, setPublisherId] = useState("");
  const [year, setYear] = useState("");
  const [themeTitle, setThemeTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const reload = useCallback(async () => {
    const workspace = await api.cookingPlan(orgId, viewingYear ?? undefined);
    setData(workspace);
    setPlan(workspace.plan);
    setExtraInstructions(workspace.extraInstructions);
    setCookingTeamId(workspace.cookingTeamId);
    setError("");
  }, [orgId, viewingEventId, viewingYear]);

  useEffect(() => {
    if (!eventsReady) {
      return;
    }
    void reload().catch((err: Error) => setError(err.message));
  }, [eventsReady, orgEventEpoch, reload]);

  useEffect(() => {
    if (!data?.publishers.length) {
      return;
    }
    setPublisherId((c) => c || data.publishers[0]?.id || "");
    setYear((c) => c || String(data.defaultYear));
  }, [data?.publishers, data?.defaultYear]);

  const years = useMemo(() => vbsYearOptions(data?.programs ?? []), [data?.programs]);
  const titles = useMemo(
    () => vbsProgramsMatching(data?.programs ?? [], publisherId, year).map((p: ShareProgram) => p.theme),
    [data?.programs, publisherId, year],
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

  async function savePreferences(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.saveCookingPlanSettings(orgId, {
        extraInstructions,
        ...(data?.canConfigureCooking ? { cookingTeamId } : {}),
      });
      setData(result);
      setPlan(result.plan);
      setStatus("Preferences saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function persistLayout(next: CookingPlanDocument) {
    setPlan(next);
    setBusy(true);
    try {
      const result = await api.saveCookingPlanLayout(orgId, next);
      setData(result);
      setPlan(result.plan);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save layout");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!themeTitle) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await api.saveCookingPlanSettings(orgId, { extraInstructions });
      const replaceItemIds = selectedIds.size > 0 ? [...selectedIds] : undefined;
      const result = await api.generateCookingPlan(orgId, {
        publisherId,
        year: Number(year),
        title: themeTitle,
        replaceItemIds,
      });
      setPlan(result.plan);
      setSelectedIds(new Set());
      setStatus(
        replaceItemIds?.length
          ? `Replaced ${result.replacedItemCount} item(s) with new options.`
          : `Full week generated (${result.plan.strategy} plan).`,
      );
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <p className="status">
        {error}{" "}
        <Link to={`/org/${orgId}/registration`}>Registration</Link>
      </p>
    );
  }
  if (!data || !plan) {
    return <p className="status">Loading cooking plan…</p>;
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="reviews vbs-plan vbs-workspace vbs-cooking-plan-page">
      <header className="vbs-plan-masthead">
        <div className="vbs-plan-masthead-main">
          {org ? <p className="vbs-plan-masthead-org">{org.name}</p> : null}
          <h1 className="vbs-plan-masthead-title">Cooking plan</h1>
          <p className="vbs-plan-masthead-empty muted">
            Allergy map and Mon–Fri snack items. The model chooses unified vs separate allergy portions; you pick
            which items to swap.
          </p>
        </div>
      </header>

      <div className="vbs-cooking-plan-layout">
        <CookingPlanAllergyTree data={data} />
        <div className="vbs-cooking-plan-main">
          <form className="vbs-panel vbs-cooking-plan-prefs" onSubmit={(e) => void savePreferences(e)}>
            {data.canConfigureCooking ? (
              <label className="vbs-plan-field">
                Cooking team
                <select value={cookingTeamId} disabled={busy} onChange={(e) => setCookingTeamId(e.target.value)}>
                  <option value="">Auto-detect Snack / Cook / Kitchen team</option>
                  {data.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="vbs-plan-field">
              Cook preferences (budget, stores, prep, theme)
              <textarea
                rows={3}
                disabled={busy}
                value={extraInstructions}
                onChange={(e) => setExtraInstructions(e.target.value)}
              />
            </label>
            <div className="vbs-plan-field-row">
              <label className="vbs-plan-field">
                Publisher
                <select disabled={busy} value={publisherId} onChange={(e) => setPublisherId(e.target.value)}>
                  {data.publishers.map((pub: Publisher) => (
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
            <div className="vbs-plan-form-actions">
              <button type="submit" className="ghost" disabled={busy}>
                Save preferences
              </button>
              <button type="button" className="vbs-plan-save" disabled={busy || !themeTitle} onClick={() => void generate()}>
                {selectedCount > 0 ? `Generate ${selectedCount} new item(s)` : "Generate full week"}
              </button>
            </div>
            {status ? <p className="tagline">{status}</p> : null}
          </form>

          <CookingPlanMenuBoard
            plan={plan}
            busy={busy}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            onPlanChange={(next) => void persistLayout(next)}
          />
        </div>
      </div>
    </div>
  );
}
