import { purgeTestArtifacts, sessionCall } from "./api-session";
import { loginViaUi } from "./auth";
import { captureStep } from "./capture";
import { e2e } from "./env";
import { testName } from "./test-data";
import { documentedTest, expect } from "./test-doc";

const orgId = e2e.orgId;

documentedTest(
  "org write — setup post, curriculum review, share listing, and hub pages",
  "Creates a test_ setup photo post and deletes it, submits a curriculum review and sees it on Reviews, adds a share listing visible on Share, and confirms home and about render.",
  async ({ page }, testInfo) => {
    await loginViaUi(page, e2e.personas.orgWrite, testInfo);

    await page.goto("/");
    await captureStep(page, testInfo, "home");
    await expect(page.getByRole("navigation").first()).toBeVisible();

    await page.goto("/about");
    await captureStep(page, testInfo, "about");
    await expect(page.getByRole("heading").first()).toBeVisible();

    const setupTitle = testName("setup");
    const setupRes = await sessionCall(
      page,
      "POST",
      "/api/setups",
      {
      year: 2026,
      publisherId: "group",
      title: setupTitle,
      body: "E2E setup ideas and notes for validation.",
      videoUrl: "",
      pictures: [],
      attachments: [],
      },
      { tenantId: orgId },
    );
    expect(setupRes.ok).toBeTruthy();
    const setupId = (setupRes.json as { id?: string })?.id;
    expect(setupId).toBeTruthy();
    await page.goto(`/org/${orgId}/setup`);
    await captureStep(page, testInfo, "setup-with-test-post");
    await expect(page.getByText(setupTitle)).toBeVisible({ timeout: 20_000 });
    await sessionCall(page, "DELETE", `/api/setups/${setupId}`, undefined, { tenantId: orgId });

    const curriculum = await sessionCall(page, "GET", "/api/curriculum?year=2026", undefined, {
      tenantId: orgId,
    });
    expect(curriculum.ok).toBeTruthy();
    const programs = (curriculum.json as { programs?: { id: string }[] })?.programs ?? [];
    const programId = programs[0]?.id ?? "group-2026";
    const reviewNote = testName("review");
    const reviewRes = await sessionCall(
      page,
      "POST",
      "/api/reviews",
      {
      programId,
      biblicalTeaching: 4,
      merchHelp: 4,
      fun: 4,
      whatPeopleSay: reviewNote,
      biblicalTeachingNotes: "",
      merchHelpNotes: "",
      funNotes: "",
      criticisms: "",
      cost: "",
      },
      { tenantId: orgId },
    );
    expect(reviewRes.ok).toBeTruthy();
    const curriculumAfter = await sessionCall(page, "GET", "/api/curriculum?year=2026", undefined, {
      tenantId: orgId,
    });
    expect(curriculumAfter.ok).toBeTruthy();
    const programsAfter = (curriculumAfter.json as { programs?: { reviews: { whatPeopleSay: string }[] }[] })
      ?.programs ?? [];
    expect(
      programsAfter.some((p) => p.reviews.some((r) => r.whatPeopleSay === reviewNote)),
    ).toBeTruthy();
    await page.goto(`/org/${orgId}/reviews`);
    await captureStep(page, testInfo, "reviews-page");
    await expect(page.getByRole("heading").first()).toBeVisible();

    const shareTitle = testName("share");
    const shareRes = await sessionCall(
      page,
      "POST",
      "/api/shares",
      {
      year: 2026,
      publisherId: "group",
      title: shareTitle,
      item: "Decor",
      details: "E2E leftover materials",
      availableOn: "2026-08-01",
      contact: e2e.personas.orgWrite.username,
      location: "Seattle",
      videoUrl: "",
      attachments: [],
      },
      { tenantId: orgId },
    );
    expect(shareRes.ok).toBeTruthy();
    await page.goto(`/org/${orgId}/share`);
    await captureStep(page, testInfo, "share-with-test-listing");
    await expect(page.getByText(shareTitle)).toBeVisible({ timeout: 20_000 });

    await purgeTestArtifacts(page, orgId);
  },
);
