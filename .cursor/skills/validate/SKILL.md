---
name: validate
description: >-
  /validate ONLY — run this skill when the user types /validate or clearly asks to run the
  full E2E suite (validate, test:e2e, Playwright regression). Do NOT run npm run validate
  on other tasks. Playwright E2E for VBS: fix app when red, extend coverage when features
  change; never weaken assertions to get green.
---

# /validate (VBS E2E)

**Invoke this skill only when the user asks for `/validate` or an explicit full E2E run.** Do not run `npm run validate` as part of unrelated feature work, refactors, or “done” checklists unless they requested validation in that message.

**Regression suite, not a rubber stamp.** Passing means the scenarios in `e2e/` still behave as asserted. Failing means **fix the app first** (or revert a bad change). Only change tests when product intent or RBAC intentionally changed.

All Playwright tests live in **`e2e/`** (`playwright.config.ts` → `testDir: "e2e"`).

Project rule: `.cursor/rules/e2e-regression.mdc` (always on).

---

## Strict failure policy

| Do | Don't |
|----|--------|
| Fix bugs, broken routes, wrong RBAC | Loosen `expect` to make red green |
| Update selectors when UI structure changed but behavior unchanged | Delete assertions because they are inconvenient |
| Add coverage when you add features | “Heal” by skipping tests or `test.fixme` without user ask |
| Run full suite after fixes | Stop after one spec passes |
| Raise `depth` in `site-coverage.ts` when you add real checks | Mark areas `crud` without create/delete/workflow proof |

**Retries: 0** — no automatic re-run masking flakes (`playwright.config.ts`).

---

## What “green” means (honest)

See **`e2e/site-coverage.ts`** — each area has a **depth**:

| Depth | Meaning |
|-------|---------|
| **crud** | Create → visible in UI → delete (API + UI proof) |
| **workflow** | Multi-step behavior (RBAC matrix, reimbursement queue, public reg, login) |
| **smoke** | Route loads + minimal visible content — **can break without failing** until deepened |
| **none** | No spec — **will not fail** if broken |

The validate report lists depths and explains: **high confidence only for crud/workflow areas**; smoke-only pages need stronger tests for the same confidence.

---

## Coverage philosophy

| Goal | Approach |
|------|----------|
| **Breadth** | Every **major workflow** each persona can perform: open route → **create** → **see in UI** → **delete** (when API exists). |
| **Depth** | One strong happy path per entity type; deepen smoke → workflow → crud when the feature matters. |
| **Data** | All created titles/names **must** start with **`test_`** (`testName()` in `e2e/test-data.ts`). |
| **Cleanup** | Explicit delete in-test **and** `purgeTestArtifacts()` / fixture teardown. |
| **Speed** | Create/delete via **`sessionCall`**; UI proves what the user would see. |

**Do not** add CRUD tests for entities with **no delete API** until delete exists.

**Avoid redundancy:** do not add route-only tests if a deeper spec already navigates there with meaningful assertions.

### Suite map

| File | Purpose |
|------|---------|
| `roles-access.spec.ts` | Each persona: plan, registration, profile, reimbursements visibility |
| `crud-plan.spec.ts` | Plan CRUD + section tabs + schedule health |
| `crud-registration.spec.ts` | Class + student CRUD + UI |
| `workflow-org.spec.ts` | Cooking, contact, messages, board, teams CRUD, room/Photoshoppe/manage |
| `workflow-content.spec.ts` | Setup CRUD, reviews, shares, home, about |
| `workflow-profile-notifications.spec.ts` | Profile contact save + bell mark-all-read after public reg |
| `plan-export.spec.ts` | Excel export download from VBS Plan header |
| `reimbursement-flow.spec.ts` | Submitted test_ receipt on reimbursements tab |
| `public-registration.spec.ts` | Public parent UI form submit + cleanup |

Add **`crud-*.spec.ts`** for new domains; update **`site-coverage.ts`** `depth` + `specFiles`.

### Plain-English summaries

- **`documentedTest(title, "…", fn)`** or **`summaryAnnotation("…")`** → validate report.
- When behavior changes, **update the summary** to match — do not silently change behavior.

### Support modules

| File | Purpose |
|------|---------|
| `e2e/site-coverage.ts` | Areas, **depth**, spec file mapping |
| `e2e/test-doc.ts` | `documentedTest`, `summaryAnnotation` |
| `e2e/reporters/validate-report.ts` | HTML report + confidence note |
| `e2e/env.ts`, `auth.ts`, `api-session.ts`, `fixtures.ts`, `test-data.ts` | Personas, login, API, purge |

---

## Prerequisites

1. `.env` with **E2E_*** personas.
2. `npm run docker:up`
3. `npm run test:e2e:setup` if browsers or DB personas may be stale.
4. **`npm run validate`** → `e2e-report/index.html` (gitignored).

Workers default to **1** (shared `E2E_ORG_ID` + global `test_` purge).

---

## Loop when invoked

```
- [ ] npm run test:e2e:setup (if needed)
- [ ] npm run validate
- [ ] If RED: read trace / error-context.md → fix APP or env → re-run full suite
- [ ] If UI label moved only: update selector, keep same expectation
- [ ] If intentional product change: update test + summary + site-coverage depth
- [ ] New route/RBAC/CRUD from feature work: extend e2e specs + site-coverage (during this /validate task)
- [ ] Full suite green without weakening assertions before finishing **this** /validate task
```

---

## Feature change checklist (agent)

1. **New or changed nav/route** → `routes-*.spec.ts` or deepest spec + `site-coverage.ts` row.
2. **Permission / tab visibility** → `roles-access.spec.ts`.
3. **Writable domain with delete API** → `crud-*.spec.ts`, set depth **`crud`**.
4. **Multi-step but no CRUD** → workflow test, depth **`workflow`**.
5. **Run `npm run validate`** (only in this /validate workflow — not on unrelated agent tasks).

---

## How to add a CRUD test

Use `fixtures`, `testName()`, `sessionCall`, assert UI, delete, fixture purge. See earlier sections in this file; reference [reference.md](reference.md) for API paths.

---

## Coverage backlog (deepen further)

- [ ] Cooking plan — menu generate / layout (beyond extra-instructions PATCH)
- [ ] Board posts — delete API + purge
- [ ] Share listings — delete API + purge for test_ rows
- [ ] Room ideas — save/generate flow (LLM/images)
- [ ] Org manage — invite accept flow
- [ ] Registration — allergies/contacts/nametags tabs
- [ ] Helper role persona in `roles-access`

Mark done items in this list when implemented and bump **`depth`** in `site-coverage.ts`.

---

## Validate report

`e2e-report/index.html` — pass/fail, **confidence note**, depth table, step screenshots, traces.

---

## Do not

- Commit `.env` secrets.
- Create E2E data without `test_` prefix.
- Skip purge after CRUD tests.
- Weaken tests to pass without fixing the app.
- Stop after fixing one spec — run **full** suite.

---

## Reference

[reference.md](reference.md) — env vars, routes, purge paths.
