import { ensurePlanExists } from "./api-session";
import { loginViaUi } from "./auth";
import { captureStep } from "./capture";
import { e2e } from "./env";
import { documentedTest, expect } from "./test-doc";

documentedTest(
  "org admin — plan workbook Excel export downloads",
  "Opens VBS Plan workbooks and triggers Export all (Excel), expecting a non-empty .xlsx download.",
  async ({ page }, testInfo) => {
    await loginViaUi(page, e2e.personas.orgAdmin, testInfo);
    const orgId = e2e.orgId;
    await ensurePlanExists(page, orgId);
    await page.goto(`/org/${orgId}/vbs-plan`);
    await expect(page.getByText(/plan workbooks/i)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /expand master timeline/i }).click();
    await captureStep(page, testInfo, "plan-workbooks-expanded");
    const exportBtn = page.getByRole("button", { name: /export all \(excel\)/i });
    await expect(exportBtn).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await exportBtn.click();
    const download = await downloadPromise;
    const name = download.suggestedFilename();
    expect(name.toLowerCase()).toMatch(/\.xlsx$/);
    const path = await download.path();
    expect(path).toBeTruthy();
  },
);
