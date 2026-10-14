import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useOrgs } from "../orgs";
import { useOrgVbs } from "../org-vbs";
import { vbsProgramsMatching, vbsYearOptions } from "../vbs-cascade";
import type {
  ShareProgram,
  VbsRegistrationPaymentStatus,
  VbsRegistrationStudent,
  VbsRegistrationWorkspace,
} from "../types";
import { VbsRegistrationAllergiesPanel } from "./VbsRegistrationAllergiesPanel";
import { VbsRegistrationContactsPanel } from "./VbsRegistrationContactsPanel";
import { VbsRegistrationRosterPlanning } from "./VbsRegistrationRosterPlanning";
import {
  ageFromBirthMonthYear,
  allergiesLabel,
  attendanceSummary,
  birthMonthOptions,
  birthYearOptions,
} from "../vbs-registration-utils";

type Tab = "classes" | "contacts" | "allergies" | "register" | "nametags";

const allSections: { id: Tab; label: string; hint: string }[] = [
  {
    id: "classes",
    label: "Roster planning",
    hint: "Board or zoomable tree — classes, leaders, teachers, and students",
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
    id: "register",
    label: "Student registration",
    hint: "Add children, contacts, attendance, allergies, and T-shirt size",
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
      return data.canViewContacts;
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
  if (allowed.includes("classes")) {
    return "classes";
  }
  return allowed[0] ?? "allergies";
}

type Draft = {
  id: string;
  childFullName: string;
  birthMonth: number;
  birthYear: number;
  allergiesCommon: string[];
  allergiesOther: string;
  comments: string;
  specialRequests: string;
  contact1Name: string;
  contact1Phone: string;
  contact2Name: string;
  contact2Phone: string;
  attendMon: boolean;
  attendTue: boolean;
  attendWed: boolean;
  attendThu: boolean;
  attendFri: boolean;
  tshirtSize: string;
  assignedTeamId: string;
  classId: string;
  paymentStatus: VbsRegistrationPaymentStatus;
  nametagExtraInstructions: string;
};

function emptyDraft(): Draft {
  const now = new Date();
  return {
    id: "",
    childFullName: "",
    birthMonth: now.getMonth() + 1,
    birthYear: now.getFullYear() - 6,
    allergiesCommon: [],
    allergiesOther: "",
    comments: "",
    specialRequests: "",
    contact1Name: "",
    contact1Phone: "",
    contact2Name: "",
    contact2Phone: "",
    attendMon: true,
    attendTue: true,
    attendWed: true,
    attendThu: true,
    attendFri: true,
    tshirtSize: "",
    assignedTeamId: "",
    classId: "",
    paymentStatus: "pending",
    nametagExtraInstructions: "",
  };
}

function draftFromStudent(student: VbsRegistrationStudent): Draft {
  return {
    id: student.id,
    childFullName: student.childFullName,
    birthMonth: student.birthMonth,
    birthYear: student.birthYear,
    allergiesCommon: [...student.allergiesCommon],
    allergiesOther: student.allergiesOther,
    comments: student.comments,
    specialRequests: student.specialRequests,
    contact1Name: student.contact1Name,
    contact1Phone: student.contact1Phone,
    contact2Name: student.contact2Name,
    contact2Phone: student.contact2Phone,
    attendMon: student.attendMon,
    attendTue: student.attendTue,
    attendWed: student.attendWed,
    attendThu: student.attendThu,
    attendFri: student.attendFri,
    tshirtSize: student.tshirtSize,
    assignedTeamId: student.assignedTeamId,
    classId: student.classId,
    paymentStatus: student.paymentStatus,
    nametagExtraInstructions: student.nametagExtraInstructions,
  };
}

export default function VbsRegistrationPage() {
  const { orgId = "" } = useParams();
  const { current: org } = useOrgs();
  const { filterDefault, working, prefsReady } = useOrgVbs();
  const [data, setData] = useState<VbsRegistrationWorkspace | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
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

  useEffect(() => {
    if (!data) {
      return;
    }
    const allowed = sectionsForWorkspace(data).map((item) => item.id);
    setTab(tabFromSearch(searchParams, allowed));
  }, [searchParams, data]);

  const reload = useCallback(async () => {
    const workspace = await api.vbsRegistration(orgId);
    setData(workspace);
    setError("");
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    api
      .vbsRegistration(orgId)
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
  }, [orgId]);

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
  const draftAge = ageFromBirthMonthYear(draft.birthMonth, draft.birthYear);

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
    setDraft((current) => {
      const set = new Set(current.allergiesCommon);
      if (set.has(label)) {
        set.delete(label);
      } else {
        set.add(label);
      }
      return { ...current, allergiesCommon: [...set] };
    });
  }

  function startNew() {
    setDraft(emptyDraft());
    setError("");
  }

  function editStudent(student: VbsRegistrationStudent) {
    setDraft(draftFromStudent(student));
    setTab("register");
    setSearchParams({}, { replace: true });
  }

  async function submitRegistration(event: FormEvent) {
    event.preventDefault();
    if (!data?.canWrite) {
      return;
    }
    await run(async () => {
      const result = await api.saveVbsRegistrationStudent(orgId, { ...draft });
      setDraft(draftFromStudent(result.student));
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
      if (draft.id === student.id) {
        setDraft(emptyDraft());
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
      setDraft((current) =>
        current.id === result.student.id ? draftFromStudent(result.student) : current,
      );
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
          <h1 className="vbs-plan-masthead-title">Student registration</h1>
          <p className="vbs-plan-masthead-empty muted">
            Register VBS children, track allergies and attendance, and print themed nametags for your crew.
          </p>
        </div>
        <div className="vbs-plan-masthead-aside">
          <ul className="vbs-plan-snapshot" aria-label="Registration counts">
            <li>
              <strong>{data.summary.total}</strong>
              <span>Registered</span>
            </li>
            <li>
              <strong>{data.summary.parentOnline}</strong>
              <span>Parent online</span>
            </li>
            <li>
              <strong>{data.summary.paymentPending}</strong>
              <span>Payment pending</span>
            </li>
            <li>
              <strong>{data.summary.unassigned}</strong>
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
            : "You can view registrations. A registration admin or org admin is needed to add students or generate nametags."}
        </p>
      ) : null}

      <section className="vbs-plan-sections" aria-labelledby="vbs-reg-sections-title">
        <h2 id="vbs-reg-sections-title" className="vbs-plan-sections-title">
          Registration workspace
        </h2>
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
                    if (item.id === "classes") {
                      params.delete("tab");
                    } else {
                      params.set("tab", item.id);
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

            {tab === "classes" ? (
              <>
                {data.publicRegistration && data.canWrite ? (
                  <PublicRegistrationLinkPanel
                    orgId={orgId}
                    settings={data.publicRegistration}
                    onUpdated={() => void reload()}
                  />
                ) : null}
                <VbsRegistrationRosterPlanning
                  orgId={orgId}
                  orgName={org?.name ?? ""}
                  data={data}
                  canWrite={data.canWrite}
                  onReload={reload}
                />
              </>
            ) : null}

            {tab === "contacts" ? <VbsRegistrationContactsPanel students={data.students} /> : null}

            {tab === "allergies" ? (
              <VbsRegistrationAllergiesPanel
                students={data.students}
                commonAllergies={data.commonAllergies}
                sharedWithCooking={data.canViewAllergies}
              />
            ) : null}

            {tab === "register" ? (
              <>
                <RegistrationForm
                  draft={draft}
                  setDraft={setDraft}
                  draftAge={draftAge}
                  data={data}
                  busy={busy}
                  onSubmit={submitRegistration}
                  onNew={startNew}
                  toggleAllergy={toggleAllergy}
                />
                <RegistrationRoster
                  students={data.students}
                  canWrite={data.canWrite}
                  busy={busy}
                  onEdit={editStudent}
                  onDelete={(student) => void removeStudent(student)}
                />
              </>
            ) : null}

            {tab === "nametags" ? (
              <NametagsPanel
                data={data}
                students={data.students}
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

function PublicRegistrationLinkPanel({
  orgId,
  settings,
  onUpdated,
}: {
  orgId: string;
  settings: { enabled: boolean; link: string };
  onUpdated: () => void;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [link, setLink] = useState(settings.link);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setEnabled(settings.enabled);
    setLink(settings.link);
  }, [settings.enabled, settings.link]);

  async function saveEnabled(next: boolean) {
    setBusy(true);
    setStatus("");
    try {
      const result = await api.updateVbsRegistrationPublic(orgId, { enabled: next });
      setEnabled(result.enabled);
      setLink(result.link);
      setStatus(next ? "Parent registration is open." : "Parent registration is closed.");
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
      const result = await api.updateVbsRegistrationPublic(orgId, { regenerateToken: true });
      setLink(result.link);
      setStatus("New parent link created.");
      onUpdated();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not regenerate link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="vbs-panel vbs-registration-public">
      <h2 className="vbs-plan-section-title">Parent registration (no login)</h2>
      <p className="muted vbs-task-field-hint">
        Share a link with families. Submissions appear on your roster as &quot;Parent&quot; entries. The URL is
        unlisted — anyone with the link can register when this is on.
      </p>
      <label className="vbs-registration-check">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => void saveEnabled(e.target.checked)}
        />
        Accept online parent registrations
      </label>
      <div className="vbs-registration-public-link">
        <input type="text" readOnly value={link} aria-label="Parent registration link" onFocus={(e) => e.target.select()} />
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
  onNew,
  toggleAllergy,
}: {
  draft: Draft;
  setDraft: (value: Draft | ((current: Draft) => Draft)) => void;
  draftAge: number;
  data: VbsRegistrationWorkspace;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onNew: () => void;
  toggleAllergy: (label: string) => void;
}) {
  const monthOptions = birthMonthOptions();
  const yearOptions = birthYearOptions(18);

  return (
    <form className="vbs-panel vbs-registration-form" onSubmit={onSubmit}>
      <div className="vbs-registration-form-head">
        <h2 className="vbs-plan-section-title">{draft.id ? "Edit student" : "Add a student"}</h2>
        <button type="button" className="ghost" disabled={busy} onClick={onNew}>
          Clear form
        </button>
      </div>

      <div className="vbs-plan-overview-block">
        <h3 className="vbs-plan-section-title">Child</h3>
        <label className="vbs-plan-field">
          Full name
          <input
            required
            disabled={!data.canWrite || busy}
            value={draft.childFullName}
            onChange={(e) => setDraft({ ...draft, childFullName: e.target.value })}
          />
        </label>
        <div className="vbs-plan-field-row">
          <label className="vbs-plan-field">
            Birth month
            <select
              required
              disabled={!data.canWrite || busy}
              value={draft.birthMonth}
              onChange={(e) => setDraft({ ...draft, birthMonth: Number(e.target.value) })}
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="vbs-plan-field">
            Birth year
            <select
              required
              disabled={!data.canWrite || busy}
              value={draft.birthYear}
              onChange={(e) => setDraft({ ...draft, birthYear: Number(e.target.value) })}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <div className="vbs-plan-field vbs-plan-field-readonly">
            <span className="vbs-plan-field-readonly-label">Age (today)</span>
            <strong className="vbs-plan-field-readonly-value">{draftAge}</strong>
          </div>
        </div>
        <label className="vbs-plan-field">
          T-shirt size
          <select
            disabled={!data.canWrite || busy}
            value={draft.tshirtSize}
            onChange={(e) => setDraft({ ...draft, tshirtSize: e.target.value })}
          >
            <option value="">Select size…</option>
            {data.tshirtSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label className="vbs-plan-field">
          Assigned team / crew
          <select
            disabled={!data.canWrite || busy}
            value={draft.assignedTeamId}
            onChange={(e) => setDraft({ ...draft, assignedTeamId: e.target.value })}
          >
            <option value="">Suggest from age on save…</option>
            {data.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="vbs-plan-field">
          Class (any class — age not enforced for staff)
          <select
            disabled={!data.canWrite || busy}
            value={draft.classId}
            onChange={(e) => setDraft({ ...draft, classId: e.target.value })}
          >
            <option value="">Suggest from age on save…</option>
            {data.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
                {cls.registrationClosed ? " (closed online)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="vbs-plan-field">
          Payment (offline)
          <select
            disabled={!data.canWrite || busy}
            value={draft.paymentStatus}
            onChange={(e) =>
              setDraft({ ...draft, paymentStatus: e.target.value as VbsRegistrationPaymentStatus })
            }
          >
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
          </select>
        </label>
      </div>

      <div className="vbs-plan-overview-block">
        <h3 className="vbs-plan-section-title">Allergies</h3>
        <fieldset className="vbs-registration-allergies" disabled={!data.canWrite || busy}>
          <legend className="muted">Common allergies</legend>
          <ul className="vbs-registration-allergy-grid">
            {data.commonAllergies.map((label) => (
              <li key={label}>
                <label className="vbs-registration-check">
                  <input
                    type="checkbox"
                    checked={draft.allergiesCommon.includes(label)}
                    onChange={() => toggleAllergy(label)}
                  />
                  {label}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <label className="vbs-plan-field">
          Other allergies (type any not listed)
          <textarea
            rows={2}
            disabled={!data.canWrite || busy}
            value={draft.allergiesOther}
            onChange={(e) => setDraft({ ...draft, allergiesOther: e.target.value })}
            placeholder="e.g. red dye, cats, bee stings"
          />
        </label>
      </div>

      <div className="vbs-plan-overview-block">
        <h3 className="vbs-plan-section-title">Contacts</h3>
        <div className="vbs-plan-field-row">
          <label className="vbs-plan-field">
            Primary contact full name
            <input
              disabled={!data.canWrite || busy}
              value={draft.contact1Name}
              onChange={(e) => setDraft({ ...draft, contact1Name: e.target.value })}
            />
          </label>
          <label className="vbs-plan-field">
            Primary contact phone
            <input
              type="tel"
              disabled={!data.canWrite || busy}
              value={draft.contact1Phone}
              onChange={(e) => setDraft({ ...draft, contact1Phone: e.target.value })}
            />
          </label>
        </div>
        <div className="vbs-plan-field-row">
          <label className="vbs-plan-field">
            Second contact full name
            <input
              disabled={!data.canWrite || busy}
              value={draft.contact2Name}
              onChange={(e) => setDraft({ ...draft, contact2Name: e.target.value })}
            />
          </label>
          <label className="vbs-plan-field">
            Second contact phone
            <input
              type="tel"
              disabled={!data.canWrite || busy}
              value={draft.contact2Phone}
              onChange={(e) => setDraft({ ...draft, contact2Phone: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="vbs-plan-overview-block">
        <h3 className="vbs-plan-section-title">Expected attendance (Mon–Fri)</h3>
        <ul className="vbs-registration-weekdays">
          {(
            [
              ["attendMon", "Monday"],
              ["attendTue", "Tuesday"],
              ["attendWed", "Wednesday"],
              ["attendThu", "Thursday"],
              ["attendFri", "Friday"],
            ] as const
          ).map(([key, label]) => (
            <li key={key}>
              <label className="vbs-registration-check">
                <input
                  type="checkbox"
                  disabled={!data.canWrite || busy}
                  checked={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                />
                {label}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="vbs-plan-overview-block">
        <label className="vbs-plan-field">
          Special requests (optional)
          <textarea
            rows={2}
            disabled={!data.canWrite || busy}
            value={draft.specialRequests}
            onChange={(e) => setDraft({ ...draft, specialRequests: e.target.value })}
            placeholder="Buddy requests, accessibility, team preference…"
          />
        </label>
        <label className="vbs-plan-field">
          Comments (optional)
          <textarea
            rows={2}
            disabled={!data.canWrite || busy}
            value={draft.comments}
            onChange={(e) => setDraft({ ...draft, comments: e.target.value })}
          />
        </label>
      </div>

      {data.canWrite ? (
        <div className="vbs-plan-form-actions">
          <button type="submit" className="vbs-plan-save" disabled={busy}>
            {draft.id ? "Save changes" : "Add student"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function RegistrationRoster({
  students,
  canWrite,
  busy,
  onEdit,
  onDelete,
}: {
  students: VbsRegistrationStudent[];
  canWrite: boolean;
  busy: boolean;
  onEdit: (student: VbsRegistrationStudent) => void;
  onDelete: (student: VbsRegistrationStudent) => void;
}) {
  return (
    <section className="vbs-panel vbs-registration-roster" aria-label="Registered students">
      <h2 className="vbs-plan-section-title">Roster</h2>
      {students.length === 0 ? (
        <p className="muted">No students registered yet.</p>
      ) : (
        <div className="vbs-spreadsheet-scroll">
          <table className="vbs-spreadsheet vbs-registration-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Source</th>
                <th>Age</th>
                <th>Team</th>
                <th>Class</th>
                <th>Pay</th>
                <th>Allergies</th>
                <th>Attendance</th>
                <th>Shirt</th>
                {canWrite ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td>{student.childFullName}</td>
                  <td>
                    <span className="vbs-registration-source">
                      {student.source === "public" ? "Parent online" : "Staff"}
                    </span>
                  </td>
                  <td>{student.ageYears}</td>
                  <td>{student.assignedTeamName || "—"}</td>
                  <td>{student.className || "—"}</td>
                  <td>{student.paymentStatus}</td>
                  <td>{allergiesLabel(student.allergiesCommon, student.allergiesOther)}</td>
                  <td>{attendanceSummary(student)}</td>
                  <td>{student.tshirtSize || "—"}</td>
                  {canWrite ? (
                    <td className="vbs-registration-row-actions">
                      <button type="button" className="ghost" disabled={busy} onClick={() => onEdit(student)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost danger"
                        disabled={busy}
                        onClick={() => onDelete(student)}
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
        <p className="vbs-plan-callout">Register at least one student on the Student registration tab first.</p>
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
                    {student.childFullName}
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
