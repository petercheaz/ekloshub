import { ensurePlanExists, fetchVbsPlan, purgeTestArtifacts, sessionCall } from "./api-session";
import { loginViaUi } from "./auth";
import { testName } from "./test-data";
import { e2e } from "./env";
import { documentedTest, expect } from "./test-doc";

documentedTest(
  "org admin — reimbursement queue shows submitted test_ receipt",
  "Creates a plan task with test_ title and submitted reimbursement status, verifies it appears on the Reimbursements tab, then deletes the task.",
  async ({ page }, testInfo) => {
    await loginViaUi(page, e2e.personas.orgAdmin, testInfo);
    const orgId = e2e.orgId;
    await ensurePlanExists(page, orgId);
    const title = testName("receipt");
    const create = await sessionCall(page, "POST", `/api/orgs/${orgId}/vbs-plan/tasks`, {
      title,
      description: "e2e reimbursement",
      notes: "",
      category: "supplies",
      status: "done",
      dueDate: "",
      assignedUsername: "",
      assignedTeamId: "",
      expenseAmount: 12.5,
      reimbursementStatus: "submitted",
    });
    expect(create.ok).toBeTruthy();
    const plan = await fetchVbsPlan(page, orgId);
    const task = plan.tasks.find((t) => t.title === title);
    expect(task).toBeTruthy();

    await page.goto(`/org/${orgId}/vbs-plan?tab=reimbursements`);
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });

    await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-plan/tasks/${task!.id}`);
    await purgeTestArtifacts(page, orgId);
  },
);
