# Decisions Log

Format: **D-NNN — Title** · date · status. Context → Decision → Consequences.

## D-001 — Rebuild rather than refactor the legacy "Ascend" app · 2026-10-06 · accepted
**Context:** The existing app is a vanilla-JS localStorage RPG habit tracker. It doesn't model the Harada Method, has XSS sinks, destroys data on template load, and has no tests, auth, or server.
**Decision:** Start fresh. Keep the old code in `legacy/` for reference only; delete it once the rebuild ships.
**Consequences:** No data migration from Ascend backups. The plan's default (no importer) was approved; this can be revisited if needed.

## D-002 — Stack: Next.js 15 + TypeScript + Drizzle/Postgres + PGlite · accepted
**Decision:** Next.js App Router with server actions; Drizzle ORM; Postgres in production; PGlite (embedded WASM Postgres) for dev/test so no Docker is needed; Tailwind v4 + Radix primitives; Vitest + Playwright.
**Consequences:** One SQL dialect everywhere. PGlite is single-connection, so dev/test concurrency is serialised. Real concurrency behaviour is exercised in production Postgres; DB constraints (partial unique indexes) guarantee invariants either way.

## D-003 — npm instead of pnpm · accepted
**Context:** The machine has Node 20 via nvm with npm; corepack/pnpm would add another network-dependent bootstrap step.
**Decision:** Use npm with a committed `package-lock.json`.

## D-004 — Own session auth (no third-party auth provider) · superseded by D-013
**Decision:** Email + password (Argon2id via `@node-rs/argon2`), DB sessions keyed by the SHA-256 of a random token, httpOnly cookie, 30-day sliding expiry. No email verification or password reset by email (that would need an email provider; see PROJECT_STATUS limitations).

## D-005 — Harada structure: up to 8 outcomes × 8 actions · accepted
**Decision:** Enforce **maximums** of 8/8 (Open Window 64) and allow fewer. The UI shows the empty slots as gentle invitations.

## D-006 — Remove gamification and the AI assistant · accepted
**Decision:** No XP, levels, ranks, achievements, sounds, or AI chat. Streaks are shown as information only.
**Rationale:** These mechanics aren't part of the Harada Method and distract from intrinsic purpose. The AI chat also required storing a key client-side.

## D-007 — Tasks vs routines; adherence over a 28-day window · accepted
**Decision:** Actions are `task` (one-off) or `routine` (scheduled habit, tracked via a check sheet). Routine progress = rolling 28-day adherence, excluding an unchecked today. Full rules: DOMAIN_MODEL §4.

## D-008 — Goal lifecycle with archive-before-delete · accepted
**Decision:** `draft → active → achieved`, with archive/restore from any state. Permanent deletion only from archived, with typed title confirmation. Outcomes and actions are archived, not deleted.

## D-009 — Reflections are per goal · accepted
**Context:** Harada's daily diary is per person; a multi-goal app needs a home for entries.
**Decision:** Reflections belong to a goal (daily or weekly kind). The Today view offers quick entry for a chosen active goal.

## D-010 — Time zone stored on the user · accepted
**Decision:** "Today" is computed from the user's IANA time zone (detected at sign-up, editable). This fixes the legacy UTC-date bug.

## D-011 — Model routing fallback · accepted
**Context:** The brief requires Gemini 3.8 for specialist subagents. The environment's subagent tool exposes only `inherit | flash_lite | flash | pro` and doesn't show exact model versions.
**Decision:** Specialist subagents run with model option `pro`, the strongest Gemini-family option offered. The orchestrator runs on Claude Opus 5.5. This substitution is disclosed in PROJECT_STATUS.md.

## D-012 — web-design-guidelines skill source · accepted
**Context:** The brief specified `npx skills add https://github.com/antfu/skills --skill web-design-guidelines`. That repository doesn't contain the skill (it lists antfu, vite, vitest, vue, …).
**Decision:** Installed the canonical `web-design-guidelines` skill from `vercel-labs/agent-skills` into `.agents/skills/`. It fetches the latest Vercel Web Interface Guidelines at review time.

## D-013 — Supabase for Postgres and Auth; RLS as the ownership boundary · 2026-10-19 · accepted
**Context:** The user directed a move to Supabase. The app stays a Next.js server-rendered app with server
actions; a mobile client may come later.
**Decision:** Supabase hosts Postgres and Supabase Auth replaces the custom Argon2/session-table auth
(supersedes D-004). Schema of record moves to `supabase/migrations/*.sql`; Drizzle stays as the typed
query layer (schema.ts is a mirror, guarded by a sync test). RLS is enabled on every table. The server's
`UnitOfWork.run(userId, …)` runs each transaction as the `authenticated` role with the verified user's
JWT claims, so the same policies protect server queries and any future direct supabase-js client.
Local dev/test use PGlite + an auth shim (no Docker on this machine); auth flows in tests use a fake
gateway. `drizzle/0000_init.sql` is retired (only ever applied to local databases).
**Consequences:** No password hashing or session storage in the app. Email confirmation / reset emails
come from Supabase (configure SMTP in the dashboard). Real GoTrue behaviour is only verifiable against a
Supabase project. Account deletion needs `SUPABASE_SERVICE_ROLE_KEY` on the server.
**Brief vs repo:** the backend brief assumed Expo/React Native; the repo is Next.js. No Expo app was created.
The data model and RLS are client-agnostic so a mobile app can use supabase-js directly later.

## D-014 — Matrix slots: explicit positions 0..7, empty cells are absent rows · 2026-10-19 · accepted
**Decision:** Outcomes and actions occupy positions 0..7, unique among active rows (deferrable exclusion
constraints). Users may add into a specific slot; gaps are allowed (archiving no longer compacts).
Nothing is pre-created: an empty cell is the absence of a row. Creates take a client-generated uuid for
idempotent retries; updates may carry `expectedUpdatedAt` for optimistic concurrency.
Supersedes the "dense 0..n-1" invariant of D-005 (the 8×8 maximums stand).

## D-015 — Three separate progress metrics · 2026-10-19 · accepted
**Context:** QA P-1/P-2: a blended `progress` let action completion read as goal achievement.
**Decision:** Planning completeness (filled/72), execution (task completion + routine adherence) and
attainment (outcome measures only) are separate fields. Pace uses attainment only. Definitions are in
DOMAIN_MODEL §4.

## D-016 — Daily priorities are derived, not stored · 2026-10-19 · accepted
**Decision:** Today's list is derived from due dates, routine schedules and status (`domain/next.ts`).
There is no separate daily-planning table, so there is a single source of truth. Revisit only if users need to pick
actions for a date independently of due dates; then add an explicit `daily_picks` table rather than
overloading `due_date`.
