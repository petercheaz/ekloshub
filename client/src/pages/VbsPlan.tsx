import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { VbsFilterPanel } from "../VbsFilterPanel";
import type { VbsFilterState } from "../VbsFilterFields";
import { useOrgVbs } from "../org-vbs";
import { api } from "../api";
import { useAuth } from "../auth";
import { OrgUserTypeahead } from "../OrgUserTypeahead";
import { VbsPlanCalendar } from "../VbsPlanCalendar";
import { VbsPlanSpreadsheet } from "../VbsPlanSpreadsheet";
import { useOrgs } from "../orgs";
import type {
  VbsPlanWorkspace,
  VbsBoardPost,
  VbsChecklistItem,
  VbsScheduleSlot,
  VbsStation,
  VbsTask,
  VbsTaskAttachment,
  VbsTaskCategory,
  VbsReimbursementStatus,
  VbsTaskStatus,
  ShareAttachment,
} from "../types";
import { vbsTaskSavePayload } from "../vbs-task-payload";
import { enumeratePlanDays } from "../vbs-plan-worksheet-views";
import {
  MILESTONE_STATUS_LABELS,
  milestoneIsDone,
  milestoneTone,
  normalizeMilestoneStatus,
  type MilestoneTone,
} from "../vbs-milestone-status";
import type { VbsMilestoneStatus } from "../types";
import { attachmentTooLargeMessage, MAX_ATTACHMENT_BYTES } from "@media-limits";
import { VbsPlanReimbursementsTab } from "./VbsPlanReimbursements";
import { VbsPlanAdherence } from "../VbsPlanAdherence";

type Tab =
  | "overview"
  | "adherence"
  | "tasks"
  | "reimbursements"
  | "schedule"
  | "stations"
  | "checklist"
  | "board";

const planSections: { id: Tab; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "Dates, budget, curriculum & notes" },
  { id: "adherence", label: "Schedule health", hint: "Overdue work and gaps before VBS week" },
  { id: "checklist", label: "Milestones Checklist", hint: "Due-date timeline of launch milestones" },
  { id: "tasks", label: "Tasks", hint: "Assign and track work by team" },
  {
    id: "reimbursements",
    label: "Reimbursements",
    hint: "Org admin — submitted receipts and payout tracking",
  },
  { id: "schedule", label: "VBS daily schedule", hint: "Day-by-day program from overview dates & hours" },
  { id: "stations", label: "Stations", hint: "Rooms, rotations & default teams" },
  { id: "board", label: "Message board", hint: "Team updates, replies & alerts" },
];

function formatPlanMoney(amount: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function parseMoneyInput(raw: string) {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function tabFromSearch(params: URLSearchParams, allowed: Set<string>): Tab {
  const raw = params.get("tab");
  if (raw && allowed.has(raw)) {
    return raw as Tab;
  }
  return "overview";
}

export default function VbsPlanPage() {
  const { orgId = "" } = useParams();
  const { user } = useAuth();
  const { canAdmin, current: org } = useOrgs();
  const seesAllTeams = Boolean(user?.platformAdmin || canAdmin);
  const [data, setData] = useState<VbsPlanWorkspace | null>(null);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const visibleSections = useMemo(
    () => planSections.filter((section) => section.id !== "reimbursements" || data?.canAdmin),
    [data?.canAdmin],
  );
  const tabIds = useMemo(() => new Set(visibleSections.map((t) => t.id)), [visibleSections]);

  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    setTab(tabFromSearch(searchParams, tabIds));
  }, [searchParams, tabIds]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const workspace = await api.vbsPlan(orgId);
    setData(workspace);
    setError("");
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    api
      .vbsPlan(orgId)
      .then((workspace) => {
        if (!cancelled) {
          setData(workspace);
          setError("");
        }
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

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return <p className="status">{error}</p>;
  }
  if (!data) {
    return <p className="status">Loading VBS plan…</p>;
  }

  const plan = data.plan;
  const teamName = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "";
  const tasksOpen = data.tasks.filter((t) => t.status !== "done").length;
  const checklistOpen = data.checklist.filter((c) => !milestoneIsDone(c)).length;
  const activeSection = planSections.find((section) => section.id === tab);

  const publisherName =
    data.publishers.find((item) => item.id === plan?.publisherId)?.name ?? plan?.publisherId ?? "";
  const dateRange =
    plan?.startDate && plan?.endDate
      ? `${plan.startDate} – ${plan.endDate}`
      : plan?.startDate ?? "";

  return (
    <div className="reviews vbs-plan vbs-workspace">
      <header className="vbs-plan-masthead" aria-label="VBS plan summary">
        <div className="vbs-plan-masthead-main">
          {org ? <p className="vbs-plan-masthead-org">{org.name}</p> : null}
          <h1 className="vbs-plan-masthead-title">{plan?.title || "VBS plan"}</h1>
          {plan ? (
            <dl className="vbs-plan-masthead-meta">
              {plan.programTitle ? (
                <div className="vbs-plan-masthead-meta-row">
                  <dt>Curriculum</dt>
                  <dd>
                    {[publisherName, plan.programTitle, plan.year ? String(plan.year) : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </div>
              ) : null}
              {dateRange ? (
                <div className="vbs-plan-masthead-meta-row">
                  <dt>Dates</dt>
                  <dd>{dateRange}</dd>
                </div>
              ) : null}
              {plan.location ? (
                <div className="vbs-plan-masthead-meta-row">
                  <dt>Location</dt>
                  <dd>{plan.location}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="vbs-plan-masthead-empty muted">
              Start on <strong>Overview</strong> to set curriculum, dates, and location for this organization.
            </p>
          )}
        </div>
        {plan ? (
          <div className="vbs-plan-masthead-aside">
            <ul className="vbs-plan-snapshot vbs-plan-financial" aria-label="Plan budget">
              <li>
                <strong>{formatPlanMoney(plan.budgetAmount ?? 0)}</strong>
                <span>Budget</span>
              </li>
              <li>
                <strong>{formatPlanMoney(plan.expensesAmount ?? 0)}</strong>
                <span>Expenses</span>
              </li>
            </ul>
            <ul className="vbs-plan-snapshot" aria-label="Plan progress">
            <li>
              <strong>{tasksOpen}</strong>
              <span>Open tasks</span>
            </li>
            <li>
              <strong>{checklistOpen}</strong>
              <span>Milestones left</span>
            </li>
            <li>
              <strong>{data.schedule.length}</strong>
              <span>Schedule blocks</span>
            </li>
            <li>
              <strong>{data.boardPosts.length}</strong>
              <span>Board posts</span>
            </li>
          </ul>
          </div>
        ) : null}
      </header>

      {error ? <p className="status">{error}</p> : null}

      {user ? (
        <VbsPlanCalendar
          orgId={orgId}
          username={user.username}
          data={data}
          seesAllTeams={seesAllTeams}
          onReload={() => void reload()}
          onRun={run}
        />
      ) : null}

      {user && data.plan ? (
        <VbsPlanSpreadsheet
          orgId={orgId}
          data={data}
          username={user.username}
          seesAllTeams={seesAllTeams}
          teamName={teamName}
          busy={busy}
          onRun={run}
        />
      ) : null}

      <section className="vbs-plan-sections" aria-labelledby="vbs-plan-sections-title">
        <h2 id="vbs-plan-sections-title" className="vbs-plan-sections-title">
          Planning sections
        </h2>
        <p className="vbs-plan-sections-lead muted">
          These are the main areas of your plan. Pick a tab to view and edit — the team calendar above stays in
          sync on every tab.
        </p>
        <div className="vbs-chrome-tabs">
          <nav className="vbs-chrome-tabs-bar" role="tablist" aria-label="VBS planning sections">
            {visibleSections.map((item) => {
              const selected = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`vbs-plan-tab-${item.id}`}
                  className={selected ? "vbs-chrome-tab active" : "vbs-chrome-tab"}
                  aria-selected={selected}
                  aria-controls="vbs-plan-tabpanel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    setTab(item.id);
                    setSearchParams(item.id === "overview" ? {} : { tab: item.id }, { replace: true });
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="vbs-chrome-tabs-panel" role="tabpanel" id="vbs-plan-tabpanel" aria-labelledby={`vbs-plan-tab-${tab}`}>
            {activeSection ? (
              <p className="vbs-plan-tab-hint">
                <strong>{activeSection.label}</strong>
                <span className="muted"> — {activeSection.hint}</span>
              </p>
            ) : null}

            {tab === "overview" ? (
              <>
                <VbsPlanAdherence data={data} />
                <OverviewTab data={data} busy={busy} onSave={(input) => run(() => api.saveVbsPlan(orgId, input))} />
              </>
            ) : null}
            {tab === "adherence" ? <VbsPlanAdherence data={data} /> : null}
            {tab === "tasks" ? (
              <TasksTab data={data} orgId={orgId} busy={busy} teamName={teamName} onRun={run} />
            ) : null}
            {tab === "reimbursements" && data.canAdmin ? (
              <VbsPlanReimbursementsTab orgId={orgId} />
            ) : null}
            {tab === "schedule" ? (
              <ScheduleTab data={data} orgId={orgId} busy={busy} teamName={teamName} onRun={run} />
            ) : null}
            {tab === "stations" ? (
              <StationsTab data={data} orgId={orgId} busy={busy} teamName={teamName} onRun={run} />
            ) : null}
            {tab === "checklist" ? (
              <ChecklistTab data={data} orgId={orgId} busy={busy} teamName={teamName} onRun={run} />
            ) : null}
            {tab === "board" ? (
              <BoardTab data={data} orgId={orgId} busy={busy} onRun={run} teamName={teamName} />
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function OverviewTab({
  data,
  busy,
  onSave,
}: {
  data: VbsPlanWorkspace;
  busy: boolean;
  onSave: (input: Record<string, unknown>) => void;
}) {
  const { filterDefault, prefsReady } = useOrgVbs();
  const plan = data.plan;
  const [year, setYear] = useState(plan?.year ?? data.defaultYear);
  const [title, setTitle] = useState(plan?.title ?? "");
  const [publisherId, setPublisherId] = useState(plan?.publisherId ?? data.publishers[0]?.id ?? "");
  const [programTitle, setProgramTitle] = useState(plan?.programTitle ?? "");
  const [location, setLocation] = useState(plan?.location ?? "");
  const [startDate, setStartDate] = useState(plan?.startDate ?? "");
  const [endDate, setEndDate] = useState(plan?.endDate ?? "");
  const [dailyStart, setDailyStart] = useState(plan?.dailyStart ?? "09:00");
  const [dailyEnd, setDailyEnd] = useState(plan?.dailyEnd ?? "12:00");
  const [expectedKids, setExpectedKids] = useState(plan?.expectedKids ?? 0);
  const [budgetAmount, setBudgetAmount] = useState(plan?.budgetAmount ?? 0);
  const [coordinatorNotes, setCoordinatorNotes] = useState(plan?.coordinatorNotes ?? "");
  const taskExpensesTotal = useMemo(
    () => data.tasks.reduce((sum, task) => sum + Math.max(0, task.expenseAmount ?? 0), 0),
    [data.tasks],
  );
  const [seedSchedule, setSeedSchedule] = useState(!plan);
  const [curriculumBootstrapped, setCurriculumBootstrapped] = useState(Boolean(plan?.programTitle));

  useEffect(() => {
    if (!plan) {
      return;
    }
    setBudgetAmount(plan.budgetAmount ?? 0);
  }, [plan?.id, plan?.budgetAmount]);

  useEffect(() => {
    if (!prefsReady || curriculumBootstrapped || plan?.programTitle) {
      return;
    }
    if (filterDefault?.allFilters) {
      setCurriculumBootstrapped(true);
      return;
    }
    if (filterDefault?.programTitle && filterDefault.programTitle !== "all") {
      setYear(filterDefault.year);
      setPublisherId(filterDefault.publisherId);
      setProgramTitle(filterDefault.programTitle);
    }
    setCurriculumBootstrapped(true);
  }, [prefsReady, filterDefault, plan?.programTitle, curriculumBootstrapped]);

  const curriculumFilter: VbsFilterState = {
    yearFilter: String(year),
    publisherFilter: publisherId,
    titleFilter: programTitle,
  };

  function onCurriculumChange(next: VbsFilterState) {
    setYear(Number(next.yearFilter));
    setPublisherId(next.publisherFilter);
    setProgramTitle(next.titleFilter);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      year,
      title,
      publisherId,
      programTitle,
      location,
      startDate,
      endDate,
      dailyStart,
      dailyEnd,
      expectedKids,
      budgetAmount,
      coordinatorNotes,
      seedTemplate: !plan,
      seedSchedule,
    });
  }

  return (
    <section className="vbs-panel vbs-tasks-panel vbs-plan-overview">
      {!data.canWrite ? (
        <div className="vbs-plan-callout vbs-plan-callout-readonly">
          <p>You have read-only access. Coordinators with write access can edit this plan.</p>
        </div>
      ) : null}

      <div className="vbs-plan-overview-block">
        <h2 className="vbs-plan-section-title">Curriculum on this plan</h2>
        <p className="vbs-plan-section-lead muted">
          Year, publisher, and VBS title are saved with this organization&apos;s plan — not with your personal
          browsing filters elsewhere.
        </p>
        <div className="vbs-plan-callout">
          <p>
            <strong>Save as my default VBS</strong> (below) is optional. It only sets what you see on Share, Setup,
            and Reviews — it does not change this plan until you save the overview form.
          </p>
        </div>
        <VbsFilterPanel
          mode="pick"
          programs={data.programs}
          publishers={data.publishers}
          value={curriculumFilter}
          onChange={onCurriculumChange}
          ariaLabel="Plan curriculum"
          disabled={!data.canWrite}
          showSaveDefault
        />
      </div>

      <form className="vbs-plan-overview-form" onSubmit={submit}>
      <div className="vbs-plan-overview-block">
        <h2 className="vbs-plan-section-title">Budget</h2>
        <p className="vbs-plan-section-lead muted">
          Set the planned budget here. Expenses are totaled automatically from task expense amounts on the Tasks
          tab. Budget and expenses also appear in the plan header on every tab.
        </p>
        <div className="vbs-plan-field-row">
          <label className="vbs-plan-field">
            Budget (USD)
            <input
              type="text"
              inputMode="decimal"
              value={budgetAmount === 0 ? "" : String(budgetAmount)}
              placeholder="0"
              onChange={(e) => setBudgetAmount(parseMoneyInput(e.target.value))}
              disabled={!data.canWrite}
            />
          </label>
          <div className="vbs-plan-field vbs-plan-field-readonly">
            <span className="vbs-plan-field-readonly-label">Expenses from tasks</span>
            <strong className="vbs-plan-field-readonly-value">{formatPlanMoney(taskExpensesTotal)}</strong>
            <span className="muted vbs-plan-field-readonly-hint">
              {data.tasks.length === 0
                ? "Add tasks with expense totals to track spend."
                : `${data.tasks.filter((t) => t.expenseAmount > 0).length} task${data.tasks.filter((t) => t.expenseAmount > 0).length === 1 ? "" : "s"} with expenses`}
            </span>
          </div>
        </div>
        {budgetAmount > 0 ? (
          <p className="vbs-plan-budget-hint muted">
            Remaining: {formatPlanMoney(Math.max(0, budgetAmount - taskExpensesTotal))}
            {taskExpensesTotal > budgetAmount ? " (over budget)" : ""}
          </p>
        ) : null}
      </div>

      <div className="vbs-plan-overview-block">
        <h2 className="vbs-plan-section-title">Plan details</h2>
        <p className="vbs-plan-section-lead muted">Title, venue, daily hours, and coordinator notes.</p>
        <label className="vbs-plan-field">
          Plan title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`VBS ${year}`} disabled={!data.canWrite} />
        </label>
        <label className="vbs-plan-field">
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} disabled={!data.canWrite} />
        </label>
        <div className="vbs-plan-field-row">
          <label className="vbs-plan-field">
            Start date
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!data.canWrite} />
          </label>
          <label className="vbs-plan-field">
            End date
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!data.canWrite} />
          </label>
        </div>
        <div className="vbs-plan-field-row">
          <label className="vbs-plan-field">
            Daily start
            <input type="time" value={dailyStart} onChange={(e) => setDailyStart(e.target.value)} disabled={!data.canWrite} />
          </label>
          <label className="vbs-plan-field">
            Daily end
            <input type="time" value={dailyEnd} onChange={(e) => setDailyEnd(e.target.value)} disabled={!data.canWrite} />
          </label>
        </div>
        <label className="vbs-plan-field vbs-plan-field-narrow">
          Expected kids
          <input
            type="number"
            min={0}
            value={expectedKids}
            onChange={(e) => setExpectedKids(Number(e.target.value))}
            disabled={!data.canWrite}
          />
        </label>
        <label className="vbs-plan-field">
          Coordinator notes
          <textarea
            value={coordinatorNotes}
            onChange={(e) => setCoordinatorNotes(e.target.value)}
            rows={6}
            disabled={!data.canWrite}
          />
        </label>
        {!plan ? (
          <label className="checkbox-line">
            <input type="checkbox" checked={seedSchedule} onChange={(e) => setSeedSchedule(e.target.checked)} />
            Build VBS daily schedule from overview dates and daily hours
          </label>
        ) : null}
      </div>
        {data.canWrite ? (
          <div className="vbs-plan-form-actions">
            <button type="submit" className="vbs-plan-save" disabled={busy}>
              {plan ? "Save plan" : "Create plan & starter checklist"}
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

const TASK_STATUS_LABEL: Record<VbsTaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

const REIMBURSEMENT_LABEL: Record<VbsReimbursementStatus, string> = {
  none: "Not applicable",
  pending: "Pending",
  submitted: "Submitted",
  reimbursed: "Reimbursed",
  denied: "Denied",
};

function attachmentShowsImagePreview(file: Pick<VbsTaskAttachment, "type" | "name" | "dataUrl">) {
  if (!file.dataUrl) {
    return false;
  }
  if (file.type.startsWith("image/")) {
    return true;
  }
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|svg)$/i.test(file.name);
}

function attachmentKindLabel(file: Pick<VbsTaskAttachment, "type" | "name">) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return "PDF";
  }
  if (file.type.startsWith("image/")) {
    return "Image";
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop()?.toUpperCase() : "";
  return ext && ext.length <= 5 ? ext : "File";
}

async function readReceiptFiles(files: FileList | null): Promise<ShareAttachment[]> {
  if (!files?.length) {
    return [];
  }
  const selected = [...files].slice(0, 10);
  return Promise.all(
    selected.map(
      (file) =>
        new Promise<ShareAttachment>((resolve, reject) => {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            reject(new Error(attachmentTooLargeMessage(file.name)));
            return;
          }
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl: String(reader.result ?? ""),
            });
          reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
          reader.readAsDataURL(file);
        }),
    ),
  );
}

const UNASSIGNED_TEAM_FILTER = "__unassigned__";

function sortTasksByDue(tasks: VbsTask[], ascending: boolean) {
  const dir = ascending ? 1 : -1;
  return [...tasks].sort((a, b) => {
    const aDue = a.dueDate || "";
    const bDue = b.dueDate || "";
    if (!aDue && !bDue) {
      return a.title.localeCompare(b.title) * dir;
    }
    if (!aDue) {
      return 1;
    }
    if (!bDue) {
      return -1;
    }
    const cmp = aDue.localeCompare(bDue);
    return cmp !== 0 ? cmp * dir : a.title.localeCompare(b.title) * dir;
  });
}

function filterVbsTasksByStatus(tasks: VbsTask[], statusFilter: string) {
  return tasks.filter((task) => !statusFilter || task.status === statusFilter);
}

function tasksForTeamSection(tasks: VbsTask[], sectionKey: string) {
  if (sectionKey === UNASSIGNED_TEAM_FILTER) {
    return tasks.filter((task) => !task.assignedTeamId);
  }
  return tasks.filter((task) => task.assignedTeamId === sectionKey);
}

type TaskTeamSectionDef = { key: string; label: string; teamId: string };

function buildTaskTeamSections(teams: VbsPlanWorkspace["teams"]): TaskTeamSectionDef[] {
  const teamSections = [...teams]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((team) => ({ key: team.id, label: team.name, teamId: team.id }));
  return [...teamSections, { key: UNASSIGNED_TEAM_FILTER, label: "Unassigned", teamId: "" }];
}

const ORG_WIDE_BOARD_FILTER = "__org__";

function filterByTeamId(teamId: string, teamFilter: string) {
  if (teamFilter === UNASSIGNED_TEAM_FILTER) {
    return !teamId;
  }
  if (teamFilter && teamId !== teamFilter) {
    return false;
  }
  return true;
}

function sortScheduleSlots(slots: VbsScheduleSlot[], ascending: boolean) {
  const dir = ascending ? 1 : -1;
  return [...slots].sort((a, b) => {
    const dayCmp = (a.dayDate || "").localeCompare(b.dayDate || "");
    if (dayCmp !== 0) {
      return dayCmp * dir;
    }
    const timeCmp = (a.startsAt || "").localeCompare(b.startsAt || "");
    return timeCmp !== 0 ? timeCmp * dir : a.label.localeCompare(b.label) * dir;
  });
}

function filterScheduleSlots(slots: VbsScheduleSlot[], teamFilter: string, dayFilter: string) {
  return slots.filter((slot) => {
    if (dayFilter && slot.dayDate !== dayFilter) {
      return false;
    }
    return filterByTeamId(slot.teamId, teamFilter);
  });
}

function sortStations(stations: VbsStation[], ascending: boolean) {
  const dir = ascending ? 1 : -1;
  return [...stations].sort((a, b) => a.name.localeCompare(b.name) * dir);
}

function filterStations(stations: VbsStation[], teamFilter: string) {
  return stations.filter((station) => filterByTeamId(station.defaultTeamId, teamFilter));
}

function filterChecklistItems(
  items: VbsChecklistItem[],
  categoryFilter: string,
  teamFilter: string,
  doneFilter: string,
) {
  return items.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) {
      return false;
    }
    if (doneFilter === "done" && !milestoneIsDone(item)) {
      return false;
    }
    if (doneFilter === "not_started" && normalizeMilestoneStatus(item) !== "not_started") {
      return false;
    }
    if (doneFilter === "in_progress" && normalizeMilestoneStatus(item) !== "in_progress") {
      return false;
    }
    return filterByTeamId(item.assignedTeamId, teamFilter);
  });
}

function sortChecklistItems(items: VbsChecklistItem[], ascending: boolean) {
  const dir = ascending ? 1 : -1;
  return [...items].sort((a, b) => {
    const cat = a.category.localeCompare(b.category);
    if (cat !== 0) {
      return cat * dir;
    }
    return a.label.localeCompare(b.label) * dir;
  });
}

function localTodayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function sortMilestonesByDueDate(items: VbsChecklistItem[]) {
  return [...items].sort((a, b) => {
    const aDue = a.dueDate || "";
    const bDue = b.dueDate || "";
    if (!aDue && !bDue) {
      return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);
    }
    if (!aDue) {
      return 1;
    }
    if (!bDue) {
      return -1;
    }
    const dueCmp = aDue.localeCompare(bDue);
    return dueCmp !== 0 ? dueCmp : a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);
  });
}

function parseIsoDayMs(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    return Number.NaN;
  }
  return Date.UTC(year, month - 1, day);
}

function milestoneDueDateRange(items: VbsChecklistItem[]) {
  const dated = items.filter((item) => item.dueDate);
  if (dated.length === 0) {
    return null;
  }
  const times = dated.map((item) => parseIsoDayMs(item.dueDate)).filter((ms) => Number.isFinite(ms));
  if (times.length === 0) {
    return null;
  }
  return { minMs: Math.min(...times), maxMs: Math.max(...times) };
}

function milestoneDatePercent(iso: string, minMs: number, maxMs: number) {
  const ms = parseIsoDayMs(iso);
  if (!Number.isFinite(ms)) {
    return null;
  }
  if (maxMs === minMs) {
    return 0.5;
  }
  const ratio = (ms - minMs) / (maxMs - minMs);
  return Math.min(1, Math.max(0, ratio));
}

function milestoneTodayLinePercent(today: string, minMs: number, maxMs: number) {
  const todayMs = parseIsoDayMs(today);
  if (!Number.isFinite(todayMs)) {
    return null;
  }
  if (maxMs === minMs) {
    return todayMs < minMs ? 0 : todayMs > maxMs ? 1 : 0.5;
  }
  const ratio = (todayMs - minMs) / (maxMs - minMs);
  return Math.min(1, Math.max(0, ratio));
}

/** Max horizontal shift for milestones on the due-date timeline (percent of row width). */
const MILESTONE_DATE_SHIFT_PCT = 14;

function formatMilestoneDue(iso: string) {
  if (!iso) {
    return "No due date";
  }
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) {
    return iso;
  }
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function filterBoardPosts(posts: VbsBoardPost[], teamFilter: string) {
  return posts.filter((post) => {
    if (teamFilter === ORG_WIDE_BOARD_FILTER) {
      return !post.teamId;
    }
    if (teamFilter === UNASSIGNED_TEAM_FILTER) {
      return false;
    }
    if (teamFilter && post.teamId !== teamFilter) {
      return false;
    }
    return true;
  });
}

function sortBoardPosts(posts: VbsBoardPost[], newestFirst: boolean) {
  const dir = newestFirst ? -1 : 1;
  return [...posts].sort((a, b) => a.createdAt.localeCompare(b.createdAt) * dir);
}

function TasksTab({
  data,
  orgId,
  busy,
  teamName,
  onRun,
}: {
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  teamName: (id: string) => string;
  onRun: (action: () => Promise<unknown>) => void;
}) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [sectionUi, setSectionUi] = useState<Record<string, { status: string; sortDueAsc: boolean }>>({});

  const sections = useMemo(() => buildTaskTeamSections(data.teams), [data.teams]);

  function sectionState(key: string) {
    return sectionUi[key] ?? { status: "", sortDueAsc: true };
  }

  function patchSection(key: string, patch: Partial<{ status: string; sortDueAsc: boolean }>) {
    setSectionUi((current) => ({
      ...current,
      [key]: { ...sectionState(key), ...patch },
    }));
  }

  if (!data.plan) {
    return <p className="muted">Create your plan on the Overview tab first.</p>;
  }

  const hasAnyTasks = data.tasks.length > 0;

  return (
    <section className="vbs-panel vbs-tasks-panel">
      {!hasAnyTasks ? <p className="muted vbs-task-empty">No tasks yet. Add one under a team below.</p> : null}

      <div className="vbs-task-team-sections">
        {sections.map((section) => {
          const { status, sortDueAsc } = sectionState(section.key);
          const inSection = tasksForTeamSection(data.tasks, section.key);
          const visibleTasks = sortTasksByDue(filterVbsTasksByStatus(inSection, status), sortDueAsc);

          return (
            <TaskTeamSection
              key={section.key}
              section={section}
              tasks={visibleTasks}
              totalInSection={inSection.length}
              statusFilter={status}
              sortDueAsc={sortDueAsc}
              onStatusChange={(next) => {
                patchSection(section.key, { status: next });
                setExpandedTaskId(null);
              }}
              onSortToggle={() => patchSection(section.key, { sortDueAsc: !sortDueAsc })}
              data={data}
              orgId={orgId}
              busy={busy}
              teamName={teamName}
              expandedTaskId={expandedTaskId}
              onToggleTask={(taskId) =>
                setExpandedTaskId((current) => (current === taskId ? null : taskId))
              }
              onRun={onRun}
            />
          );
        })}
      </div>
    </section>
  );
}

function TaskTeamSection({
  section,
  tasks,
  totalInSection,
  statusFilter,
  sortDueAsc,
  onStatusChange,
  onSortToggle,
  data,
  orgId,
  busy,
  teamName,
  expandedTaskId,
  onToggleTask,
  onRun,
}: {
  section: TaskTeamSectionDef;
  tasks: VbsTask[];
  totalInSection: number;
  statusFilter: string;
  sortDueAsc: boolean;
  onStatusChange: (status: string) => void;
  onSortToggle: () => void;
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  teamName: (id: string) => string;
  expandedTaskId: string | null;
  onToggleTask: (taskId: string) => void;
  onRun: (action: () => Promise<unknown>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<VbsTaskCategory>("planning");
  const [dueDate, setDueDate] = useState("");
  const [assignedUsername, setAssignedUsername] = useState("");
  const [notify, setNotify] = useState(true);

  function resetAdd() {
    setTitle("");
    setDescription("");
    setNotes("");
    setCategory("planning");
    setDueDate("");
    setAssignedUsername("");
    setAdding(false);
  }

  function addTask(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onRun(() =>
      api.saveVbsTask(orgId, {
        title: title.trim(),
        description,
        notes,
        category,
        status: "todo",
        dueDate,
        assignedUsername,
        assignedTeamId: section.teamId,
        notify,
      }),
    );
    resetAdd();
  }

  const filteredEmpty = totalInSection > 0 && tasks.length === 0;

  return (
    <section className="vbs-task-team-section" aria-labelledby={`vbs-task-team-${section.key}`}>
      <div className="vbs-task-team-section-head">
        <h2 className="vbs-task-team-section-title" id={`vbs-task-team-${section.key}`}>
          {section.label}
          <span className="vbs-task-team-section-count" aria-label={`${totalInSection} tasks`}>
            {totalInSection}
          </span>
        </h2>
        <div className="vbs-task-team-section-actions">
          <label className="vbs-task-team-control">
            <span className="vbs-task-team-control-label">Status</span>
            <select
              className="vbs-task-team-select"
              value={statusFilter}
              onChange={(e) => onStatusChange(e.target.value)}
              aria-label={`Filter ${section.label} by status`}
            >
              <option value="">All statuses</option>
              {data.taskStatuses.map((status) => (
                <option key={status} value={status}>
                  {TASK_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>
          <div className="vbs-task-team-control" role="group" aria-label={`Sort ${section.label} tasks`}>
            <span className="vbs-task-team-control-label">Sort</span>
            <button
              type="button"
              className="vbs-task-sort-btn active"
              aria-pressed
              onClick={onSortToggle}
            >
              Due date
              <span aria-hidden="true">{sortDueAsc ? " ↑" : " ↓"}</span>
            </button>
          </div>
          {data.canWrite ? (
            <button
              type="button"
              className={adding ? "vbs-task-team-add-btn secondary" : "vbs-task-team-add-btn"}
              aria-expanded={adding}
              onClick={() => setAdding((open) => !open)}
            >
              {adding ? "Cancel" : "Add task"}
            </button>
          ) : null}
        </div>
      </div>

      {adding && data.canWrite ? (
        <form className="vbs-task-add-form vbs-task-team-add-form" onSubmit={addTask}>
          <label className="vbs-task-field">
            <span className="vbs-task-field-label">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Task title" />
          </label>
          <label className="vbs-task-field">
            <span className="vbs-task-field-label">Description</span>
            <textarea
              className="vbs-task-details"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional instructions or links…"
            />
          </label>
          <label className="vbs-task-field vbs-task-notes-field">
            <span className="vbs-task-field-label">Notes</span>
            <textarea
              className="vbs-task-details"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — updates, blockers, phone numbers…"
            />
          </label>
          <div className="vbs-task-meta-grid">
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as VbsTaskCategory)}>
                {data.taskCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Due</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Assigned to</span>
              <OrgUserTypeahead
                orgId={orgId}
                value={assignedUsername}
                onChange={setAssignedUsername}
                placeholder="Search org members…"
              />
              <span className="muted vbs-task-field-hint">Each task can go to a different person.</span>
            </label>
          </div>
          <label className="checkbox-line">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Notify assignees (app, email, SMS per their preferences)
          </label>
          <div className="vbs-task-add-actions">
            <button type="submit" className="vbs-plan-save" disabled={busy}>
              Create task
            </button>
          </div>
        </form>
      ) : null}

      {filteredEmpty ? (
        <p className="muted vbs-task-empty">No tasks in this section match the status filter.</p>
      ) : null}

      {tasks.length > 0 ? (
        <ul className="vbs-task-list">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              data={data}
              orgId={orgId}
              busy={busy}
              teamName={teamName}
              omitTeamInSummary
              expanded={expandedTaskId === task.id}
              onToggle={() => onToggleTask(task.id)}
              onRun={onRun}
            />
          ))}
        </ul>
      ) : totalInSection === 0 ? (
        <p className="muted vbs-task-empty vbs-task-team-section-empty">No tasks for this team yet.</p>
      ) : null}
    </section>
  );
}

function TaskReceiptAttachments({
  attachments,
  canEdit,
  busy,
  onChange,
}: {
  attachments: VbsTaskAttachment[];
  canEdit: boolean;
  busy: boolean;
  onChange: (next: VbsTaskAttachment[]) => void;
}) {
  function addFiles(files: FileList | null) {
    void readReceiptFiles(files)
      .then((uploaded) => {
        if (uploaded.length === 0) {
          return;
        }
        onChange([
          ...attachments,
          ...uploaded.map((file, index) => ({
            id: `new-${Date.now()}-${index}`,
            ...file,
          })),
        ]);
      })
      .catch((err: Error) => window.alert(err.message));
  }

  return (
    <div className="vbs-task-receipts">
      <span className="vbs-task-field-label">Receipt attachments</span>
      {attachments.length === 0 && !canEdit ? (
        <p className="muted vbs-task-receipt-empty">No receipts attached yet.</p>
      ) : (
        <div className="vbs-task-receipt-strip" role="list" aria-label="Receipt attachments">
          {attachments.map((file) => (
            <figure className="vbs-task-receipt-thumb" role="listitem" key={file.id}>
              <a
                className="vbs-task-receipt-thumb-link"
                href={file.dataUrl}
                target="_blank"
                rel="noreferrer"
                title={file.name}
              >
                {attachmentShowsImagePreview(file) ? (
                  <img src={file.dataUrl} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="vbs-task-receipt-file-badge">{attachmentKindLabel(file)}</span>
                )}
              </a>
              <figcaption className="vbs-task-receipt-thumb-caption" title={file.name}>
                {file.name}
              </figcaption>
              {canEdit ? (
                <button
                  type="button"
                  className="vbs-task-receipt-remove"
                  aria-label={`Remove ${file.name}`}
                  disabled={busy}
                  onClick={() => onChange(attachments.filter((item) => item.id !== file.id))}
                >
                  ×
                </button>
              ) : null}
            </figure>
          ))}
          {canEdit ? (
            <label className="vbs-task-receipt-add">
              <span className="vbs-task-receipt-add-plus" aria-hidden="true">
                +
              </span>
              <span className="vbs-task-receipt-add-label">Add receipts</span>
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.heic"
                disabled={busy}
                hidden
                onChange={(event) => {
                  const input = event.target;
                  addFiles(input.files);
                  input.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
      )}
      {attachments.length === 0 && canEdit ? (
        <p className="muted vbs-task-receipt-hint">Upload photos or PDFs of receipts (up to 10 MB each).</p>
      ) : null}
    </div>
  );
}

function taskSummaryLine(task: VbsTask, teamName: (id: string) => string, omitTeam?: boolean) {
  const assignee =
    task.assignedUsername ||
    (omitTeam ? "" : task.assignedTeamId ? teamName(task.assignedTeamId) : "Unassigned");
  const expense =
    task.expenseAmount > 0
      ? ` · ${formatPlanMoney(task.expenseAmount)}${task.reimbursementStatus !== "none" ? ` · ${REIMBURSEMENT_LABEL[task.reimbursementStatus]}` : ""}`
      : "";
  const who = assignee ? ` · ${assignee}` : "";
  return `${task.category} · due ${task.dueDate || "—"}${who}${expense}`;
}

function TaskRow({
  task,
  data,
  orgId,
  busy,
  teamName,
  omitTeamInSummary,
  expanded,
  onToggle,
  onRun,
}: {
  task: VbsTask;
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  teamName: (id: string) => string;
  omitTeamInSummary?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRun: (action: () => Promise<unknown>) => void;
}) {
  const canEdit = data.canWrite;
  const [draft, setDraft] = useState(task);

  useEffect(() => {
    setDraft(task);
  }, [task]);

  const save = useCallback(
    (next: VbsTask) => {
      setDraft(next);
      onRun(() => api.saveVbsTask(orgId, vbsTaskSavePayload(next)));
    },
    [orgId, onRun],
  );

  function confirmDelete(event: MouseEvent) {
    event.stopPropagation();
    const ok = window.confirm(
      `Delete “${draft.title || "this task"}”?\n\nIt will be removed from the plan and the team calendar.`,
    );
    if (!ok) {
      return;
    }
    onRun(() => api.deleteVbsTask(orgId, task.id));
  }

  return (
    <li className={expanded ? `vbs-task-card open status-${draft.status}` : `vbs-task-card status-${draft.status}`}>
      <button type="button" className="vbs-task-summary" aria-expanded={expanded} onClick={onToggle}>
        <span className="vbs-task-summary-main">
          <span className="vbs-task-summary-title">{task.title}</span>
          {task.assignedUsername ? (
            <span className="vbs-task-assignee-pill" title="Assigned to">
              {task.assignedUsername}
            </span>
          ) : null}
          <span className={`vbs-task-status-pill mini active status-${task.status}`}>
            {TASK_STATUS_LABEL[task.status]}
          </span>
        </span>
        <span className="vbs-task-summary-meta muted">{taskSummaryLine(task, teamName, omitTeamInSummary)}</span>
        {task.notes.trim() && !expanded ? (
          <span className="vbs-task-notes-preview muted">{task.notes.trim()}</span>
        ) : null}
        <span className="vbs-task-chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded ? (
        <div className="vbs-task-body">
          <div className="vbs-task-card-head">
            {canEdit ? (
              <input
                className="vbs-task-title-input"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onBlur={() => {
                  if (draft.title.trim() && draft.title !== task.title) {
                    save({ ...draft, title: draft.title.trim() });
                  } else {
                    setDraft(task);
                  }
                }}
                disabled={busy}
                aria-label="Task title"
              />
            ) : (
              <h3 className="vbs-task-title-read">{task.title}</h3>
            )}
            {canEdit ? (
              <button
                type="button"
                className="vbs-task-remove"
                aria-label={`Delete task ${draft.title}`}
                title="Delete task"
                disabled={busy}
                onClick={confirmDelete}
              >
                ×
              </button>
            ) : null}
          </div>

          {canEdit || task.description ? (
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Description</span>
              {canEdit ? (
                <textarea
                  className="vbs-task-details"
                  value={draft.description}
                  rows={2}
                  placeholder="Optional instructions or links…"
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  onBlur={() => {
                    if (draft.description !== task.description) {
                      save(draft);
                    }
                  }}
                  disabled={busy}
                />
              ) : (
                <p className="vbs-task-details-read">{task.description}</p>
              )}
            </label>
          ) : null}

          {canEdit ? (
            <label className="vbs-task-field vbs-task-notes-field">
              <span className="vbs-task-field-label">Notes</span>
              <textarea
                className="vbs-task-details"
                value={draft.notes}
                rows={3}
                placeholder="Optional — updates, blockers, phone numbers…"
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                onBlur={() => {
                  if (draft.notes !== task.notes) {
                    save({ ...draft, notes: draft.notes.trim() });
                  }
                }}
                disabled={busy}
              />
            </label>
          ) : task.notes.trim() ? (
            <label className="vbs-task-field vbs-task-notes-field">
              <span className="vbs-task-field-label">Notes</span>
              <p className="vbs-task-details-read">{task.notes.trim()}</p>
            </label>
          ) : null}

          <div className="vbs-task-meta-grid">
        <label className="vbs-task-field">
          <span className="vbs-task-field-label">Category</span>
          {canEdit ? (
            <select
              value={draft.category}
              disabled={busy}
              onChange={(e) => save({ ...draft, category: e.target.value as VbsTaskCategory })}
            >
              {data.taskCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <span>{task.category}</span>
          )}
        </label>
        <label className="vbs-task-field">
          <span className="vbs-task-field-label">Due</span>
          {canEdit ? (
            <input
              type="date"
              value={draft.dueDate}
              disabled={busy}
              onChange={(e) => save({ ...draft, dueDate: e.target.value })}
            />
          ) : (
            <span>{task.dueDate || "—"}</span>
          )}
        </label>
        <label className="vbs-task-field">
          <span className="vbs-task-field-label">Assigned to</span>
          {canEdit ? (
            <OrgUserTypeahead
              orgId={orgId}
              value={draft.assignedUsername}
              disabled={busy}
              onChange={(assignedUsername) => setDraft({ ...draft, assignedUsername })}
              onCommit={(nextUsername) => {
                if (nextUsername !== task.assignedUsername) {
                  save({ ...draft, assignedUsername: nextUsername });
                }
              }}
            />
          ) : (
            <span>{task.assignedUsername || "—"}</span>
          )}
        </label>
        {canEdit ? (
          <div className="vbs-task-field vbs-task-team-picks-wrap">
            <span className="vbs-task-field-label">Team</span>
            <div className="vbs-task-team-picks" role="group" aria-label="Assign team">
              {data.teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={
                    draft.assignedTeamId === t.id ? "vbs-task-team-pick active" : "vbs-task-team-pick"
                  }
                  disabled={busy}
                  onClick={() => {
                    if (draft.assignedTeamId !== t.id) {
                      save({ ...draft, assignedTeamId: t.id });
                    }
                  }}
                >
                  {t.name}
                </button>
              ))}
              <button
                type="button"
                className={!draft.assignedTeamId ? "vbs-task-team-pick active" : "vbs-task-team-pick"}
                disabled={busy}
                onClick={() => {
                  if (draft.assignedTeamId) {
                    save({ ...draft, assignedTeamId: "" });
                  }
                }}
              >
                Unassigned
              </button>
            </div>
          </div>
        ) : (
          <label className="vbs-task-field">
            <span className="vbs-task-field-label">Team</span>
            <span>{data.teams.find((t) => t.id === task.assignedTeamId)?.name ?? "Unassigned"}</span>
          </label>
        )}
      </div>

          <div className="vbs-task-expenses">
            <h4 className="vbs-task-expenses-title">Expenses</h4>
            <div className="vbs-task-meta-grid">
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Expenses total (USD)</span>
                {canEdit ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.expenseAmount === 0 ? "" : String(draft.expenseAmount)}
                    placeholder="0"
                    disabled={busy}
                    onChange={(e) => setDraft({ ...draft, expenseAmount: parseMoneyInput(e.target.value) })}
                    onBlur={() => {
                      if (draft.expenseAmount !== task.expenseAmount) {
                        save(draft);
                      }
                    }}
                  />
                ) : (
                  <span>{draft.expenseAmount > 0 ? formatPlanMoney(draft.expenseAmount) : "—"}</span>
                )}
              </label>
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Reimbursed status</span>
                {canEdit ? (
                  <select
                    value={draft.reimbursementStatus}
                    disabled={busy}
                    onChange={(e) =>
                      save({ ...draft, reimbursementStatus: e.target.value as VbsReimbursementStatus })
                    }
                  >
                    {data.taskReimbursementStatuses.map((status) => (
                      <option key={status} value={status}>
                        {REIMBURSEMENT_LABEL[status]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{REIMBURSEMENT_LABEL[draft.reimbursementStatus]}</span>
                )}
              </label>
            </div>
            <TaskReceiptAttachments
              attachments={draft.attachments}
              canEdit={canEdit}
              busy={busy}
              onChange={(attachments) => {
                const next = { ...draft, attachments };
                setDraft(next);
                save(next);
              }}
            />
          </div>

          <div className="vbs-task-status" role="group" aria-label="Task status">
            {data.taskStatuses.map((status) => {
              const active = draft.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  className={
                    active ? `vbs-task-status-pill active status-${status}` : `vbs-task-status-pill status-${status}`
                  }
                  aria-pressed={active}
                  disabled={busy || !canEdit}
                  onClick={() => {
                    if (canEdit && status !== draft.status) {
                      save({ ...draft, status });
                    }
                  }}
                >
                  {TASK_STATUS_LABEL[status]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function schedulePayload(slot: VbsScheduleSlot) {
  return {
    id: slot.id,
    dayDate: slot.dayDate,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    label: slot.label,
    stationId: slot.stationId,
    teamId: slot.teamId,
    notes: slot.notes,
  };
}

function scheduleSummaryLine(slot: VbsScheduleSlot, teamName: (id: string) => string, stationLabel: string) {
  const team = slot.teamId ? teamName(slot.teamId) : "No team";
  const station = stationLabel ? ` · ${stationLabel}` : "";
  return `${slot.dayDate} · ${slot.startsAt}–${slot.endsAt} · ${team}${station}`;
}

function scheduleDayIndentPercent(dayIndex: number, totalDays: number) {
  if (totalDays <= 1) {
    return 0;
  }
  return dayIndex / (totalDays - 1);
}

function ScheduleTab({
  data,
  orgId,
  busy,
  teamName,
  onRun,
}: {
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  teamName: (id: string) => string;
  onRun: (action: () => Promise<unknown>) => void;
}) {
  const plan = data.plan;
  const planDays = useMemo(() => enumeratePlanDays(plan), [plan]);
  const activityLabels = data.scheduleActivityLabels;

  const [dayDate, setDayDate] = useState(plan?.startDate ?? "");
  const [startsAt, setStartsAt] = useState(plan?.dailyStart ?? "09:00");
  const [endsAt, setEndsAt] = useState("09:30");
  const [activityPick, setActivityPick] = useState("");
  const [customActivity, setCustomActivity] = useState("");
  const [teamId, setTeamId] = useState("");
  const [stationId, setStationId] = useState("");
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);

  useEffect(() => {
    if (planDays.length > 0 && !planDays.some((d) => d.iso === dayDate)) {
      setDayDate(planDays[0].iso);
    }
  }, [planDays, dayDate]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, VbsScheduleSlot[]>();
    for (const slot of data.schedule) {
      if (!slot.dayDate) {
        continue;
      }
      const list = map.get(slot.dayDate) ?? [];
      list.push(slot);
      map.set(slot.dayDate, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => `${a.startsAt}`.localeCompare(`${b.startsAt}`));
    }
    return map;
  }, [data.schedule]);

  if (!plan) {
    return <p className="muted">Create your plan on the Overview tab first.</p>;
  }

  const resolvedActivity =
    activityPick === "__custom__" ? customActivity.trim() : activityPick.trim();

  function addSlot(event: FormEvent) {
    event.preventDefault();
    if (!resolvedActivity) {
      return;
    }
    onRun(() =>
      api.saveVbsScheduleSlot(orgId, {
        dayDate,
        startsAt,
        endsAt,
        label: resolvedActivity,
        teamId,
        stationId,
        notes: "",
      }),
    );
    if (activityPick === "__custom__") {
      setCustomActivity("");
    } else {
      setActivityPick("");
    }
  }

  function generateFromOverview() {
    const replace = data.schedule.length > 0;
    if (replace) {
      const ok = window.confirm(
        "Replace all existing schedule blocks with a fresh VBS daily template from your Overview dates and daily hours?",
      );
      if (!ok) {
        return;
      }
    }
    onRun(() => api.generateVbsDailySchedule(orgId, replace));
  }

  function confirmRemoveActivity(label: string) {
    const ok = window.confirm(
      `Remove “${label}” from the activity list? Existing schedule blocks will keep this label.`,
    );
    if (!ok) {
      return;
    }
    onRun(() => api.removeScheduleActivityLabel(orgId, label));
  }

  const hoursHint =
    plan.dailyStart && plan.dailyEnd ? `${plan.dailyStart}–${plan.dailyEnd}` : "set daily hours on Overview";
  const dateHint =
    plan.startDate && plan.endDate ? `${plan.startDate} – ${plan.endDate}` : "set dates on Overview";

  return (
    <section className="vbs-panel vbs-daily-schedule-panel">
      <header className="vbs-daily-schedule-lead">
        <p className="muted">
          Program days from Overview: <strong>{dateHint}</strong>, each day <strong>{hoursHint}</strong> (plus staff
          setup before and debrief after).
        </p>
        {data.canWrite ? (
          <button type="button" className="vbs-daily-schedule-generate" disabled={busy} onClick={generateFromOverview}>
            Build schedule from overview
          </button>
        ) : null}
      </header>

      {activityLabels.length > 0 ? (
        <div className="vbs-daily-schedule-labels" aria-label="Schedule activity types">
          <span className="vbs-daily-schedule-labels-heading muted">Activities</span>
          <ul className="vbs-daily-schedule-label-chips">
            {activityLabels.map((label) => (
              <li key={label}>
                <span className="vbs-daily-schedule-label-chip">{label}</span>
                {data.canAdmin ? (
                  <button
                    type="button"
                    className="vbs-daily-schedule-label-remove"
                    aria-label={`Remove ${label} from activity list`}
                    title="Remove from list (org admin)"
                    disabled={busy}
                    onClick={() => confirmRemoveActivity(label)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.canWrite ? (
        <div className="vbs-task-add-wrap">
          <h2 className="vbs-task-add-heading">Add to the day</h2>
          <form className="vbs-task-add-form" onSubmit={addSlot}>
            <div className="vbs-task-meta-grid">
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">VBS day</span>
                <select value={dayDate} onChange={(e) => setDayDate(e.target.value)} required>
                  {planDays.map((day, index) => (
                    <option key={day.iso} value={day.iso}>
                      Day {index + 1} · {day.weekday}, {day.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Activity</span>
                <select
                  value={activityPick}
                  onChange={(e) => setActivityPick(e.target.value)}
                  required={activityPick !== "__custom__"}
                >
                  <option value="">Choose activity…</option>
                  {activityLabels.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="__custom__">Add custom activity…</option>
                </select>
              </label>
              {activityPick === "__custom__" ? (
                <label className="vbs-task-field">
                  <span className="vbs-task-field-label">Custom name</span>
                  <input
                    value={customActivity}
                    onChange={(e) => setCustomActivity(e.target.value)}
                    required
                    placeholder="New activity (saved to list)"
                  />
                </label>
              ) : null}
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Start</span>
                <input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
              </label>
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">End</span>
                <input type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
              </label>
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Station</span>
                <select value={stationId} onChange={(e) => setStationId(e.target.value)}>
                  <option value="">—</option>
                  {data.stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Team</span>
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">—</option>
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="vbs-task-add-actions">
              <button type="submit" className="vbs-plan-save" disabled={busy || !resolvedActivity}>
                Add block
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {planDays.length === 0 ? (
        <p className="muted vbs-task-empty">Set VBS start and end dates on Overview to lay out daily boxes.</p>
      ) : null}

      {planDays.length > 0 ? (
        <div
          className="vbs-daily-schedule-timeline-wrap"
          style={{ ["--milestone-date-shift" as string]: `${MILESTONE_DATE_SHIFT_PCT}%` }}
        >
          <ol className="vbs-daily-schedule-days">
            {planDays.map((day, dayIndex) => {
              const daySlots = slotsByDay.get(day.iso) ?? [];
              const nodeStyle: CSSProperties = {
                "--milestone-date-pct": scheduleDayIndentPercent(dayIndex, planDays.length),
              } as CSSProperties;
              return (
                <li
                  key={day.iso}
                  className="vbs-daily-schedule-day vbs-milestone-node"
                  style={nodeStyle}
                >
                  <div className="vbs-daily-schedule-day-body vbs-milestone-node-body">
                    <header className="vbs-daily-schedule-day-head">
                      <h3 className="vbs-daily-schedule-day-title">
                        Day {dayIndex + 1}
                        <span className="muted">
                          {" "}
                          · {day.weekday}, {day.label}
                        </span>
                      </h3>
                      <time className="vbs-daily-schedule-day-iso muted" dateTime={day.iso}>
                        {day.iso}
                      </time>
                    </header>
                    {daySlots.length === 0 ? (
                      <p className="muted vbs-daily-schedule-day-empty">No blocks yet for this day.</p>
                    ) : (
                      <ul className="vbs-daily-schedule-slots">
                        {daySlots.map((slot) => (
                          <ScheduleRow
                            key={slot.id}
                            slot={slot}
                            data={data}
                            orgId={orgId}
                            busy={busy}
                            teamName={teamName}
                            activityLabels={activityLabels}
                            variant="day"
                            expanded={expandedSlotId === slot.id}
                            onToggle={() => setExpandedSlotId((current) => (current === slot.id ? null : slot.id))}
                            onRun={onRun}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {data.schedule.length === 0 && planDays.length > 0 ? (
        <p className="muted vbs-task-empty">
          No schedule yet. Use <strong>Build schedule from overview</strong> for a full multi-day template, or add
          blocks above.
        </p>
      ) : null}
    </section>
  );
}

function ScheduleRow({
  slot,
  data,
  orgId,
  busy,
  teamName,
  activityLabels = [],
  variant = "list",
  expanded,
  onToggle,
  onRun,
}: {
  slot: VbsScheduleSlot;
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  teamName: (id: string) => string;
  activityLabels?: string[];
  variant?: "list" | "day";
  expanded: boolean;
  onToggle: () => void;
  onRun: (action: () => Promise<unknown>) => void;
}) {
  const canEdit = data.canWrite;
  const [draft, setDraft] = useState(slot);
  const stationLabel = data.stations.find((s) => s.id === slot.stationId)?.name ?? "";

  useEffect(() => {
    setDraft(slot);
  }, [slot]);

  const save = useCallback(
    (next: VbsScheduleSlot) => {
      setDraft(next);
      onRun(() => api.saveVbsScheduleSlot(orgId, schedulePayload(next)));
    },
    [orgId, onRun],
  );

  function confirmDelete(event: MouseEvent) {
    event.stopPropagation();
    const ok = window.confirm(`Delete “${draft.label || "this block"}” from the schedule?`);
    if (!ok) {
      return;
    }
    onRun(() => api.deleteVbsScheduleSlot(orgId, slot.id));
  }

  const listId = `vbs-schedule-activities-${slot.id}`;

  return (
    <li
      className={
        variant === "day"
          ? expanded
            ? "vbs-daily-schedule-slot open"
            : "vbs-daily-schedule-slot"
          : expanded
            ? "vbs-task-card open"
            : "vbs-task-card"
      }
    >
      <button
        type="button"
        className={variant === "day" ? "vbs-daily-schedule-slot-summary" : "vbs-task-summary"}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {variant === "day" ? (
          <>
            <span className="vbs-daily-schedule-slot-time">
              {slot.startsAt}–{slot.endsAt}
            </span>
            <span className="vbs-daily-schedule-slot-label">{slot.label}</span>
            {(slot.teamId || stationLabel) && !expanded ? (
              <span className="vbs-daily-schedule-slot-meta muted">
                {slot.teamId ? teamName(slot.teamId) : ""}
                {stationLabel ? `${slot.teamId ? " · " : ""}${stationLabel}` : ""}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span className="vbs-task-summary-main">
              <span className="vbs-task-summary-title">{slot.label}</span>
            </span>
            <span className="vbs-task-summary-meta muted">
              {scheduleSummaryLine(slot, teamName, stationLabel)}
            </span>
          </>
        )}
        <span className="vbs-task-chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded ? (
        <div className="vbs-task-body">
          <div className="vbs-task-card-head">
            {canEdit ? (
              <>
                <input
                  className="vbs-task-title-input"
                  list={activityLabels.length > 0 ? listId : undefined}
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  onBlur={() => {
                    if (draft.label.trim() && draft.label !== slot.label) {
                      save({ ...draft, label: draft.label.trim() });
                    } else {
                      setDraft(slot);
                    }
                  }}
                  disabled={busy}
                  aria-label="Block label"
                />
                {activityLabels.length > 0 ? (
                  <datalist id={listId}>
                    {activityLabels.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                ) : null}
              </>
            ) : (
              <h3 className="vbs-task-title-read">{slot.label}</h3>
            )}
            {canEdit ? (
              <button
                type="button"
                className="vbs-task-remove"
                aria-label={`Delete block ${draft.label}`}
                title="Delete block"
                disabled={busy}
                onClick={confirmDelete}
              >
                ×
              </button>
            ) : null}
          </div>

          <div className="vbs-task-meta-grid">
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Day</span>
              {canEdit ? (
                <input
                  type="date"
                  value={draft.dayDate}
                  disabled={busy}
                  onChange={(e) => save({ ...draft, dayDate: e.target.value })}
                />
              ) : (
                <span>{slot.dayDate}</span>
              )}
            </label>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Start</span>
              {canEdit ? (
                <input
                  type="time"
                  value={draft.startsAt}
                  disabled={busy}
                  onChange={(e) => save({ ...draft, startsAt: e.target.value })}
                />
              ) : (
                <span>{slot.startsAt}</span>
              )}
            </label>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">End</span>
              {canEdit ? (
                <input
                  type="time"
                  value={draft.endsAt}
                  disabled={busy}
                  onChange={(e) => save({ ...draft, endsAt: e.target.value })}
                />
              ) : (
                <span>{slot.endsAt}</span>
              )}
            </label>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Team</span>
              {canEdit ? (
                <select
                  value={draft.teamId}
                  disabled={busy}
                  onChange={(e) => save({ ...draft, teamId: e.target.value })}
                >
                  <option value="">—</option>
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{slot.teamId ? teamName(slot.teamId) : "—"}</span>
              )}
            </label>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Station</span>
              {canEdit ? (
                <select
                  value={draft.stationId}
                  disabled={busy}
                  onChange={(e) => save({ ...draft, stationId: e.target.value })}
                >
                  <option value="">—</option>
                  {data.stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{stationLabel || "—"}</span>
              )}
            </label>
          </div>

          {canEdit || slot.notes ? (
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Notes</span>
              {canEdit ? (
                <textarea
                  className="vbs-task-details"
                  rows={2}
                  value={draft.notes}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  onBlur={() => {
                    if (draft.notes !== slot.notes) {
                      save(draft);
                    }
                  }}
                />
              ) : (
                <p className="vbs-task-details-read">{slot.notes}</p>
              )}
            </label>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function stationPayload(station: VbsStation) {
  return {
    id: station.id,
    name: station.name,
    description: station.description,
    defaultTeamId: station.defaultTeamId,
  };
}

function StationsTab({
  data,
  orgId,
  busy,
  teamName,
  onRun,
}: {
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  teamName: (id: string) => string;
  onRun: (action: () => Promise<unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [defaultTeamId, setDefaultTeamId] = useState("");
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null);
  const [filterTeamId, setFilterTeamId] = useState("");
  const [sortNameAsc, setSortNameAsc] = useState(true);

  const visibleStations = useMemo(() => {
    const filtered = filterStations(data.stations, filterTeamId);
    return sortStations(filtered, sortNameAsc);
  }, [data.stations, filterTeamId, sortNameAsc]);

  if (!data.plan) {
    return <p className="muted">Create your plan on the Overview tab first.</p>;
  }

  function addStation(event: FormEvent) {
    event.preventDefault();
    onRun(() => api.saveVbsStation(orgId, { name, description: "", defaultTeamId }));
    setName("");
  }

  return (
    <section className="vbs-panel vbs-tasks-panel">
      {data.canWrite ? (
        <div className="vbs-task-add-wrap">
          <h2 className="vbs-task-add-heading">Add station</h2>
          <form className="vbs-task-add-form" onSubmit={addStation}>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Station name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Station name" />
            </label>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Default team</span>
              <select value={defaultTeamId} onChange={(e) => setDefaultTeamId(e.target.value)}>
                <option value="">—</option>
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="vbs-task-add-actions">
              <button type="submit" className="vbs-plan-save" disabled={busy}>
                Add station
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="vbs-task-toolbar">
        <div className="vbs-task-filters">
          <label className="vbs-task-filter">
            <span className="vbs-task-field-label">Default team</span>
            <select
              value={filterTeamId}
              onChange={(e) => {
                setFilterTeamId(e.target.value);
                setExpandedStationId(null);
              }}
            >
              <option value="">All teams</option>
              <option value={UNASSIGNED_TEAM_FILTER}>Unassigned</option>
              {data.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="vbs-task-sort" role="group" aria-label="Sort stations">
          <span className="vbs-task-sort-label muted">Sort</span>
          <button
            type="button"
            className="vbs-task-sort-btn active"
            aria-pressed
            onClick={() => setSortNameAsc((asc) => !asc)}
          >
            Name
            <span aria-hidden="true">{sortNameAsc ? " ↑" : " ↓"}</span>
          </button>
        </div>
      </div>

      {data.stations.length === 0 ? <p className="muted vbs-task-empty">No stations yet.</p> : null}
      {data.stations.length > 0 && visibleStations.length === 0 ? (
        <p className="muted vbs-task-empty">No stations match these filters.</p>
      ) : null}

      <ul className="vbs-task-list">
        {visibleStations.map((station) => (
          <StationRow
            key={station.id}
            station={station}
            data={data}
            orgId={orgId}
            busy={busy}
            teamName={teamName}
            expanded={expandedStationId === station.id}
            onToggle={() =>
              setExpandedStationId((current) => (current === station.id ? null : station.id))
            }
            onRun={onRun}
          />
        ))}
      </ul>
    </section>
  );
}

function StationRow({
  station,
  data,
  orgId,
  busy,
  teamName,
  expanded,
  onToggle,
  onRun,
}: {
  station: VbsStation;
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  teamName: (id: string) => string;
  expanded: boolean;
  onToggle: () => void;
  onRun: (action: () => Promise<unknown>) => void;
}) {
  const canEdit = data.canWrite;
  const [draft, setDraft] = useState(station);

  useEffect(() => {
    setDraft(station);
  }, [station]);

  const save = useCallback(
    (next: VbsStation) => {
      setDraft(next);
      onRun(() => api.saveVbsStation(orgId, stationPayload(next)));
    },
    [orgId, onRun],
  );

  function confirmDelete(event: MouseEvent) {
    event.stopPropagation();
    const ok = window.confirm(`Delete station “${draft.name || "this station"}”?`);
    if (!ok) {
      return;
    }
    onRun(() => api.deleteVbsStation(orgId, station.id));
  }

  const teamLabel = station.defaultTeamId ? teamName(station.defaultTeamId) : "No default team";

  return (
    <li className={expanded ? "vbs-task-card open" : "vbs-task-card"}>
      <button type="button" className="vbs-task-summary" aria-expanded={expanded} onClick={onToggle}>
        <span className="vbs-task-summary-main">
          <span className="vbs-task-summary-title">{station.name}</span>
        </span>
        <span className="vbs-task-summary-meta muted">{teamLabel}</span>
        <span className="vbs-task-chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded ? (
        <div className="vbs-task-body">
          <div className="vbs-task-card-head">
            {canEdit ? (
              <input
                className="vbs-task-title-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onBlur={() => {
                  if (draft.name.trim() && draft.name !== station.name) {
                    save({ ...draft, name: draft.name.trim() });
                  } else {
                    setDraft(station);
                  }
                }}
                disabled={busy}
                aria-label="Station name"
              />
            ) : (
              <h3 className="vbs-task-title-read">{station.name}</h3>
            )}
            {canEdit ? (
              <button
                type="button"
                className="vbs-task-remove"
                aria-label={`Delete station ${draft.name}`}
                title="Delete station"
                disabled={busy}
                onClick={confirmDelete}
              >
                ×
              </button>
            ) : null}
          </div>

          <label className="vbs-task-field">
            <span className="vbs-task-field-label">Description</span>
            {canEdit ? (
              <textarea
                className="vbs-task-details"
                rows={2}
                value={draft.description}
                disabled={busy}
                placeholder="Room setup notes…"
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                onBlur={() => {
                  if (draft.description !== station.description) {
                    save(draft);
                  }
                }}
              />
            ) : (
              <p className="vbs-task-details-read">{station.description || "—"}</p>
            )}
          </label>

          <label className="vbs-task-field">
            <span className="vbs-task-field-label">Default team</span>
            {canEdit ? (
              <select
                value={draft.defaultTeamId}
                disabled={busy}
                onChange={(e) => save({ ...draft, defaultTeamId: e.target.value })}
              >
                <option value="">—</option>
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <span>{teamLabel}</span>
            )}
          </label>
        </div>
      ) : null}
    </li>
  );
}

function checklistPayload(item: VbsChecklistItem) {
  return {
    id: item.id,
    category: item.category,
    label: item.label,
    assignedTeamId: item.assignedTeamId,
    dueDate: item.dueDate,
    notes: item.notes,
    status: normalizeMilestoneStatus(item),
  };
}

function ChecklistTab({
  data,
  orgId,
  busy,
  teamName,
  onRun,
}: {
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  teamName: (id: string) => string;
  onRun: (action: () => Promise<unknown>) => void;
}) {
  const milestoneCategories = data.milestoneCategories?.length
    ? data.milestoneCategories
    : ["Before VBS"];
  const [category, setCategory] = useState(milestoneCategories[0] ?? "Before VBS");
  const [label, setLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTeamId, setAssignedTeamId] = useState("");
  const [notes, setNotes] = useState("");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDone, setFilterDone] = useState("");
  const today = localTodayIso();

  const visibleItems = useMemo(() => {
    const filtered = filterChecklistItems(data.checklist, filterCategory, "", filterDone);
    return sortMilestonesByDueDate(filtered);
  }, [data.checklist, filterCategory, filterDone]);

  const dateRange = useMemo(() => milestoneDueDateRange(visibleItems), [visibleItems]);
  const todayLinePercent = useMemo(() => {
    if (!dateRange) {
      return null;
    }
    return milestoneTodayLinePercent(today, dateRange.minMs, dateRange.maxMs);
  }, [dateRange, today]);

  if (!data.plan) {
    return <p className="muted">Create your plan on the Overview tab first.</p>;
  }

  function addItem(event: FormEvent) {
    event.preventDefault();
    onRun(() =>
      api.saveVbsChecklistItem(orgId, {
        category,
        label,
        assignedTeamId,
        dueDate,
        notes,
      }),
    );
    setLabel("");
    setDueDate("");
    setNotes("");
  }

  return (
    <section className="vbs-panel vbs-tasks-panel vbs-milestones-panel">
      <p className="vbs-milestones-lead muted">
        Milestones in due-date order. Past-due open items show in red; completed items in green. The vertical dotted
        line shows where today falls between the earliest and latest due dates.
      </p>

      {data.canWrite ? (
        <div className="vbs-task-add-wrap">
          <h2 className="vbs-task-add-heading">Add milestone</h2>
          <form className="vbs-task-add-form" onSubmit={addItem}>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Milestone</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="What must be ready?" />
            </label>
            <div className="vbs-task-meta-grid">
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Category</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {milestoneCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Due date</span>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <label className="vbs-task-field">
                <span className="vbs-task-field-label">Team</span>
                <select value={assignedTeamId} onChange={(e) => setAssignedTeamId(e.target.value)}>
                  <option value="">—</option>
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Notes</span>
              <textarea
                className="vbs-task-details"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tracking numbers, contacts, or reminders…"
              />
            </label>
            <div className="vbs-task-add-actions">
              <button type="submit" className="vbs-plan-save" disabled={busy}>
                Add milestone
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="vbs-task-toolbar">
        <div className="vbs-task-filters">
          <label className="vbs-task-filter">
            <span className="vbs-task-field-label">Status</span>
            <select
              value={filterDone}
              onChange={(e) => {
                setFilterDone(e.target.value);
                setExpandedItemId(null);
              }}
            >
              <option value="">All milestones</option>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label className="vbs-task-filter">
            <span className="vbs-task-field-label">Category</span>
            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setExpandedItemId(null);
              }}
            >
              <option value="">All categories</option>
              {milestoneCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {data.checklist.length === 0 ? <p className="muted vbs-task-empty">No milestones yet.</p> : null}
      {data.checklist.length > 0 && visibleItems.length === 0 ? (
        <p className="muted vbs-task-empty">No milestones match these filters.</p>
      ) : null}

      {visibleItems.length > 0 ? (
        <div
          className="vbs-milestone-timeline-wrap"
          style={{ ["--milestone-date-shift" as string]: `${MILESTONE_DATE_SHIFT_PCT}%` }}
        >
          {todayLinePercent !== null ? (
            <div
              className="vbs-milestone-today-vertical"
              style={{ left: `${todayLinePercent * MILESTONE_DATE_SHIFT_PCT}%` }}
              aria-hidden="true"
            />
          ) : null}
          {todayLinePercent !== null ? (
            <div
              className="vbs-milestone-today-tag"
              style={{ left: `${todayLinePercent * MILESTONE_DATE_SHIFT_PCT}%` }}
              aria-label={`Today, ${formatMilestoneDue(today)}`}
            >
              Today
            </div>
          ) : null}
          <ol className="vbs-milestone-timeline" start={1}>
            {visibleItems.map((item, index) => {
              const datePercent =
                item.dueDate && dateRange
                  ? milestoneDatePercent(item.dueDate, dateRange.minMs, dateRange.maxMs)
                  : null;
              return (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  data={data}
                  orgId={orgId}
                  busy={busy}
                  teamName={teamName}
                  datePercent={datePercent}
                  tone={milestoneTone(item, today)}
                  milestoneCategories={milestoneCategories}
                  expanded={expandedItemId === item.id}
                  onToggle={() => setExpandedItemId((current) => (current === item.id ? null : item.id))}
                  onRun={onRun}
                />
              );
            })}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function MilestoneExpandIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? "vbs-milestone-expand-icon open" : "vbs-milestone-expand-icon"}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 6l6 6-6 6"
      />
    </svg>
  );
}

function ChecklistRow({
  item,
  data,
  orgId,
  busy,
  teamName,
  datePercent,
  tone,
  milestoneCategories,
  expanded,
  onToggle,
  onRun,
}: {
  item: VbsChecklistItem;
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  teamName: (id: string) => string;
  datePercent: number | null;
  tone: MilestoneTone;
  milestoneCategories: string[];
  expanded: boolean;
  onToggle: () => void;
  onRun: (action: () => Promise<unknown>) => void;
}) {
  const canEdit = data.canWrite;
  const [draft, setDraft] = useState(item);

  useEffect(() => {
    setDraft(item);
  }, [item]);

  const save = useCallback(
    (next: VbsChecklistItem) => {
      setDraft(next);
      onRun(() => api.saveVbsChecklistItem(orgId, checklistPayload(next)));
    },
    [orgId, onRun],
  );

  function setStatus(status: VbsMilestoneStatus) {
    onRun(() => api.saveVbsChecklistItem(orgId, { id: item.id, status }));
  }

  function confirmDelete(event: MouseEvent) {
    event.stopPropagation();
    const ok = window.confirm(`Delete checklist item “${draft.label || "this item"}”?`);
    if (!ok) {
      return;
    }
    onRun(() => api.deleteVbsChecklistItem(orgId, item.id));
  }

  const teamLabel = item.assignedTeamId ? teamName(item.assignedTeamId) : "Unassigned";
  const dueLabel = formatMilestoneDue(item.dueDate);

  const nodeStyle: CSSProperties = {
    "--milestone-date-pct": datePercent ?? 0,
  } as CSSProperties;

  return (
    <li className={`vbs-milestone-node tone-${tone}${expanded ? " open" : ""}`} style={nodeStyle}>
      <div className="vbs-milestone-node-body">
          <button type="button" className="vbs-milestone-summary" aria-expanded={expanded} onClick={onToggle}>
            <div className={`vbs-milestone-due-badge tone-${tone}`}>
              <span className="vbs-milestone-due-label">Due</span>
              {item.dueDate ? (
                <>
                  <time className="vbs-milestone-due-date" dateTime={item.dueDate}>
                    {dueLabel}
                  </time>
                  <span className="vbs-milestone-due-iso">{item.dueDate}</span>
                </>
              ) : (
                <span className="vbs-milestone-due-missing">Not set</span>
              )}
            </div>
            <span className="vbs-milestone-summary-main">
              <span className="vbs-milestone-title">{item.label}</span>
            </span>
            <span className="vbs-milestone-meta muted">
              {item.category}
              {teamLabel !== "Unassigned" ? ` · ${teamLabel}` : ""}
            </span>
            {item.notes.trim() && !expanded ? (
              <span className="vbs-milestone-notes-preview muted">{item.notes.trim()}</span>
            ) : null}
            <span className="vbs-milestone-expand" aria-hidden="true">
              <MilestoneExpandIcon open={expanded} />
            </span>
          </button>
          <div className="vbs-milestone-quick-status" role="group" aria-label="Milestone status">
            {canEdit ? (
              <select
                className="vbs-milestone-status-select"
                value={normalizeMilestoneStatus(item)}
                disabled={busy}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setStatus(e.target.value as VbsMilestoneStatus)}
              >
                {(Object.keys(MILESTONE_STATUS_LABELS) as VbsMilestoneStatus[]).map((key) => (
                  <option key={key} value={key}>
                    {MILESTONE_STATUS_LABELS[key]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="vbs-milestone-status-read">{MILESTONE_STATUS_LABELS[normalizeMilestoneStatus(item)]}</span>
            )}
          </div>

      {expanded ? (
        <div className="vbs-task-body">
          <div className="vbs-task-card-head">
            {canEdit ? (
              <input
                className="vbs-task-title-input"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                onBlur={() => {
                  if (draft.label.trim() && draft.label !== item.label) {
                    save({ ...draft, label: draft.label.trim() });
                  } else {
                    setDraft(item);
                  }
                }}
                disabled={busy}
                aria-label="Checklist item"
              />
            ) : (
              <h3 className="vbs-task-title-read">{item.label}</h3>
            )}
            {canEdit ? (
              <button
                type="button"
                className="vbs-task-remove"
                aria-label={`Delete item ${draft.label}`}
                title="Delete item"
                disabled={busy}
                onClick={confirmDelete}
              >
                ×
              </button>
            ) : null}
          </div>

          <div className="vbs-task-meta-grid">
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Category</span>
              {canEdit ? (
                <select
                  value={draft.category}
                  disabled={busy}
                  onChange={(e) => save({ ...draft, category: e.target.value })}
                >
                  {!milestoneCategories.includes(draft.category) && draft.category ? (
                    <option value={draft.category}>{draft.category}</option>
                  ) : null}
                  {milestoneCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{item.category}</span>
              )}
            </label>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Team</span>
              {canEdit ? (
                <select
                  value={draft.assignedTeamId}
                  disabled={busy}
                  onChange={(e) => save({ ...draft, assignedTeamId: e.target.value })}
                >
                  <option value="">—</option>
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{teamLabel}</span>
              )}
            </label>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Due (calendar)</span>
              {canEdit ? (
                <input
                  type="date"
                  value={draft.dueDate}
                  disabled={busy}
                  onChange={(e) => save({ ...draft, dueDate: e.target.value })}
                />
              ) : (
                <span>{item.dueDate || "—"}</span>
              )}
            </label>
          </div>

          <label className="vbs-task-field vbs-milestone-notes-field">
            <span className="vbs-task-field-label">Notes</span>
            {canEdit ? (
              <textarea
                className="vbs-task-details"
                rows={3}
                value={draft.notes}
                disabled={busy}
                placeholder="Optional details for your team…"
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                onBlur={() => {
                  if (draft.notes !== item.notes) {
                    save({ ...draft, notes: draft.notes.trim() });
                  }
                }}
              />
            ) : (
              <span className="vbs-milestone-notes-read">{item.notes.trim() || "—"}</span>
            )}
          </label>

          <div className="vbs-task-status" role="group" aria-label="Milestone status">
            {(Object.keys(MILESTONE_STATUS_LABELS) as VbsMilestoneStatus[]).map((key) => (
              <button
                key={key}
                type="button"
                className={
                  normalizeMilestoneStatus(item) === key
                    ? `vbs-task-status-pill active milestone-status-${key.replace("_", "-")}`
                    : `vbs-task-status-pill milestone-status-${key.replace("_", "-")}`
                }
                aria-pressed={normalizeMilestoneStatus(item) === key}
                disabled={busy || !canEdit}
                onClick={() => setStatus(key)}
              >
                {MILESTONE_STATUS_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      </div>
    </li>
  );
}

function BoardTab({
  data,
  orgId,
  busy,
  onRun,
  teamName,
}: {
  data: VbsPlanWorkspace;
  orgId: string;
  busy: boolean;
  teamName: (id: string) => string;
  onRun: (action: () => Promise<unknown>) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [teamId, setTeamId] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [filterTeamId, setFilterTeamId] = useState("");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  const visiblePosts = useMemo(() => {
    const filtered = filterBoardPosts(data.boardPosts, filterTeamId);
    return sortBoardPosts(filtered, sortNewestFirst);
  }, [data.boardPosts, filterTeamId, sortNewestFirst]);

  if (!data.plan) {
    return <p className="muted">Create your plan on the Overview tab first.</p>;
  }

  const myTeamIds = new Set(
    data.teams.filter((t) => user && t.memberUsernames.includes(user.username)).map((t) => t.id),
  );
  const canPostOrg = data.canWrite;
  const canPostTeam = data.canWrite || myTeamIds.size > 0;
  const postableTeams = data.canWrite ? data.teams : data.teams.filter((t) => myTeamIds.has(t.id));

  function submitPost(event: FormEvent) {
    event.preventDefault();
    onRun(() => api.createVbsBoardPost(orgId, { title, body, teamId }));
    setTitle("");
    setBody("");
  }

  function submitReply(postId: string, event: FormEvent) {
    event.preventDefault();
    const text = replyDrafts[postId]?.trim() ?? "";
    if (!text) {
      return;
    }
    onRun(async () => {
      await api.createVbsBoardReply(orgId, postId, text);
      setReplyDrafts((prev) => ({ ...prev, [postId]: "" }));
    });
  }

  return (
    <section className="vbs-panel vbs-tasks-panel vbs-board">
      <p className="muted">
        Posts for your teams and organization-wide updates. Team members and subscribers get notified per{" "}
        <Link to="/profile">your notification profile</Link>.
      </p>

      {canPostTeam ? (
        <div className="vbs-task-add-wrap">
          <h2 className="vbs-task-add-heading">New post</h2>
          <form className="vbs-task-add-form" onSubmit={submitPost}>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Subject</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Subject" />
            </label>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Message</span>
              <textarea
                className="vbs-task-details"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                required
                placeholder="Write your update…"
              />
            </label>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Audience</span>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                {canPostOrg ? <option value="">Whole organization</option> : null}
                {postableTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    Team: {t.name}
                  </option>
                ))}
              </select>
            </label>
            {!canPostOrg && canPostTeam ? (
              <p className="muted">Organization-wide posts require coordinator write access.</p>
            ) : null}
            <div className="vbs-task-add-actions">
              <button type="submit" className="vbs-plan-save" disabled={busy}>
                Post to board
              </button>
            </div>
          </form>
        </div>
      ) : (
        <p className="muted">Join a team to post, or ask a coordinator for write access.</p>
      )}

      <div className="vbs-task-toolbar">
        <div className="vbs-task-filters">
          <label className="vbs-task-filter">
            <span className="vbs-task-field-label">Audience</span>
            <select
              value={filterTeamId}
              onChange={(e) => {
                setFilterTeamId(e.target.value);
                setExpandedPostId(null);
              }}
            >
              <option value="">All posts</option>
              {data.canWrite ? <option value={ORG_WIDE_BOARD_FILTER}>Whole organization</option> : null}
              {data.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="vbs-task-sort" role="group" aria-label="Sort posts">
          <span className="vbs-task-sort-label muted">Sort</span>
          <button
            type="button"
            className="vbs-task-sort-btn active"
            aria-pressed
            onClick={() => setSortNewestFirst((n) => !n)}
          >
            Posted date
            <span aria-hidden="true">{sortNewestFirst ? " ↓" : " ↑"}</span>
          </button>
        </div>
      </div>

      {data.boardPosts.length === 0 ? <p className="muted vbs-task-empty">No posts yet.</p> : null}
      {data.boardPosts.length > 0 && visiblePosts.length === 0 ? (
        <p className="muted vbs-task-empty">No posts match these filters.</p>
      ) : null}

      <ul className="vbs-task-list vbs-board-list">
        {visiblePosts.map((post) => (
          <BoardPostCard
            key={post.id}
            post={post}
            teamName={teamName}
            expanded={expandedPostId === post.id}
            onToggle={() => setExpandedPostId((current) => (current === post.id ? null : post.id))}
            replyBody={replyDrafts[post.id] ?? ""}
            busy={busy}
            onReplyChange={(text) => setReplyDrafts((prev) => ({ ...prev, [post.id]: text }))}
            onReply={(event) => submitReply(post.id, event)}
          />
        ))}
      </ul>
    </section>
  );
}

function BoardPostCard({
  post,
  teamName,
  expanded,
  onToggle,
  replyBody,
  busy,
  onReplyChange,
  onReply,
}: {
  post: VbsBoardPost;
  teamName: (id: string) => string;
  expanded: boolean;
  onToggle: () => void;
  replyBody: string;
  busy: boolean;
  onReplyChange: (text: string) => void;
  onReply: (event: FormEvent) => void;
}) {
  const audience = post.teamId ? post.teamName || teamName(post.teamId) : "Whole organization";
  const posted = new Date(post.createdAt).toLocaleString();
  const preview =
    post.body.length > 120 && !expanded ? `${post.body.slice(0, 120).trimEnd()}…` : post.body;
  const replyCount = post.replies.length;

  return (
    <li className={expanded ? "vbs-task-card open vbs-board-post" : "vbs-task-card vbs-board-post"}>
      <button type="button" className="vbs-task-summary" aria-expanded={expanded} onClick={onToggle}>
        <span className="vbs-task-summary-main">
          <span className="vbs-task-summary-title">{post.title}</span>
          {replyCount > 0 ? (
            <span className="vbs-task-status-pill mini active status-in_progress">{replyCount} repl{replyCount === 1 ? "y" : "ies"}</span>
          ) : null}
        </span>
        <span className="vbs-task-summary-meta muted">
          {audience} · {posted} · {post.createdBy}
        </span>
        <span className="vbs-task-chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded ? (
        <div className="vbs-task-body">
          <p className="vbs-board-post-body">{post.body}</p>
          {post.replies.length > 0 ? (
            <ol className="vbs-board-replies">
              {post.replies.map((reply) => (
                <li key={reply.id}>
                  <p>
                    <strong>{reply.createdBy}</strong>
                    <span className="muted"> · {new Date(reply.createdAt).toLocaleString()}</span>
                  </p>
                  <p>{reply.body}</p>
                </li>
              ))}
            </ol>
          ) : null}
          <form className="vbs-board-reply-form" onSubmit={onReply}>
            <label className="vbs-task-field">
              <span className="vbs-task-field-label">Reply</span>
              <textarea
                className="vbs-task-details"
                value={replyBody}
                onChange={(e) => onReplyChange(e.target.value)}
                rows={2}
                placeholder="Write a reply…"
              />
            </label>
            <button type="submit" className="ghost" disabled={busy || !replyBody.trim()}>
              Reply
            </button>
          </form>
        </div>
      ) : (
        <p className="vbs-board-post-preview muted">{preview}</p>
      )}
    </li>
  );
}
