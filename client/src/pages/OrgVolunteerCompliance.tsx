import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import { useOrgs } from "../orgs";
import type { VolunteerComplianceVolunteer, VolunteerComplianceWorkspace } from "../types";
import { orgRoleLabels } from "@org-permissions";

const statusLabels: Record<VolunteerComplianceVolunteer["backgroundCheckStatus"], string> = {
  not_started: "Not started",
  pending: "Pending",
  cleared: "Cleared",
};

function displayName(v: VolunteerComplianceVolunteer) {
  const name = [v.firstName, v.lastName].filter(Boolean).join(" ").trim();
  return name || v.username;
}

export default function OrgVolunteerCompliancePage() {
  const { orgId = "" } = useParams();
  const { current: org, canManageMembers } = useOrgs();
  const [data, setData] = useState<VolunteerComplianceWorkspace | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const next = await api.volunteerCompliance(orgId);
    setData(next);
    setError("");
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    api
      .volunteerCompliance(orgId)
      .then((next) => {
        if (!cancelled) {
          setData(next);
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

  async function setStatus(volunteer: VolunteerComplianceVolunteer, status: string) {
    setBusy(volunteer.username);
    try {
      const next = await api.updateVolunteerBackgroundCheck(orgId, volunteer.username, status);
      setData(next);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setBusy(null);
    }
  }

  if (!canManageMembers) {
    return <p className="status">Only org admins or registration admins can manage background checks.</p>;
  }
  if (error && !data) {
    return <p className="status">{error}</p>;
  }
  if (!data) {
    return <p className="status">Loading volunteers…</p>;
  }

  return (
    <OrgWorkspacePage
      eyebrow={org?.name ?? "Organization"}
      title="Volunteer background checks"
      tagline="Track child-safety screening for every org member in one place. Update status inline — no need to open each profile."
    >
      <section className="vbs-panel">
        <ul className="vbs-plan-snapshot" aria-label="Background check summary">
          <li>
            <strong>{data.summary.cleared}</strong>
            <span>Cleared</span>
          </li>
          <li>
            <strong>{data.summary.pending}</strong>
            <span>Pending</span>
          </li>
          <li>
            <strong>{data.summary.notStarted}</strong>
            <span>Not started</span>
          </li>
          <li>
            <strong>{data.summary.total}</strong>
            <span>Volunteers</span>
          </li>
        </ul>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <div className="vbs-spreadsheet-scroll">
        <table className="vbs-spreadsheet vbs-volunteer-compliance-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Login</th>
              <th>Org role</th>
              <th>Background check</th>
            </tr>
          </thead>
          <tbody>
            {data.volunteers.map((volunteer) => (
              <tr key={volunteer.username}>
                <td>{displayName(volunteer)}</td>
                <td className="muted">{volunteer.username}</td>
                <td>{orgRoleLabels[volunteer.role] ?? volunteer.role}</td>
                <td>
                  <select
                    className="vbs-inline-status-select"
                    value={volunteer.backgroundCheckStatus}
                    disabled={busy === volunteer.username}
                    aria-label={`Background check for ${displayName(volunteer)}`}
                    onChange={(e) => void setStatus(volunteer, e.target.value)}
                  >
                    {data.statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {statusLabels[option]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted vbs-task-field-hint">
        Exported Excel workbooks include this column on the Volunteers sheet. Cleared means screening is on file for
        VBS week.
      </p>
    </OrgWorkspacePage>
  );
}
