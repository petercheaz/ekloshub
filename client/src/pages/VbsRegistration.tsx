import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useOrgs } from "../orgs";
import { useOrgVbs } from "../org-vbs";
import { vbsProgramsMatching, vbsYearOptions } from "../vbs-cascade";
import type { ShareProgram, VbsRegistrationStudent, VbsRegistrationWorkspace } from "../types";
import { VbsRegistrationAllergiesPanel } from "./VbsRegistrationAllergiesPanel";
import { VbsRegistrationContactsPanel } from "./VbsRegistrationContactsPanel";
import { VbsRegistrationClassesBoard } from "./VbsRegistrationClassesBoard";
import { CollapsibleForm } from "../CollapsibleForm";
import { RegistrationStudentFields } from "../RegistrationStudentFields";
import { RegistrationStudentRoster } from "../RegistrationStudentRoster";
import {
  emptyRegistrationStudentDraft,
  toggleRegistrationAllergy,
  type RegistrationStudentDraft,
} from "../registration-student-draft";
import { studentPlainName } from "../StudentName";
import { ageFromBirthMonthYear, allergiesLabel, vbsSeasonAgeReferenceDate } from "../vbs-registration-utils";

type Tab = "classes" | "contacts" | "allergies" | "register" | "nametags";

const allSections: { id: Tab; label: string; hint: string }[] = [
  {
    id: "register",
    label: "Students",
    hint: "Register each child with parent/guardian contact, allergies, and attendance",
  },
  {
    id: "classes",
    label: "Classes & roster",
    hint: "Drag students onto rotation station classes; assign volunteers as leaders, teachers, or helpers",
  },
  {
    id: "contacts",
    label: "Contacts",
    hint: "Emergency and pickup contacts for registration planners",
  },
  {
    id: "allergies",
    label: "Allergies",
    hint: "Allergy summary — shared with the cooking team",
  },
  {
    id: "nametags",
    label: "Nametags",
    hint: "Generate themed printable nametags with allergies and assigned team",
  },
];

function sectionsForWorkspace(data: VbsRegistrationWorkspace) {
  return allSections.filter((item) => {
    if (item.id === "contacts") {
      return data.canViewContacts && !data.canWrite;
    }
    if (item.id === "allergies") {
      return data.canViewAllergies;
    }
    if (item.id === "register" || item.id === "nametags") {
      return data.canWrite;
    }
    return data.canWrite || data.canViewContacts || data.canViewAllergies;
  });
}

function tabFromSearch(params: URLSearchParams, allowed: Tab[]): Tab {
  const raw = params.get("tab") as Tab | null;
  if (raw && allowed.includes(raw)) {
    return raw;
  }
  if (allowed.includes("register")) {
    return "register";
  }
  if (allowed.includes("classes")) {
    return "classes";
  }
  return allowed[0] ?? "allergies";
}

export default function VbsRegistrationPage() {
  const { orgId = "" } = useParams();
  const { current: org } = useOrgs();
  const { filterDefault, working, prefsReady, viewingYear, viewingEventId, eventsReady, orgEventEpoch } = useOrgVbs();
  const [data, setData] = useState<VbsRegistrationWorkspace | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<RegistrationStudentDraft>(() => emptyRegistrationStudentDraft());
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [showAddStudentForm, setShowAddStudentForm] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("classes");
  const [nametagStudentId, setNametagStudentId] = useState("");
  const [publisherId, setPublisherId] = useState("");
  const [year, setYear] = useState("");
  const [themeTitle, setThemeTitle] = useState("");
  const [nametagTeamId, setNametagTeamId] = useState("");
  const [nametagInstructions, setNametagInstructions] = useState("");
  const [nametagStatus, setNametagStatus] = useState("");
  const sections = useMemo(() => (data ? sectionsForWorkspace(data) : allSections), [data]);

  const displayStudents = useMemo(() => data?.students ?? [], [data]);

  const displaySummary = useMemo(() => {
    return {
      total: displayStudents.length,
      parentOnline: displayStudents.filter((s) => s.source === "public").length,
      staffEntered: displayStudents.filter((s) => s.source === "staff").length,
      unassigned: displayStudents.filter((s) => s.classIds.length === 0).length,
      paymentPending: displayStudents.filter((s) => s.paymentStatus === "pending").length,
    };
  }, [displayStudents]);

  const displayClasses = useMemo(() => data?.classes ?? [], [data]);

  const rosterData = useMemo(() => {
    if (!data) {
      return null;
    }
    return { ...data, students: displayStudents, classes: displayClasses, summary: displaySummary };
  }, [data, displayStudents, displayClasses, displaySummary]);

  const focusStudent = useCallback(
    (studentId: string | null, options?: { syncUrl?: boolean }) => {
      setExpandedStudentId(studentId);
      setShowAddStudentForm(false);
      if (studentId) {
        setTab("register");
      }
      if (options?.syncUrl === false) {
        return;
      }
      const params = new URLSearchParams(searchParams);
      if (studentId) {
        params.set("student", studentId);
        params.delete("tab");
      } else {
        params.delete("student");
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (!data) {
      return;
    }
    const allowed = sectionsForWorkspace(data).map((item) => item.id);
    setTab(tabFromSearch(searchParams, allowed));
  }, [searchParams, data]);

  useEffect(() => {
    if (!data) {
      return;
    }
    const tabParam = searchParams.get("tab")?.trim();
    if (tabParam && tabParam !== "register") {
      return;
    }
    const studentId = searchParams.get("student")?.trim();
    if (!studentId) {
      return;
    }
    const allowed = sectionsForWorkspace(data).map((item) => item.id);
    if (!allowed.includes("register")) {
      return;
    }
    if (!data.students.some((student) => student.id === studentId)) {
      return;
    }
    focusStudent(studentId, { syncUrl: false });
  }, [searchParams, data, focusStudent]);

  const reload = useCallback(async () => {
    const workspace = await api.vbsRegistration(orgId, viewingYear ?? undefined);
    setData(workspace);
    setError("");
  }, [orgId, viewingEventId, viewingYear]);

  useEffect(() => {
    if (!eventsReady) {
      return;
    }
    let cancelled = false;
    api
      .vbsRegistration(orgId, viewingYear ?? undefined)
      .then((workspace) => {
        if (!cancelled) {
          setData(workspace);
          setPublisherId((current) => current || workspace.publishers[0]?.id || "");
          setYear((current) => current || String(workspace.defaultYear));
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
  }, [eventsReady, orgEventEpoch, orgId, viewingEventId, viewingYear]);

  useEffect(() => {
    const pick = working?.programTitle && working.programTitle !== "all" ? working : filterDefault;
    if (!prefsReady || !pick?.programTitle || pick.programTitle === "all" || pick.allFilters) {
      return;
    }
    setPublisherId(pick.publisherId);
    setYear(String(pick.year));
    setThemeTitle(pick.programTitle);
  }, [prefsReady, filterDefault, working]);

  const programs = data?.programs ?? [];
  const years = useMemo(() => vbsYearOptions(programs), [programs]);
  const titles = useMemo(
    () => vbsProgramsMatching(programs, publisherId, year),
    [programs, publisherId, year],
  );

  const activeSection = sections.find((section) => section.id === tab);
  const vbsAgeOn = useMemo(
    () => vbsSeasonAgeReferenceDate(viewingYear ?? data?.activeVbsYear ?? new Date().getFullYear()),
    [data?.activeVbsYear, viewingYear],
  );
  const draftAge = ageFromBirthMonthYear(draft.birthMonth, draft.birthYear, vbsAgeOn);

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

  function toggleAllergy(label: string) {
    setDraft((current) => toggleRegistrationAllergy(current, label));
  }

  function startNew() {
    setDraft(emptyRegistrationStudentDraft());
    setError("");
  }

  function openAddStudentForm() {
    startNew();
    setShowAddStudentForm(true);
  }

  function closeAddStudentForm() {
    startNew();
    setShowAddStudentForm(false);
  }

  async function submitRegistration(event: FormEvent) {
    event.preventDefault();
    if (!data?.canWrite) {
      return;
    }
    await run(async () => {
      const result = await api.saveVbsRegistrationStudent(orgId, {
        ...draft,
        id: "",
        vbsSeasonYear: viewingYear ?? data.activeVbsYear,
      });
      setDraft(emptyRegistrationStudentDraft());
      focusStudent(result.student.id);
    });
  }

  async function saveStudentDraft(studentDraft: RegistrationStudentDraft) {
    if (!data?.canWrite) {
      return;
    }
    await run(async () => {
      await api.saveVbsRegistrationStudent(orgId, { ...studentDraft });
    });
  }

  async function removeStudent(student: VbsRegistrationStudent) {
    if (!data?.canWrite) {
      return;
    }
    if (!window.confirm(`Remove registration for ${student.childFullName}?`)) {
      return;
    }
    await run(async () => {
      await api.deleteVbsRegistrationStudent(orgId, student.id);
      if (expandedStudentId === student.id) {
        focusStudent(null);
      }
      if (nametagStudentId === student.id) {
        setNametagStudentId("");
      }
    });
  }

  const nametagStudent = data?.students.find((student) => student.id === nametagStudentId) ?? null;

  useEffect(() => {
    if (!nametagStudent) {
      return;
    }
    setNametagTeamId(nametagStudent.assignedTeamId);
    setNametagInstructions(nametagStudent.nametagExtraInstructions);
  }, [nametagStudent?.id, nametagStudent?.assignedTeamId, nametagStudent?.nametagExtraInstructions]);

  async function generateNametag() {
    if (!data?.canWrite || !nametagStudentId) {
      setError("Choose a registered student first");
      return;
    }
    if (!publisherId || !year || !themeTitle) {
      setError("Publisher, year, and VBS theme title are required for nametags");
      return;
    }
    setNametagStatus("Generating nametag…");
    setError("");
    setBusy(true);
    try {
      const result = await api.generateVbsRegistrationNametag(orgId, nametagStudentId, {
        publisherId,
        year: Number(year),
        title: themeTitle,
        extraInstructions: nametagInstructions,
        assignedTeamId: nametagTeamId,
      });
      setNametagStatus("Nametag ready — scroll to preview.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate nametag");
      setNametagStatus("");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return <p className="status">{error}</p>;
  }
  if (!data) {
    return <p className="status">Loading registration…</p>;
  }

  return (
    <div className="reviews vbs-plan vbs-workspace vbs-registration">
      <header className="vbs-plan-masthead" aria-label="VBS registration summary">
        <div className="vbs-plan-masthead-main">
          {org ? <p className="vbs-plan-masthead-org">{org.name}</p> : null}
          <h1 className="vbs-plan-masthead-title">Registration</h1>
          <p className="vbs-plan-masthead-empty muted">
            Register children on <strong>Students</strong>, then assign them to station classes on{" "}
            <strong>Classes & roster</strong>. Volunteers come from Members & invites — not the student list.
          </p>
          {!data.viewAllSeasons && data.viewSeason !== null ? (
            <p className="muted">
              Your access is limited to <strong>VBS {data.viewSeason}</strong> students.
            </p>
          ) : null}
        </div>
        <div className="vbs-plan-masthead-aside">
          <ul className="vbs-plan-snapshot" aria-label="Registration counts">
            <li>
              <strong>{displaySummary.total}</strong>
              <span>Registered</span>
            </li>
            <li>
              <strong>{displaySummary.parentOnline}</strong>
              <span>Parent online</span>
            </li>
            <li>
              <strong>{displaySummary.paymentPending}</strong>
              <span>Payment pending</span>
            </li>
            <li>
              <strong>{displaySummary.unassigned}</strong>
              <span>No class</span>
            </li>
          </ul>
        </div>
      </header>

      {error ? <p className="status">{error}</p> : null}
      {!data.canWrite ? (
        <p className="vbs-plan-callout vbs-plan-callout-readonly">
          {data.canViewAllergies && !data.canViewContacts
            ? "Cooking team view — allergy and snack tools only. Contact details stay with registration staff."
            : !data.viewAllSeasons && data.viewSeason !== null && data.viewSeason !== data.activeVbsYear
              ? `View-only — your account is for VBS ${data.viewSeason}. Registration edits require the active VBS ${data.activeVbsYear} season.`
              : "You can view registrations. A registration admin or org admin is needed to add students or generate nametags."}
        </p>
      ) : null}

      <section className="vbs-plan-sections" aria-labelledby="vbs-reg-sections-title">
        <h2 id="vbs-reg-sections-title" className="vbs-plan-sections-title">
          Registration workflow
        </h2>
        <ol className="vbs-reg-workflow-steps muted">
          <li>Register each child on <strong>Students</strong> (parent/guardian info required)</li>
          <li>Place them in classes on <strong>Classes &amp; roster</strong></li>
          <li>Review allergies; print nametags when ready</li>
          <li>Optional: publish the family info link under Students</li>
        </ol>
        <div className="vbs-chrome-tabs">
          <nav className="vbs-chrome-tabs-bar" role="tablist" aria-label="Registration sections">
            {sections.map((item) => {
              const selected = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`vbs-reg-tab-${item.id}`}
                  className={selected ? "vbs-chrome-tab active" : "vbs-chrome-tab"}
                  aria-selected={selected}
                  aria-controls="vbs-reg-tabpanel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    setTab(item.id);
                    const params = new URLSearchParams(searchParams);
                    if (item.id === "register") {
                      params.delete("tab");
                    } else {
                      params.set("tab", item.id);
                      params.delete("student");
                      params.delete("view");
                      setExpandedStudentId(null);
                      setShowAddStudentForm(false);
                    }
                    setSearchParams(params, { replace: true });
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div
            className="vbs-chrome-tabs-panel"
            role="tabpanel"
            id="vbs-reg-tabpanel"
            aria-labelledby={`vbs-reg-tab-${tab}`}
          >
            {activeSection ? (
              <p className="vbs-plan-tab-hint">
                <strong>{activeSection.label}</strong>
                <span className="muted"> — {activeSection.hint}</span>
              </p>
            ) : null}

            {tab === "classes" && rosterData ? (
              <>
                <VbsRegistrationClassesBoard
                  orgId={orgId}
                  data={rosterData}
                  vbsAgeOn={vbsAgeOn}
                  canWrite={data.canWrite}
                  onReload={reload}
                />
              </>
            ) : null}

            {tab === "contacts" ? <VbsRegistrationContactsPanel students={displayStudents} /> : null}

            {tab === "allergies" ? (
              <VbsRegistrationAllergiesPanel
                students={displayStudents}
                commonAllergies={data.commonAllergies}
                sharedWithCooking={data.canViewAllergies}
              />
            ) : null}

            {tab === "register" ? (
              <>
                <RegistrationStudentRoster
                  students={displayStudents}
                  data={data}
                  vbsAgeOn={vbsAgeOn}
                  canWrite={data.canWrite}
                  busy={busy}
                  expandedStudentId={expandedStudentId}
                  onExpandedStudentIdChange={focusStudent}
                  onSave={saveStudentDraft}
                  onDelete={(student) => void removeStudent(student)}
                  onAddStudent={openAddStudentForm}
                  addStudentFormOpen={showAddStudentForm}
                />
                {showAddStudentForm && data.canWrite ? (
                  <RegistrationForm
                    draft={draft}
                    setDraft={setDraft}
                    draftAge={draftAge}
                    data={data}
                    busy={busy}
                    onSubmit={submitRegistration}
                    onCancel={closeAddStudentForm}
                    toggleAllergy={toggleAllergy}
                  />
                ) : null}
                {data.publicFamily && data.canWrite ? (
                  <details className="vbs-registration-optional-public">
                    <summary>Family info page (optional)</summary>
                    <PublicFamilyLinkPanel
                      orgId={orgId}
                      settings={data.publicFamily}
                      onUpdated={() => void reload()}
                    />
                  </details>
                ) : null}
              </>
            ) : null}

            {tab === "nametags" ? (
              <NametagsPanel
                data={data}
                students={displayStudents}
                canWrite={data.canWrite}
                busy={busy}
                publisherId={publisherId}
                setPublisherId={setPublisherId}
                year={year}
                setYear={setYear}
                themeTitle={themeTitle}
                setThemeTitle={setThemeTitle}
                years={years}
                titles={titles}
                nametagStudentId={nametagStudentId}
                setNametagStudentId={setNametagStudentId}
                nametagTeamId={nametagTeamId}
                setNametagTeamId={setNametagTeamId}
                nametagInstructions={nametagInstructions}
                setNametagInstructions={setNametagInstructions}
                nametagStudent={nametagStudent}
                nametagStatus={nametagStatus}
                onGenerate={() => void generateNametag()}
              />
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function PublicFamilyLinkPanel({
  orgId,
  settings,
  onUpdated,
}: {
  orgId: string;
  settings: { enabled: boolean; link: string };
  onUpdated: () => void;
}) {
  const copy = {
    hint: "A no-login page for already-registered families: VBS dates, daily hours, location, and your “Notes for families” text from Plan → Overview. It does not collect registrations — staff still add students in the roster.",
    checkbox: "Publish family info page",
    linkLabel: "Family info link",
    enabledOn: "Family info page is open.",
    enabledOff: "Family info page is closed.",
    regenerated: "New family link created.",
  };
  const [enabled, setEnabled] = useState(settings.enabled);
  const [link, setLink] = useState(settings.link);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setEnabled(settings.enabled);
    setLink(settings.link);
  }, [settings.enabled, settings.link]);

  async function patch(input: { enabled?: boolean; regenerateToken?: boolean }) {
    return api.updateVbsRegistrationFamilyPage(orgId, input);
  }

  async function saveEnabled(next: boolean) {
    setBusy(true);
    setStatus("");
    try {
      const result = await patch({ enabled: next });
      setEnabled(result.enabled);
      setLink(result.link);
      setStatus(next ? copy.enabledOn : copy.enabledOff);
      onUpdated();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not update settings");
    } finally {
      setBusy(false);
    }
  }

  async function regenerateLink() {
    if (!window.confirm("Regenerate the link? The old URL will stop working.")) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const result = await patch({ regenerateToken: true });
      setLink(result.link);
      setStatus(copy.regenerated);
      onUpdated();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not regenerate link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="vbs-panel vbs-registration-public">
      <p className="muted vbs-task-field-hint">{copy.hint}</p>
      <label className="vbs-registration-check">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => void saveEnabled(e.target.checked)}
        />
        {copy.checkbox}
      </label>
      <div className="vbs-registration-public-link">
        <input type="text" readOnly value={link} aria-label={copy.linkLabel} onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => {
            void navigator.clipboard.writeText(link);
            setStatus("Link copied.");
          }}
        >
          Copy link
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void regenerateLink()}>
          Regenerate link
        </button>
      </div>
      {status ? <p className="tagline">{status}</p> : null}
    </section>
  );
}

function RegistrationForm({
  draft,
  setDraft,
  draftAge,
  data,
  busy,
  onSubmit,
  onCancel,
  toggleAllergy,
}: {
  draft: RegistrationStudentDraft;
  setDraft: (
    value: RegistrationStudentDraft | ((current: RegistrationStudentDraft) => RegistrationStudentDraft),
  ) => void;
  draftAge: number;
  data: VbsRegistrationWorkspace;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  toggleAllergy: (label: string) => void;
}) {
  return (
    <CollapsibleForm
      title="Register a student"
      className="vbs-registration-form"
      busy={busy}
      saveLabel="Save"
      onCancel={onCancel}
      onSubmit={onSubmit}
    >
      <RegistrationStudentFields
        draft={draft}
        setDraft={setDraft}
        draftAge={draftAge}
        data={data}
        busy={busy}
        canWrite={data.canWrite}
        toggleAllergy={toggleAllergy}
      />
    </CollapsibleForm>
  );
}

function NametagsPanel({
  data,
  students,
  canWrite,
  busy,
  publisherId,
  setPublisherId,
  year,
  setYear,
  themeTitle,
  setThemeTitle,
  years,
  titles,
  nametagStudentId,
  setNametagStudentId,
  nametagTeamId,
  setNametagTeamId,
  nametagInstructions,
  setNametagInstructions,
  nametagStudent,
  nametagStatus,
  onGenerate,
}: {
  data: VbsRegistrationWorkspace;
  students: VbsRegistrationStudent[];
  canWrite: boolean;
  busy: boolean;
  publisherId: string;
  setPublisherId: (value: string) => void;
  year: string;
  setYear: (value: string) => void;
  themeTitle: string;
  setThemeTitle: (value: string) => void;
  years: number[];
  titles: ShareProgram[];
  nametagStudentId: string;
  setNametagStudentId: (value: string) => void;
  nametagTeamId: string;
  setNametagTeamId: (value: string) => void;
  nametagInstructions: string;
  setNametagInstructions: (value: string) => void;
  nametagStudent: VbsRegistrationStudent | null;
  nametagStatus: string;
  onGenerate: () => void;
}) {
  return (
    <section className="vbs-panel vbs-registration-nametags">
      <p className="muted vbs-registration-nametag-lead">
        Nametags use the prompt in <code>llm/reg_name_tags.txt</code> plus your extra instructions below. The
        artwork includes the student&apos;s name, assigned team, and allergies in a corner.
      </p>

      {students.length === 0 ? (
        <p className="vbs-plan-callout">Register at least one student on the Students tab first.</p>
      ) : (
        <>
          <div className="vbs-plan-field-row">
            <label className="vbs-plan-field">
              Student
              <select
                disabled={!canWrite || busy}
                value={nametagStudentId}
                onChange={(e) => setNametagStudentId(e.target.value)}
              >
                <option value="">Choose…</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {studentPlainName(student)}
                  </option>
                ))}
              </select>
            </label>
            <label className="vbs-plan-field">
              Assigned team (on nametag)
              <select
                disabled={!canWrite || busy || !nametagStudent}
                value={nametagTeamId}
                onChange={(e) => setNametagTeamId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {data.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="vbs-plan-field-row">
            <label className="vbs-plan-field">
              Publisher
              <select
                disabled={!canWrite || busy}
                value={publisherId}
                onChange={(e) => setPublisherId(e.target.value)}
              >
                {data.publishers.map((publisher) => (
                  <option key={publisher.id} value={publisher.id}>
                    {publisher.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="vbs-plan-field">
              Year
              <select disabled={!canWrite || busy} value={year} onChange={(e) => setYear(e.target.value)}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="vbs-plan-field">
              VBS theme title
              <select
                disabled={!canWrite || busy}
                value={themeTitle}
                onChange={(e) => setThemeTitle(e.target.value)}
              >
                <option value="">Select theme…</option>
                {titles.map((program) => (
                  <option key={program.id} value={program.theme}>
                    {program.theme}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {nametagStudent ? (
            <dl className="vbs-registration-nametag-meta">
              <div>
                <dt>Allergies on tag</dt>
                <dd>{allergiesLabel(nametagStudent.allergiesCommon, nametagStudent.allergiesOther)}</dd>
              </div>
              <div>
                <dt>Special requests</dt>
                <dd>{nametagStudent.specialRequests.trim() || "None"}</dd>
              </div>
            </dl>
          ) : null}

          <label className="vbs-plan-field">
            Extra instructions for the image model (added to reg_name_tags.txt)
            <textarea
              rows={4}
              disabled={!canWrite || busy}
              value={nametagInstructions}
              onChange={(e) => setNametagInstructions(e.target.value)}
              placeholder="e.g. Use bold primary colors, add subtle paw prints, leave white margin for lanyard punch."
            />
          </label>

          {canWrite ? (
            <div className="vbs-plan-form-actions">
              <button type="button" className="vbs-plan-save" disabled={busy || !nametagStudentId} onClick={onGenerate}>
                {nametagStudent?.nametagImageUrl ? "Regenerate nametag" : "Generate nametag"}
              </button>
            </div>
          ) : null}

          {nametagStatus ? <p className="status">{nametagStatus}</p> : null}

          {nametagStudent?.nametagImageUrl ? (
            <figure className="vbs-registration-nametag-preview">
              <img src={nametagStudent.nametagImageUrl} alt={`Nametag for ${nametagStudent.childFullName}`} />
              <figcaption className="muted">
                Latest nametag for {nametagStudent.childFullName}. Regenerate after changing team or instructions.
              </figcaption>
            </figure>
          ) : null}
        </>
      )}
    </section>
  );
}
