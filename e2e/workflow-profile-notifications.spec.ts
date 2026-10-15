import { purgeTestArtifacts, sessionCall } from "./api-session";
import { loginViaUi, logoutViaUi } from "./auth";
import { captureStep } from "./capture";
import { e2e } from "./env";
import { testName } from "./test-data";
import { documentedTest, expect } from "./test-doc";

const orgId = e2e.orgId;

documentedTest(
  "member — profile contact save round-trip and notification bell mark-all-read",
  "Saves and restores notification profile contact fields, then after a public registration submission verifies org admin sees an in-app notification and can mark all read.",
  async ({ page, browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    await loginViaUi(page, e2e.personas.orgWrite, testInfo);
    const before = await sessionCall(page, "GET", "/api/profile/contact");
    expect(before.ok).toBeTruthy();
    const original = before.json as {
      email: string;
      phone: string;
      firstName: string;
      lastName: string;
    };

    await page.goto("/profile");
    await captureStep(page, testInfo, "profile-before-save");
    const testEmail = `test+e2e.${Date.now()}@cornerstone.test`;
    await page.getByLabel(/^email$/i).fill(testEmail);
    await page.getByRole("button", { name: /save contact info/i }).click();
    await expect(page.getByText(/saved contact info/i)).toBeVisible({ timeout: 15_000 });

    const saved = await sessionCall(page, "GET", "/api/profile/contact");
    expect((saved.json as { email: string }).email).toBe(testEmail);

    await sessionCall(page, "PATCH", "/api/profile/contact", original);
    await page.reload();
    await expect(page.getByLabel(/^email$/i)).toHaveValue(original.email || "");

    await logoutViaUi(page);
    await loginViaUi(page, e2e.personas.registrationAdmin, testInfo);
    const enable = await sessionCall(page, "PATCH", `/api/orgs/${orgId}/vbs-registration/public`, {
      enabled: true,
      regenerateToken: true,
    });
    expect(enable.ok).toBeTruthy();
    const link = (enable.json as { link?: string })?.link ?? "";
    const tokenMatch = link.match(/\/register\/([^/?#]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();
    const token = tokenMatch![1]!;

    const childFullName = testName("notify_child");
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`/register/${token}`);
    await publicPage.getByLabel(/^full name$/i).fill(childFullName);
    await publicPage.getByLabel(/^Female \(F\)$/i).check();
    await publicPage.getByLabel(/primary contact full name/i).fill("E2E Parent");
    await publicPage.getByLabel(/primary contact phone/i).fill("+12065550199");
    await publicPage.getByRole("checkbox", { name: /understand and agree/i }).check();
    await publicPage.getByRole("button", { name: /submit registration/i }).click();
    await expect(publicPage.getByRole("heading", { name: /thank you/i })).toBeVisible({ timeout: 20_000 });
    const thankYou = await publicPage.textContent("body");
    expect(thankYou).toContain(childFullName);
    await publicContext.close();

    await logoutViaUi(page);
    await loginViaUi(page, e2e.personas.orgAdmin, testInfo);
    await page.goto(`/org/${orgId}/vbs-plan`);
    await page.getByRole("button", { name: /notifications/i }).click();
    await captureStep(page, testInfo, "notifications-panel");
    await expect(page.getByText(/new parent registration/i).first()).toBeVisible({ timeout: 20_000 });
    const markAll = page.getByRole("button", { name: /mark all read/i });
    if (await markAll.isVisible()) {
      await markAll.click();
    }
    await expect(page.locator(".bell-count")).toHaveCount(0);

    const reg = await sessionCall(page, "GET", `/api/orgs/${orgId}/vbs-registration`);
    const student = (reg.json as { students: { id: string; childFullName: string }[] }).students.find(
      (s) => s.childFullName === childFullName,
    );
    if (student) {
      await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-registration/students/${student.id}`);
    }
    await sessionCall(page, "PATCH", `/api/orgs/${orgId}/vbs-registration/public`, { enabled: false });
    await purgeTestArtifacts(page, orgId);
  },
);
