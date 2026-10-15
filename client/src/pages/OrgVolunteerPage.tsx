import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import { orgPath, useOrgs } from "../orgs";
import type { OrgTeam, VbsPlanWorkspace } from "../types";
import { milestoneIsDone } from "../vbs-milestone-status";
import { PlanActionLink, PlanSecondaryLink } from "../CollapsibleForm";
import {
  myOpenTasks,
  myScheduleSlots,
  sortScheduleSlots,
  sortTasksByDue,
  userTeamIds,
} from "../vbs-plan-prep";

/** Volunteer views: personal week (`/my-week`) or a specific team (`/team/:teamId`). */
export default function OrgVolunteerPage() {
  const { orgId = "", teamId } = useParams();
  const { user } = useAuth();
  const { canAdmin, current: org } = useOrgs();
  const [data, setData] = useState<VbsPlanWorkspace | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .vbsPlan(orgId)
      .then((plan) => {
        if (!cancelled) {
          setData(plan);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load plan");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const username = user?.username ?? "";
  const team: OrgTeam | undefined = teamId ? data?.teams.find((t) => t.id === teamId) : undefined;
  const teamMode = Boolean(teamId);

  const canViewTeam =
    !teamMode ||
    canAdmin ||
    data?.canWrite ||
    (team?.memberUsernames.includes(username) ?? false);

  const myTeams = useMemo(() => (data ? [...userTeamIds(data, username)] : []), [data, username]);
  const personalSchedule = useMemo(
    () => (data ? sortScheduleSlots(myScheduleSlots(data, username)) : []),
    [data, username],
  );
  const personalTasks = useMemo(() => (data ? sortTasksByDue(myOpenTasks(data, username)) : []), [data, username]);

  const teamTasks = useMemo(
    () => data?.tasks.filter((t) => t.assignedTeamId === teamId && t.status !== "done") ?? [],
    [data?.tasks, teamId],
  );
  const teamMilestones = useMemo(
    () => data?.checklist.filter((c) => c.assignedTeamId === teamId && !milestoneIsDone(c)) ?? [],
    [data?.checklist, teamId],
  );
  const teamSchedule = useMemo(
    () => sortScheduleSlots(data?.schedule.filter((s) => s.teamId === teamId) ?? []),
    [data?.schedule, teamId],
  );
  const teamPosts = useMemo(
    () => data?.boardPosts.filter((p) => p.teamId === teamId).slice(0, 5) ?? [],
    [data?.boardPosts, teamId],
  );

  if (error && !data) {
    return <p className="status">{error}</p>;
  }

  if (teamMode && data && !team) {
    return <Navigate to={orgPath(orgId, "/teams")} replace />;
  }

  if (teamMode && data && team && !canViewTeam) {
    return <p className="status">You do not have access to this team page.</p>;
  }

  const plan = data?.plan;

  if (teamMode && team) {
    return (
      <OrgWorkspacePage
        eyebrow={org?.name ?? "Organization"}
        title={team.name}
        tagline="Tasks, schedule blocks, and board posts for this crew."
      >
        <p className="muted">
          {team.memberUsernames.length} member{team.memberUsernames.length === 1 ? "" : "s"}
          {team.teamAdminUsername ? ` · Team admin: ${team.teamAdminUsername}` : ""}
        </p>
        <div className="vbs-director-quick-actions">
          <PlanActionLink to={orgPath(orgId, "/vbs-plan?tab=prep&prep=tasks")} label="Team prep tasks" />
          <PlanSecondaryLink to={orgPath(orgId, "/my-week")} label="My VBS week" />
          <PlanSecondaryLink to={orgPath(orgId, "/vbs-plan?tab=board")} label="Message board" />
        </div>
        <section className="vbs-panel">
          <h2 className="vbs-plan-section-title">Open tasks</h2>
          {teamTasks.length === 0 ? (
            <p className="muted">No open tasks assigned to this team.</p>
          ) : (
            <ul>
              {teamTasks.slice(0, 8).map((task) => (
                <li key={task.id}>
                  {task.title}
                  {task.dueDate ? <span className="muted"> · due {task.dueDate}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="vbs-panel">
          <h2 className="vbs-plan-section-title">Milestones</h2>
          {teamMilestones.length === 0 ? (
            <p className="muted">No open milestones for this team.</p>
          ) : (
            <ul>
              {teamMilestones.map((item) => (
                <li key={item.id}>
                  {item.label}
                  {item.dueDate ? <span className="muted"> · due {item.dueDate}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="vbs-panel">
          <h2 className="vbs-plan-section-title">Week schedule</h2>
          {teamSchedule.length === 0 ? (
            <p className="muted">No schedule blocks tagged with this team yet.</p>
          ) : (
            <ul className="vbs-my-week-schedule">
              {teamSchedule.map((slot) => (
                <li key={slot.id}>
                  <strong>
                    {slot.dayDate} · {slot.startsAt}–{slot.endsAt}
                  </strong>{" "}
                  {slot.label}
                  {slot.roleLabel ? <span className="muted"> · {slot.roleLabel}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="vbs-panel">
          <h2 className="vbs-plan-section-title">Recent board posts</h2>
          {teamPosts.length === 0 ? (
            <p className="muted">No posts for this team yet.</p>
          ) : (
            <ul>
              {teamPosts.map((post) => (
                <li key={post.id}>
                  <strong>{post.title}</strong>
                  <p className="muted vbs-board-post-preview">{post.body.slice(0, 120)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </OrgWorkspacePage>
    );
  }

  return (
    <OrgWorkspacePage
      eyebrow={org?.name ?? "Organization"}
      title="My VBS week"
      tagline="Your schedule blocks and prep tasks — filtered to your teams and assignments."
    >
      {!plan ? (
        <p className="muted">Your director has not published a VBS plan yet.</p>
      ) : (
        <p className="muted vbs-my-week-dates">
          {plan.programTitle || plan.title}
          {plan.startDate && plan.endDate ? ` · ${plan.startDate} – ${plan.endDate}` : ""}
          {plan.location ? ` · ${plan.location}` : ""}
        </p>
      )}

      {myTeams.length > 0 && data ? (
        <section className="vbs-panel" aria-label="Your teams">
          <h2 className="vbs-plan-section-title">Your teams</h2>
          <ul className="vbs-my-week-teams">
            {data.teams
              .filter((t) => myTeams.includes(t.id))
              .map((t) => (
                <li key={t.id}>
                  <Link to={orgPath(orgId, `/team/${t.id}`)}>{t.name}</Link>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <section className="vbs-panel" aria-label="Your schedule">
        <h2 className="vbs-plan-section-title">On the schedule</h2>
        {personalSchedule.length === 0 ? (
          <p className="muted">No blocks assigned to you or your teams yet.</p>
        ) : (
          <ul className="vbs-my-week-schedule">
            {personalSchedule.map((slot) => (
              <li key={slot.id}>
                <strong>
                  {slot.dayDate} · {slot.startsAt}–{slot.endsAt}
                </strong>
                <span>{slot.label}</span>
                {slot.roleLabel ? <span className="muted"> · {slot.roleLabel}</span> : null}
                {slot.assignedUsername === username ? (
                  <span className="vbs-my-week-you"> · You</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <PlanSecondaryLink to={orgPath(orgId, "/vbs-plan?tab=schedule")} label="Full week schedule" />
      </section>

      <section className="vbs-panel" aria-label="Your prep tasks">
        <h2 className="vbs-plan-section-title">Prep still open</h2>
        {personalTasks.length === 0 ? (
          <p className="muted">Nothing due for you right now — nice work.</p>
        ) : (
          <ul className="vbs-my-week-tasks">
            {personalTasks.slice(0, 12).map((task) => (
              <li key={task.id}>
                <Link to={orgPath(orgId, "/vbs-plan?tab=prep&prep=tasks")}>{task.title}</Link>
                {task.dueDate ? <span className="muted"> · due {task.dueDate}</span> : null}
              </li>
            ))}
          </ul>
        )}
        <PlanSecondaryLink to={orgPath(orgId, "/vbs-plan?tab=prep&prep=tasks")} label="All prep work" />
      </section>
    </OrgWorkspacePage>
  );
}
