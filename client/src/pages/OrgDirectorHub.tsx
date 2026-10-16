import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import { useOrgVbs } from "../org-vbs";
import { orgPath, useOrgs } from "../orgs";
import type { OrgDetail, VbsPlanWorkspace, VbsRegistrationWorkspace } from "../types";
import { milestoneIsDone } from "../vbs-milestone-status";
import { enumeratePlanDays } from "../vbs-plan-worksheet-views";
import { VbsPlanAdherence } from "../VbsPlanAdherence";
import { SeasonCopyPanel } from "../SeasonCopyPanel";
import { PlanActionLink, PlanSecondaryLink } from "../CollapsibleForm";

type Step = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  to: string;
  adminOnly?: boolean;
};

export default function OrgDirectorHubPage() {
  const { orgId = "" } = useParams();
  const { user } = useAuth();
  const { canAdmin, canManageMembers, current: org } = useOrgs();
  const {
    viewingYear,
    viewingEventId,
    viewingEvent,
    events,
    eventsReady,
    orgEventEpoch,
    refreshEvents,
    deleteProject,
  } = useOrgVbs();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [plan, setPlan] = useState<VbsPlanWorkspace | null>(null);
  const [registration, setRegistration] = useState<VbsRegistrationWorkspace | null>(null);
  const [error, setError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [seasonCopyKey, setSeasonCopyKey] = useState(0);

  useEffect(() => {
    if (!eventsReady) {
      return;
    }
    let cancelled = false;
    void Promise.all([
      api.organization(orgId).catch(() => null),
      api.vbsPlan(orgId, viewingYear ?? undefined).catch(() => null),
      api.vbsRegistration(orgId, viewingYear ?? undefined).catch(() => null),
    ]).then(([orgDetail, planData, regData]) => {
      if (cancelled) {
        return;
      }
      if (orgDetail) {
        setDetail(orgDetail);
      }
      if (planData) {
        setPlan(planData);
      }
      if (regData) {
        setRegistration(regData);
      }
      setError("");
    });
    return () => {
      cancelled = true;
    };
  }, [eventsReady, orgEventEpoch, orgId, viewingEventId, viewingYear]);

  const planDays = useMemo(() => enumeratePlanDays(plan?.plan ?? null), [plan?.plan]);
  const scheduleDayCount = useMemo(() => {
    const days = new Set(plan?.schedule.map((s) => s.dayDate).filter(Boolean));
    return days.size;
  }, [plan?.schedule]);

  const openTasks = plan?.tasks.filter((t) => t.status !== "done").length ?? 0;
  const openMilestones = plan?.checklist.filter((c) => !milestoneIsDone(c)).length ?? 0;
  const memberCount =
    detail?.members.filter((member) => !viewingYear || member.vbsSeasonYear === viewingYear).length ?? 0;
  const teamCount = detail?.teams.length ?? 0;
  const registered = registration?.summary.total ?? 0;

  const directorSteps: Step[] = useMemo(() => {
    const hasPlanBasics = Boolean(plan?.plan?.startDate && plan?.plan?.endDate && plan?.plan?.title);
    const hasSchedule = (plan?.schedule.length ?? 0) > 0;
    const scheduleCoversWeek = planDays.length > 0 && scheduleDayCount >= planDays.length;
    const hasTeams = teamCount > 0;
    const hasPeople = memberCount > 1;
    const hasStudents = registered > 0;
    const hasClasses = (registration?.classes.length ?? 0) > 0;

    return [
      {
        id: "plan-basics",
        title: "Set VBS dates, hours, and curriculum",
        detail: hasPlanBasics
          ? `${plan!.plan!.title} · ${plan!.plan!.startDate} – ${plan!.plan!.endDate}`
          : "Start on the plan overview so every team shares the same week.",
        done: hasPlanBasics,
        to: orgPath(orgId, "/vbs-plan"),
      },
      {
        id: "teams",
        title: "Create teams (building, registration, teaching…)",
        detail: hasTeams
          ? `${teamCount} team${teamCount === 1 ? "" : "s"} — assign rosters and team admins.`
          : "Group volunteers before you assign tasks and schedule blocks.",
        done: hasTeams,
        to: orgPath(orgId, "/teams"),
        adminOnly: true,
      },
      {
        id: "people",
        title: "Invite members and assign org roles",
        detail: hasPeople
          ? `${memberCount} members in this organization.`
          : "Add coordinators, registration staff, and team leads.",
        done: hasPeople,
        to: orgPath(orgId, "/manage"),
        adminOnly: true,
      },
      {
        id: "schedule",
        title: "Build the VBS week schedule",
        detail: hasSchedule
          ? scheduleCoversWeek
            ? "Every program day has schedule blocks."
            : `${scheduleDayCount} of ${planDays.length} days have blocks — finish the week view.`
          : "Generate from overview dates or add blocks day by day.",
        done: hasSchedule && scheduleCoversWeek,
        to: orgPath(orgId, "/vbs-plan?tab=schedule"),
      },
      {
        id: "registration",
        title: "Register students and place classes",
        detail: hasStudents
          ? `${registered} registered${hasClasses ? ` · ${registration!.classes.length} classes` : ""}.`
          : "Staff entry first; turn on a parent link only if you want families to self-register.",
        done: hasStudents && hasClasses,
        to: orgPath(orgId, "/registration?tab=register"),
      },
      {
        id: "tasks",
        title: "Assign prep work and track milestones",
        detail:
          openTasks + openMilestones > 0
            ? `${openTasks} open task${openTasks === 1 ? "" : "s"} · ${openMilestones} milestone${openMilestones === 1 ? "" : "s"} left.`
            : "Use team tasks and prep milestones so nothing slips before week-of.",
        done: openTasks === 0 && openMilestones === 0 && (plan?.tasks.length ?? 0) > 0,
        to: orgPath(orgId, "/vbs-plan?tab=prep"),
      },
    ];
  }, [
    orgId,
    plan,
    planDays.length,
    scheduleDayCount,
    teamCount,
    memberCount,
    registered,
    registration,
    openTasks,
    openMilestones,
  ]);

  const visibleDirectorSteps = directorSteps.filter((step) => !step.adminOnly || canAdmin || canManageMembers);

  const quickLinks = [
    { label: "VBS plan", to: orgPath(orgId, "/vbs-plan"), blurb: "Schedule, tasks, stations, board" },
    { label: "Registration", to: orgPath(orgId, "/registration"), blurb: "Students, classes, nametags" },
    { label: "Communicate", to: orgPath(orgId, "/contact"), blurb: "Volunteers, whole org, or parent email" },
    { label: "Teams", to: orgPath(orgId, "/teams"), blurb: "Rosters for each crew", admin: true },
    { label: "Members", to: orgPath(orgId, "/manage"), blurb: "Invites and roles", admin: true },
    {
      label: "Background checks",
      to: orgPath(orgId, "/volunteers"),
      blurb: "Volunteer screening status",
      admin: true,
    },
    { label: "Cooking", to: orgPath(orgId, "/cooking-plan"), blurb: "Snacks aligned with allergies" },
    { label: "Room design", to: orgPath(orgId, "/room-design"), blurb: "Decor ideas and photos" },
  ].filter((link) => !link.admin || canAdmin || canManageMembers);

  if (error && !detail && !plan) {
    return <p className="status">{error}</p>;
  }

  const isDirector = canAdmin || canManageMembers;

  return (
    <OrgWorkspacePage
      eyebrow={org?.name ?? "Organization"}
      title="Director home"
      tagline={
        isDirector
          ? "Run VBS from here: set the week, build teams, register kids, and track prep work. Team members use the same links for their assignments."
          : "Jump to your plan, registration tools, or team work. Your org admin sets up teams and roles."
      }
    >
      {plan ? (
        <section className="vbs-director-inbox" aria-label="Needs attention">
          <VbsPlanAdherence data={plan} orgId={orgId} />
        </section>
      ) : null}

      {canAdmin ? (
        <SeasonCopyPanel
          key={seasonCopyKey}
          orgId={orgId}
          onCopied={() => {
            setSeasonCopyKey((k) => k + 1);
            void refreshEvents();
            void api.vbsPlan(orgId, viewingYear ?? undefined).then(setPlan).catch(() => undefined);
            void api.vbsRegistration(orgId, viewingYear ?? undefined).then(setRegistration).catch(() => undefined);
          }}
        />
      ) : null}

      {canAdmin && viewingEvent && events.length > 1 ? (
        <section className="vbs-panel vbs-director-delete-project" aria-labelledby="director-delete-project-title">
          <h2 id="director-delete-project-title" className="vbs-plan-section-title">
            Delete VBS project
          </h2>
          <p className="muted">
            Permanently removes <strong>{viewingEvent.name || viewingEvent.label}</strong> and all of its data: plan,
            schedule, tasks, board, registration, classes, and volunteer rosters for this session. Other projects in your
            church are not affected. You must keep at least one project.
          </p>
          <button
            type="button"
            className="ghost danger vbs-plan-save-danger"
            disabled={deleteBusy}
            onClick={() => {
              const label = viewingEvent.name || viewingEvent.label;
              const ok = window.confirm(
                `Delete “${label}” and all related VBS data? This cannot be undone.`,
              );
              if (!ok) {
                return;
              }
              setDeleteBusy(true);
              setDeleteError("");
              void deleteProject(viewingEvent.id)
                .then(() => {
                  void refreshEvents();
                  void api.vbsPlan(orgId).then(setPlan).catch(() => setPlan(null));
                  void api.vbsRegistration(orgId).then(setRegistration).catch(() => setRegistration(null));
                })
                .catch((err) => {
                  setDeleteError(err instanceof Error ? err.message : "Could not delete this project");
                })
                .finally(() => setDeleteBusy(false));
            }}
          >
            {deleteBusy ? "Deleting…" : "Delete this project"}
          </button>
          {deleteError ? <p className="error">{deleteError}</p> : null}
        </section>
      ) : null}

      {isDirector ? (
        <section className="vbs-panel vbs-director-checklist" aria-labelledby="director-checklist-title">
          <h2 id="director-checklist-title" className="vbs-plan-section-title">
            Setup checklist
          </h2>
          <p className="muted vbs-director-checklist-lead">
            Recommended order for coordinators. Steps link straight to the screen where you finish the work.
          </p>
          <ol className="vbs-director-steps">
            {visibleDirectorSteps.map((step, index) => (
              <li key={step.id} className={step.done ? "vbs-director-step done" : "vbs-director-step"}>
                <span className="vbs-director-step-num" aria-hidden="true">
                  {step.done ? "✓" : index + 1}
                </span>
                <div className="vbs-director-step-body">
                  <Link to={step.to} className="vbs-director-step-title">
                    {step.title}
                  </Link>
                  <p className="muted">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section className="vbs-panel vbs-director-member">
          <h2 className="vbs-plan-section-title">Your work</h2>
          <p className="muted">Open the VBS plan for tasks assigned to your team, the message board, and the team calendar.</p>
          <div className="vbs-director-quick-actions">
            <PlanActionLink to={orgPath(orgId, "/my-week")} label="My VBS week" />
            <PlanSecondaryLink to={orgPath(orgId, "/vbs-plan?tab=prep&prep=tasks")} label="Prep tasks" />
            <PlanSecondaryLink to={orgPath(orgId, "/vbs-plan?tab=board")} label="Message board" />
            <PlanSecondaryLink to={orgPath(orgId, "/vbs-plan")} label="Full plan" />
          </div>
        </section>
      )}

      <section className="vbs-director-quick" aria-label="Quick links">
        <h2 className="vbs-plan-sections-title">Go to</h2>
        <ul className="landing-grid vbs-director-link-grid">
          {quickLinks.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className="landing-card">
                <strong>{item.label}</strong>
                <span>{item.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {user ? (
        <p className="muted vbs-director-foot">
          Signed in as <strong>{user.username}</strong>
          {detail?.organization.role ? ` · ${detail.organization.role.replace(/_/g, " ")}` : ""}
        </p>
      ) : null}
    </OrgWorkspacePage>
  );
}
