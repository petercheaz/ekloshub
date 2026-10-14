import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export type E2EPersonaKey =
  | "platformAdmin"
  | "orgAdmin"
  | "registrationAdmin"
  | "orgWrite"
  | "orgRead"
  | "teamAdmin";

export type E2EPersona = {
  key: E2EPersonaKey;
  username: string;
  password: string;
  role: string;
};

function pass(envKey: string, fallbackUser?: string) {
  const v = process.env[envKey]?.trim();
  if (v) {
    return v;
  }
  const shared = process.env.E2E_DEFAULT_PASSWORD?.trim();
  if (shared) {
    return shared;
  }
  if (fallbackUser === "admin") {
    return process.env.AUTH_PASSWORD?.trim() ?? "vbs-dev";
  }
  return process.env.AUTH_PASSWORD?.trim() ?? "vbs-dev";
}

function user(envKey: string, defaultUsername: string) {
  return process.env[envKey]?.trim() || defaultUsername;
}

export const e2e = {
  orgId: process.env.E2E_ORG_ID?.trim() || "org-cornerstone-seattle",
  apiUrl: process.env.E2E_API_URL?.trim() || "http://localhost:3000",
  baseUrl: process.env.E2E_BASE_URL?.trim() || "http://localhost:5173",
  personas: {
    platformAdmin: {
      key: "platformAdmin" as const,
      username: user("E2E_PLATFORM_ADMIN_USERNAME", "admin"),
      password: pass("E2E_PLATFORM_ADMIN_PASSWORD", "admin"),
      role: "platform_admin",
    },
    orgAdmin: {
      key: "orgAdmin" as const,
      username: user("E2E_ORG_ADMIN_USERNAME", "pcheaz@gmail.com"),
      password: pass("E2E_ORG_ADMIN_PASSWORD"),
      role: "org_admin",
    },
    registrationAdmin: {
      key: "registrationAdmin" as const,
      username: user("E2E_REGISTRATION_ADMIN_USERNAME", "patti.tam@gmail.com"),
      password: pass("E2E_REGISTRATION_ADMIN_PASSWORD"),
      role: "registration_admin",
    },
    orgWrite: {
      key: "orgWrite" as const,
      username: user("E2E_ORG_WRITE_USERNAME", "mark.yamashita"),
      password: pass("E2E_ORG_WRITE_PASSWORD"),
      role: "org_write",
    },
    orgRead: {
      key: "orgRead" as const,
      username: user("E2E_ORG_READ_USERNAME", "e2e.org.read@cornerstone.test"),
      password: pass("E2E_ORG_READ_PASSWORD"),
      role: "org_read",
    },
    teamAdmin: {
      key: "teamAdmin" as const,
      username: user("E2E_TEAM_ADMIN_USERNAME", "e2e.team.admin@cornerstone.test"),
      password: pass("E2E_TEAM_ADMIN_PASSWORD"),
      role: "org_team_admin",
    },
  } satisfies Record<E2EPersonaKey, E2EPersona>,
};

export function allPersonas(): E2EPersona[] {
  return Object.values(e2e.personas);
}

/** Headless unless .env explicitly sets E2E_PLAYWRIGHT_HEADLESS=true|1|yes */
export function readE2EHeadless() {
  const raw = (process.env.E2E_PLAYWRIGHT_HEADLESS ?? "false").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function readE2EWorkers(_headless: boolean) {
  const raw = process.env.E2E_WORKERS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return Math.floor(n);
    }
  }
  // One worker by default: all specs share E2E_ORG_ID and purgeTestArtifacts deletes every test_* row.
  return 1;
}
