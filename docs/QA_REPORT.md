# QA Status — Harada Goal App

_Independent QA monitor · updated **2026-10-20 15:45** · rerun with `bash tests/qa-regress.sh [checkout]`
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

## 2. Status on main `01c004f` (verified by QA 2026-10-20 14:40, both engines, under `caffeinate -i`)

**Backend `data/supabase` edab51d VERIFIED: tsc 0, vitest 548/548 including QA's adversarial suites; SEC-01 A/B-verified.** Edge Function Deno wiring NOT TESTED (no Deno; staging tests ready).

**Platform decision (user, 2026-10-20): rebuild as Expo/React Native.** **Data path (confirmed with the user, as reported by D):** reads via supabase-js under RLS; writes only via SECURITY INVOKER Postgres functions (`search_path=''`, EXECUTE to `authenticated` only) that set a transaction-local GUC `harada.write_path`; a statement-level guard trigger on every table raises 42501 for direct writes as anon/authenticated (revised by D from the earlier SECURITY DEFINER plan because of hosted-PG grant risk). QA test plan: 42501 on direct writes, catalog checks, no client path to the GUC, no persistence across transactions, foreign ids → NOT_FOUND. The web app below is the verified
reference implementation. Native verification follows `NATIVE_QA_PLAN.md`.

| Gate | Result |
|---|---|
| typecheck · lint | **VERIFIED** 0 errors · 0 errors (3 warnings) |
| vitest (src + tests/integration) | **VERIFIED** 495 + 1 accepted-risk (H4) of 496, all ran |
| routes | VERIFIED (`/` 307 → signin, `/api/health` 200) |
| e2e, Chrome + WebKit (iPhone UA) | **VERIFIED 62/62**: 15/15 journeys and 15/15 mobile-shell checks on each engine |
| axe (6 real screens), offline save, 200% text, session end, forged cookie, lost response | VERIFIED on both engines |
| Real Supabase (staging) | **BLOCKED (ready to run, 15 tests)**: grants and RLS; RPC-only writes (direct write → 42501; foreign goal via add_outcome → HG404); harada_private not exposed (RPC-01); graphql closed (SEC-01); cross-user isolation; delete-account Edge Function (no JWT → 401, wrong password → data intact, success → cascade, bystander untouched, cannot sign in again) |
| iOS Simulator / real device | **BLOCKED**: Xcode not installed (25 GB free is likely too little); Java/Maestro missing |
| Native (Expo) app, native/app `e592d65` (+ auth: Supabase client, sign in/up/out, session gating, reinstall wipe) | **native tsc 0 · jest 176/176 · web tsc 0** · sign-out keychain wipe mutation-checked by QA (removing it → 2 tests fail) · screens not yet wired to data · simulator BLOCKED |

## 3. Open defects

Owner: **D** = data/backend orchestrator · **F** = frontend orchestrator · **Q** = QA · **U** = user decision.

| ID | P | Owner | Where | Repro → expected / actual | Fix | Test |
|---|---|---|---|---|---|---|
| NAT-02 | P2 → FIXED b3c16a0 (verified) | F | `mobile/src/auth/secure-session-storage.ts` @ 1a1d867 | Keychain chunks are sized in characters (1800), but the session JSON includes `display_name`; with a Japanese/emoji name, one item was **2783 UTF-8 bytes**, over the ~2 KB iOS limit → sign-in can fail on affected iOS versions. Verified with a QA jest probe | Chunk by UTF-8 bytes (TextEncoder) or ≤ 500 chars | QA probe sent for their suite |
| NAT-03 | P3: (a) FIXED b3c16a0 (verified); (b) FIXED e592d65 (install flag clears leftover keychain session; per F, mutation-checked; QA ran the suite) | F | same | Parts are written before the count (a crash can splice old and new chunks; result fails to parse, not trusted); the keychain survives reinstall, so the old session is restored | Count-last write protocol; clear on first launch after install | — |
| NAT-01 | P2 → FIXED (verified: native 59ede08 tsc 0; shared contracts alias-free in 68027be) | F (+D for shared imports) | `mobile/` @ a12bcf6 | `npm run typecheck` fails: 9× missing Jest global types; shared `src/application/schemas.ts:7` uses the web `@/` alias, which mobile's tsc can't resolve (Metro and Jest remap it, so type changes to contracts would go unchecked); 3× template CSS/web typing | `types: ["jest"]`; make the shared layer use relative imports; declare `*.css` or drop template web files | mobile typecheck |
| EXEC-01 | **P2 → FIXED db71bdd (verified, both engines)** | F | Today / KeyArea toggles (optimistic `CheckCircle`) | WebKit: tap Complete → UI shows done → reload/unload immediately → the in-flight server action is cancelled, so the completion is silently lost (5/5). Same for reopen. Chrome sends the request first. Breaks "failed writes must not appear successful" on the target platform | Track pending writes: `beforeunload` while in flight and/or a "saving…" state until confirmed | e2e #13 (WebKit) |
| HYD-02 | P3 → FIXED db71bdd | F | `useAdoptPrehydrationValue` | A `<select>` whose controlled value isn't among its options would adopt the first option on every mount. No live case | Guard selects | — |
| A11Y-01 | P2 → FIXED (verified both engines) | F | `src/ui/features/review/ReflectionForm.tsx:111` | Reflection date field has no accessible name (axe `label`, critical): a raw `<input type="date">` in `<Field>` never receives Field's context id, so `<label htmlFor>` points at nothing | Use the `Input` primitive, or read `useField()` for id/aria | e2e #12 |
| HYD-01 | P2 → FIXED (verified both engines) | F | `src/ui/features/matrix/KeyAreaEditor.tsx:32,100`; same pattern in `ActionEditorSheet`, `GoalOnboarding`, `GoalForm`, `GoalFields`, `ReflectionForm` | Text typed into a server-rendered form before React hydrates is visible but never reaches state, so submit sends `''` ("Required") and the field is wiped. Slow phone/network trigger; on WebKit under `next dev` it hit 8/11 journeys | Adopt the DOM value on mount (`useLayoutEffect` sync), or readOnly until mounted, or uncontrolled + FormData | e2e #11 |
| AUTH-01 | P2 → FIXED (verified both engines) | F | `src/middleware.ts:51` | Session cookie lost mid-edit → save shows "Something went wrong… try again" instead of "Your session has ended… nothing was saved". Middleware 307-redirects the server-action POST, the browser re-POSTs it to `/signin`, and the client gets an unexpected payload. Retrying can never succeed. Data safety VERIFIED: input kept, nothing written, next load → signin | Don't redirect requests with a `next-action` header (or non-GET); `runAuthed` already returns UNAUTHENTICATED | e2e #9 (fails until fixed) |
| AUTH-02 | P3 | F | UNAUTHENTICATED UX | The message has no "Sign in" action; no return-to after sign-in (reported by F) | Inline sign-in link with `?next=` | — |
| DUP-01 | P3 → FIXED eecac24 (verified: single model `src/application/matrix.ts`; mobile copy deleted; structure test passes) | F | `src/ui/features/matrix/matrix-model.ts` (web) and `mobile/src/features/matrix/matrix-model.ts` | The matrix model was ported verbatim: identical today (QA diff, ignoring imports), but two copies of the core Harada structure can drift silently | Move the pure model to `src/domain/matrix.ts` and import it via `@shared` on mobile; keep one structure test | QA matrix-structure test passes on both copies |
| SEC-01 | P2 → **FIXED edab51d (verified by A/B test)** | D | `begin_write` (flag never reset) | Same test on both commits, as user A in one transaction: `create_goal` then a direct `insert into goals (status 'achieved')`. **45b5109: insert succeeded (leak). edab51d: rejected 42501.** Fix: each public RPC is a wrapper that calls `<rpc>_impl` then `end_write()`. **QA correction:** QA's first "reproduction" (on 45b5109) was invalid: it read `createUser().id` (undefined; createUser returns the id string), so the RPC failed and the swallowed error looked like a leak. The finding stood on the independent subagent repro and the migration code; the A/B test above is the valid evidence | Done. Remaining: disable pg_graphql or remove graphql_public from Exposed schemas (dashboard step, SUPABASE_SETUP.md) | backend regression test + QA A/B |
| SEC-02 | P3 → mitigated edab51d; residual accepted | D | create_goal / add_* | A foreign existing id now returns generic HG409 "This was changed elsewhere — reload" with no constraint name (verified). Residual: conflict vs. success still reveals that a UUID exists; inherent to client-chosen idempotent ids; UUIDs are unguessable → accepted | — | QA check |
| SEC-03 | P3 → FIXED edab51d (per D; covered by backend tests; spot checks not repeated by QA) | D | parse_measure, has(), text fields | measure capped at 1e12; non-object outcomes → HG400; raw text > max+1000 rejected before trim; goal_events growth = one row per real change (accepted) | — | backend tests |
| RPC-01 | P3 (defense in depth) | D + user | `supabase/migrations/20261020120000_rpc_write_path.sql:19-20,1414-1415` | `authenticated` must hold USAGE on `harada_private` and EXECUTE on `begin_write()`, because the invoker RPCs call it. A client could only use it if `harada_private` were exposed through PostgREST, and even then `is_local=true` limits the flag to that single-call transaction | Never add `harada_private` to Supabase "Exposed schemas"; QA checks `pgrst.db_schemas` on staging | staging suite (to add) |
| UX-01 | P3 → FIXED aea1346 (verified: both apps render "No tasks yet" at zero) | F | web `GoalOverview.tsx:88` and native `GoalOverview.tsx` | With zero tasks both show "0 of 0 tasks done"; HARADA_SPEC §5.4 says a zero denominator renders as "—" / "No tasks yet". Consistent across platforms, honest, but off-spec | "No tasks yet" when total = 0, on both | — |
| A11Y-02 | P3 → FIXED aea1346 (verified; mutation check: removing the focus call fails 1 test) | F | native `GoalForm` (TextField primitive doesn't forward refs) | On a validation error, focus doesn't move to the first invalid field; errors are announced. Reported by F, fix planned | Forward refs in TextField; focus the first invalid field | RNTL test to add |
| INT-03 | P2 → FIXED (verified on native 93efb3a: web tsc 0, mobile tsc 0, jest 62/62) | Q | root `tsconfig.json` | Once `mobile/` existed (native 59ede08), the web `tsc` compiled the React Native app too: 66 errors in `mobile/`, plus 1 in `src/infrastructure/auth/rate-limiter.ts` (RN's DOM-style `setInterval` typing leaked into the Node code). Proven: excluding `mobile` → web tsc 0 errors | Exclude `mobile` in the root tsconfig (mobile has its own tsconfig and gate) | web typecheck gate |
| INT-02 | P1 → FIXED f703e23 | F | `src/domain/*` uses `.js` import specifiers (e.g. `./errors.js`) | `next dev`: every page that imports the domain failed with "Can't resolve './errors.js'". Vitest/tsc resolve these; webpack didn't. Found by F | webpack `resolve.extensionAlias {'.js': ['.ts','.tsx','.js']}` in `next.config.ts` (or drop the `.js` specifiers) | journeys 1–8 on 07fd5e9 load domain-backed pages |
| INT-01 | **P1 → FIXED 07fd5e9** | F | ui/integration `477ca3f` | Branch lacks data/supabase `97c845e` (grants hardening, dev-auth allow-list, routine-only trigger) — merging it to main as-is would ship H1/H2 | Merge data/supabase into ui/integration; QA re-verifies | branch ancestry check |
| H1 | **P2 → FIXED 97c845e (verified)** | D | `supabase/migrations/20261019120000_harada_schema.sql:271-279`, `…_daily_focus.sql:19-20` | As user B, `truncate table goals cascade` → expected permission denied / **succeeds and wipes every tenant** (TRUNCATE ignores RLS). Also TRIGGER/REFERENCES granted, the profiles column grant is ineffective, and there are unneeded INSERT/UPDATE/DELETE grants. P2 rather than P0 because PostgREST cannot TRUNCATE and the app runs only fixed SQL: no exploit path today, catastrophic if one appears. Verified on the shim only. | `revoke all … from anon, authenticated` + revoke the default privileges, then re-grant exactly | `rls-holes` ×24 |
| H2 | P2 → FIXED 97c845e (verified) | D | `src/infrastructure/auth/mode.ts:3` | `AUTH_PROVIDER=dev` with `NODE_ENV` unset/`staging` and a real DB URL → expected refusal / **dev auth enabled** (writes `dev_auth` into the real DB; cookie not `secure`) | Allow-list development/test **and** a pglite/memory DB | `rls-holes` ×2 |
| H3 | P3 → FIXED 97c845e (verified) | D | schema `:187-193` | A `routine_checks` row for a task-kind action is accepted | Trigger or routine-only FK | `rls-holes` |
| H4 | P3 → FIXED for clients by D-017 (verified 45b5109: direct goal_events writes → 42501) | D | schema `:219-227` | `goal_events.subject_id` can name another tenant's action; documented as an untrusted label | Constrain if any feature ever joins on it | `rls-holes` (`it.fails`, accepted) |
| M-08b | P2 | D+F | `schemas.ts` | `expectedUpdatedAt` is optional, so a client that omits it still last-write-wins. Goal/key-area/action editors send it (verified in code); reflections have no edit UI | Make it required on updates, or document | — |
| L-01 | FIXED (b858b2f) | U | main | Lint red, so `npm run verify` is red. Remaining: `fix_imports.cjs`, `gen_domain.js`, `screenshot.cjs` (deletion is a user decision), `scripts/migrate.ts`, `src/infrastructure/logger.ts`. `tests/` and `src/ui`, `src/app` are clean | Fix or delete | lint gate |
| U-09 | P2 | F | Toast | Reported fixed on ui/integration 64a7d81 | — | NOT TESTED by QA |
| U-10 | P2 | F+D | Today | No daily priority pick → D added `daily_focus` + use cases in 761b5b1; UI pending | — | NOT TESTED |
| Q-7 | P2 → FIXED | Q | QA runner, environment | Random multi-minute "hangs" on different tests each run (383–910 s). **Root cause: macOS idle sleep** (`pmset sleep 1`) froze workers between tool calls, plus Spotlight indexing. With `caffeinate -i` the same 4 suites pass in **5.6 s** (118 + 1 accepted). Runner now self-wraps in `caffeinate -i`, uses a `.noindex` scratch dir and caps workers. 204 MB of leaked QA temp dirs removed | — | `tests/integration` 118/118 + H4 |
| ENV-01 | FIXED | U | machine | `.data/` pruned with user approval: 12 leaked test DBs removed (501 → 78 MB); `.data/dev` kept. Was: `.data/` in main's checkout is 501 MB; it holds old leaked test DBs **and possibly the dev DB**, so QA has not touched it | Kill the stale process; prune `.data/test-*` (not `.data/dev`) | — |
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

**Verdict: NOT releasable yet. Engineering gates on main are green** (tsc 0, 490/490 tests, 9/9 journeys, 15/15 mobile
checks, no open P0/P1). The remaining blockers are verification-environment gaps, not known defects:
(1) the journeys against a **real Supabase project**, plus the `\dp public.*` grant check; (2) a **real phone** or at least
WebKit/iOS Safari; (3) real session **expiry** under Supabase (the local proxy, #9, found AUTH-01); (4) the native-vs-web platform question. Plus lint
(scaffold scripts) and merging the docs-only `0121743`.

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
