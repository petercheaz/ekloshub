import { expect, type Page, type TestInfo } from "@playwright/test";
import { captureStep } from "./capture";
import type { E2EPersona } from "./env";

export async function loginViaUi(page: Page, persona: E2EPersona, testInfo?: TestInfo) {
  await page.goto("/login");
  if (testInfo) {
    await captureStep(page, testInfo, "login-sign-in-page");
  }
  await page.locator("#username").fill(persona.username);
  await page.locator("#password").fill(persona.password);
  if (testInfo) {
    await captureStep(page, testInfo, "login-credentials-filled");
  }
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  if (testInfo) {
    await captureStep(page, testInfo, "login-after-submit");
  }
}

export async function logoutViaUi(page: Page) {
  const signOut = page.getByRole("button", { name: /sign out/i });
  if (await signOut.isVisible()) {
    await signOut.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 }).catch(async () => {
      await page.goto("/login");
    });
  } else {
    await page.goto("/login");
  }
}
