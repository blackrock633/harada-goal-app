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

## D-004 — Own session auth (no third-party auth provider) · accepted
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
