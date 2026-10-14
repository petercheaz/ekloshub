import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export default async function globalSetup() {
  try {
    execSync("npx playwright install chromium", { stdio: "inherit" });
  } catch {
    console.warn("Playwright browser install skipped or failed — run npm run test:e2e:setup");
  }

  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    console.warn("Missing .env — copy .env.example and set E2E_* passwords before running tests.");
  }

  execSync("tsx --env-file=.env scripts/e2e-ensure-users.ts", { stdio: "inherit" });
}
