# E2E reference (VBS)

## Directory layout

```
e2e/
  roles-access.spec.ts
  crud-plan.spec.ts
  crud-registration.spec.ts
  routes-org.spec.ts
  routes-global.spec.ts
  reimbursement-flow.spec.ts
  public-registration.spec.ts
  site-coverage.ts
  test-doc.ts
  env.ts
  auth.ts
  test-data.ts
  api-session.ts
  fixtures.ts
  global-setup.ts
playwright.config.ts
scripts/e2e-ensure-users.ts
```

## Environment variables

```bash
E2E_BASE_URL=http://localhost:5173
E2E_API_URL=http://localhost:3000
E2E_ORG_ID=org-cornerstone-seattle
E2E_PLAYWRIGHT_HEADLESS=false
E2E_DEFAULT_PASSWORD=vbs-dev

E2E_PLATFORM_ADMIN_USERNAME=admin
E2E_PLATFORM_ADMIN_PASSWORD=vbs-dev
E2E_ORG_ADMIN_USERNAME=pcheaz@gmail.com
E2E_ORG_ADMIN_PASSWORD=vbs-dev
E2E_REGISTRATION_ADMIN_USERNAME=patti.tam@gmail.com
E2E_REGISTRATION_ADMIN_PASSWORD=vbs-dev
E2E_ORG_WRITE_USERNAME=mark.yamashita
E2E_ORG_WRITE_PASSWORD=vbs-dev
E2E_ORG_READ_USERNAME=e2e.org.read@cornerstone.test
E2E_ORG_READ_PASSWORD=vbs-dev
E2E_TEAM_ADMIN_USERNAME=e2e.team.admin@cornerstone.test
E2E_TEAM_ADMIN_PASSWORD=vbs-dev
E2E_TEAM_NAME=E2E Test Team
```

## test_ convention

| Helper | Location | Use |
|--------|----------|-----|
| `TEST_PREFIX` | `e2e/test-data.ts` | `"test_"` |
| `testName("task")` | same | Unique `test_task_<timestamp>` |
| `isTestArtifact(name)` | same | Purge filter |
| `purgeTestArtifacts(page, orgId)` | `e2e/api-session.ts` | DELETE all workspace rows whose title/label/name starts with `test_` |

Purged entity types today:

- `vbs_tasks.title`
- `vbs_checklist.label` (milestones)
- `vbs_stations.name`
- `vbs_schedule_slots.label`
- `vbs_registrations.child_full_name`
- `vbs_registration_classes.name`

## CRUD API paths (org-scoped)

Base: `/api/orgs/:orgId`

| Entity | Create | Delete |
|--------|--------|--------|
| Task | POST `vbs-plan/tasks` | DELETE `vbs-plan/tasks/:taskId` |
| Milestone | POST `vbs-plan/checklist` | DELETE `vbs-plan/checklist/:itemId` |
| Station | POST `vbs-plan/stations` | DELETE `vbs-plan/stations/:stationId` |
| Schedule slot | POST `vbs-plan/schedule` | DELETE `vbs-plan/schedule/:slotId` |
| Reg class | POST `vbs-registration/classes` | DELETE `vbs-registration/classes/:classId` |
| Reg student | POST `vbs-registration/students` | DELETE `vbs-registration/students/:studentId` |

Workspace reads:

- GET `vbs-plan` → tasks, checklist, stations, schedule
- GET `vbs-registration` → students, classes

Plan must exist for plan CRUD: `ensurePlanExists(page, orgId)` in `api-session.ts`.

## Routes matrix (smoke / roles)

| Route | All members | Notes |
|-------|-------------|-------|
| `/login` | — | UI login |
| `/org/:id/vbs-plan` | yes | Overview tab |
| `/org/:id/vbs-plan?tab=tasks` | yes | CRUD task UI check |
| `/org/:id/vbs-plan?tab=reimbursements` | org_admin, platform_admin | Hidden for others |
| `/org/:id/vbs-plan?tab=adherence` | yes | Schedule health |
| `/org/:id/registration` | yes | CRUD on classes/students tabs |
| `/org/:id/cooking-plan` | cooking access | Backlog |
| `/profile` | yes | Contact + notifications |

## npm scripts

| Script | Action |
|--------|--------|
| **`validate`** | Run suite + write `e2e-report/` + **open browser tab** |
| `test:e2e:report` | Open last `e2e-report/index.html` |
| `test:e2e:setup` | `playwright install chromium` + ensure users |
| `test:e2e` | Full suite + globalSetup + report (no auto-open) |
| `test:e2e:headed` | Force headed env var |
| `test:e2e:ui` | Playwright UI mode (best for watching tests) |

## Gitignored artifacts

`e2e-report/`, `test-results/`, `playwright-report/`, `blob-report/`

## Parallelism

| Mode | Workers |
|------|---------|
| Headless (`E2E_PLAYWRIGHT_HEADLESS=true`) | Playwright default (≈ half your cores) or `E2E_WORKERS` |
| Headed (default) | **1** (single visible browser) |

Set `E2E_WORKERS=4` to parallelize headless CI; avoid high worker counts in headed mode.

## Fixture usage

```ts
import { test, expect } from "./fixtures";

test("example", async ({ orgAdminPage }) => {
  const { page, orgId } = orgAdminPage;
  // ... create test_* data ...
  // purge runs automatically after test
});
```

Personas available as fixtures today: `orgAdminPage`, `registrationAdminPage`. Add new fixture keys in `fixtures.ts` when another role needs CRUD + auto-purge.
