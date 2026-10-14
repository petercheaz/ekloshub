import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";
import { readE2EHeadless, readE2EWorkers } from "./e2e/env.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const headless = readE2EHeadless();
const workers = readE2EWorkers(headless);
const baseURL = process.env.E2E_BASE_URL?.trim() || "http://localhost:5173";

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  // No retries: a flake or regression must fail the run, not be masked.
  retries: 0,
  forbidOnly: !!process.env.CI,
  fullyParallel: headless,
  workers,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"], ["./e2e/reporters/validate-report.ts"]],
  use: {
    baseURL,
    headless,
    trace: "on",
    screenshot: "on",
    video: "off",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
