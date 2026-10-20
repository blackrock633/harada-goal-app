# QA Status — Harada Goal App

_Independent QA monitor · updated **2026-10-20 05:50** · rerun with `bash tests/qa-regress.sh [checkout]`
(`SNAPSHOT=1` for other agents' worktrees, which tests committed HEAD only) · logs in `test-results/qa/`._

Related: `HARADA_SPEC.md` · `ACCEPTANCE_CRITERIA.md` · `research/HARADA_METHOD_SOURCES.md` · `research/MOBILE_USABILITY_REVIEW.md`.

**Status words:** VERIFIED = executed and passed · FAILED = executed and failed · NOT TESTED · BLOCKED = cannot run yet (reason given).
**Priority:** P0 security, data loss, or broken workflow · P1 broken core feature, matrix, persistence, or metrics · P2 usability, a11y, or defense-in-depth · P3 cosmetic.

## 1. Primary acceptance criterion

> Create a goal, build and edit the matrix, save securely to Supabase, reopen without losing data,
> complete daily actions, and see accurate progress on a real mobile device.

**PARTIALLY VERIFIED.** Every step works end to end on `ui/integration` 07fd5e9 (journeys 1–8, §5b) with dev auth,
an embedded Postgres carrying the real migrations and RLS, and Chromium phone emulation.
**Not yet verified:** (1) a real Supabase project (GoTrue sign-up, hosted Postgres, PostgREST, `\dp public.*` grants);
none is configured, so this needs a user action. (2) A real mobile device or iOS Safari; none is available.

**Platform (unconfirmed with the user):** the code is a Next.js 15 phone-first **web** app, not React Native/Expo.
Peers report that the user chose this. Native iOS/Android cannot be verified for this codebase. Mobile coverage is
Chromium emulation (360×640, 390×844); WebKit/Safari is NOT TESTED.

## 2. Branch status (all executed by QA; branches verified at committed snapshots)

| Gate | main `cb2eda4` | data/supabase `97c845e` | ui/integration `07fd5e9` (merges 97c845e) |
|---|---|---|---|
| typecheck | FAILED (4) | **VERIFIED** 0 errors | **VERIFIED** 0 errors |
| lint | FAILED 38 | FAILED | FAILED 26 |
| vitest | VERIFIED 147 + 13 expected-fail | **VERIFIED 269/269** | **VERIFIED 344/344** |
| routes 200 (`/`, `/styleguide`, `/api/health`) | VERIFIED | NOT TESTED | `/` 500 without auth env = correct fail-closed ("Supabase is not configured"); QA script now runs with dev auth |
| e2e mobile shell | FAILED 4 (styleguide specimens) | n/a | **VERIFIED 15/15** |
| e2e journeys 1–8 (+6b) | BLOCKED | n/a | **VERIFIED 9/9** (QA run, 2.1 min; real pages + use cases + RLS DB; dev auth; fresh PGlite; Chrome 390×844) |
| Matrix 9×9 structure (`pending/matrix-structure`) | n/a | n/a | **VERIFIED 5/5**: 1 goal · 8 hubs · 8 centres · 64 actions, bijective |
| Metrics semantics (`pending/progress-metrics`) | P-1/P-2 open | **VERIFIED 11/11** | inherits on merge |
| Data integrity (`pending/data-integrity.port`) | D-01..04 open | **VERIFIED 21/21** | inherits |
| RLS, branch suite (`rls.rls.test.ts`) | n/a | **VERIFIED 63/63** (re-run by an independent QA subagent) | inherits |
| RLS, adversarial (`pending/rls-holes`) | n/a | **VERIFIED 81 pass + 1 accepted-risk (H4)** | includes 97c845e; re-run pending (first attempt stalled under CPU contention) |
| Real Supabase project / GoTrue / PostgREST / `\dp public.*` | NOT TESTED | NOT TESTED (none configured; user action) | NOT TESTED |

Merge path: `data/supabase` → `ui/integration` → main. On merge, move `tests/pending/*` into `tests/integration/`
and retire `tests/integration/progress-semantics.test.ts` and `data-integrity.test.ts` (old API).

## 3. Open defects

Owner: **D** = data/backend orchestrator · **F** = frontend orchestrator · **Q** = QA · **U** = user decision.

| ID | P | Owner | Where | Repro → expected / actual | Fix | Test |
|---|---|---|---|---|---|---|
| INT-02 | P1 → FIXED f703e23 | F | `src/domain/*` uses `.js` import specifiers (e.g. `./errors.js`) | `next dev`: every page that imports the domain failed with "Can't resolve './errors.js'". Vitest/tsc resolve these; webpack didn't. Found by F | webpack `resolve.extensionAlias {'.js': ['.ts','.tsx','.js']}` in `next.config.ts` (or drop the `.js` specifiers) | journeys 1–8 on 07fd5e9 load domain-backed pages |
| INT-01 | **P1 → FIXED 07fd5e9** | F | ui/integration `477ca3f` | Branch lacks data/supabase `97c845e` (grants hardening, dev-auth allow-list, routine-only trigger) — merging it to main as-is would ship H1/H2 | Merge data/supabase into ui/integration; QA re-verifies | branch ancestry check |
| H1 | **P2 → FIXED 97c845e (verified)** | D | `supabase/migrations/20261019120000_harada_schema.sql:271-279`, `…_daily_focus.sql:19-20` | As user B, `truncate table goals cascade` → expected permission denied / **succeeds and wipes every tenant** (TRUNCATE ignores RLS). Also TRIGGER/REFERENCES granted, the profiles column grant is ineffective, and there are unneeded INSERT/UPDATE/DELETE grants. P2 rather than P0 because PostgREST cannot TRUNCATE and the app runs only fixed SQL: no exploit path today, catastrophic if one appears. Verified on the shim only. | `revoke all … from anon, authenticated` + revoke the default privileges, then re-grant exactly | `rls-holes` ×24 |
| H2 | P2 → FIXED 97c845e (verified) | D | `src/infrastructure/auth/mode.ts:3` | `AUTH_PROVIDER=dev` with `NODE_ENV` unset/`staging` and a real DB URL → expected refusal / **dev auth enabled** (writes `dev_auth` into the real DB; cookie not `secure`) | Allow-list development/test **and** a pglite/memory DB | `rls-holes` ×2 |
| H3 | P3 → FIXED 97c845e (verified) | D | schema `:187-193` | A `routine_checks` row for a task-kind action is accepted | Trigger or routine-only FK | `rls-holes` |
| H4 | P3 accepted risk | D | schema `:219-227` | `goal_events.subject_id` can name another tenant's action; documented as an untrusted label | Constrain if any feature ever joins on it | `rls-holes` (`it.fails`, accepted) |
| M-08b | P2 | D+F | `schemas.ts` | `expectedUpdatedAt` is optional, so a client that omits it still last-write-wins. Goal/key-area/action editors send it (verified in code); reflections have no edit UI | Make it required on updates, or document | — |
| L-01 | P2 | D+F | all branches | Lint red, so `npm run verify` is red | Fix lint; the user decides on the scaffold scripts | lint gate |
| U-09 | P2 | F | Toast | Reported fixed on ui/integration 64a7d81 | — | NOT TESTED by QA |
| U-10 | P2 | F+D | Today | No daily priority pick → D added `daily_focus` + use cases in 761b5b1; UI pending | — | NOT TESTED |
| Q-2 | P3 | D | test harness | Per-process PGlite template leaks into `$TMPDIR` | In-memory `dumpDataDir` | — |
| Q-6 | P3 | U | `ui/integration` commits | Author is `Your Name <your-email@example.com>`: git identity not configured | `git config user.name/email` | — |
| P-5 | — | U | product | Attainment = mean of per-measure progress (each normalised to its own target; verified unit-agnostic); `achieved` status is authoritative. User-designated success-criteria measures were declined for R1. **Product decision.** | — | `progress-metrics` |

Audit, still pending: verify that use cases never call `ReflectionRepo.update/deleteById` or `GoalEventRepo` before an owner-scoped load (RLS now backstops this, per `rls-holes` "repos without ownerId" tests passing).

## 4. Fixed and verified

| ID | Was | Evidence |
|---|---|---|
| D-02 (was P0) | An action could be linked to an outcome in another goal | composite FK; `data-integrity.port` 4/4b/4c (4c same-user: proves the FK, not RLS) on 761b5b1 |
| D-01 | Unique violations surfaced as raw 500s | `data-integrity.port` 3a–3c |
| D-03 | Task↔routine kind change not persisted | `data-integrity.port` 5–5c |
| D-04 | Measure unit `''` read back as null | `data-integrity.port` 10b/10c |
| P-1 | 100% / "ahead" from action completion | `progress-metrics`: all tasks done → attainment null, pace unknown |
| P-2 | 1 of 8 tasks → 50% (mean of means) | `progress-metrics`: tasks = 1/8 |
| P-3 | A measure masked task completion | `progress-metrics`: separate fields |
| P-4 | Tasks and routine adherence averaged together | `progress-metrics`: separate `tasks`, `routines` |
| P-6 | Two definitions of goal progress | old functions deleted (761b5b1) |
| M-07/M-08 | Retried creates duplicated; stale edits silently overwrote | branch tests read by QA (row count = 1; `CONFLICT` code) and executed in the 269/269 snapshot run |
| B-01 | Prod `container.ts` didn't compile | snapshot 94d0bb9: tsc 0 |
| R-01 | 30 application tests silently not loading (a8b4e83) | snapshot 761b5b1: 242 tests incl. application; the test-count guard is now in `qa-regress.sh` |
| U-01..06, U-08 | Every route returned 500; missing `"use client"`; safe-area; progressbar name; contrast; touch targets; colour-only check | routes 200; e2e 15/15 on ui/integration; code review of `CheckCircle` |
| Q-1, Q-3, Q-4, Q-5 | 347 MB test leak · vitest ignored `tests/` · worktrees linted/typechecked/not gitignored · 3 tautological e2e tests | fixed by QA |

## 5. QA process notes

- Peer claims are recorded only after QA re-runs them. One claim ("tsc clean") matched only the committed snapshot, not the live worktree.
  QA now always tests other agents' branches at committed HEAD.
- Subagent findings are re-run by QA before they are filed. Severity is re-assessed: H1 was downgraded from the subagent's P1 to P2
  after checking the exploit path.
- `qa-regress.sh` fails the run if the executed test count drops versus the previous run on the same branch.

## 5b. End-to-end journey evidence (ui/integration `07fd5e9`, run by QA)

| # | Journey | Result | Key evidence |
|---|---|---|---|
| 1 | Create goal → reload | VERIFIED | title, success criteria, target date and "Draft" badge persist |
| 2 | Matrix 1 + 8 + 64 | VERIFIED | "Plan: 0 of 72 positions filled" → after 2 areas + 3 actions "5 of 72", "2 of 8 key areas · 3 of 64 actions"; 8 key-area pages × 8 slots; persists on reload |
| 3 | Today: complete → reload → reopen | VERIFIED | "Complete: …" aria-pressed false → "Reopen: …" true; persists both ways |
| 4 | Metrics distinct | VERIFIED | "4 of 72 positions filled" · "2 of 3 tasks done" → "3 of 3 tasks done" while attainment stays "Not measured yet"; no "Achieved", no 100% |
| 5 | Two-user isolation | VERIFIED | B on `/goal`, `/matrix`, `/matrix/0`, `/review` with A's id: pages render (< 500, `main` visible) and contain neither A's goal nor key-area title |
| 6 | Network failure → retry | VERIFIED | role=alert shown, dialog stays open, input kept; retry gives exactly 1 action |
| 6b | Lost response (server committed) → retry | VERIFIED | no duplicate: "1 of 64 actions" (added by QA; exercises idempotent creates end to end) |
| 7 | Mobile editing | VERIFIED | "Save changes" and the focused input stay in the viewport at heights 844 and 420 (keyboard stand-in); edit persists |
| 8 | Auth transitions | VERIFIED | `/today` → `/signin`; sign-up works; sign-out → `/today` and `/goal` redirect; title not visible |

Limits of this evidence: dev auth, not Supabase GoTrue; PGlite, not hosted Postgres; Chromium emulation, not
iOS Safari or a device; the keyboard is simulated by viewport resize. Session *expiry* (as opposed to sign-out) is NOT TESTED.

## 6. Release readiness

| Requirement | Status |
|---|---|
| App starts | VERIFIED (dev server, main + ui/integration). Production build NOT TESTED |
| Core goal workflow | **VERIFIED** end to end on ui/integration (dev auth + PGlite) |
| Matrix structure | VERIFIED (UI layout model; DB positions 0..7 + composite FK) |
| Persistence | VERIFIED across reloads (journeys 1–3, 7). Against Supabase: NOT TESTED |
| Daily execution | VERIFIED (journey 3) |
| Progress accuracy | VERIFIED domain (11/11) and UI texts (journey 4) |
| User data protected | RLS policies VERIFIED (shim). Grants **FAILED** (H1). Real Supabase NOT TESTED |
| Honest errors | VERIFIED (journeys 6, 6b) |
| Mobile navigation | VERIFIED in Chromium emulation (journeys 1–8) |
| Journeys automated | VERIFIED 9/9 |
| iOS / Android device | NOT TESTED (web app; no device) |

**Verdict: NOT releasable yet.** There are no open P0 or P1 defects, and the core journeys pass end to end. Before release:
run the journeys against a real Supabase project and on a real phone (WebKit at minimum), test session expiry,
get lint green, and merge ui/integration → main. The QA files also need committing (user decision).

## 7. Roadmap

R1 = auth · goal · matrix 1+8+64 with empty slots · Today (complete/reopen/check + daily focus) · reflections ·
separate metrics · honest errors · idempotent creates + optimistic concurrency · export.

| Proposal | User problem | Value | Dependencies | Complexity | Security / privacy | R1? |
|---|---|---|---|---|---|---|
| Guided goal creation | Blank-page paralysis | High | Goal form | Low | — | Yes (prompts only) |
| Templates (exist) | Getting started | Med | Domain templates | Done | — | Yes, explicit choice |
| Daily priority pick | Harada's daily plan | High | `daily_focus` (761b5b1) | Med | — | Yes |
| Weekly review | Adapting the plan | High | Reflections + events | Low | — | Yes |
| Suggested key areas | Hard to decompose | Med | — | Low (static) | — | Later |
| AI action decomposition | Hard to decompose | Med | LLM API, suggestion storage | High | Goal text leaves the device; consent; suggestions stay distinct | No |
| Reminders | Forgetting routines | High | Web push / email | Med | Notification permissions | R2 |
| Milestones | Long horizons | Med | Schema | Med | — | R2 |
| Progress history | Motivation | Med | Events, checks | Med | — | R2 |
| Calendar integration | Scheduling | Low-Med | OAuth | High | Third-party data | No |
| Export / import | Data ownership | Med | Export query | Low / Med | Import must never overwrite | Export yes |
| Offline execution | Connectivity | Med | Sync model | High | Local data at rest | No |
| Subscription | Revenue | — | Billing | High | Payment data | No |
