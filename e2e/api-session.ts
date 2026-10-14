import type { Page } from "@playwright/test";
import { isTestArtifact } from "./test-data";

type VbsPlanWorkspace = {
  plan: { id: string } | null;
  tasks: { id: string; title: string }[];
  stations: { id: string; name: string }[];
  schedule: { id: string; label: string }[];
  checklist: { id: string; label: string }[];
  board?: { posts: { id: string; title: string }[] };
};

type RegistrationWorkspace = {
  students: { id: string; childFullName: string }[];
  classes: { id: string; name: string }[];
};

type OrgTeamsResponse = { teams: { id: string; name: string }[] };

type SetupRow = { id: string; title: string };

async function sessionCall(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
  options?: { tenantId?: string },
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const tenantId = options?.tenantId?.trim() || "";
  return page.evaluate(
    async ({ method, path, body, tenantId }) => {
      const headers: Record<string, string> = {};
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      if (tenantId) {
        headers["X-Tenant-Id"] = tenantId;
      }
      const res = await fetch(path, {
        method,
        credentials: "include",
        headers: Object.keys(headers).length ? headers : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { ok: res.ok, status: res.status, json };
    },
    { method, path, body, tenantId },
  );
}

export async function fetchVbsPlan(page: Page, orgId: string) {
  const res = await sessionCall(page, "GET", `/api/orgs/${orgId}/vbs-plan`);
  if (!res.ok) {
    throw new Error(`vbs-plan fetch failed: ${res.status}`);
  }
  return res.json as VbsPlanWorkspace;
}

export async function fetchRegistration(page: Page, orgId: string) {
  const res = await sessionCall(page, "GET", `/api/orgs/${orgId}/vbs-registration`);
  if (!res.ok) {
    throw new Error(`registration fetch failed: ${res.status}`);
  }
  return res.json as RegistrationWorkspace;
}

export async function fetchOrgTeams(page: Page, orgId: string) {
  const res = await sessionCall(page, "GET", `/api/orgs/${orgId}/teams`);
  if (!res.ok) {
    throw new Error(`teams fetch failed: ${res.status}`);
  }
  return res.json as OrgTeamsResponse;
}

export async function ensurePlanExists(page: Page, orgId: string) {
  const workspace = await fetchVbsPlan(page, orgId);
  if (workspace.plan) {
    return workspace;
  }
  const year = new Date().getFullYear() + 1;
  const res = await sessionCall(page, "PUT", `/api/orgs/${orgId}/vbs-plan`, {
    year,
    title: `${orgId} E2E plan`,
    publisherId: "group",
    programTitle: "E2E",
    location: "Test",
    startDate: `${year}-07-07`,
    endDate: `${year}-07-11`,
    dailyStart: "09:00",
    dailyEnd: "12:00",
    expectedKids: 10,
    coordinatorNotes: "",
    budgetAmount: 0,
    seedSchedule: false,
    seedTemplate: false,
  });
  if (!res.ok) {
    throw new Error(`Could not create plan: ${JSON.stringify(res.json)}`);
  }
  return fetchVbsPlan(page, orgId);
}

export async function purgeTestArtifacts(page: Page, orgId: string) {
  try {
    const plan = await fetchVbsPlan(page, orgId);
    for (const task of plan.tasks) {
      if (isTestArtifact(task.title)) {
        await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-plan/tasks/${task.id}`);
      }
    }
    for (const item of plan.checklist) {
      if (isTestArtifact(item.label)) {
        await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-plan/checklist/${item.id}`);
      }
    }
    for (const station of plan.stations) {
      if (isTestArtifact(station.name)) {
        await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-plan/stations/${station.id}`);
      }
    }
    for (const slot of plan.schedule) {
      if (isTestArtifact(slot.label)) {
        await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-plan/schedule/${slot.id}`);
      }
    }
    const posts = plan.board?.posts ?? [];
    for (const post of posts) {
      if (isTestArtifact(post.title)) {
        /* board posts have no delete API yet */
      }
    }
  } catch {
    /* plan may not exist for this org */
  }

  try {
    const reg = await fetchRegistration(page, orgId);
    for (const student of reg.students) {
      if (isTestArtifact(student.childFullName)) {
        await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-registration/students/${student.id}`);
      }
    }
    for (const cls of reg.classes) {
      if (isTestArtifact(cls.name)) {
        await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-registration/classes/${cls.id}`);
      }
    }
  } catch {
    /* registration not accessible */
  }

  try {
    const teams = await fetchOrgTeams(page, orgId);
    for (const team of teams.teams) {
      if (isTestArtifact(team.name)) {
        await sessionCall(page, "DELETE", `/api/orgs/${orgId}/teams/${team.id}`);
      }
    }
  } catch {
    /* teams not accessible */
  }

  try {
    const setups = await sessionCall(page, "GET", "/api/setups", undefined, { tenantId: orgId });
    if (setups.ok && Array.isArray(setups.json)) {
      for (const row of setups.json as SetupRow[]) {
        if (isTestArtifact(row.title)) {
          await sessionCall(page, "DELETE", `/api/setups/${row.id}`);
        }
      }
    }
  } catch {
    /* tenant setups */
  }
}

export { sessionCall };
