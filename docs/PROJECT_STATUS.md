# Project Status Report

**Project:** Harada Goal App
**Last updated:** 2026-10-20 (data/backend orchestrator, from main `5f02816`)
**Overall status:** Active. Engineering gates are mostly green; the release is blocked on verification environments.
**Development stage:** MVP / release candidate for R1. Not deployed and not yet run against a real Supabase project.

> **How to read this.** This file summarises the project's state and links to the authoritative detail.
> `QA_REPORT.md` is the independent QA ledger: per-gate results, open defects and journey evidence. When the
> two disagree on a test result, QA_REPORT wins. Status words: **VERIFIED** (executed and passed),
> **FAILED**, **NOT TESTED**, **BLOCKED**, **Implemented, unverified**.

## 1. Executive summary

- **What the app is:** a phone-first web app for the Harada Method.
  - One goal with its purpose, and 8 key areas (outcomes) of 8 actions each (the 1 + 8 + 64 matrix).
  - Daily execution: complete tasks, check routines, pick up to 5 "today's focus" actions.
  - Reflections and progress tracking.
- **Data and security:**
  - All data lives in Supabase Postgres under row-level security (RLS). Auth is Supabase Auth.
  - Every server query runs as the signed-in user, so the database itself enforces ownership.
- **Verified locally:** the core workflow works end to end.
  - Setup: dev auth, embedded Postgres (PGlite) with the real migrations and RLS, Chrome phone emulation.
  - Covered: create a goal, build the matrix, reload without loss, complete and reopen, see separate progress metrics, two-user isolation, honest errors, retries without duplicates.
  - Evidence: 490 unit, integration and RLS tests pass; the journey results are in §9.
- **Biggest gaps (not code defects):**
  - **Supabase:** never run against a real Supabase project; none is configured.
  - **Devices:** never run on a real phone or in real iOS Safari.
  - **WebKit:** journeys are still unstable in WebKit (Safari's engine) on the latest code.
- **Immediate priority:** a clean QA e2e run on current main (Chrome and WebKit). Then the user creates a Supabase project so the same journeys can run against hosted Auth and Postgres.

## 2. Project objectives

- **Primary objective:** help a person reach one long-term goal with the Harada Method.
  - Plan: purpose, 8 key areas, 64 actions.
  - Execute: daily tasks and routines.
  - Review: reflections, and progress that does not overstate achievement.
- **Intended users:** individuals on their phone. A desktop layout is secondary.
- **Primary acceptance criterion (QA_REPORT §1):**
  - Create a goal, build and edit the matrix, and save securely to Supabase.
  - Reopen without losing data, complete daily actions, and see accurate progress on a real mobile device.
- **Constraints set by the user and the backend brief:**
  - Supabase with RLS on every table; security enforced in the database or on the trusted server, never by hidden UI.
  - No service-role key on any client. Never destructively migrate user data.
  - Matrix initialisation is atomic and idempotent; empty positions are absent rows.
  - Planning completeness, action completion and goal attainment are kept separate.
- **Platform:** Next.js phone-first **web** app. The brief assumed Expo/React Native. The repo's Next.js stack was kept and Supabase adopted (D-013). No native app exists. QA lists "native vs web" as unconfirmed with the user (§15).

## 3. Current state

| Area | Status | Evidence |
|---|---|---|
| Schema, constraints, RLS, exact grants | VERIFIED locally (PGlite + auth shim); NOT TESTED on Supabase | `src/infrastructure/db/rls.rls.test.ts`, `tests/integration/rls-adversarial.test.ts` (81 + 1 accepted) |
| Matrix 1 + 8 + 64, empty slots, atomic template create, idempotent creates | VERIFIED | `matrix-structure`, `data-integrity` tests; e2e #2, #6b |
| Progress metrics (planning / tasks / routines / attainment / pace) | VERIFIED | `progress-metrics` (11), domain tests, e2e #4 |
| Today: complete/reopen, routine checks, daily focus (≤ 5) | VERIFIED in Chrome | e2e #3; `daily-focus-repo` + application tests |
| Reflections, export, settings, account deletion | Implemented. Use cases tested; account deletion via Supabase Admin API NOT TESTED | `application.test.ts` |
| Auth: sign-up / sign-in / sign-out / redirects | VERIFIED with dev auth; Supabase Auth NOT TESTED | e2e #8, #10 |
| Session ends mid-edit (AUTH-01 fix) | **VERIFIED in Chrome**; WebKit inconclusive (failed in setup) | §9 |
| Typing before hydration (HYD-01 fix, 682ee11) | Implemented, unverified by QA | e2e #11 not yet rerun on main |
| Reflection date label (A11Y-01 fix, e3cb1ab) | Implemented, unverified by QA | e2e #12 not yet rerun |
| Real Supabase project, real phone / iOS Safari | NOT TESTED (no project configured; no device or simulator) | — |

## 4. Architecture and technology

Details: `ARCHITECTURE.md`, `DATABASE.md`, `API_CONTRACTS.md`, `DOMAIN_MODEL.md`, `SUPABASE_SETUP.md`.

- **Stack:**
  - Next.js 15 (App Router, server components, server actions), React 19, strict TypeScript, Tailwind.
  - Node 20. The Supabase packages are pinned (`@supabase/ssr` 0.12.0, `@supabase/supabase-js` 2.109.0), because newer releases need Node 22.
- **Layers** (enforced by ESLint import boundaries):
  - `src/domain`: pure rules, metrics and the Today derivation.
  - `src/application`: use cases, queries, ports, Zod schemas, DTOs, `Result` errors.
  - `src/infrastructure`: Drizzle repositories, auth gateways, container.
  - `src/app` (routes and server actions) and `src/ui` (features and primitives).
- **Data:**
  - The schema of record is `supabase/migrations/*.sql`: 8 tables, RLS on all, exact grants, a routine-only trigger.
  - `db/schema.ts` is a Drizzle mirror, guarded by `schema-sync.test.ts`.
  - `UnitOfWork.run(userId, fn)` runs each transaction as the `authenticated` role with the user's JWT `sub`, so RLS also governs server queries.
- **Auth:**
  - Supabase Auth via `@supabase/ssr` cookies. `requireCtx()` gets the user from `auth.getUser()` (verified server-side).
  - Middleware only refreshes sessions and redirects page loads (GET/HEAD); it is not the authorisation boundary.
  - Dev gateway: only with `AUTH_PROVIDER=dev`, NODE_ENV development or test, and a local database URL.
- **Environments:**

  | Environment | Database | Auth |
  |---|---|---|
  | Local dev | PGlite with `supabase/tests/auth-shim.sql` | dev auth |
  | Tests | in-memory PGlite with shim and all migrations | `FakeAuthGateway` (mocked) |
  | Production (planned) | Supabase pooler | Supabase Auth |

- **Integrations:** Supabase only. No AI features (D-006). No email provider other than Supabase's (SMTP is configured in its dashboard).
- **Deployment:** none yet. `next build` passes (1f5d2fb, 2026-10-20; 14 dynamic routes + middleware, built without Supabase env vars).
- **Testing:**
  - Vitest: domain, application, infrastructure and `tests/integration`.
  - Playwright: `tests/e2e`, Chrome plus WebKit with an iPhone user agent.
  - QA runner: `tests/qa-regress.sh` (count guard, snapshot mode).

## 5. Completed work

The data/backend items were each verified by QA re-runs recorded in QA_REPORT §4.

| Item | Where | Verification | Limits |
|---|---|---|---|
| Supabase schema + RLS + exact grants (QA H1–H3) | `supabase/migrations/2026101912…`, `…13…`, `…14…` | RLS suite 63, adversarial 81 + 1 accepted, TRUNCATE denied | Shim only; `\dp public.*` on a real project pending |
| Supabase Auth gateway, dev gateway allow-list (H2), auth error mapping | `src/infrastructure/auth/*` | unit tests; e2e #8/#10 (dev auth) | GoTrue behaviour only mocked |
| Repositories, use cases and queries for every API_CONTRACTS operation | `src/application`, `src/infrastructure/db/repositories` | application + repo tests | — |
| Idempotent creates (client uuid), optimistic concurrency (`expectedUpdatedAt`) | schemas + use cases | tests (row count = 1, `CONFLICT`); e2e #6b | `expectedUpdatedAt` optional (M-08b) |
| Separate metrics (D-015; QA P-1..P-6) | `src/domain/progress.ts` | `progress-metrics` 11/11, e2e #4 | Attainment needs outcome measures; else "Not measured yet" |
| Daily focus, ≤ 5 per day (D-016) | `daily_focus` migration, `addToToday/removeFromToday`, Today UI | repo + RLS tests; UI suite | — |
| DB errors mapped to typed results (`CONFLICT`, `NOT_FOUND`, `UNAVAILABLE`) | `src/infrastructure/db/pg-errors.ts` | `pg-errors.test.ts`, data-integrity 3a–3c | — |
| AUTH-01: server actions answer `UNAUTHENTICATED` instead of being redirected | `src/middleware.ts` (20e7ecc, on main via b595460) | e2e #9 Chrome passed (run 20261020-133527) | WebKit not confirmed |
| UI: all routes, matrix editor, Today, review, settings, onboarding | `src/ui`, `src/app` | UI suite 121/121 (frontend report); e2e #1–#8 | AUTH-02 open |
| UI fixes U-01..03, U-08, HYD-01 (682ee11), A11Y-01 (e3cb1ab) | `src/ui` | U-*: QA VERIFIED; HYD-01/A11Y-01: frontend-tested only | Pending QA rerun |

## 6. Work in progress

| Task | Owner | State | Done when |
|---|---|---|---|
| QA re-verification of main (AUTH-01 in WebKit, HYD-01 #11, A11Y-01 #12) | QA | Running on main `682ee11`+. Two e2e runs at 13:35–13:37 were both killed (exit 143, cause unknown) | One complete e2e run on current main, recorded in QA_REPORT §2 |
| Status/docs consistency | data orchestrator | This report; ARCHITECTURE and D-016 refreshed (33d951e) | `ACCEPTANCE_CRITERIA.md` auth rows updated by QA |

## 7. Outstanding tasks

| P | Task | Reason | Depends on | Acceptance | Status |
|---|---|---|---|---|---|
| P1 | A complete e2e run on current main, both engines | No full run on main since HYD-01/AUTH-01 merged | — | #1–#12 + mobile shell pass, or each failure filed | In progress (QA) |
| P1 | Diagnose WebKit e2e failures #3 and #9 | Failed on b2a34e2 (see §8). Possibly fixed by HYD-01 | rerun above | Pass on WebKit, or a filed defect with cause | Planned |
| P1 | Create and link a Supabase project; `supabase db push` | Primary acceptance criterion requires real Supabase | **User** (account, project, secrets) | Migrations applied; `\dp public.*` shows exact grants | Blocked on user |
| P1 | Run the journeys against hosted Supabase (real GoTrue, session expiry) | Auth flows only mocked; expiry NOT TESTED | previous row | Journeys #1–#10 pass with `AUTH_PROVIDER` unset | Blocked |
| P1 | Real phone or iOS Safari check | Acceptance says "real mobile device" | **User** (device or deployed URL) | Journeys 1–4 manually on a phone | Blocked on user |
| P2 | Deployment target + preview deploy | Build passes locally; no host chosen | user (host choice) | Deployed preview over HTTPS with Supabase env | Planned |
| P3 | Decide whether `/styleguide` ships to production | It is in the production route list | — | Removed or gated in production | Proposed |
| P2 | AUTH-02: sign-in action + return-to after session ends | Dead end after expiry | — | Link with `?next=`; e2e | Open (frontend) |
| P2 | M-08b: make `expectedUpdatedAt` required on updates | Clients that omit it get last-write-wins | UI editors already send it | Schema requires it; tests | Proposed |
| P2 | Update `ACCEPTANCE_CRITERIA.md` B-AUTH / AC-AUTH-01 | Still describe argon2 + `hga_session` | — | Rows describe Supabase Auth | Open (QA's file) |
| P3 | Audit use cases for owner-scoped load before `ReflectionRepo.update/deleteById`, `GoalEventRepo` | QA pending audit; RLS already backstops | — | Audit noted in QA_REPORT | Planned |
| P3 | `exportData` N+1, events for routine checks/reflections, per-process rate limiter | Known limitations | — | — | Proposed |

## 8. Known bugs and limitations

- **WebKit e2e #9 and #3 failures** (run 20261020-133527, on the b2a34e2 snapshot, which predates HYD-01). Status: open, cause unconfirmed.
  - **#9:** `page.goto /matrix/0` was "interrupted by another navigation to /today" during setup, so the session check never ran.
  - **#3:** the "Reopen" button never appeared after Complete, and an alert was shown.
  - **Hypothesis (unconfirmed):** pre-hydration interaction (HYD-01) or setup timing in WebKit under `next dev`.
- **AUTH-02 (P3):** after a session ends there is no sign-in action and no return-to.
- **H4 (accepted):** `goal_events.subject_id` is an untrusted label and may name another user's id. It is never used for authorisation or joins.
- **By design:**
  - Rate limiting is in-memory and per process.
  - Email confirmation, password reset and SMTP are configured in the Supabase dashboard (not done yet).
  - Attainment is "Not measured yet" until outcome measures are set.
- **Two e2e runs killed with exit 143** at about 13:35–13:37 (mine and QA's ran concurrently). Cause unknown; possibly contention or an external kill.

## 9. Testing and verification

| Gate | Result | Run |
|---|---|---|
| typecheck | VERIFIED, 0 errors | b2a34e2 (qa-regress 20261020-133527); 5fe2f97 (QA 133725); 33d951e (`npx tsc --noEmit`, merged as 5f02816) |
| lint | FAILED on b2a34e2 (5 errors, all in one-off generator scripts); **PASS on QA's 5fe2f97** after b858b2f deleted them (0 errors, 5 `no-console` warnings) | same |
| vitest | **VERIFIED 489 + 1 expected-fail of 490** (36 files) on b2a34e2; 492 + 1 of 493 on QA's 5fe2f97 (adds journey-helper tests) | count guard passed |
| routes | VERIFIED `/` 307, `/styleguide` 200, `/api/health` 200 | both runs |
| e2e Chrome, b2a34e2 | **#1–#10 + 6b VERIFIED (incl. #9 AUTH-01)**, mobile shell 15/15; #11 FAILED (expected: snapshot predates HYD-01) | 20261020-133527 |
| e2e WebKit, b2a34e2 | #1, 2, 4–8, 6b, 10 VERIFIED; **#3, #9 FAILED** (§8); #11 FAILED (pre-HYD-01); run killed before completion | same |
| e2e on current main | NOT TESTED to completion | QA rerunning |
| UI suite | 121/121 (reported by the frontend session; part of the vitest total) | — |
| production build (`npx next build`) | **VERIFIED**, exit 0; 0 lint errors, 5 `no-console` warnings in `logger.ts` | 1f5d2fb (= main 682ee11 + data/supabase 33d951e) |
| Supabase (hosted), real device | NOT TESTED | — |

- **Reproduce:**
  - Regression run on a checkout's committed HEAD: `SNAPSHOT=1 bash tests/qa-regress.sh <checkout>`.
  - Quick gates: `npm run typecheck && npx eslint . && npx vitest run`.
- **What is mocked versus real:**
  - Mocked: Supabase Auth (GoTrue) in every test.
  - Real: Postgres engine, constraints, triggers and RLS (PGlite with the shim emulating `auth.uid()` and the roles).

## 10. Technical debt

| Issue | Consequence | P | Remediation |
|---|---|---|---|
| Drizzle mirror of the SQL schema | Drift risk | P3 | Guarded by `schema-sync.test.ts`; switch to generated types once a project is linked |
| `drizzle-kit` devDependency unused (script removed in 33d951e) | Keeps a dev-only `esbuild` advisory | P3 | Remove the dependency in a lockfile-touching change |
| In-memory rate limiter | Ineffective across instances | P2 before multi-instance deploy | Supabase Auth rate limits + a shared store |
| `exportData` N+1 per goal | Slow export for many goals | P3 | Batch queries |
| `.data/` in main checkout is 501 MB (ENV-01) | Disk use; may contain the dev DB | P3 | User prunes `.data/test-*` (not `.data/dev`) |

## 11. Architecture and technical decisions

Recorded in `DECISIONS.md`. The ones future work most often touches:

- **D-013:** Supabase Postgres and Auth; RLS is the ownership boundary; server queries run as `authenticated`. Final. Revisit only if leaving Supabase.
- **D-014:** matrix positions 0..7; empty cells are absent rows; client uuid for idempotency. Final.
- **D-015:** planning, execution and attainment are separate metrics, and pace uses attainment only. Final. A user-designated success-criteria measure was declined for R1 (product decision P-5).
- **D-016 (revised 2026-10-19):** daily focus is an explicit table (≤ 5 per date); the rest of Today is derived.
- **Package pins:** `@supabase/*` stay pinned while the project is on Node 20. Revisit on Node 22.

## 12. Risks and dependencies

| Risk | Impact | Likelihood | Mitigation | Status |
|---|---|---|---|---|
| Hosted Supabase differs from the shim (grants, GoTrue, pooler) | Auth or RLS surprises at launch | Medium | `SUPABASE_SETUP.md` checklist, `\dp public.*`, journeys against the project | Open; needs user |
| Supabase default privileges re-granted by a dashboard action or a future migration | TRUNCATE etc. reopened for app roles | Low | Exact-grant migration; the privilege test fails on drift; check `\dp` after each push | Mitigated locally |
| WebKit/iOS behaviour (hydration, navigation) | Broken flows for iPhone users | Medium | WebKit journeys; real-device pass | Open |
| Service-role key leakage | Full DB access | Low | Server-only env var; never `NEXT_PUBLIC_`; used only for account deletion | Mitigated |
| Native vs web unconfirmed | Rework if a native app is expected | Unknown | Ask the user (§15). The data model and RLS already suit a supabase-js mobile client | Open |
| Multiple agents on one repo | Lost or overwritten work | Medium | Worktrees per role; merges to main by the frontend session; explicit-path commits | Managed |

## 13. Potential future improvements (not approved)

See the QA_REPORT §7 roadmap. Candidates:

- **Reminders for routines (R2):** web push or email; needs a notification permission flow.
- **Progress history (R2):** built from `goal_events` and routine checks.
- **Milestones (R2):** need a schema change.
- **AI-assisted decomposition:** not in R1. It sends goal text off the device, so it needs consent, and AI suggestions must be stored separately from the user's own entries.

## 14. Recommended next steps

1. **One complete e2e run on current main, Chrome and WebKit (QA).**
   - Why first: three fixes (AUTH-01, HYD-01, A11Y-01) are merged but not confirmed together, and the last two runs were killed before finishing.
   - Avoid running two suites at once.
   - Done when: QA_REPORT §2 shows #1–#12 per engine on the main SHA.
2. **Triage the WebKit #3/#9 failures** if they persist after HYD-01. Done when: they pass, or a defect is filed with a confirmed cause.
3. **User: create a Supabase project** and follow `SUPABASE_SETUP.md` (link, `db push`, env vars, auth URLs, SMTP).
   - Then confirm the grants with `\dp public.*` and run the journeys with real Supabase Auth.
   - Done when: QA records hosted-Supabase journey results.
4. **A preview deployment** (the build already passes), then test on a real phone (journeys 1–4 manually).
5. **AUTH-02, then M-08b.**

## 15. Decisions or input needed (user)

- **Supabase project:** create one and provide the project ref and keys via env, never in chat or git. Steps 3–4 are blocked without it.
- **Platform:** confirm that a phone-first web app (installable PWA later) meets "real mobile device". The alternative is a native Expo app reusing the same Supabase schema and RLS, which would be a new workstream.
- **Hosting target** for the Next.js app (e.g. Vercel), needed for a device test over HTTPS.

## 16. Recent changes (2026-10-19 → 2026-10-20)

- **Stack:** Supabase migration completed and merged to main: schema, RLS, grants hardening, Supabase Auth, daily focus.
- **Defects fixed:**
  - On main: AUTH-01 (20e7ecc → b595460), HYD-01 (682ee11), A11Y-01 (e3cb1ab).
  - Generator scripts removed with user approval (b858b2f).
- **This refresh (33d951e → 5f02816):**
  - `db:migrate` is PGlite-only and points to `supabase db push`; the stale `db:generate` was removed.
  - ARCHITECTURE describes Supabase Auth and RLS; D-016 matches `daily_focus`.
- **ui/integration** is superseded; the frontend now works on main.
- **Corrected claims from the previous version of this file:**
  - Phases 3–5 are no longer "not started".
  - The test count is 490, not 242.
  - "Daily priorities are not stored" is wrong; see D-016.

## 17. Status confidence and unknowns

- **Verified directly by me** (data orchestrator, 2026-10-20):
  - typecheck, vitest 490 and Chrome e2e #1–#10 on b2a34e2;
  - typecheck and eslint on 33d951e;
  - the `db:migrate` refusal for a postgres URL (exit 1);
  - `next build` on 1f5d2fb (exit 0).
- **From QA_REPORT:**
  - the RLS and adversarial results, H1–H4, U-* fixes and journey evidence;
  - the 5fe2f97 gates (lint 0 errors, vitest 493).
- **Reported by peers, not re-run by me:** UI suite 121/121, HYD-01 and A11Y-01 fixes, and the route list.
- **Unknown:**
  - behaviour on hosted Supabase and on iOS Safari or a real device;
  - the cause of the exit-143 kills;
  - the WebKit #3/#9 root cause.
