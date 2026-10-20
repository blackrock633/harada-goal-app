# Project Status

_Last updated: 2026-10-06 (orchestrator)_

## Model routing (disclosure)

| Role | Requested | Actually used |
|---|---|---|
| Orchestrator / lead | Claude Opus 5.5 | Claude Opus 5.5 |
| Specialist subagents (frontend, application, domain, data, QA) | Gemini 3.8 | Subagent model option **`pro`**. The environment doesn't offer a "Gemini 3.8" identifier or show exact versions. See D-011. |

## Starting state (legacy audit)

- Vanilla HTML/CSS/JS SPA "Ascend" (~5.3k LOC) using localStorage. No git, package manager, tests, auth, or server.
- Not a Harada implementation (RPG habit tracker with XP/levels/sounds).
- Defects found: `loadTemplate()` wipes all data with `localStorage.clear()`; 23 unescaped `innerHTML` sinks (XSS); Gemini API key stored in localStorage and sent in the URL; UTC-based "today" (wrong date in the evening in US time zones); off-by-one streak maths; no error handling.
- Moved to `legacy/` (git commit `39efdcc`).

## Phase tracker

| Phase | Status |
|---|---|
| 0. Bootstrap (git, Next.js, TS, ESLint boundaries, Vitest, Playwright, `npm run verify`) | ✅ done |
| 1. Contracts (ARCHITECTURE, DOMAIN_MODEL, API_CONTRACTS, DATABASE, DESIGN_SYSTEM, DECISIONS, `domain/types.ts`, `application/ports.ts`) | ✅ done |
| 2. Parallel build: domain · data/infra · design system | ⏳ in progress |
| 3. Application layer (use cases, queries, auth, server actions) | ⬜ |
| 4. Feature UI | ⬜ |
| 5. QA offensive | ⬜ |
| 6. Hardening (design audit, security, performance, docs) | ⬜ |
| 7. Final loop + five reviews | ⬜ |

## Testing status

| Suite | Status |
|---|---|
| typecheck / lint / build | ✅ green (skeleton) |
| unit (domain) | ⬜ |
| integration (application + infra on PGlite) | ⬜ |
| e2e (Playwright) | ⬜ |

## Known issues / technical debt

- `npm audit` reports 2 **dev-only** advisories (`braces` via eslint-config-next; `esbuild` via drizzle-kit's `@esbuild-kit`). Neither ships in the production bundle. Revisit when upstream releases fixes.

## Known limitations (by design, for now)

- No email verification or email-based password reset (no email provider configured).

## Data layer (branch `data/supabase`) — 2026-10-19, data orchestrator

- **Stack change:** Supabase Postgres + Supabase Auth with RLS (D-013). Schema of record: `supabase/migrations/`.
- **Done:** migrations (8 tables, RLS on all), Supabase/dev auth gateways, middleware, `requireCtx`, repositories,
  all API_CONTRACTS use cases and queries, daily focus, separate planning/task/routine/attainment metrics.
- **Tests:** 20 files / 242 tests on real PGlite with the Supabase auth shim (RLS, constraints and triggers are real).
  Supabase Auth (GoTrue) is mocked (`FakeAuthGateway`); auth error mapping is unit-tested with constructed errors.
  **Never run against a real Supabase project** (none is configured): see SUPABASE_SETUP.md.
- **Known limitations:** `exportData` reads reflections/events per goal (N+1); no event for routine checks or
  reflections; in-memory rate limiter is per process; generated supabase-js types need a linked project.
