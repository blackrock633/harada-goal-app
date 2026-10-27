# Project Status Report

**Project:** Harada Goal App
**Last updated:** 2026-10-26 (refreshed by the session that built the premium system; previous version: 2026-10-20)
**Current commit:** `fc58b29` (branch `security/hardening`; local `main` was fast-forwarded to it by another session)
**Overall status:** Active, **at risk**: the backend is live, but the product has never been seen on a device or run against real Stripe or Claude, and a second session's uncommitted work in the main checkout (§6) has not been committed or deployed.
**Development stage:** pre-release. A Supabase project is live; the mobile app runs only in Expo Go; nothing is deployed to the web or the stores.

> **How to read this.** Status words: **VERIFIED** (executed and passed, evidence given), **Implemented, unverified**,
> **NOT TESTED**, **BLOCKED**. `QA_REPORT.md` (independent QA ledger) was last updated **2026-10-20** and predates the
> native app, the security audit and the premium system; where it disagrees with this file on anything after that
> date, this file is newer. Detail lives in: `PREMIUM_SYSTEM.md` (premium), `SECURITY_AUDIT.md` /
> `SECURITY_ARCHITECTURE.md` / `SECURITY_TESTING.md` (security), `DECISIONS.md`, `SUPABASE_SETUP.md`.

## 1. Executive summary

- **What it is:** a Harada Method app: one goal, 8 key areas, 64 actions, daily execution and reviews. The client is a native **Expo / React Native** app (`mobile/`, user decision 2026-10-20) talking straight to Supabase (reads under RLS, writes only through Postgres RPCs, D-017). A Next.js web app (`src/`) still exists and now also serves the public pages.
- **Since the last report (2026-10-20):**
  - The native app was built and wired to real data; a security audit was run and fixed (2026-10-24/25).
  - A real Supabase project (`krmuohxsbmshtgebklme`) is linked, with all 13 migrations applied and the `delete-account` function deployed.
  - The premium system (Free/Pro plans, Stripe billing, 30-Day Challenge, sharing, referrals, analytics, admin metrics, AI planning suggestions) was built and committed in `fc58b29`.
  - Four UI fixes were requested and made: logo-only login, centred key-area names, distinct daily/weekly reviews, pinch-zoom on the full sheet.
- **Verified today (2026-10-26):** web typecheck clean; 739 vitest tests passed (15 skipped, 55 files); mobile typecheck clean; 389 jest tests passed (28 suites). Evidence in §9.
- **Biggest gaps:**
  1. **Nothing premium has run for real:** no Stripe keys, no Anthropic key, and the billing/AI Edge Functions are not deployed.
  2. **No screen has been checked on a device or in a browser** since the premium work. The user saw Today fail ("Something went wrong") before the migrations were applied; whether it loads now has not been confirmed.
  3. **Parallel uncommitted work** in the main checkout (§6): Pro-only challenge and weekly reviews (user-approved 2026-10-26, now a new migration, not yet deployed) and a large community/social feature (not reviewed by this session).
  4. The older gaps stand: web e2e not re-run since 2026-10-20; the cross-user suite against the live project has not been run.
- **Immediate priority:** commit the main-checkout work in reviewable pieces and deploy migration `20261026170000` (note: `db push` would also apply the unreviewed social migration `…160000`), then confirm the app loads on the phone and run one Stripe test-mode purchase end to end.

## 2. Project objectives

- **Primary objective:** help a person reach one long-term goal with the Harada Method (plan, execute, review), with progress that never overstates achievement.
- **Intended users:** individuals on their phone. Whether coaches or teachers take part is undecided; the app is single-user.
- **Core requirements:** `mobile/PRODUCT.md`, `HARADA_SPEC.md`. Planning completeness, action completion and goal attainment stay separate metrics (D-015). No gamification; AI only as optional, labelled suggestions accepted item by item.
- **Business model (brief of 2026-10-26):** freemium. Free must be genuinely useful: one active goal, the full matrix, daily tracking and daily reflection, basic progress card. Pro ($7.99/month or $49.99/year, configurable) adds multiple goals, history, weekly and monthly reviews, the 30-Day Challenge, premium templates, AI suggestions. Downgrades never delete data. **User decision 2026-10-26:** weekly reviews and the 30-Day Challenge are Pro (the brief had them Free); the `challenge` card is Pro too.
- **Definition of success:** a user can plan, act, review, upgrade when useful and share progress; security is enforced by the database (D-017); nothing claims success it has not verified.
- **Constraints:** RLS on every table; no service-role key on any client; no destructive migrations; a new migration for every schema change (applied migration files must not be edited).

## 3. Current state

| Area | Status | Evidence |
|---|---|---|
| Core app (goal, matrix, today, reviews) on PGlite + shim | VERIFIED | vitest 739 passed; RLS and adversarial suites; mobile jest 389 |
| Live Supabase schema | VERIFIED: `supabase migration list --linked` shows all 13 local migrations applied remotely (2026-10-26) | CLI output |
| Live Supabase security probes | VERIFIED 2026-10-25 (before the premium migrations); partly re-probed 2026-10-26 as anon only | `SECURITY_TESTING.md`; see §9 |
| Cross-user suite against the live project (`tests/staging`) | NOT TESTED (skips without `STAGING_DATABASE_URL`) | `SECURITY_TESTING.md` |
| Premium database layer (plans, entitlements, reviews, templates, history, challenge, sharing, referrals, analytics, admin) | VERIFIED on PGlite; applied to live; behaviour on live not exercised as a signed-in user | `tests/integration/premium-features.test.ts` (20 tests) |
| Stripe checkout, portal, webhook | Implemented, unverified: logic tested with mocks (13 tests); **not deployed, no keys, price ids unset** | `billing-functions.test.ts` |
| AI planning (`ai-plan`) | Implemented, unverified: handler tested with a mocked model (6 tests); **not deployed, no API key**; the call to the Claude API has never been made | `ai-plan-function.test.ts` |
| Mobile screens (upgrade, plan/billing, goal switcher, reviews, history, suggestions, challenge, share) | Implemented, unverified on a device: tests pass, nothing seen on screen | mobile jest |
| Web pages (landing, pricing, challenge, `/s/<token>`, billing, `/admin`) | Implemented; `next build` passes; checked with `curl` and unit tests only, never in a browser | web agent report; build |
| iOS app on the phone | Runs through Expo Go over Wi-Fi (works); no EAS build verified | user screenshots |
| Web deployment / `EXPO_PUBLIC_WEB_URL` | NOT DONE | — |

## 4. Architecture and technology

- **Stack:** Expo SDK 58 / React Native 0.88, Expo Router, TanStack Query, supabase-js (mobile); Next.js 15, React 19, TypeScript, Tailwind, Drizzle (web); Supabase Postgres + Auth; Deno Edge Functions. Node 24 is the default (`nvm alias default 24`); Expo 58 needs ≥ 22.13.
- **Layers (web):** `src/domain` → `src/application` → `src/infrastructure` → `src/app` / `src/ui`, enforced by ESLint. Mobile imports `src/domain` and `src/application` via `@shared/*`.
- **Authorization:** the database. The device is untrusted; RLS, exact grants, a write-guard trigger and SECURITY INVOKER RPCs (D-017). Premium rules are triggers or SECURITY DEFINER functions resolving the caller from `auth.uid()` (D-018), so the web server's direct-write path is covered too.
- **Entitlements:** `harada_private.plan_of(user)` decides Free/Pro from `subscriptions` (written only by the Stripe webhook, service role) and `plan_grants` (operator comps). Limits, features and prices are rows.
- **Edge Functions:** `delete-account` (deployed, v2), `billing-checkout`, `billing-portal`, `stripe-webhook`, `ai-plan` (written, not deployed). Pure handlers live in `supabase/functions/_shared/` and are unit-tested under Node; the Deno wiring (`index.ts`, `*-deps.ts`) has **never been executed**.
- **Environments:** local = PGlite + auth shim; tests = in-memory PGlite; live = one Supabase project (no separate staging project exists, so "run the staging suite against staging" has no target).
- **Delivery:** CI workflows `ci.yml`, `security.yml`; EAS project linked and EAS Update configured (06cc578); no EAS build or update is verified. `fc58b29` is not pushed (`origin/security/hardening` is one commit behind).
- **Details:** `ARCHITECTURE.md`, `PREMIUM_SYSTEM.md`, `SECURITY_ARCHITECTURE.md`.

## 5. Completed work

| Item | Where | Verification | Known limits |
|---|---|---|---|
| Supabase schema, RLS, exact grants, write-path RPCs, security hardening | `supabase/migrations/20261019…`–`20261025…` | RLS 82, adversarial and cross-user suites; live probes 2026-10-25 | Cross-user suite not run on live |
| Security audit and fixes (1 critical fixed; GitHub-settings item open) | `SECURITY_AUDIT.md` | regression tests per fix | Audit predates the premium work (§8) |
| Native app wired to real data | `mobile/` | jest 389 | Never on a real project beyond Expo Go checks by the user |
| Premium database layer (6 migrations: plans, reviews, templates, history, challenge, sharing, referrals, analytics, admin) | `supabase/migrations/20261026*` | `premium-features.test.ts` 20; structure tests pinned to explicit allow-lists | As Free/Pro user on live: not exercised |
| Billing handlers (checkout, portal, signed idempotent webhook) | `supabase/functions/_shared/billing.ts` | 13 tests incl. real HMAC signatures | Not deployed; Stripe never called |
| AI planning handler (Pro, 20/day, validated output) | `_shared/ai-plan.ts` | 6 tests | Not deployed; never called the API; `fallbacks: "default"` is behind a `@ts-expect-error` (SDK typing) |
| Mobile premium UI (upgrade, plan, reviews, history, suggestions, templates, over-limit chooser) | `mobile/src/features/premium`, `review`, `goal`, `matrix` | jest, 25 + 8 + 4 + … tests | Not seen on a device |
| Mobile challenge and sharing UI | `mobile/src/features/challenge`, `sharing` | jest 31 | Image export sizes unverified; no web export |
| Web pages (landing, pricing, challenge, share, billing, admin) | `src/app/*`, `src/ui/features/marketing` | 61 new vitest tests; `next build` | Not viewed in a browser |
| UI fixes (login, key-area centring, daily/weekly prompts, pinch-zoom) | `mobile/src/…` | jest; **pinch-zoom never tried on a device** | iOS only; Android scrolls sideways |
| Archived-goals-only restore path on the goal tab | `mobile/src/app/(tabs)/goal/index.tsx` | existing suite passes; no dedicated test | — |

## 6. Work in progress

| Task | Current state | Remaining | Blockers |
|---|---|---|---|
| **Uncommitted work in the main checkout (`/Users/noahdockery/harada-goal-app`, branch `main`)** | `main` was fast-forwarded to `fc58b29` by another session, which left ~65 modified and ~14 untracked files. Two bodies of work: (1) **Pro gating** of the challenge and weekly/monthly reviews (mobile + web screens, tests); (2) a **community/social feature** (`social_*` tables, `20261026160000_social_community.sql` of 2165 lines, `/community`, `/u/…`, `src/application/social.ts`, …). | Review and commit in pieces; deploy; verify on a device | Owner's intent; Pro gating needs deploy approval |
| **Pro gating migration (this session, 2026-10-26)** | The other session had edited five *already-applied* migrations. Per the user ("keep the edits") the change was re-expressed as **`supabase/migrations/20261026170000_gate_challenge_and_weekly_reviews.sql`** (generated from the edited bodies: new `challenge` feature, weekly/monthly reflections and challenge enrollments hidden by RLS and refused by RPCs without Pro, `challenge` share cards gated) and the five applied files were restored to their committed content. A backup of the pre-change diff is in the session scratchpad (`main-checkout-uncommitted.patch`). **Uncommitted; not applied to the live project.** | Commit; deploy (below); verify as Free and Pro user on live | Deploy approval |

Verified on the main checkout's combined tree after the change: `vitest` **764 passed, 15 skipped** (57 files + 1 skipped); root and mobile `tsc` clean; mobile `jest` **392 passed** (28 suites). The tests apply the migrations in order from scratch, i.e. the same path the live project takes (original files, then `…160000`, then `…170000`).

**Deploy caveat:** `supabase db push` applies every pending migration, so it would also apply the community migration (`…160000`, 2165 lines, which this session has not reviewed). Review it first, or move it aside for the push.

## 7. Outstanding tasks

| P | Task | Why | Depends on | Acceptance | Status |
|---|---|---|---|---|---|
| **P0** | Review and deploy the Pro-gating migration `20261026170000`; decide what to do with the community migration `…160000` that `db push` will carry along | Without the deploy the live database still serves the challenge and weekly reviews to Free users | User approval to push; review of `…160000` | `supabase migration list --linked` shows 15 applied; as a Free user `join_challenge` → HG402 and weekly reflections are hidden; as Pro both work | Migration written and tested locally; **not deployed** |
| **P1** | Confirm the app loads on the phone after the migrations (Today, Goal, Settings, Challenge) | The user's last observation was a failure caused by the then-missing schema | User | Screenshots/confirmation; any error investigated | Waiting on user |
| P1 | Stripe test-mode purchase end to end | The only real proof of billing; today only mocks | Stripe account + test keys; price ids on `prices`; functions deployed | Checkout → webhook → `get_my_plan` says pro → portal cancel → free at period end | Blocked on user (keys) |
| P1 | Deploy `billing-checkout`, `billing-portal`, `stripe-webhook`, `ai-plan`; set secrets | Premium UI says "not available yet" until then | Keys, `APP_URL`, `ANTHROPIC_API_KEY` | `supabase functions list` shows 5 ACTIVE; one successful call each | Blocked on user (keys) |
| P1 | Run the live cross-user suite (`tests/staging`) | New tables/RPCs were never attacked on the real project | A **non-production** project (none exists) | 15 tests pass | Needs a staging project |
| P1 | Look at every new screen on a device and in a browser (375 pt, dark mode, 200 % text) | Layout was reviewed in code only | Phone/browser | Defects filed or none found | Open |
| P2 | Decide App Store position on web checkout | Apple rules vary by storefront | User | Written decision in `DECISIONS.md` | Open |
| P2 | Deploy the web app; set `EXPO_PUBLIC_WEB_URL` | Public share/invite links and referral are hidden without it | Host choice | `/s/<token>` reachable over HTTPS | Open |
| P2 | Extend the security audit to the premium surface; push `fc58b29` so CI runs | CI and audit have not seen it | Push approval | CI green; audit appendix | Open |
| P2 | Pin `npm:@anthropic-ai/sdk` in `ai-plan/index.ts`; confirm `fallbacks: "default"` against the live API | Unpinned import; typing suppressed | Anthropic key | One real call succeeds | Open |
| P2 | Re-run web Playwright e2e on current code | Last run 2026-10-20; web changed heavily | — | #1–#13 per engine | Open |
| P3 | Export (`exportData`) to include challenges and share links | Incomplete data export | — | Export lists them | Proposed |
| P3 | Web: choose-active-goal after downgrade; copy-link button; image export on web | Parity gaps | — | — | Proposed |

## 8. Known bugs and limitations

- **Premium behaviour on the live database as a signed-in user is unexercised.** Only anon probes were run after migration (prices readable; `get_my_plan` and the challenge table refuse anon).
- **Billing and AI never reached their providers.** Checkout refuses until `prices.stripe_price_id` is set; AI answers "not available" without a key.
- **Rate limiting is in-memory per process** (web share page, tracking, sign-in): ineffective across restarts or instances.
- **Web checkout needs JavaScript** (CSP `form-action 'self'`).
- **Mobile:** card image export fails on web (optional `html2canvas` peer missing); no copy-to-clipboard; tapping Edit on a past reflection fills the form but does not scroll to it; restoring an archived goal on Free may be refused with the upgrade prompt (intended).
- **Web:** no choose-active-goal after a downgrade (told to use the app).
- **Pinch-zoom** on the full sheet is iOS only; unverified on a device.
- **Older, unresolved from 2026-10-20 (not re-run since):** WebKit e2e #3 and #9 failures (cause unconfirmed), AUTH-02 (no return-to after session expiry), H4 (accepted: `goal_events.subject_id` is an untrusted label).
- **Security audit open items:** GitHub repository settings (needs the repo owner); sign-in throttling design (`SECURITY_AUDIT.md`).

## 9. Testing and verification

Run 2026-10-26 on `fc58b29` (clean working tree in the `security` worktree):

| Check | Command | Result |
|---|---|---|
| Web typecheck | `npx tsc --noEmit` | 0 errors |
| Web/DB/integration tests | `npx vitest run` | **739 passed, 15 skipped**, 55 files passed + 1 skipped |
| Mobile typecheck | `cd mobile && npx tsc --noEmit` | 0 errors |
| Mobile tests | `cd mobile && npx jest` | **389 passed**, 28 suites |
| Web lint | `npx eslint .` | 0 errors, 3 `no-console` warnings (pre-existing, `logger.ts`) |
| Web production build | `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npx next build` | succeeds |
| Live migrations | `supabase migration list --linked` | 13 of 13 applied remotely |
| Live functions | `supabase functions list` | only `delete-account` (v2, ACTIVE) |
| Live API as anon | `curl` to `/rest/v1/...` | `prices` readable; `reflections`, `challenge_enrollments` and `get_my_plan` refuse anon (42501) |

(Lint and build were run earlier the same day, before the last mobile-only edit; the web code has not changed since.)

**Not run:** Playwright e2e; `tests/staging`; any Maestro/device flow; Stripe; the Claude API; the Deno wiring of any Edge Function; the dirty main checkout. **Mocked:** Supabase Auth in every test; Stripe and the model in the function tests. **Real:** Postgres engine, constraints, triggers, RLS (PGlite).

## 10. Technical debt

| Issue | Consequence | P | Remediation |
|---|---|---|---|
| Domain rules exist in TypeScript and in SQL | Drift risk (the parity test found 3 bugs) | P2 | `rpc-parity.rls.test.ts`; long-term, web writes through the RPCs |
| Deno wiring never executed | A broken `index.ts` would only show at deploy | P2 | Deploy to the live project behind keys; smoke each function |
| `fallbacks` typing suppressed; SDK unpinned in `ai-plan` | Breaks silently on an SDK change | P2 | Pin; remove the suppression when typings catch up |
| In-memory rate limiter | See §8 | P2 | Shared store before multi-instance deploy |
| Free templates duplicated (TS file and DB rows) | Drift | P3 | `templates-sync` test guards it |
| Mobile has no ESLint config | Lint not enforced there | P3 | Add config |

## 11. Architecture and technical decisions

`DECISIONS.md`. Current: **D-013** Supabase + RLS as the boundary; **D-014** matrix positions; **D-015** separate metrics; **D-016** daily focus; **D-017** device reads under RLS, writes through RPCs; **D-018** Harada Pro: Stripe on the web, entitlements in Postgres (2026-10-26).
- **Tension to resolve:** D-006 removed "the AI assistant" and `PRODUCT.md` says "no AI". The planning suggestions are optional, labelled "Suggested" and accepted item by item, which is the exception `PRODUCT.md` allows, but D-006 was never amended. Provisional until the user confirms.
- **New rule recorded here:** applied migrations are immutable; changes go in a new file.

## 12. Risks and dependencies

| Risk | Impact | Likelihood | Mitigation | Status |
|---|---|---|---|---|
| Repo and live DB diverge | Wrong behaviour in production that tests do not show | Was high (applied migrations had been edited); addressed 2026-10-26 by restoring them and adding `…170000` | Keep applied migrations immutable; check `migration list` before each push | Mitigated; confirm after deploy |
| Large unreviewed community feature in the working tree | A 2165-line migration and new public surface reach production via `db push` | Medium | Review before pushing; `rls-adversarial` allow-lists already updated by its author | Open |
| Two sessions editing one repository | Lost or contradictory work | Happening now | One owner per checkout; say who is working where | Open |
| Premium never exercised end to end | First real purchase fails | Medium | Stripe test-mode run | Open |
| Only one Supabase project (no staging) | Attack/QA suites would run against production data | Medium | Create a staging project before running `tests/staging` | Open |
| App Store rejection for web payments | iOS release blocked | Medium | Policy decision (§15) | Open |
| Hosted Supabase differs from the shim (GoTrue, pooler) | Auth surprises | Low–Medium | `tests/staging`, journeys against live | Partly mitigated (probes 2026-10-25) |
| Secrets (Stripe, Anthropic, service role) | Leakage | Low | Edge-function secrets only; scan of the `fc58b29` diff found none | Mitigated |

## 13. Potential future improvements (not approved)

Reminders and notifications; Android parity for pinch-zoom; a coach/teacher view (undecided); in-app purchase via StoreKit if web checkout is not acceptable; a shared-store rate limiter; stronger analytics views. Each needs a decision before work.

## 14. Recommended next steps

1. **Commit the main-checkout work in reviewable pieces and deploy `…170000` (P0).** Review the community migration first because `db push` carries it. *Done when:* §7 P0 acceptance passes and the repo's applied migrations still equal the live versions.
2. **Confirm the phone loads the app** and report anything broken. *Done when:* Today, My Goal, Settings and the challenge open without errors.
3. **Stripe test mode + Anthropic key → deploy the four functions → one purchase.** *Done when:* §7 P1 acceptance passes.
4. **Create a staging Supabase project** and run `tests/staging`.
5. **Look at the new screens** on the device and in a browser, then push the branch so CI runs.

Step 1 comes first: until it is deployed, the live database serves Free users what the app now says is Pro.

## 15. Decisions or input needed (user)

- ~~Pro-only challenge and weekly reviews~~: **decided 2026-10-26, keep the edits** (Pro). Still open: **may `db push` carry the community migration `…160000`**, or should it be reviewed/held back first? Recommendation: review it before any push.
- **Stripe account and test keys; Anthropic API key** (set as Edge Function secrets, never in chat or git).
- **App Store policy for web checkout** (US external link vs in-app purchase elsewhere).
- **Confirm AI suggestions are acceptable** under the "no AI" product rule, so D-006 can be amended.
- **A staging Supabase project** (needed for the attack suites) and a **web hosting target**.
- **Push `fc58b29` to GitHub?** (CI and the audit have not seen it.)

## 16. Recent changes (2026-10-21 → 2026-10-26)

- Native app wired to data; redesign around the printed sheet; pull-to-refresh.
- Security audit 2026-10-24/25, fixes and CI; live Supabase linked, `db push`, `delete-account` v2 deployed, probes recorded; EAS linked.
- 2026-10-26: UI fixes (logo-only login, centred key areas, daily vs weekly prompts, pinch-zoom); premium system built by this session and three UI agents; migrations `20261026120000`–`150000` applied to the live project after the app failed with "Something went wrong" on a missing column; all committed as `fc58b29`.
- Corrections to the previous version of this file: "never run against a real Supabase project" and "490 tests" were out of date; the web app is no longer the only client; AI is no longer absent (see §11).
- Discovered: `main` fast-forwarded and ~65 uncommitted edits plus a community/social feature in the main checkout (§6).
- Decided by the user: keep the Pro-only challenge/weekly-review edits. Done by this session: `20261026170000_gate_challenge_and_weekly_reviews.sql` added, the five applied migrations restored, full suites re-run (§6).

## 17. Status confidence and unknowns

- **Verified directly by this session today:** §9 results; the migration and function lists; the anon probes; the diff of the main-checkout migration edits (read in full).
- **Supported by tests only (mocked or PGlite):** all premium behaviour, billing logic, AI handler, mobile and web screens.
- **From documents, not re-checked:** the security audit findings and the 2026-10-25 live probes; QA's 2026-10-20 e2e results.
- **Verified by this session on the main checkout's combined tree (2026-10-26, after the migration change):** vitest 764 passed / 15 skipped, `tsc` clean (root and mobile), jest 392 passed. The community feature and the Pro-gated screens were **not** reviewed or seen, only tested by their author's tests.
- **Unknown:** whether the phone app now loads; the author's intent for the community feature; behaviour of Stripe, Claude, the Deno functions and the screens on real devices; WebKit e2e state; GitHub CI result for `fc58b29`.
