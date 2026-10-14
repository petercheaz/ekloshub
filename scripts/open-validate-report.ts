import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const reportPath = path.join(process.cwd(), "e2e-report", "index.html");

if (!fs.existsSync(reportPath)) {
  console.error("No report at e2e-report/index.html — run npm run validate or npm run test:e2e first.");
  process.exit(1);
}

const abs = path.resolve(reportPath);
const platform = process.platform;
try {
  if (platform === "darwin") {
    execSync(`open "${abs}"`, { stdio: "inherit" });
  } else if (platform === "win32") {
    execSync(`start "" "${abs}"`, { stdio: "inherit", shell: "true" });
  } else {
    execSync(`xdg-open "${abs}"`, { stdio: "inherit" });
  }
  console.log(`Opened ${abs}`);
} catch {
  console.log(`Report ready: file://${abs}`);
}
