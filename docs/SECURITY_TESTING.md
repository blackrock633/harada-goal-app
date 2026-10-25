# Security testing

## One command

```bash
npm run test:security     # authorization, RLS, RPCs, auth hardening, log hygiene — no secrets or network needed
```

It runs on the real migrations, applied to embedded Postgres (PGlite) after `supabase/tests/auth-shim.sql`.
Each test switches to role `authenticated` with a user's JWT claims, which is exactly what PostgREST does
for a supabase-js client. These are real database permission checks, not mocked frontend checks.

| Suite | What it proves |
|---|---|
| `tests/integration/security-cross-user.test.ts` | User A attacks user B with B's real ids: reads by id/owner/join, updates, deletes, inserts claiming B, ownership hand-off, re-parenting (key area → B's goal, action → B's key area), upserts over B's ids, TRUNCATE, completion records, reflections, forged history, focus rows; every RPC with B's ids and mixed A/B pairs; direct `harada_private` calls; anon; claimless sessions; the delete-account attempt limiter; numeric DoS. **Every direct-table attack runs twice**: once as a plain client, and once with the write-path guard forced on, so RLS and grants alone must stop it. Ends with a byte-for-byte snapshot of B's data. |
| `tests/integration/rls-adversarial.test.ts`, `src/infrastructure/db/rls.rls.test.ts` | Privilege catalog (no TRUNCATE/TRIGGER/REFERENCES, anon has nothing), RLS enabled and policies present on every table, owner rules, the server repositories path (`uow.run`) |
| `src/infrastructure/db/rpc.rls.test.ts`, `rpc-parity.rls.test.ts`, `native-read.rls.test.ts` | RPC write path: guard on direct writes, input validation, foreign ids → NOT_FOUND, SEC-01 flag scope, parity with the web use cases, the mobile read queries under RLS |
| `src/infrastructure/auth/*.test.ts` | Session cookies are httpOnly/Secure; sign-up does not enumerate; dev auth refused in production; Edge Function: auth, re-auth, attempt limit, body cap, CORS, error hygiene |
| `src/infrastructure/log-hygiene.test.ts` | No reflection text, user ids, emails or tokens in logs |
| `src/application/schemas.security.test.ts` | Web validation limits match the database |

Mobile-side: `cd mobile && npx jest src/auth src/data` covers keychain storage (device-only, chunking, partial-session
handling), the cache clear on user switch, and RPC error mapping.

## Scanners

All of these run in `.github/workflows/security.yml` on every PR, on pushes to `main`, and weekly.

| Check | Command (local) | Last local result (2026-10-24) |
|---|---|---|
| npm audit, web | `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities (all deps: 4 moderate, dev-only, in drizzle-kit's esbuild) |
| npm audit, mobile | `cd mobile && npm audit --omit=dev --audit-level=critical` | 0 critical; 5 high / 5 moderate in `@expo/cli` tooling (SEC-DEP-03) |
| gitleaks (full history) | `gitleaks git . --config .gitleaks.toml --redact` | 101 commits, no leaks |
| Semgrep | `semgrep scan --config p/typescript --config p/javascript --config p/react --config p/nextjs --config p/secrets src mobile/src supabase scripts` | 0 findings, 322 files (semgrep 1.136 locally; CI pins 1.182) |
| Trivy | `trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --ignore-unfixed --ignorefile .trivyignore --skip-dirs legacy .` | clean (one reviewed ignore: zod 3 in @expo/cli) |
| CSP / headers | production build + Chrome and WebKit (see below) | hydration OK, 0 violations; injected inline handlers and `srcdoc` scripts refused; HSTS and CSP present; `/_next/image` 404 |

The workflow files were validated locally (YAML parse, pinned action SHAs resolved through the GitHub API,
release assets exist). **They have not run on GitHub Actions yet**, because the branch has not been pushed.

### CSP check

Run `npm run build`, then start the server:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
  DATABASE_URL=pglite://.data/csp NODE_ENV=production npx next start -p 3101
```

Then load `/signin` and `/signup` in a browser. Confirm that DevTools shows no CSP errors and that the forms
work. Each `<script>` tag should carry the nonce from the response's `content-security-policy` header.

### End-to-end

`tests/qa-regress.sh` runs the Playwright journeys under `next dev` with dev auth, on Chrome and WebKit.

## Not run, and why

| Check | Why | How to run it |
|---|---|---|
| **Live Supabase** (`tests/staging/staging.test.ts`, 15 tests): grants on the real project, PostgREST/GraphQL exposure, GoTrue sign-up/sign-in, Edge Function end to end | No staging project credentials, Docker or Supabase CLI on this machine. The tests **skip with a reason**; they are never counted as passed | Put `STAGING_DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for a **staging** project in `.env.local`, then run `npx vitest run tests/staging`. Never point it at production. Add a probe there that `POST /rest/v1/rpc/begin_write` with `Content-Profile: harada_private` returns PGRST106 |
| OWASP ZAP | No deployed web environment to scan. ZAP against `next dev` mostly tests the dev server | After a staging deploy: `zap-baseline.py -t https://<staging-host>` (passive; GitHub Action `zaproxy/action-baseline`). Do not run active scans against production |
| Mobile `expo lint` | Needs Node ≥ 22.13 (this machine has 20); `mobile/` has no ESLint config yet | CI uses Node 24. Add `eslint-config-expo` and wire it into ci.yml |
| Native device testing of keychain accessibility | No device or simulator run in this audit | Install a dev build, sign in, restore an encrypted backup to a second device, and confirm the session is not carried over |

## Fidelity of the local database tests

The shim emulates `auth.uid()` (from `request.jwt.claims`), the `anon`/`authenticated`/`service_role` roles
and a minimal `auth.users`. It does not emulate GoTrue, PostgREST's schema exposure, or pg_graphql. Those are
the parts the staging suite covers. RLS, grants, triggers, SECURITY DEFINER/INVOKER behaviour and the RPCs
run on real Postgres code.

## Adding a regression test

For a new table or RPC:

1. Add a direct-read and a direct-write case to `security-cross-user.test.ts`. The write cases run in the
   `describe.each([false, true])` block, so they are checked both with and without the write-path guard.
2. Add a foreign-id case to the RPC table in the same file.
3. Make it fail first. Run it against the code before your fix, or temporarily move your migration aside,
   and confirm it fails for the right reason.
