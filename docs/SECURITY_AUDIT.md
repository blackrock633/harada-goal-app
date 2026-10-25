# Security audit — 2026-10-24

Scope: branch `security/hardening` (based on `native/app` 1d14559, which contains `main`): the Next.js web app
(`src/`), the Expo app (`mobile/`), Supabase migrations and the `delete-account` Edge Function (`supabase/`),
dependencies, repository and GitHub configuration. Architecture and trust boundaries: `SECURITY_ARCHITECTURE.md`.
How to re-run every check: `SECURITY_TESTING.md`.

This audit does not certify the app as secure. It records what was looked at, what was found, what was fixed
and verified, and what is still open.

## Summary

| Severity | Found | Fixed and verified | Open |
|---|---|---|---|
| Critical | 1 | 1 | 0 |
| High | 2 | 1 | 1 (GitHub settings: needs the repo owner) |
| Medium | 5 | 4 | 1 (sign-in throttling design) |
| Low | 14 | 10 | 4 |
| Info | 7 | — | — |

**No cross-user data access was found.** Two independent users were tested against every table and every RPC.
The attacks were run twice: once through the normal client path, and once with the write-path guard forced off,
so that only RLS and grants stood in the way. Every attack was blocked. That includes direct reads,
updates, deletes, inserts claiming the other user's ownership, re-parenting rows, joins through child records,
RPCs with the other user's ids or mixed id pairs, anonymous access, and claimless (signed-out) sessions.
The 70 pure-RLS attacks in `tests/integration/security-cross-user.test.ts` pass on the policies as they were
before this audit. The policies were already correct; this audit adds regression coverage.

"Verified" means a regression test fails without the fix and passes with it, unless a different check is named.

## Findings

### Critical

**SEC-DEP-01 — `next` 15.5.27: unauthenticated RCE in the image optimizer (GHSA-2464-fhr4-w9xw) and Server Actions DoS (GHSA-p3m5-59mp-jv5r, high)** · CONFIRMED (vulnerable version installed; `/_next/image` was enabled by default) · **FIXED**
- `package.json`: `next`/`eslint-config-next` 15.5.28 (patch release).
- `next.config.ts`: `images.unoptimized: true`. The app uses no `next/image`, so the optimizer endpoint is removed altogether.
- Verified: `npm audit --omit=dev` reports 0 vulnerabilities. Against the production build, `GET /_next/image?...` → 404.

### High

**SEC-DEP-02 — `zod` 4.6.5: memory exhaustion validating oversized constrained collections (GHSA-mrhx-c7xc-m3w5)** · CONFIRMED (zod parses every server-action input) · **FIXED**: `zod@^4.6.7` (same as mobile). Verified by npm audit and the full test suite.

**SEC-REPO-02 — GitHub repository settings** · CONFIRMED (read-only `gh api`) · **OPEN — requires the repo owner**
- The repository is public.
- Dependabot alerts and Dependabot security updates are off.
- `main` has no branch protection.
- Actions allow any action, and SHA pinning is not required.
- Secret scanning and push protection are on.
- To do: enable Dependabot alerts and security updates; protect `main` with the `ci` and `security` checks as required; require SHA-pinned actions. This audit did not change any settings.

### Medium

**SEC-AUTH-01 — Web Supabase session cookies readable by JavaScript and not `Secure`** · CONFIRMED · **FIXED**
- Cause: `@supabase/ssr` defaults to `httpOnly: false`, and neither `createServerClient` call overrode it. Any XSS could read the access token and the 400-day refresh token. The app has no browser Supabase client, so scripts never need them.
- Fix: `supabaseCookieOptions()` in `src/infrastructure/supabase/env.ts` (`httpOnly`; `secure` outside dev/test), used by `supabase-auth-gateway.ts` and `middleware.ts`.
- Test: `src/infrastructure/auth/supabase-auth-gateway.test.ts` (A/B verified).
- Residual: cookie `maxAge` is fixed at 400 days by `@supabase/ssr`. Session lifetime has to be limited in Supabase Auth (see SUPABASE_SETUP).

**SEC-EDGE-01 — `delete-account` Edge Function: unlimited password guesses with a stolen access token** · CONFIRMED (1,000 guesses, then deletion) · **FIXED**
- Fix: `public.consume_password_attempt(uuid)` allows 5 attempts per user per 15 minutes. It is `SECURITY DEFINER`, executable only by `service_role`, and backed by `harada_private.password_attempts` (migration `20261025120000_security_hardening.sql`). The handler checks it before verifying the password and returns 429 `RATE_LIMITED` once the limit is reached.
- Tests: the handler test (6th attempt → 429; `verifyPassword` is not called) and the DB test (5 × true then false; per-user; anon and authenticated are denied).
- Not verified: the Deno wiring in `index.ts` was not run, because there is no Supabase project here.

**SEC-LOG-01 — Unexpected errors wrote user content and ids to server logs** · CONFIRMED path · **FIXED**
- Cause: drizzle's `DrizzleQueryError` message contains the SQL and its parameters (reflection text, titles, the JWT claims JSON). `toAppError` and `runAuthed` logged it raw, and the logger's redaction only covered top-level keys.
- Fix: `safeErrorSummary()` (`src/application/errors.ts`) keeps names, SQLSTATE codes, constraint names and stack frames. `run.ts` uses it. `ConsoleLogger` now redacts sensitive keys at any depth.
- Test: `src/infrastructure/log-hygiene.test.ts`.

**SEC-DB-01 — `authenticated` could open the RPC write path directly** · CONFIRMED mechanism; exploitable only after a configuration change · **FIXED**
- Background: `harada_private.begin_write()` and the `*_impl` functions are executable by `authenticated`, because the invoker wrappers need that.
- Risk: if `harada_private` were ever added to the API's exposed schemas while pg_graphql is enabled, a single multi-mutation transaction could run `begin_write` and then write directly. That would skip every RPC rule for the caller's own rows. RLS would still block cross-user writes.
- Fix: `begin_write` now reads its call stack (`PG_CONTEXT`) and raises 42501 unless the outermost frame is one of the 30 public wrappers, which always close the write path. `revoke create on schema public` from client roles.
- Tests: `security-cross-user.test.ts` › private helpers (A/B verified). The existing RPC suite (45 tests) still passes.

**SEC-AUTH-03 — Web sign-in throttling: per-email only, per-process, consumed before the credential check** · CONFIRMED (design) · **OPEN**
- Problems:
  - Anyone can lock a victim out of web sign-in for 15 minutes by sending 10 bad attempts.
  - There is no per-IP limit against password spraying.
  - Counters reset on every restart and are not shared across instances.
  - All web sign-ins reach Supabase Auth from the server's IP, so Supabase's per-IP limit is shared by every web user. This last point is potential, not verified.
  - Mobile calls Supabase Auth directly, so only Supabase's limits apply there.
- Why it is not fixed here: a correct fix needs the deployment's trusted client-IP header and a shared store, and neither is in the repo. Reading `X-Forwarded-For` without a trusted proxy would make things worse.
- Recommendation: key on `ip` and `ip+email` using the proxy's IP header; use a shared store (Postgres table or Redis); use a soft per-email limit (delay or CAPTCHA, not a block); enable Supabase CAPTCHA.

### Low

| ID | Finding | Status |
|---|---|---|
| SEC-HDR-01 | No CSP and no HSTS | **FIXED**: nonce-based CSP in `src/middleware.ts` (no `unsafe-inline` for scripts; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'`) and HSTS in `next.config.ts`. Verified in Chrome and WebKit against the production build: pages hydrate with 0 violations, and injected inline handlers and `srcdoc` scripts are refused. |
| SEC-AUTH-02 | Web sign-up revealed whether an email is registered (it threw `EMAIL_TAKEN` on Supabase's obfuscated response) | **FIXED**: same "check your email" answer as a new address, matching mobile. Test in `supabase-auth-gateway.test.ts` (A/B). If "Confirm email" is turned off in Supabase, Auth itself reports existing emails, so keep it on. |
| SEC-MOB-01 | iOS keychain items used the default `WHEN_UNLOCKED` (they can move to a new device through an encrypted backup) | **FIXED**: `WHEN_UNLOCKED_THIS_DEVICE_ONLY` on every SecureStore call (`mobile/src/auth/secure-session-storage.ts`) + test. Existing iOS users may have to sign in once after updating. |
| SEC-EDGE-02 | Edge Function password probe left a live session behind, and reported Auth outages and rate limits as "incorrect password" | **FIXED** in `index.ts` (probe `signOut`; only `invalid_credentials` counts as "false"). Handler-level test for the 500 path. Deno wiring not executed. |
| SEC-EDGE-03 | Edge Function read unbounded bodies and had no CORS preflight (account deletion was broken on the Expo web build) | **FIXED**: 4 KB cap → 413 before auth; `OPTIONS` answered only for origins listed in `ALLOWED_ORIGINS`. Tests. |
| SEC-DB-02 | Measure numbers capped in magnitude but not in digits (a 16,000-digit fraction was stored and copied into `goal_events` on every call) | **FIXED**: `harada_private.num` rejects over 32 characters → HG400. Test. |
| SEC-VAL-01 | Web zod accepted measures up to 1e308; the RPC caps at 1e12 | **FIXED**: `.max(1e12)` + `schemas.security.test.ts`. |
| SEC-REPO-01 | `.gitignore` did not cover `.env.production`/`.env.staging`, signing keys (`*.pem`, `*.p8`, `*.p12`, `*.jks`, `*.keystore`), Firebase/Google credential files, `supabase/.temp` | **FIXED** (`git check-ignore` verified). |
| SEC-BUILD-01 | The service-role module had only a runtime `typeof window` guard against client bundling | **FIXED**: `import 'server-only'` in `supabase-auth-gateway.ts`. A client import now fails the build. Production build verified. |
| SEC-DEP-04 | PostCSS 8.4.31 nested under `next`: 4 advisories (2 rated high), used at build time only | **FIXED**: `overrides.next.postcss ^8.5.29`; build verified. |
| SEC-DEP-03 | Mobile: 5 high / 5 moderate, all inside `expo` → `@expo/cli` build tooling (node-forge, zod 3, uuid). The app bundle ships zod 4.6.7 | **OPEN, upstream**: no fix that doesn't downgrade the SDK. CI gates mobile on critical and reports highs. `.trivyignore` entry has a removal condition. |
| SEC-DB-03 | Integrity, own data only: changing a routine to a task keeps its completion records; `complete_action`/`update_action` work on actions in an archived key area | **OPEN** (not a security boundary; product decision). |
| SEC-DB-05 | No per-user quotas on goals, reflections or events (per-call inputs are bounded) | **OPEN**: add caps or API rate limits before public launch. |
| SEC-AUTH-04 | Dev-auth cookie has no expiry and cannot be revoked (dev mode only; refused in production) | **OPEN, accepted** (dev only). |

### Informational

- **Secrets:** none found in the working tree or in the history of any branch (101 commits). Checked with gitleaks, trivy secret, semgrep p/secrets and manual regexes. `.env.example` holds placeholders only. The single hit was a test-only `DEV_AUTH_SECRET` in `tests/qa-regress.sh`; it is allowlisted in `.gitleaks.toml` with a reason. No credential needs rotating.
- **Client keys:** mobile reads only `EXPO_PUBLIC_SUPABASE_URL` and the anon/publishable key. The web exposes only `NEXT_PUBLIC_SUPABASE_*`. These keys are public by design, and access control comes from RLS. The service-role key is used only by the web server (account deletion) and the Edge Function.
- **SEC-DB-04, existence oracle:** creating with another user's existing id returns HG409 rather than success. This needs a known v4 UUID. Accepted.
- **SEC-MOB-02:** the Expo **web** build keeps the session in `localStorage` (native uses the keychain). Treat that build as preview-only, or move it to cookie-based auth before deploying it publicly.
- **No password-reset flow** exists on either client. That means no reset-token surface, but users who forget their password are locked out.
- **Web has no account deletion or data export UI.** The use cases exist but are not wired up. This is an app-store / GDPR gap, not a vulnerability.
- **GraphQL:** the apps don't use it. Disable `pg_graphql` or remove `graphql_public` from exposed schemas (SUPABASE_SETUP §1). The staging suite checks this but has not run (see SECURITY_TESTING).

## Changes in this audit

| Area | Files |
|---|---|
| Migration | `supabase/migrations/20261025120000_security_hardening.sql` (SEC-DB-01, SEC-DB-02, SEC-EDGE-01) |
| Edge Function | `supabase/functions/delete-account/handler.ts`, `index.ts` |
| Web auth / headers | `src/infrastructure/supabase/env.ts`, `src/infrastructure/auth/supabase-auth-gateway.ts`, `src/middleware.ts`, `next.config.ts` |
| Logging / validation | `src/application/errors.ts`, `src/app/actions/run.ts`, `src/infrastructure/logger.ts`, `src/application/schemas.ts` |
| Mobile | `mobile/src/auth/secure-session-storage.ts` |
| Dependencies | `package.json`, `package-lock.json` (`next`, `zod`, `vitest`, `undici`, `server-only`, postcss override) |
| Repo / CI | `.gitignore`, `.gitleaks.toml`, `.trivyignore`, `.github/workflows/security.yml`, `.github/workflows/ci.yml`, `.github/dependabot.yml`, `eslint.config.mjs` (root lint no longer lints `mobile/`; this was a pre-existing lint failure) |
| Tests | `tests/integration/security-cross-user.test.ts` (75), `src/infrastructure/auth/supabase-auth-gateway.test.ts`, `src/infrastructure/log-hygiene.test.ts`, `src/application/schemas.security.test.ts`, additions to `delete-account-function.test.ts` and `mobile/src/auth/__tests__/secure-session-storage-test.ts` |

## Deployment order (required)

1. `supabase db push`: the new migration must land **before** the Edge Function, which calls `consume_password_attempt`.
2. `supabase functions deploy delete-account`, and set `ALLOWED_ORIGINS` if the Expo web build is used.
3. Deploy the web app. Users will need to sign in again only if their cookies were set by the old build without `Secure` over plain HTTP. Normal HTTPS sessions keep working.
4. Ship the mobile update. Some iOS users may be asked to sign in once (SEC-MOB-01).
