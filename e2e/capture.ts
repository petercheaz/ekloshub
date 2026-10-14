import type { Page, TestInfo } from "@playwright/test";

const stepCounter = new WeakMap<TestInfo, number>();

/** Attach a full-page screenshot with ordered `step-NNN-label` name for the validate report. */
export async function captureStep(page: Page, testInfo: TestInfo, label: string) {
  const n = (stepCounter.get(testInfo) ?? 0) + 1;
  stepCounter.set(testInfo, n);
  const safe = label.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const name = `step-${String(n).padStart(3, "0")}-${safe || "screen"}`;
  const body = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body, contentType: "image/png" });
}
