import { test as base, expect } from "@playwright/test";

export { expect };

/** Plain-English description shown in the validate report (keep in sync with what the test does). */
export function summaryAnnotation(summary: string) {
  return { annotation: [{ type: "summary" as const, description: summary }] };
}

export function documentedTest(
  title: string,
  summary: string,
  fn: Parameters<typeof base>[2],
) {
  return base(title, summaryAnnotation(summary), fn);
}

export function documentedDescribe(title: string, summary: string, fn: () => void) {
  base.describe(title, { annotation: [{ type: "summary", description: summary }] }, fn);
}

export function summaryFromTest(testCase: { annotations: { type: string; description?: string }[] }) {
  const direct = testCase.annotations.find((a) => a.type === "summary")?.description?.trim();
  if (direct) {
    return direct;
  }
  const inherited = testCase.annotations.find((a) => a.type === "describe-summary")?.description?.trim();
  return inherited ?? "";
}
