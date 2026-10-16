import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { api, setApiVbsEvent } from "./api";
import { useAuth } from "./auth";
import { useOrgs } from "./orgs";
import type { OrgVbsEvent, Publisher, ShareProgram, UserVbsCurriculum } from "./types";

export type VbsWorkingSelection = {
  year: number;
  publisherId: string;
  programTitle: string;
  allFilters?: boolean;
};

export type VbsFilterSource = "user" | null;

type OrgVbsContextValue = {
  prefsReady: boolean;
  userDefault: UserVbsCurriculum | null;
  filterDefault: VbsWorkingSelection | null;
  filterSource: VbsFilterSource;
  working: VbsWorkingSelection | null;
  hasSessionOverride: boolean;
  publishers: Publisher[];
  programs: ShareProgram[];
  defaultYear: number;
  setWorking: (next: VbsWorkingSelection) => void;
  resetWorking: () => void;
  saveUserDefault: (next: VbsWorkingSelection) => Promise<void>;
  refresh: () => Promise<void>;
  eventsReady: boolean;
  events: OrgVbsEvent[];
  viewingYear: number | null;
  viewingEventId: string | null;
  currentVbsYear: number | null;
  currentEventId: string | null;
  viewingEvent: OrgVbsEvent | null;
  canSwitchEvents: boolean;
  canMakeCurrent: boolean;
  canCreateEvent: boolean;
  orgEventEpoch: number;
  setViewingYear: (year: number) => void;
  setViewingEventId: (eventId: string) => void;
  makeCurrent: () => Promise<void>;
  setPersonalDefault: () => Promise<void>;
  saveAsProject: (name?: string) => Promise<void>;
  renameProject: (name: string) => Promise<void>;
  deleteProject: (eventId: string) => Promise<void>;
  refreshEvents: () => Promise<void>;
};

const OrgVbsContext = createContext<OrgVbsContextValue | null>(null);

function viewingKey(orgId: string) {
  return `vbs.viewingEvent.${orgId}`;
}

function readViewingEventId(orgId: string): string | null {
  try {
    return sessionStorage.getItem(viewingKey(orgId));
  } catch {
    return null;
  }
}

function writeViewingEventId(orgId: string, eventId: string | null) {
  if (!eventId) {
    sessionStorage.removeItem(viewingKey(orgId));
    return;
  }
  sessionStorage.setItem(viewingKey(orgId), eventId);
}

function toWorking(curriculum: UserVbsCurriculum): VbsWorkingSelection {
  if (curriculum.allFilters) {
    return {
      allFilters: true,
      year: 0,
      publisherId: "all",
      programTitle: "all",
    };
  }
  return {
    year: curriculum.year,
    publisherId: curriculum.publisherId,
    programTitle: curriculum.programTitle,
  };
}

function eventWorking(event: OrgVbsEvent | null): VbsWorkingSelection | null {
  if (!event?.programTitle || !event.publisherId) {
    return null;
  }
  return {
    year: event.year,
    publisherId: event.publisherId,
    programTitle: event.programTitle,
  };
}

export function OrgVbsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { tenantId } = useOrgs();
  const [prefsReady, setPrefsReady] = useState(false);
  const [userDefault, setUserDefault] = useState<UserVbsCurriculum | null>(null);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [programs, setPrograms] = useState<ShareProgram[]>([]);
  const [defaultYear, setDefaultYear] = useState(new Date().getFullYear());
  const [eventsReady, setEventsReady] = useState(false);
  const [events, setEvents] = useState<OrgVbsEvent[]>([]);
  const [viewingEventId, setViewingEventIdState] = useState<string | null>(null);
  const [currentVbsYear, setCurrentVbsYear] = useState<number | null>(null);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [canSwitchEvents, setCanSwitchEvents] = useState(false);
  const [canMakeCurrent, setCanMakeCurrent] = useState(false);
  const [canCreateEvent, setCanCreateEvent] = useState(false);
  const [orgEventEpoch, setOrgEventEpoch] = useState(0);

  const refresh = useCallback(async () => {
    setPrefsReady(false);
    if (!user) {
      setUserDefault(null);
      setPrefsReady(true);
      return;
    }
    const userPayload = await api.userVbsDefault();
    setUserDefault(userPayload.userDefault);
    setPublishers(userPayload.publishers);
    setPrograms(userPayload.programs);
    setDefaultYear(userPayload.defaultYear);
    setPrefsReady(true);
  }, [user]);

  useEffect(() => {
    void refresh().catch(() => setPrefsReady(true));
  }, [refresh]);

  const applyEventsPayload = useCallback(
    (payload: Awaited<ReturnType<typeof api.orgVbsEvents>>, orgId: string, preferEventId?: string) => {
      setEvents(payload.events);
      setCurrentVbsYear(payload.currentVbsYear);
      setCurrentEventId(payload.currentEventId);
      setCanSwitchEvents(payload.canSwitchEvents);
      setCanMakeCurrent(payload.canMakeCurrent);
      setCanCreateEvent(payload.canCreateEvent);
      const stored = preferEventId ?? readViewingEventId(orgId);
      const nextId =
        (stored && payload.events.some((event) => event.id === stored) ? stored : null) ??
        payload.defaultEventId ??
        payload.currentEventId ??
        payload.events[0]?.id ??
        null;
      setViewingEventIdState(nextId);
      writeViewingEventId(orgId, nextId);
      setApiVbsEvent(nextId);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (!user || !tenantId) {
      setEvents([]);
      setViewingEventIdState(null);
      setCurrentVbsYear(null);
      setCurrentEventId(null);
      setCanSwitchEvents(false);
      setCanMakeCurrent(false);
      setCanCreateEvent(false);
      setApiVbsEvent(null);
      setEventsReady(true);
      return;
    }
    setEventsReady(false);
    api
      .orgVbsEvents(tenantId)
      .then((payload) => {
        if (!cancelled) {
          applyEventsPayload(payload, tenantId);
          setEventsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEventsReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyEventsPayload, tenantId, user]);

  const filterDefault = useMemo(() => {
    if (userDefault) {
      return toWorking(userDefault);
    }
    return null;
  }, [userDefault]);

  const filterSource: VbsFilterSource = userDefault ? "user" : null;
  const viewingEvent = useMemo(
    () => events.find((event) => event.id === viewingEventId) ?? events[0] ?? null,
    [events, viewingEventId],
  );
  const viewingYear = viewingEvent?.year ?? null;
  const working = eventWorking(viewingEvent) ?? filterDefault;

  const setWorking = useCallback((_next: VbsWorkingSelection) => {
    // Org tools follow the event switcher; catalog pages use saved filter defaults.
  }, []);

  const setViewingEventId = useCallback(
    (eventId: string) => {
      if (!tenantId) {
        return;
      }
      setViewingEventIdState(eventId);
      writeViewingEventId(tenantId, eventId);
      setApiVbsEvent(eventId);
      setOrgEventEpoch((value) => value + 1);
    },
    [tenantId],
  );

  const resetWorking = useCallback(() => {
    if (!tenantId || !currentEventId) {
      return;
    }
    setViewingEventId(currentEventId);
  }, [currentEventId, setViewingEventId, tenantId]);

  const saveUserDefault = useCallback(
    async (next: VbsWorkingSelection) => {
      const result = await api.saveUserVbsDefault({
        year: next.year,
        publisherId: next.publisherId,
        programTitle: next.programTitle,
        allFilters: next.allFilters,
      });
      setUserDefault(result.userDefault);
    },
    [],
  );

  const setViewingYear = useCallback(
    (year: number) => {
      const match = events.find((event) => event.year === year && event.isCurrent) ?? events.find((event) => event.year === year);
      if (match) {
        setViewingEventId(match.id);
      }
    },
    [events, setViewingEventId],
  );

  const refreshEvents = useCallback(async () => {
    if (!tenantId) {
      return;
    }
    const payload = await api.orgVbsEvents(tenantId);
    applyEventsPayload(payload, tenantId, viewingEventId ?? undefined);
    setOrgEventEpoch((value) => value + 1);
  }, [applyEventsPayload, tenantId, viewingEventId]);

  const makeCurrent = useCallback(async () => {
    if (!tenantId || !viewingEventId) {
      return;
    }
    const payload = await api.setCurrentVbsEvent(tenantId, viewingEventId);
    applyEventsPayload(payload, tenantId, viewingEventId);
    setOrgEventEpoch((value) => value + 1);
  }, [applyEventsPayload, tenantId, viewingEventId]);

  const setPersonalDefault = useCallback(async () => {
    if (!tenantId || !viewingEventId) {
      return;
    }
    const payload = await api.setPersonalVbsEventDefault(tenantId, viewingEventId);
    applyEventsPayload(payload, tenantId, viewingEventId);
    setOrgEventEpoch((value) => value + 1);
  }, [applyEventsPayload, tenantId, viewingEventId]);

  const saveAsProject = useCallback(
    async (name?: string) => {
      if (!tenantId || !viewingEvent) {
        return;
      }
      const payload = await api.createVbsEvent(tenantId, {
        fromEventId: viewingEvent.id,
        year: viewingEvent.year,
        name: name?.trim() || viewingEvent.name.trim() || undefined,
      });
      applyEventsPayload(payload, tenantId, payload.createdEventId);
      setOrgEventEpoch((value) => value + 1);
    },
    [applyEventsPayload, tenantId, viewingEvent],
  );

  const renameProject = useCallback(
    async (name: string) => {
      if (!tenantId || !viewingEventId) {
        return;
      }
      const payload = await api.renameVbsEvent(tenantId, viewingEventId, name);
      applyEventsPayload(payload, tenantId, viewingEventId);
      setOrgEventEpoch((value) => value + 1);
    },
    [applyEventsPayload, tenantId, viewingEventId],
  );

  const deleteProject = useCallback(
    async (eventId: string) => {
      if (!tenantId) {
        return;
      }
      const payload = await api.deleteVbsEvent(tenantId, eventId);
      applyEventsPayload(payload, tenantId);
      setOrgEventEpoch((value) => value + 1);
    },
    [applyEventsPayload, tenantId],
  );

  const value = useMemo(
    () => ({
      prefsReady,
      userDefault,
      filterDefault,
      filterSource,
      working,
      hasSessionOverride: Boolean(viewingEventId && currentEventId && viewingEventId !== currentEventId),
      publishers,
      programs,
      defaultYear,
      setWorking,
      resetWorking,
      saveUserDefault,
      refresh,
      eventsReady,
      events,
      viewingYear,
      viewingEventId,
      currentVbsYear,
      currentEventId,
      viewingEvent,
      canSwitchEvents,
      canMakeCurrent,
      canCreateEvent,
      orgEventEpoch,
      setViewingYear,
      setViewingEventId,
      makeCurrent,
      setPersonalDefault,
      saveAsProject,
      renameProject,
      deleteProject,
      refreshEvents,
    }),
    [
      prefsReady,
      userDefault,
      filterDefault,
      filterSource,
      working,
      viewingYear,
      viewingEventId,
      currentVbsYear,
      currentEventId,
      publishers,
      programs,
      defaultYear,
      setWorking,
      resetWorking,
      saveUserDefault,
      refresh,
      eventsReady,
      events,
      viewingEvent,
      canSwitchEvents,
      canMakeCurrent,
      canCreateEvent,
      orgEventEpoch,
      setViewingYear,
      setViewingEventId,
      makeCurrent,
      setPersonalDefault,
      saveAsProject,
      renameProject,
      deleteProject,
      refreshEvents,
    ],
  );

  return <OrgVbsContext.Provider value={value}>{children}</OrgVbsContext.Provider>;
}

export function useOrgVbs() {
  const context = useContext(OrgVbsContext);
  if (!context) {
    throw new Error("useOrgVbs must be used within OrgVbsProvider");
  }
  return context;
}

function projectDisplayName(event: OrgVbsEvent) {
  if (event.name.trim()) {
    return event.name.trim();
  }
  if (event.startDate) {
    const start = event.startDate.slice(0, 10);
    const end = event.endDate?.slice(0, 10) ?? start;
    const matchStart = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
    if (matchStart) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const y = Number(matchStart[1]);
      const m = Number(matchStart[2]);
      const d = Number(matchStart[3]);
      const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
      let span = `${months[m - 1]} ${d}`;
      if (endMatch && (endMatch[2] !== matchStart[2] || endMatch[3] !== matchStart[3])) {
        const em = Number(endMatch[2]);
        const ed = Number(endMatch[3]);
        span =
          em === m ? `${months[m - 1]} ${d}–${ed}` : `${span}–${months[em - 1]} ${ed}`;
      }
      return `VBS ${span} ${y}`;
    }
  }
  if (event.programTitle.trim()) {
    return `VBS ${event.year} · ${event.programTitle.trim()}`;
  }
  return `VBS ${event.year}`;
}

export function projectOptionLabel(event: OrgVbsEvent) {
  const session = projectDisplayName(event);
  const marks = [event.isCurrent ? "current" : "", event.isDefault ? "my default" : ""].filter(Boolean);
  return marks.length ? `${session} (${marks.join(", ")})` : session;
}

export function eventsGroupedByYear(events: OrgVbsEvent[]) {
  const years: number[] = [];
  const grouped = new Map<number, OrgVbsEvent[]>();
  for (const event of events) {
    const list = grouped.get(event.year);
    if (list) {
      list.push(event);
      continue;
    }
    grouped.set(event.year, [event]);
    years.push(event.year);
  }
  return years.map((year) => ({ year, events: grouped.get(year) ?? [] }));
}

export function OrgVbsBar() {
  const location = useLocation();
  const { tenantId } = useOrgs();
  const {
    eventsReady,
    events,
    viewingYear,
    viewingEventId,
    currentVbsYear,
    viewingEvent,
    canSwitchEvents,
    canMakeCurrent,
    canCreateEvent,
    hasSessionOverride,
    setViewingEventId,
    makeCurrent,
    setPersonalDefault,
    saveAsProject,
    renameProject,
  } = useOrgVbs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafting, setDrafting] = useState<"saveAs" | "rename" | null>(null);
  const [draftName, setDraftName] = useState("");

  const onOrgRoute = /^\/org\/[^/]+/.test(location.pathname) && !location.pathname.startsWith("/org/new");
  if (!onOrgRoute || !tenantId || !eventsReady || events.length === 0) {
    return null;
  }

  const viewingIsCurrent = Boolean(viewingEvent?.isCurrent);
  const grouped = eventsGroupedByYear(events);
  const saveAsPlaceholder = viewingEvent?.name.trim() || viewingEvent?.programTitle.trim() || "New project";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setDrafting(null);
      setDraftName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this VBS");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="vbs-filter-panel vbs-filter-panel-compact vbs-context-bar" aria-label="VBS project">
      <div className="vbs-context-head">
        <span className="vbs-context-label">VBS project</span>
        <div className="vbs-context-actions">
          {viewingIsCurrent ? (
            <span className="vbs-context-meta muted">Current VBS for this church</span>
          ) : (
            <span className="vbs-context-meta muted">
              Viewing another project — current remains {events.find((event) => event.isCurrent)?.name || events.find((event) => event.isCurrent)?.label || `VBS ${currentVbsYear}`}
            </span>
          )}
        </div>
      </div>
      <div className="vbs-context-main">
        {canSwitchEvents ? (
          <label className="vbs-context-event-field">
            <select
              value={viewingEventId ?? ""}
              onChange={(event) => setViewingEventId(event.target.value)}
              aria-label="Open VBS project"
            >
              {grouped.map((group) => (
                <optgroup key={group.year} label={String(group.year)}>
                  {group.events.map((item) => (
                    <option key={item.id} value={item.id}>
                      {projectOptionLabel(item)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        ) : (
          <strong>{viewingEvent?.name || viewingEvent?.label || `VBS ${viewingYear}`}</strong>
        )}
        {canCreateEvent ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => saveAsProject())}
          >
            New project
          </button>
        ) : null}
        {canCreateEvent ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDrafting((open) => (open === "saveAs" ? null : "saveAs"));
              setDraftName("");
            }}
          >
            Save as…
          </button>
        ) : null}
        {canCreateEvent ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDrafting((open) => (open === "rename" ? null : "rename"));
              setDraftName(viewingEvent?.name ?? "");
            }}
          >
            Rename
          </button>
        ) : null}
        {canMakeCurrent && !viewingIsCurrent ? (
          <button type="button" className="primary" disabled={busy} onClick={() => void run(makeCurrent)}>
            Make this the current VBS
          </button>
        ) : null}
        {viewingEvent && !viewingEvent.isDefault ? (
          <button type="button" disabled={busy} onClick={() => void run(setPersonalDefault)}>
            Set as my default
          </button>
        ) : null}
      </div>
      {drafting === "saveAs" ? (
        <form
          className="vbs-context-add-event"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => saveAsProject(draftName));
          }}
        >
          <label className="vbs-context-event-field">
            <span className="muted">Project name</span>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder={saveAsPlaceholder}
              aria-label="New project name"
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save as new project"}
          </button>
        </form>
      ) : null}
      {drafting === "rename" ? (
        <form
          className="vbs-context-add-event"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => renameProject(draftName));
          }}
        >
          <label className="vbs-context-event-field">
            <span className="muted">Project name</span>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder={saveAsPlaceholder}
              aria-label="Rename project"
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save name"}
          </button>
        </form>
      ) : null}
      <p className="vbs-filter-note muted">
        Everything you see is for the open project only. Use the list to browse past VBS weeks.{" "}
        <strong>Make this the current VBS</strong> controls family sign-ups and public registration.{" "}
        <strong>Save as…</strong> duplicates this week in the same year; for a new week, year, or curriculum use{" "}
        <strong>Start another VBS</strong> on Director home or Plan overview.
      </p>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
