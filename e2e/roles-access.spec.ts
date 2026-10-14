import { test } from "@playwright/test";
import { loginViaUi, logoutViaUi } from "./auth";
import { allPersonas, e2e } from "./env";
import { expect, summaryAnnotation } from "./test-doc";

const orgId = e2e.orgId;

const personaSummary: Record<string, string> = {
  platformAdmin: "Platform admin can open plan and registration, sees reimbursements, and opens notification profile.",
  orgAdmin: "Org admin can open plan and registration with full tabs, sees reimbursements, and opens notification profile.",
  orgWrite: "Org write member can open plan and registration; reimbursements tab is hidden; profile is available.",
  orgRead: "Org read-only member can view plan and registration; reimbursements tab is hidden; profile is available.",
  registrationAdmin: "Registration admin can open plan and registration with roster tools; no reimbursements tab.",
  teamAdmin: "Team admin can open plan and registration; reimbursements tab is hidden; profile is available.",
};

for (const persona of allPersonas()) {
  const summary =
    personaSummary[persona.key] ??
    `${persona.role} (${persona.username}) opens core org routes and profile to verify role-based UI.`;
  test(
    `${persona.role} (${persona.username}) — core routes`,
    summaryAnnotation(summary),
    async ({ page }, testInfo) => {
      await loginViaUi(page, persona, testInfo);
      await page.goto(`/org/${orgId}/vbs-plan`);
      await expect(page.getByRole("tab", { name: /overview/i })).toBeVisible({ timeout: 30_000 });

      const reimbTab = page.getByRole("tab", { name: /reimbursements/i });
      const expectReimb = persona.key === "orgAdmin" || persona.key === "platformAdmin";
      if (expectReimb) {
        await expect(reimbTab).toBeVisible();
      } else {
        await expect(reimbTab).toHaveCount(0);
      }

      await page.goto(`/org/${orgId}/registration`);
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });

      const canRegistration =
        persona.key === "orgAdmin" ||
        persona.key === "registrationAdmin" ||
        persona.key === "platformAdmin" ||
        persona.key === "orgWrite";
      if (canRegistration) {
        await expect(page.getByRole("tab", { name: /roster|students|classes/i }).first()).toBeVisible();
      }

      await page.goto("/profile");
      await expect(page.getByRole("heading", { name: /notification profile/i })).toBeVisible();
      await expect(page.getByText(/contact for delivery/i)).toBeVisible();

      await logoutViaUi(page);
    },
  );
}
