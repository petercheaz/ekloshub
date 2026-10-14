import { ensurePlanExists, fetchOrgTeams, purgeTestArtifacts, sessionCall } from "./api-session";
import { loginViaUi } from "./auth";
import { captureStep } from "./capture";
import { e2e } from "./env";
import { TINY_PNG_PREVIEW } from "./test-assets";
import { testName } from "./test-data";
import { documentedTest, expect } from "./test-doc";

const orgId = e2e.orgId;
const emptySnapshot = {
  layers: [],
  pixels: {},
  doc: { width: 400, height: 300 },
  activeLayerId: null,
};

documentedTest(
  "org admin — cooking settings, contact church, direct message, board post, team, room design, Photoshoppe",
  "Exercises org-only workflows: cooking extra instructions round-trip, contact form submit, DM create/delete, board post visible on plan, team CRUD on Manage teams, and Photoshoppe document save visible in the browser.",
  async ({ page }, testInfo) => {
    await loginViaUi(page, e2e.personas.orgAdmin, testInfo);
    await ensurePlanExists(page, orgId);

    const cookingGet = await sessionCall(page, "GET", `/api/orgs/${orgId}/cooking-plan`);
    expect(cookingGet.ok).toBeTruthy();
    const priorInstructions = (cookingGet.json as { extraInstructions?: string })?.extraInstructions ?? "";
    const instructions = testName("cooking_note");
    const cookingPatch = await sessionCall(page, "PATCH", `/api/orgs/${orgId}/cooking-plan`, {
      extraInstructions: instructions,
    });
    expect(cookingPatch.ok).toBeTruthy();
    await page.goto(`/org/${orgId}/cooking-plan`);
    await captureStep(page, testInfo, "cooking-plan");
    await expect(page.locator("body")).toContainText(instructions, { timeout: 20_000 });
    await sessionCall(page, "PATCH", `/api/orgs/${orgId}/cooking-plan`, {
      extraInstructions: priorInstructions,
    });

    const contactSubject = testName("contact");
    const contactRes = await sessionCall(page, "POST", `/api/orgs/${orgId}/contact`, {
      subject: contactSubject,
      message: "E2E org contact message body",
      scope: "organization",
      teamIds: [],
    });
    expect(contactRes.ok).toBeTruthy();
    await page.goto(`/org/${orgId}/contact`);
    await captureStep(page, testInfo, "org-contact");
    await expect(page.getByRole("heading", { name: /contact/i })).toBeVisible();

    const msgBody = testName("dm");
    const msgRes = await sessionCall(
      page,
      "POST",
      "/api/messages",
      {
        to: [e2e.personas.orgRead.username],
        body: msgBody,
        teams: [],
      },
      { tenantId: orgId },
    );
    expect(msgRes.ok).toBeTruthy();
    const threadId = (msgRes.json as { threadId?: string })?.threadId;
    expect(threadId).toBeTruthy();
    await page.goto(`/org/${orgId}/messages`);
    await captureStep(page, testInfo, "messages");
    await expect(page.getByText(msgBody)).toBeVisible({ timeout: 20_000 });
    await sessionCall(page, "DELETE", `/api/messages/${threadId}`, undefined, { tenantId: orgId });

    const boardTitle = testName("board");
    const boardRes = await sessionCall(page, "POST", `/api/orgs/${orgId}/vbs-plan/board/posts`, {
      title: boardTitle,
      body: "E2E board post body",
      teamId: "",
    });
    expect(boardRes.ok).toBeTruthy();
    await page.goto(`/org/${orgId}/vbs-plan?tab=board`);
    await captureStep(page, testInfo, "board-with-test-post");
    await expect(page.getByText(boardTitle)).toBeVisible({ timeout: 20_000 });

    const teamName = testName("team");
    const teamRes = await sessionCall(page, "POST", `/api/orgs/${orgId}/teams`, {
      name: teamName,
      members: e2e.personas.orgAdmin.username,
    });
    expect(teamRes.ok).toBeTruthy();
    const teamId = (teamRes.json as { id?: string })?.id;
    expect(teamId).toBeTruthy();
    await page.goto(`/org/${orgId}/teams`);
    await captureStep(page, testInfo, "manage-teams");
    await expect(page.getByText(teamName)).toBeVisible({ timeout: 20_000 });
    await sessionCall(page, "DELETE", `/api/orgs/${orgId}/teams/${teamId}`);
    const teamsAfter = await fetchOrgTeams(page, orgId);
    expect(teamsAfter.teams.some((t) => t.id === teamId)).toBeFalsy();

    await page.goto(`/org/${orgId}/room-design`);
    await captureStep(page, testInfo, "room-design");
    await expect(page.getByRole("heading").first()).toBeVisible();

    const docName = testName("ps_doc");
    const psRes = await sessionCall(page, "POST", `/api/orgs/${orgId}/photoshoppe/documents`, {
      name: docName,
      parentId: null,
      snapshot: emptySnapshot,
      preview: TINY_PNG_PREVIEW,
    });
    expect(psRes.ok).toBeTruthy();
    const browse = await sessionCall(page, "GET", `/api/orgs/${orgId}/photoshoppe`);
    expect(browse.ok).toBeTruthy();
    const documents = (browse.json as { documents?: { name: string }[] })?.documents ?? [];
    expect(documents.some((d) => d.name === docName)).toBeTruthy();
    await page.goto(`/org/${orgId}/photoshoppe-lite`);
    await captureStep(page, testInfo, "photoshoppe");
    await expect(page.getByRole("heading").first()).toBeVisible();

    await page.goto(`/org/${orgId}/manage`);
    await captureStep(page, testInfo, "manage-org");
    await expect(page.locator("body")).toContainText(/member|organization/i);

    await purgeTestArtifacts(page, orgId);
  },
);
