import { test as base } from "@playwright/test";
import { loginViaUi } from "./auth";
import { purgeTestArtifacts } from "./api-session";
import { e2e, type E2EPersona } from "./env";

type PersonaFixtures = {
  orgAdminPage: { page: import("@playwright/test").Page; orgId: string };
  registrationAdminPage: { page: import("@playwright/test").Page; orgId: string };
};

async function loginPersona(
  page: import("@playwright/test").Page,
  persona: E2EPersona,
  testInfo: import("@playwright/test").TestInfo,
) {
  await loginViaUi(page, persona, testInfo);
  return { page, orgId: e2e.orgId };
}

export const test = base.extend<PersonaFixtures>({
  orgAdminPage: async ({ page }, use, testInfo) => {
    const ctx = await loginPersona(page, e2e.personas.orgAdmin, testInfo);
    await use(ctx);
    await purgeTestArtifacts(page, e2e.orgId);
  },
  registrationAdminPage: async ({ page }, use, testInfo) => {
    const ctx = await loginPersona(page, e2e.personas.registrationAdmin, testInfo);
    await use(ctx);
    await purgeTestArtifacts(page, e2e.orgId);
  },
});

export { expect } from "@playwright/test";
