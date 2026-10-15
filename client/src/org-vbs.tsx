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
import type { VbsFilterState } from "./VbsFilterFields";
import { VbsFilterFields } from "./VbsFilterFields";
import { api } from "./api";
import { useAuth } from "./auth";
import { useOrgs } from "./orgs";
import type { Publisher, ShareProgram, UserVbsCurriculum } from "./types";

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
};

const OrgVbsContext = createContext<OrgVbsContextValue | null>(null);

function storageKey(orgId: string) {
  return `vbs.working.${orgId}`;
}

function readStored(orgId: string): VbsWorkingSelection | null {
  try {
    const raw = sessionStorage.getItem(storageKey(orgId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as VbsWorkingSelection;
    if (!parsed.year || !parsed.publisherId || !parsed.programTitle) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(orgId: string, value: VbsWorkingSelection | null) {
  if (!value) {
    sessionStorage.removeItem(storageKey(orgId));
    return;
  }
  sessionStorage.setItem(storageKey(orgId), JSON.stringify(value));
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

function siteFallback(
  publishers: Publisher[],
  programs: ShareProgram[],
  defaultYear: number,
): VbsWorkingSelection | null {
  const publisherId = publishers[0]?.id ?? "";
  const program = programs.find((p) => p.year === defaultYear && p.publisherId === publisherId);
  if (!program) {
    return null;
  }
  return {
    year: program.year,
    publisherId: program.publisherId,
    programTitle: program.theme,
  };
}

function baselineWorking(
  userDefault: UserVbsCurriculum | null,
  publishers: Publisher[],
  programs: ShareProgram[],
  defaultYear: number,
): VbsWorkingSelection | null {
  if (userDefault) {
    return toWorking(userDefault);
  }
  return {
    allFilters: true,
    year: 0,
    publisherId: "all",
    programTitle: "all",
  };
}

export function OrgVbsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { tenantId } = useOrgs();
  const [prefsReady, setPrefsReady] = useState(false);
  const [userDefault, setUserDefault] = useState<UserVbsCurriculum | null>(null);
  const [working, setWorkingState] = useState<VbsWorkingSelection | null>(null);
  const [hasSessionOverride, setHasSessionOverride] = useState(false);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [programs, setPrograms] = useState<ShareProgram[]>([]);
  const [defaultYear, setDefaultYear] = useState(new Date().getFullYear());

  const refresh = useCallback(async () => {
    setPrefsReady(false);
    if (!user) {
      setUserDefault(null);
      setWorkingState(null);
      setHasSessionOverride(false);
      setPrefsReady(true);
      return;
    }

    const userPayload = await api.userVbsDefault();
    setUserDefault(userPayload.userDefault);
    setPublishers(userPayload.publishers);
    setPrograms(userPayload.programs);
    setDefaultYear(userPayload.defaultYear);

    const baseline = baselineWorking(
      userPayload.userDefault,
      userPayload.publishers,
      userPayload.programs,
      userPayload.defaultYear,
    );

    if (tenantId) {
      const stored = readStored(tenantId);
      if (stored) {
        setWorkingState(stored);
        setHasSessionOverride(true);
      } else {
        setWorkingState(baseline);
        setHasSessionOverride(false);
      }
    } else {
      setWorkingState(baseline);
      setHasSessionOverride(false);
    }

    setPrefsReady(true);
  }, [tenantId, user]);

  useEffect(() => {
    void refresh().catch(() => setPrefsReady(true));
  }, [refresh]);

  const filterDefault = useMemo(() => {
    if (userDefault) {
      return toWorking(userDefault);
    }
    return null;
  }, [userDefault]);

  const filterSource: VbsFilterSource = userDefault ? "user" : null;

  const setWorking = useCallback(
    (next: VbsWorkingSelection) => {
      if (!tenantId) {
        return;
      }
      setWorkingState(next);
      writeStored(tenantId, next);
      const baseline = baselineWorking(userDefault, publishers, programs, defaultYear);
      const matchesBaseline =
        baseline &&
        Boolean(baseline.allFilters) === Boolean(next.allFilters) &&
        baseline.year === next.year &&
        baseline.publisherId === next.publisherId &&
        baseline.programTitle === next.programTitle;
      setHasSessionOverride(!matchesBaseline);
    },
    [tenantId, userDefault, publishers, programs, defaultYear],
  );

  const resetWorking = useCallback(() => {
    if (!tenantId) {
      return;
    }
    writeStored(tenantId, null);
    const baseline = baselineWorking(userDefault, publishers, programs, defaultYear);
    setWorkingState(baseline);
    setHasSessionOverride(false);
  }, [tenantId, userDefault, publishers, programs, defaultYear]);

  const saveUserDefault = useCallback(
    async (next: VbsWorkingSelection) => {
      const result = await api.saveUserVbsDefault({
        year: next.year,
        publisherId: next.publisherId,
        programTitle: next.programTitle,
        allFilters: next.allFilters,
      });
      setUserDefault(result.userDefault);
      if (tenantId && result.userDefault) {
        writeStored(tenantId, null);
        setWorkingState(toWorking(result.userDefault));
        setHasSessionOverride(false);
      }
    },
    [tenantId],
  );

  const value = useMemo(
    () => ({
      prefsReady,
      userDefault,
      filterDefault,
      filterSource,
      working,
      hasSessionOverride,
      publishers,
      programs,
      defaultYear,
      setWorking,
      resetWorking,
      saveUserDefault,
      refresh,
    }),
    [
      prefsReady,
      userDefault,
      filterDefault,
      filterSource,
      working,
      hasSessionOverride,
      publishers,
      programs,
      defaultYear,
      setWorking,
      resetWorking,
      saveUserDefault,
      refresh,
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

export function OrgVbsBar() {
  const location = useLocation();
  const { tenantId } = useOrgs();
  const {
    prefsReady,
    working,
    userDefault,
    hasSessionOverride,
    publishers,
    programs,
    defaultYear,
    setWorking,
    resetWorking,
  } = useOrgVbs();

  const path = location.pathname;
  if (
    path.endsWith("/vbs-plan") ||
    path.endsWith("/manage") ||
    path.endsWith("/teams") ||
    /\/org\/[^/]+$/.test(path)
  ) {
    return null;
  }

  if (!tenantId || !prefsReady) {
    return null;
  }

  const year = working?.year ?? defaultYear;
  const publisherId = working?.publisherId ?? publishers[0]?.id ?? "";
  const programTitle = working?.programTitle ?? "";

  const filterValue: VbsFilterState = {
    yearFilter: String(year),
    publisherFilter: publisherId,
    titleFilter: programTitle,
  };

  return (
    <section className="vbs-filter-panel vbs-filter-panel-compact vbs-context-bar" aria-label="Working VBS">
      <div className="vbs-context-head">
        <span className="vbs-context-label">Working VBS</span>
        <div className="vbs-context-actions">
          {userDefault?.allFilters ? (
            <span className="vbs-context-meta muted">Your default: All years · All publishers · All curriculum</span>
          ) : userDefault ? (
            <span className="vbs-context-meta muted">
              Your default: {userDefault.publisherName} · {userDefault.year} · {userDefault.programTitle}
            </span>
          ) : (
            <span className="vbs-context-meta muted">No personal default yet</span>
          )}
          {hasSessionOverride ? (
            <button type="button" className="ghost" onClick={resetWorking}>
              Reset to my default
            </button>
          ) : null}
        </div>
      </div>
      <VbsFilterFields
        mode="pick"
        programs={programs}
        publishers={publishers}
        value={filterValue}
        onChange={(next) =>
          setWorking({
            year: Number(next.yearFilter),
            publisherId: next.publisherFilter,
            programTitle: next.titleFilter,
          })
        }
        ariaLabel="Working VBS selection"
      />
      <p className="vbs-filter-note muted">
        Session-only picker for org tools (room design, etc.). Page filters use your personal default, not the org
        plan.
      </p>
    </section>
  );
}
