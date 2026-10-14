import { ensurePlanExists, fetchVbsPlan, sessionCall } from "./api-session";
import { test } from "./fixtures";
import { captureStep } from "./capture";
import { testName } from "./test-data";
import { expect, summaryAnnotation } from "./test-doc";

test.describe("VBS plan CRUD (test_ prefix)", () => {
  test(
    "org admin — plan CRUD, section tabs, and schedule health",
    summaryAnnotation(
      "Creates test_ task, checklist item, station, and schedule slot via API; confirms each on the matching VBS Plan tab (plus Tasks, board, schedule health); then deletes all artifacts.",
    ),
    async ({ orgAdminPage }, testInfo) => {
      const { page, orgId } = orgAdminPage;
      await ensurePlanExists(page, orgId);

      const taskTitle = testName("task");
      const taskRes = await sessionCall(page, "POST", `/api/orgs/${orgId}/vbs-plan/tasks`, {
        title: taskTitle,
        description: "e2e",
        notes: "",
        category: "planning",
        status: "todo",
        dueDate: "",
        assignedUsername: "",
        assignedTeamId: "",
        expenseAmount: 0,
        reimbursementStatus: "none",
      });
      expect(taskRes.ok).toBeTruthy();

      let plan = await fetchVbsPlan(page, orgId);
      const task = plan.tasks.find((t) => t.title === taskTitle);
      expect(task).toBeTruthy();

      await page.goto(`/org/${orgId}/vbs-plan?tab=tasks`);
      await captureStep(page, testInfo, "plan-tasks-tab-with-test-task");
      await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 20_000 });

      const milestoneLabel = testName("milestone");
      const mileRes = await sessionCall(page, "POST", `/api/orgs/${orgId}/vbs-plan/checklist`, {
        category: "Before VBS",
        label: milestoneLabel,
        assignedTeamId: "",
        dueDate: "2026-12-01",
        notes: "",
      });
      expect(mileRes.ok).toBeTruthy();
      plan = await fetchVbsPlan(page, orgId);
      const item = plan.checklist.find((c) => c.label === milestoneLabel);
      expect(item).toBeTruthy();
      await page.goto(`/org/${orgId}/vbs-plan?tab=checklist`);
      await expect(page.getByRole("tab", { name: /checklist|milestones/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await captureStep(page, testInfo, "plan-checklist-tab");
      // Milestone presence is asserted via API; this tab visit confirms routing for checklist CRUD.

      const stationName = testName("station");
      const stationRes = await sessionCall(page, "POST", `/api/orgs/${orgId}/vbs-plan/stations`, {
        name: stationName,
        description: "",
        defaultTeamId: "",
      });
      expect(stationRes.ok).toBeTruthy();
      plan = await fetchVbsPlan(page, orgId);
      const station = plan.stations.find((s) => s.name === stationName);
      expect(station).toBeTruthy();
      await page.goto(`/org/${orgId}/vbs-plan?tab=stations`);
      await expect(page.getByRole("tab", { name: /stations/i })).toHaveAttribute("aria-selected", "true");
      await captureStep(page, testInfo, "plan-stations-tab");
      await expect(page.getByText(stationName)).toBeVisible({ timeout: 20_000 });

      await ensurePlanExists(page, orgId);
      const dayDate = "2026-07-07";
      const slotLabel = testName("schedule");
      const slotRes = await sessionCall(page, "POST", `/api/orgs/${orgId}/vbs-plan/schedule`, {
        dayDate,
        startsAt: "09:00",
        endsAt: "09:30",
        label: slotLabel,
        stationId: "",
        teamId: "",
        notes: "",
      });
      expect(slotRes.ok).toBeTruthy();
      plan = await fetchVbsPlan(page, orgId);
      const slot = plan.schedule.find((s) => s.label === slotLabel);
      expect(slot).toBeTruthy();
      await page.goto(`/org/${orgId}/vbs-plan?tab=schedule`);
      await expect(page.getByRole("tab", { name: /VBS daily schedule/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await captureStep(page, testInfo, "plan-schedule-tab");
      await expect(page.getByText(slotLabel).first()).toBeVisible({ timeout: 20_000 });

      await page.goto(`/org/${orgId}/vbs-plan?tab=board`);
      await expect(page.getByRole("tab", { name: /message board/i })).toHaveAttribute("aria-selected", "true");
      await captureStep(page, testInfo, "plan-board-tab");

      await page.goto(`/org/${orgId}/vbs-plan?tab=adherence`);
      await expect(page.getByRole("tab", { name: /schedule health/i })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByText(/schedule health/i).first()).toBeVisible();
      await expect(page.getByText(/plan workbooks/i)).toBeVisible();
      await captureStep(page, testInfo, "plan-schedule-health-tab");

      await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-plan/tasks/${task!.id}`);
      await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-plan/checklist/${item!.id}`);
      await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-plan/stations/${station!.id}`);
      await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-plan/schedule/${slot!.id}`);
      plan = await fetchVbsPlan(page, orgId);
      expect(plan.tasks.some((t) => t.id === task!.id)).toBeFalsy();
    },
  );
});
