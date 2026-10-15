import { FormEvent, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { expandableRowHeaderProps } from "./expandable-row";
import type {
  VbsCalendarReminder,
  VbsChecklistItem,
  VbsPlanWorkspace,
  VbsScheduleSlot,
  VbsTask,
  VbsTaskCategory,
  VbsTaskStatus,
  VbsMilestoneStatus,
} from "./types";
import { MILESTONE_STATUS_LABELS } from "./vbs-milestone-status";
import {
  REMINDER_OFFSETS,
  addDays,
  addMonths,
  buildPlanCalendarEvents,
  eventsOnDay,
  monthGrid,
  parseLocalDay,
  truncate,
  weekDays,
  type CalendarViewMode,
  type PlanCalendarEvent,
} from "./vbs-plan-calendar";
import { OrgUserTypeahead } from "./OrgUserTypeahead";
import { VbsPlanDayAdd } from "./VbsPlanDayAdd";

type Props = {
  orgId: string;
  username: string;
  data: VbsPlanWorkspace;
  seesAllTeams: boolean;
  onReload: () => void;
  onRun: (action: () => Promise<unknown>) => void;
};

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={active ? "cal-bell active" : "cal-bell"}>
      <path
        fill="currentColor"
        d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Zm7.7-6.1V11a7.7 7.7 0 0 0-6.2-7.5V2.8a1.5 1.5 0 1 0-3 0v.7A7.7 7.7 0 0 0 4.3 11v4.9L2.5 18v1.1h19V18l-1.8-2.1Z"
      />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="vbs-plan-cal-glyph">
      <path
        fill="currentColor"
        d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zM7 12h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"
      />
    </svg>
  );
}

function CalendarModalOverlay({
  label,
  onClose,
  children,
  className,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className={className ? `vbs-cal-modal-overlay ${className}` : "vbs-cal-modal-overlay"}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="vbs-cal-modal-panel"
        role="dialog"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  const d =
    direction === "down"
      ? "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"
      : "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="vbs-plan-cal-chevron">
      <path fill="currentColor" d={d} />
    </svg>
  );
}

export function VbsPlanCalendar({ orgId, username, data, seesAllTeams, onReload, onRun }: Props) {
  const teamName = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "";
  const events = useMemo(
    () =>
      buildPlanCalendarEvents({
        plan: data.plan,
        tasks: data.tasks,
        schedule: data.schedule,
        checklist: data.checklist,
        teams: data.teams,
        username,
        canWrite: data.canWrite,
        seesAllTeams,
        teamName,
      }),
    [data, username, seesAllTeams],
  );

  const [view, setView] = useState<CalendarViewMode>(data.calendarDefaultView ?? "week");
  const [anchor, setAnchor] = useState(() => {
    if (data.plan?.startDate) {
      return parseLocalDay(data.plan.startDate);
    }
    return new Date();
  });
  const [expanded, setExpanded] = useState(false);
  const [reminderEvent, setReminderEvent] = useState<PlanCalendarEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PlanCalendarEvent | null>(null);
  const [reminderDraft, setReminderDraft] = useState<
    Record<number, { on: boolean; email: boolean; sms: boolean }>
  >({});
  const [savingReminders, setSavingReminders] = useState(false);
  const [savingDetail, setSavingDetail] = useState(false);

  useEffect(() => {
    setView(data.calendarDefaultView ?? "week");
  }, [data.calendarDefaultView]);

  useEffect(() => {
    if (data.plan?.startDate) {
      setAnchor(parseLocalDay(data.plan.startDate));
    }
  }, [data.plan?.id, data.plan?.startDate]);

  useEffect(() => {
    if (selectedEvent || reminderEvent) {
      setExpanded(true);
    }
  }, [selectedEvent, reminderEvent]);

  const reminders = data.calendarReminders ?? [];

  function remindersFor(event: PlanCalendarEvent) {
    return reminders.filter((r) => r.itemType === event.itemType && r.itemId === event.itemId);
  }

  function openReminders(event: PlanCalendarEvent, eventObj?: MouseEvent) {
    eventObj?.stopPropagation();
    const existing = remindersFor(event);
    const draft: Record<number, { on: boolean; email: boolean; sms: boolean }> = {};
    for (const opt of REMINDER_OFFSETS) {
      const hit = existing.find((r) => r.minutesBefore === opt.minutes);
      draft[opt.minutes] = {
        on: Boolean(hit),
        email: hit?.notifyEmail ?? data.notificationPrefs.notifyEmail,
        sms: hit?.notifySms ?? false,
      };
    }
    setReminderDraft(draft);
    setReminderEvent(event);
  }

  async function changeView(next: CalendarViewMode) {
    setView(next);
    await api.vbsCalendarView(orgId, next);
    onReload();
  }

  async function saveReminders(event: FormEvent) {
    event.preventDefault();
    if (!reminderEvent) {
      return;
    }
    setSavingReminders(true);
    try {
      const payload = REMINDER_OFFSETS.filter((opt) => reminderDraft[opt.minutes]?.on).map((opt) => ({
        minutesBefore: opt.minutes,
        notifyEmail: reminderDraft[opt.minutes]?.email ?? true,
        notifySms: reminderDraft[opt.minutes]?.sms ?? false,
      }));
      await api.saveVbsCalendarReminders(orgId, {
        itemType: reminderEvent.itemType,
        itemId: reminderEvent.itemId,
        reminders: payload,
      });
      setReminderEvent(null);
      onReload();
    } finally {
      setSavingReminders(false);
    }
  }

  function shiftAnchor(delta: number) {
    if (view === "month") {
      setAnchor((current) => addMonths(current, delta));
      return;
    }
    if (view === "day") {
      setAnchor((current) => addDays(current, delta));
      return;
    }
    setAnchor((current) => addDays(current, delta * 7));
  }

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, i) => current - 5 + i);
  }, []);

  const headerLabel = useMemo(() => {
    if (view === "day") {
      return anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }
    if (view === "month") {
      return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }
    const days = weekDays(anchor);
    const start = days[0];
    const end = days[6];
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }, [anchor, view]);

  const gridProps = {
    events,
    reminders,
    onReminders: openReminders,
    onSelect: setSelectedEvent,
    orgId,
    data,
    onRun,
  };

  const eventCount = events.length;
  const compactSummary =
    eventCount === 0
      ? "No events yet"
      : `${eventCount} event${eventCount === 1 ? "" : "s"} · ${headerLabel}`;

  return (
    <section
      className={expanded ? "vbs-plan-calendar expanded" : "vbs-plan-calendar compact"}
      aria-label="Team calendar"
    >
      <div
        {...expandableRowHeaderProps(
          expanded,
          () => setExpanded((v) => !v),
          "vbs-plan-calendar-strip",
          expanded ? "Collapse calendar" : "Expand calendar",
        )}
        title={expanded ? "Collapse calendar" : "Expand calendar"}
      >
        <div className="vbs-plan-calendar-brand">
          <CalendarGlyph />
          <div className="vbs-plan-calendar-brand-text">
            <strong>Team calendar</strong>
            <span className="muted">{expanded ? headerLabel : compactSummary}</span>
          </div>
        </div>
        <span className="vbs-plan-calendar-toggle" aria-hidden="true">
          <ChevronIcon direction={expanded ? "up" : "down"} />
        </span>
      </div>

      {expanded ? (
        <>
          <div className="vbs-plan-calendar-toolbar">
            <div className="vbs-plan-calendar-nav">
              <button type="button" className="ghost" onClick={() => shiftAnchor(-1)} aria-label="Previous">
                ‹
              </button>
              <button type="button" className="ghost" onClick={() => setAnchor(new Date())}>
                Today
              </button>
              {data.plan?.startDate ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setAnchor(parseLocalDay(data.plan!.startDate))}
                >
                  VBS week
                </button>
              ) : null}
              <button type="button" className="ghost" onClick={() => shiftAnchor(1)} aria-label="Next">
                ›
              </button>
              <strong className="vbs-plan-calendar-range">{headerLabel}</strong>
              <label className="vbs-plan-calendar-year">
                Year
                <select
                  value={anchor.getFullYear()}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    setAnchor((current) => new Date(y, current.getMonth(), current.getDate()));
                  }}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="vbs-plan-calendar-views">
              {(["day", "week", "month"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={view === mode ? "active" : ""}
                  onClick={() => void changeView(mode)}
                >
                  {mode === "day" ? "Day" : mode === "week" ? "Week" : "Month"}
                </button>
              ))}
            </div>
          </div>

          {view === "week" ? <WeekGrid anchor={anchor} {...gridProps} /> : null}
          {view === "day" ? <DayGrid day={anchor} {...gridProps} /> : null}
          {view === "month" ? <MonthGrid anchor={anchor} {...gridProps} /> : null}
        </>
      ) : (
        <button
          type="button"
          className="vbs-plan-calendar-mini"
          onClick={() => setExpanded(true)}
          aria-label="Expand team calendar"
        >
          <MiniMonthPreview anchor={anchor} events={events} />
          <span className="vbs-plan-calendar-mini-hint muted">Click to expand</span>
        </button>
      )}

      {selectedEvent ? (
        <CalendarModalOverlay
          label="Calendar item details"
          onClose={() => setSelectedEvent(null)}
        >
          <CalendarEventDetail
            event={selectedEvent}
            data={data}
            orgId={orgId}
            teamName={teamName}
            saving={savingDetail}
            onClose={() => setSelectedEvent(null)}
            onReminders={() => openReminders(selectedEvent)}
            onSaved={async (action) => {
              setSavingDetail(true);
              try {
                await action();
                setSelectedEvent(null);
                onReload();
              } finally {
                setSavingDetail(false);
              }
            }}
          />
        </CalendarModalOverlay>
      ) : null}

      {reminderEvent ? (
        <CalendarModalOverlay
          label="Calendar reminders"
          className="vbs-cal-reminder-overlay"
          onClose={() => setReminderEvent(null)}
        >
          <div className="vbs-cal-reminder-panel">
            <header>
              <h3>Reminders</h3>
              <p className="muted">{reminderEvent.title}</p>
            </header>
            <form onSubmit={(e) => void saveReminders(e)}>
              <ul className="vbs-cal-reminder-list">
                {REMINDER_OFFSETS.map((opt) => (
                  <li key={opt.minutes}>
                    <label className="checkbox-line">
                      <input
                        type="checkbox"
                        checked={reminderDraft[opt.minutes]?.on ?? false}
                        onChange={(event) =>
                          setReminderDraft((current) => ({
                            ...current,
                            [opt.minutes]: {
                              on: event.target.checked,
                              email: current[opt.minutes]?.email ?? true,
                              sms: current[opt.minutes]?.sms ?? false,
                            },
                          }))
                        }
                      />
                      <span>{opt.label}</span>
                    </label>
                    {reminderDraft[opt.minutes]?.on ? (
                      <div className="vbs-cal-reminder-channels">
                        <label className="checkbox-line">
                          <input
                            type="checkbox"
                            checked={reminderDraft[opt.minutes]?.email ?? true}
                            onChange={(event) =>
                              setReminderDraft((current) => ({
                                ...current,
                                [opt.minutes]: {
                                  ...current[opt.minutes],
                                  on: true,
                                  email: event.target.checked,
                                  sms: current[opt.minutes]?.sms ?? false,
                                },
                              }))
                            }
                          />
                          Email
                        </label>
                        <label className="checkbox-line">
                          <input
                            type="checkbox"
                            checked={reminderDraft[opt.minutes]?.sms ?? false}
                            onChange={(event) =>
                              setReminderDraft((current) => ({
                                ...current,
                                [opt.minutes]: {
                                  ...current[opt.minutes],
                                  on: true,
                                  email: current[opt.minutes]?.email ?? true,
                                  sms: event.target.checked,
                                },
                              }))
                            }
                          />
                          SMS
                        </label>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="muted vbs-cal-reminder-note">
                In-app bell notifications always fire. Email and SMS follow your choices and org alert settings.
              </p>
              <div className="form-actions">
                <button type="submit" disabled={savingReminders}>
                  {savingReminders ? "Saving…" : "Save reminders"}
                </button>
                <button type="button" className="ghost" onClick={() => setReminderEvent(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </CalendarModalOverlay>
      ) : null}
    </section>
  );
}

function CalendarEventDetail({
  event,
  data,
  orgId,
  teamName,
  saving,
  onClose,
  onReminders,
  onSaved,
}: {
  event: PlanCalendarEvent;
  data: VbsPlanWorkspace;
  orgId: string;
  teamName: (id: string) => string;
  saving: boolean;
  onClose: () => void;
  onReminders: () => void;
  onSaved: (action: () => Promise<unknown>) => void;
}) {
  const task = event.itemType === "task" ? data.tasks.find((t) => t.id === event.itemId) : undefined;
  const slot = event.itemType === "schedule" ? data.schedule.find((s) => s.id === event.itemId) : undefined;
  const checklistItem =
    event.itemType === "checklist" ? data.checklist.find((c) => c.id === event.itemId) : undefined;

  if (event.kind === "milestone" && data.plan) {
    return (
      <div className="vbs-cal-detail-panel" aria-label="VBS milestone">
        <header className="vbs-cal-detail-head">
          <h3>{event.title}</h3>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="vbs-cal-detail-full">{event.tooltipText}</p>
        <p className="muted">Edit VBS dates and daily hours on the Overview tab.</p>
        <button type="button" className="ghost" onClick={onReminders}>
          Set reminders
        </button>
      </div>
    );
  }

  if (task) {
    return (
      <TaskDetailForm
        task={task}
        data={data}
        orgId={orgId}
        saving={saving}
        onClose={onClose}
        onReminders={onReminders}
        onSave={(payload) => onSaved(() => api.saveVbsTask(orgId, payload))}
        onDelete={() => onSaved(() => api.deleteVbsTask(orgId, task.id))}
      />
    );
  }

  if (slot) {
    return (
      <ScheduleDetailForm
        slot={slot}
        data={data}
        teamName={teamName}
        saving={saving}
        onClose={onClose}
        onReminders={onReminders}
        onSave={(payload) => onSaved(() => api.saveVbsScheduleSlot(orgId, payload))}
        onDelete={() => onSaved(() => api.deleteVbsScheduleSlot(orgId, slot.id))}
      />
    );
  }

  if (checklistItem) {
    return (
      <ChecklistDetailForm
        item={checklistItem}
        data={data}
        saving={saving}
        onClose={onClose}
        onReminders={onReminders}
        onSave={(payload) => onSaved(() => api.saveVbsChecklistItem(orgId, payload))}
        onDelete={() => onSaved(() => api.deleteVbsChecklistItem(orgId, checklistItem.id))}
      />
    );
  }

  return (
    <div className="vbs-cal-detail-panel">
      <p className="muted">This item is no longer in the plan.</p>
      <button type="button" className="ghost" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function TaskDetailForm({
  task,
  data,
  orgId,
  saving,
  onClose,
  onReminders,
  onSave,
  onDelete,
}: {
  task: VbsTask;
  data: VbsPlanWorkspace;
  orgId: string;
  saving: boolean;
  onClose: () => void;
  onReminders: () => void;
  onSave: (payload: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [notes, setNotes] = useState(task.notes);
  const [category, setCategory] = useState(task.category);
  const [status, setStatus] = useState(task.status);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [assignedUsername, setAssignedUsername] = useState(task.assignedUsername);
  const [assignedTeamId, setAssignedTeamId] = useState(task.assignedTeamId);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      id: task.id,
      title,
      description,
      notes,
      category,
      status,
      dueDate,
      assignedUsername,
      assignedTeamId,
      expenseAmount: task.expenseAmount,
      reimbursementStatus: task.reimbursementStatus,
      attachments: task.attachments.map(({ name, type, size, dataUrl }) => ({ name, type, size, dataUrl })),
    });
  }

  return (
    <div className="vbs-cal-detail-panel" aria-label="Edit task">
      <header className="vbs-cal-detail-head">
        <h3>Task</h3>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </header>
      <form className="review-form" onSubmit={submit}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required disabled={!data.canWrite || saving} />
        </label>
        <label>
          Description
          <textarea
            value={description}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!data.canWrite || saving}
            placeholder="Optional instructions or links…"
          />
        </label>
        <label>
          Notes
          <textarea
            value={notes}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!data.canWrite || saving}
            placeholder="Optional — updates, blockers, phone numbers…"
          />
        </label>
        <div className="score-head">
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as VbsTaskCategory)}
              disabled={!data.canWrite || saving}
            >
              {data.taskCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as VbsTaskStatus)}
              disabled={saving}
            >
              {data.taskStatuses.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Due date
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={!data.canWrite || saving}
          />
        </label>
        <div className="score-head">
          <label>
            Assigned to
            <OrgUserTypeahead
              orgId={orgId}
              value={assignedUsername}
              onChange={setAssignedUsername}
              disabled={!data.canWrite || saving}
            />
          </label>
          <label>
            Assign team
            <select
              value={assignedTeamId}
              onChange={(e) => setAssignedTeamId(e.target.value)}
              disabled={!data.canWrite || saving}
            >
              <option value="">—</option>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-actions">
          {data.canWrite ? (
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save task"}
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={onReminders}>
            Reminders
          </button>
          {data.canWrite ? (
            <button type="button" className="ghost danger" disabled={saving} onClick={onDelete}>
              Delete
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function ScheduleDetailForm({
  slot,
  data,
  teamName,
  saving,
  onClose,
  onReminders,
  onSave,
  onDelete,
}: {
  slot: VbsScheduleSlot;
  data: VbsPlanWorkspace;
  teamName: (id: string) => string;
  saving: boolean;
  onClose: () => void;
  onReminders: () => void;
  onSave: (payload: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [dayDate, setDayDate] = useState(slot.dayDate);
  const [startsAt, setStartsAt] = useState(slot.startsAt);
  const [endsAt, setEndsAt] = useState(slot.endsAt);
  const [label, setLabel] = useState(slot.label);
  const [teamId, setTeamId] = useState(slot.teamId);
  const [stationId, setStationId] = useState(slot.stationId);
  const [notes, setNotes] = useState(slot.notes);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({ id: slot.id, dayDate, startsAt, endsAt, label, teamId, stationId, notes });
  }

  return (
    <div className="vbs-cal-detail-panel" aria-label="Edit schedule block">
      <header className="vbs-cal-detail-head">
        <h3>Schedule block</h3>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="muted">
        {teamId ? teamName(teamId) : "No team"}
        {stationId ? ` · ${data.stations.find((s) => s.id === stationId)?.name ?? ""}` : ""}
      </p>
      <form className="review-form" onSubmit={submit}>
        <label>
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} required disabled={!data.canWrite || saving} />
        </label>
        <div className="score-head">
          <label>
            Day
            <input
              type="date"
              value={dayDate}
              onChange={(e) => setDayDate(e.target.value)}
              required
              disabled={!data.canWrite || saving}
            />
          </label>
          <label>
            Start
            <input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={!data.canWrite || saving} />
          </label>
          <label>
            End
            <input type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} disabled={!data.canWrite || saving} />
          </label>
        </div>
        <div className="score-head">
          <label>
            Team
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!data.canWrite || saving}>
              <option value="">—</option>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Station
            <select value={stationId} onChange={(e) => setStationId(e.target.value)} disabled={!data.canWrite || saving}>
              <option value="">—</option>
              {data.stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Notes
          <textarea value={notes} rows={2} onChange={(e) => setNotes(e.target.value)} disabled={!data.canWrite || saving} />
        </label>
        <div className="form-actions">
          {data.canWrite ? (
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save block"}
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={onReminders}>
            Reminders
          </button>
          {data.canWrite ? (
            <button type="button" className="ghost danger" disabled={saving} onClick={onDelete}>
              Delete
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function ChecklistDetailForm({
  item,
  data,
  saving,
  onClose,
  onReminders,
  onSave,
  onDelete,
}: {
  item: VbsChecklistItem;
  data: VbsPlanWorkspace;
  saving: boolean;
  onClose: () => void;
  onReminders: () => void;
  onSave: (payload: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [category, setCategory] = useState(item.category);
  const [dueDate, setDueDate] = useState(item.dueDate);
  const [assignedTeamId, setAssignedTeamId] = useState(item.assignedTeamId);
  const [notes, setNotes] = useState(item.notes);
  const [status, setStatus] = useState(item.status);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      id: item.id,
      label,
      category,
      dueDate,
      assignedTeamId,
      notes,
      status,
    });
  }

  return (
    <div className="vbs-cal-detail-panel" aria-label="Edit milestone">
      <header className="vbs-cal-detail-head">
        <h3>Milestone</h3>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </header>
      <form className="review-form" onSubmit={submit}>
        <label>
          Item
          <input value={label} onChange={(e) => setLabel(e.target.value)} required disabled={!data.canWrite || saving} />
        </label>
        <label>
          Category
          <input value={category} onChange={(e) => setCategory(e.target.value)} disabled={!data.canWrite || saving} />
        </label>
        <label>
          Due date
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!data.canWrite || saving} />
        </label>
        <label>
          Team
          <select value={assignedTeamId} onChange={(e) => setAssignedTeamId(e.target.value)} disabled={!data.canWrite || saving}>
            <option value="">—</option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!data.canWrite || saving}
            placeholder="Optional details…"
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as VbsMilestoneStatus)} disabled={!data.canWrite || saving}>
            {(Object.keys(MILESTONE_STATUS_LABELS) as VbsMilestoneStatus[]).map((key) => (
              <option key={key} value={key}>
                {MILESTONE_STATUS_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          {data.canWrite ? (
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save item"}
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={onReminders}>
            Reminders
          </button>
          {data.canWrite ? (
            <button type="button" className="ghost danger" disabled={saving} onClick={onDelete}>
              Delete
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function hasReminder(event: PlanCalendarEvent, reminders: VbsCalendarReminder[]) {
  return reminders.some((r) => r.itemType === event.itemType && r.itemId === event.itemId);
}

function EventChip({
  event,
  reminders,
  onReminders,
  onSelect,
  compact,
}: {
  event: PlanCalendarEvent;
  reminders: VbsCalendarReminder[];
  onReminders: (event: PlanCalendarEvent, e?: MouseEvent) => void;
  onSelect: (event: PlanCalendarEvent) => void;
  compact?: boolean;
}) {
  const label = compact ? truncate(event.title, 22) : truncate(event.title, 36);
  const tooltipLines = event.tooltipText.split("\n");

  return (
    <div className={`vbs-cal-event-wrap kind-${event.kind}`}>
      <div className="vbs-cal-tooltip" role="tooltip">
        {tooltipLines.map((line, index) => (
          <span key={index} className={index === 0 ? "vbs-cal-tooltip-title" : undefined}>
            {line}
          </span>
        ))}
      </div>
      <div className={`vbs-cal-event kind-${event.kind}`}>
        <button
          type="button"
          className="vbs-cal-event-open"
          title={event.tooltipText}
          onClick={() => onSelect(event)}
        >
          <span className="vbs-cal-event-text">{label}</span>
        </button>
        <button
          type="button"
          className="vbs-cal-event-bell"
          aria-label={`Reminders for ${event.title}`}
          title={hasReminder(event, reminders) ? "Reminders on" : "Set reminders"}
          onClick={(e) => onReminders(event, e)}
        >
          <BellIcon active={hasReminder(event, reminders)} />
        </button>
      </div>
    </div>
  );
}

type GridProps = {
  events: PlanCalendarEvent[];
  reminders: VbsCalendarReminder[];
  onReminders: (event: PlanCalendarEvent, e?: MouseEvent) => void;
  onSelect: (event: PlanCalendarEvent) => void;
  orgId: string;
  data: VbsPlanWorkspace;
  onRun: (action: () => Promise<unknown>) => void;
};

function WeekGrid({ anchor, events, onReminders, onSelect, reminders, orgId, data, onRun }: GridProps & { anchor: Date }) {
  const days = weekDays(anchor);
  return (
    <div className="vbs-cal-grid week">
      {days.map((day) => (
        <div key={day.toISOString()} className="vbs-cal-day-col">
          <header className="vbs-cal-day-head">
            <div>
              <span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <strong>{day.getDate()}</strong>
            </div>
            <VbsPlanDayAdd day={day} data={data} orgId={orgId} onRun={onRun} />
          </header>
          <div className="vbs-cal-day-body">
            {eventsOnDay(events, day).map((event) => (
              <EventChip
                key={event.key}
                event={event}
                reminders={reminders}
                onReminders={onReminders}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DayGrid({
  day,
  events,
  onReminders,
  onSelect,
  reminders,
  orgId,
  data,
  onRun,
}: GridProps & { day: Date }) {
  const dayEvents = eventsOnDay(events, day);
  const hours = Array.from({ length: 15 }, (_, i) => i + 6);
  return (
    <div className="vbs-cal-grid day">
      <div className="vbs-cal-day-toolbar">
        <VbsPlanDayAdd day={day} data={data} orgId={orgId} onRun={onRun} />
      </div>
      <div className="vbs-cal-allday">
        <span className="muted">All day</span>
        {dayEvents
          .filter((e) => e.allDay)
          .map((event) => (
            <EventChip key={event.key} event={event} reminders={reminders} onReminders={onReminders} onSelect={onSelect} />
          ))}
      </div>
      {hours.map((hour) => {
        const slotEvents = dayEvents.filter((e) => !e.allDay && e.start.getHours() === hour);
        return (
          <div key={hour} className="vbs-cal-hour-row">
            <span className="vbs-cal-hour-label">{`${hour}:00`}</span>
            <div className="vbs-cal-hour-slot">
              {slotEvents.map((event) => (
                <EventChip key={event.key} event={event} reminders={reminders} onReminders={onReminders} onSelect={onSelect} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MINI_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

function MiniMonthPreview({ anchor, events }: { anchor: Date; events: PlanCalendarEvent[] }) {
  const cells = monthGrid(anchor);
  const monthLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="vbs-cal-mini" aria-hidden="true">
      <span className="vbs-cal-mini-month">{monthLabel}</span>
      <div className="vbs-cal-mini-weekdays">
        {MINI_WEEKDAYS.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="vbs-cal-mini-grid">
        {cells.map((day) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const dayEvents = eventsOnDay(events, day);
          return (
            <div
              key={day.toISOString()}
              className={inMonth ? "vbs-cal-mini-cell" : "vbs-cal-mini-cell muted-month"}
            >
              <span className="vbs-cal-mini-date">{day.getDate()}</span>
              <div className="vbs-cal-mini-marks">
                {dayEvents.slice(0, 4).map((event) => (
                  <span key={event.key} className={`vbs-cal-mini-mark kind-${event.kind}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({
  anchor,
  events,
  onReminders,
  onSelect,
  reminders,
  orgId,
  data,
  onRun,
}: GridProps & { anchor: Date }) {
  const cells = monthGrid(anchor);
  return (
    <div className="vbs-cal-grid month">
      {cells.map((day) => {
        const inMonth = day.getMonth() === anchor.getMonth();
        const dayEvents = eventsOnDay(events, day);
        const visible = dayEvents.slice(0, 3);
        const extra = dayEvents.length - visible.length;
        return (
          <div key={day.toISOString()} className={inMonth ? "vbs-cal-month-cell" : "vbs-cal-month-cell muted-month"}>
            <div className="vbs-cal-month-cell-top">
              <span className="vbs-cal-month-date">{day.getDate()}</span>
              {inMonth ? <VbsPlanDayAdd day={day} data={data} orgId={orgId} onRun={onRun} /> : null}
            </div>
            <div className="vbs-cal-month-cell-events">
              {visible.map((event) => (
                <EventChip
                  key={event.key}
                  event={event}
                  reminders={reminders}
                  onReminders={onReminders}
                  onSelect={onSelect}
                  compact
                />
              ))}
              {extra > 0 ? (
                <button type="button" className="vbs-cal-more muted" onClick={() => onSelect(dayEvents[3]!)}>
                  +{extra} more
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
