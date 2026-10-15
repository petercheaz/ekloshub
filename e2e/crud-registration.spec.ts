import { fetchRegistration, sessionCall } from "./api-session";
import { test } from "./fixtures";
import { captureStep } from "./capture";
import { testName } from "./test-data";
import { expect, summaryAnnotation } from "./test-doc";

test.describe("Registration CRUD (test_ prefix)", () => {
  test(
    "registration admin — create and delete class and student",
    summaryAnnotation(
      "Creates a test_ class and student via API, confirms the class appears on Registration, then deletes both records.",
    ),
    async ({ registrationAdminPage }, testInfo) => {
    const { page, orgId } = registrationAdminPage;

    const sectionLabel = testName("class").replace(/^test_/, "").slice(0, 16);
    const classRes = await sessionCall(page, "POST", `/api/orgs/${orgId}/vbs-registration/classes`, {
      rotationIndex: 1,
      sectionLabel,
      minAge: 5,
      maxAge: 8,
      capacityMax: 20,
      registrationClosed: false,
    });
    expect(classRes.ok).toBeTruthy();
    let reg = await fetchRegistration(page, orgId);
    const cls = reg.classes.find((c) => c.sectionLabel === sectionLabel && c.rotationIndex === 1);
    expect(cls).toBeTruthy();

    await page.goto(`/org/${orgId}/registration?tab=classes`);
    await captureStep(page, testInfo, "registration-classes-with-test-class");
    await expect(page.getByText(cls!.name)).toBeVisible({ timeout: 20_000 });

    const childFullName = testName("student");
    const studentRes = await sessionCall(page, "POST", `/api/orgs/${orgId}/vbs-registration/students`, {
      childFullName,
      childGender: "M",
      birthMonth: 6,
      birthYear: 2018,
      classId: cls!.id,
      contact1Name: "E2E Parent",
      contact1Phone: "+12065550111",
      contact1Email: "e2e.parent@example.com",
      attendMon: true,
      attendTue: true,
      attendWed: true,
      attendThu: true,
      attendFri: true,
    });
    expect(studentRes.ok).toBeTruthy();
    reg = await fetchRegistration(page, orgId);
    const student = reg.students.find((s) => s.childFullName === childFullName);
    expect(student).toBeTruthy();

    await page.goto(`/org/${orgId}/registration?tab=register`);
    await captureStep(page, testInfo, "registration-register-tab-with-test-student");
    await expect(page.getByText(childFullName)).toBeVisible({ timeout: 20_000 });

    await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-registration/students/${student!.id}`);
    await sessionCall(page, "DELETE", `/api/orgs/${orgId}/vbs-registration/classes/${cls!.id}`);
    reg = await fetchRegistration(page, orgId);
    expect(reg.students.some((s) => s.id === student!.id)).toBeFalsy();
    expect(reg.classes.some((c) => c.id === cls!.id)).toBeFalsy();
    },
  );
});
