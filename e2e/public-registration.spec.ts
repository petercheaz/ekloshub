import { purgeTestArtifacts, sessionCall } from "./api-session";
import { captureStep } from "./capture";
import { loginViaUi } from "./auth";
import { testName } from "./test-data";
import { e2e } from "./env";
import { documentedTest, expect } from "./test-doc";

documentedTest(
  "public parent link — UI form submits test_ child",
  "Enables public registration, completes the parent registration form in the browser (no staff login), confirms the thank-you screen, then removes the student and disables the link.",
  async ({ page, browser }, testInfo) => {
    const orgId = e2e.orgId;
    await loginViaUi(page, e2e.personas.registrationAdmin, testInfo);
    const enable = await sessionCall(page, "PATCH", `/api/orgs/${orgId}/vbs-registration/public`, {
      enabled: true,
      regenerateToken: true,
    });
    expect(enable.ok).toBeTruthy();
    const link = (enable.json as { link?: string })?.link;
    expect(link).toBeTruthy();
    const tokenMatch = link!.match(/\/register\/([^/?#]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();
    const token = tokenMatch![1]!;

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`/register/${token}`);
    await captureStep(publicPage, testInfo, "public-registration-form");
    await expect(publicPage.getByRole("heading", { name: /vbs registration/i })).toBeVisible({ timeout: 20_000 });

    const childFullName = testName("public_child");
    await publicPage.getByLabel(/^full name$/i).fill(childFullName);
    await publicPage.getByLabel(/^Male \(M\)$/i).check();
    await publicPage.getByLabel(/primary contact full name/i).fill("E2E Parent");
    await publicPage.getByLabel(/primary contact phone/i).fill("+12065550100");
    await publicPage.getByLabel(/primary contact email/i).fill("e2e.parent@example.com");
    await publicPage.getByRole("checkbox", { name: /understand and agree/i }).check();
    await publicPage.getByRole("button", { name: /submit registration/i }).click();
    await expect(publicPage.getByRole("heading", { name: /thank you/i })).toBeVisible({ timeout: 20_000 });
    await captureStep(publicPage, testInfo, "public-registration-success");
    await publicContext.close();

    const after = await sessionCall(page, "GET", `/api/orgs/${orgId}/vbs-registration`);
    const student = (after.json as { students: { id: string; childFullName: string }[] }).students.find(
      (s) => s.childFullName === childFullName,
    );
    expect(student).toBeTruthy();
    await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-registration/students/${student!.id}`);

    await sessionCall(page, "PATCH", `/api/orgs/${orgId}/vbs-registration/public`, { enabled: false });
    await purgeTestArtifacts(page, orgId);
  },
);
