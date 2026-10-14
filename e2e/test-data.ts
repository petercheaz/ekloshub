/** Prefix for all E2E-created rows — purge after each test file run. */
export const TEST_PREFIX = "test_";

export function isTestArtifact(name: string) {
  return name.trim().toLowerCase().startsWith(TEST_PREFIX);
}

export function testName(label: string) {
  const safe = label.replace(/[^\w-]+/g, "_").slice(0, 40);
  return `${TEST_PREFIX}${safe}_${Date.now()}`;
}
