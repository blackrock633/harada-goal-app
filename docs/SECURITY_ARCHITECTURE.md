# Security architecture

What is actually in the repository (verified 2026-10-24), not what the system was expected to be. Two clients
share one Supabase project:

| Component | Stack | Talks to |
|---|---|---|
| Web app (`src/`) | Next.js 15 App Router, server components + server actions, Drizzle | Postgres directly (pooler), Supabase Auth (server-side only) |
| Mobile app (`mobile/`) | Expo SDK 58, React Native, Expo Router, TanStack Query, supabase-js | Supabase PostgREST (reads + RPCs), Supabase Auth, the `delete-account` Edge Function |
| Database | Supabase Postgres, `supabase/migrations/*.sql` | — |
| Edge Function | `supabase/functions/delete-account` (Deno) | Supabase Auth admin API (service role) |

Shared code: mobile imports `src/domain` and `src/application` through `@shared/*`, including the zod schemas,
so both clients validate the same input shapes. No file storage buckets, views, realtime publications, or
third-party analytics or error reporting exist.

## Trust boundaries

```
 untrusted                         │ trusted
───────────────────────────────────┼──────────────────────────────────────────────────────────────
 Mobile app (code, storage, network│  PostgREST ──► Postgres: role `authenticated` + JWT claims
   requests are all attacker-      │                 RLS on every table, exact grants, write guard,
   controlled)                     │                 30 SECURITY INVOKER RPCs (all writes)
 Browser (web)                     │  Next.js server ──► Postgres as `authenticated` + claims of the
   cookies, form posts, server-    │                 user verified by Supabase Auth getUser()
   action payloads                 │  Edge Function ──► Auth admin (service role, server-only)
 Anyone on the internet            │  Supabase Auth (GoTrue): passwords, sessions, JWT signing
```

- **The mobile client is fully untrusted.** Anyone can read its code, change its local state and call PostgREST
  directly with their own JWT. Authorization therefore lives entirely in Postgres: RLS policies, grants and
  RPC checks. No client-side check is a security control.
- **The browser is untrusted.** Server actions take the user from `AuthGateway.getUser()` (`src/app/lib/session.ts`),
  which Supabase Auth verifies, and never from input. Middleware redirects are a convenience, not the
  boundary (see `src/middleware.ts`). Every page and action re-checks.
- **The Next.js server is trusted but least-privileged for data.** It connects as the pooler user. Each unit
  of work then runs `SET ROLE authenticated` with the verified user's claims (`unit-of-work.ts`), so the
  same RLS that protects mobile also protects web queries. It is the only path allowed to write tables
  directly (it sets `harada.write_path`).
- **Privileged credentials:** the `SUPABASE_SERVICE_ROLE_KEY` exists only in the web server's environment
  (`requireServiceRoleKey`, behind `import 'server-only'`) and in the Edge Function's injected env. It is used
  only to delete the caller's own auth user, after a password re-check. It is never `NEXT_PUBLIC_`/`EXPO_PUBLIC_`.
- **Public configuration:** the Supabase URL and anon/publishable key ship in both clients by design. They
  identify the project; they grant nothing beyond what RLS allows an anonymous or authenticated role.
- **Administrative functionality:** none. There are no admin roles, admin routes or admin RPCs. The dev
  styleguide route returns 404 in production.

## Identity and sessions

| | Web | Mobile |
|---|---|---|
| Credential store | Supabase Auth (no app-side passwords) | same |
| Session storage | `sb-*` cookies set by `@supabase/ssr`: **httpOnly, Secure, SameSite=Lax** | iOS Keychain / Android Keystore via expo-secure-store, chunked, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Never AsyncStorage |
| Session check | `getUser()` (server round-trip), never `getSession()` | supabase-js auto-refresh; `Stack.Protected` gates; splash held until auth resolves |
| Sign-out | `signOut({scope:'local'})` clears cookies; dynamic pages are no-store | keychain session removed in `finally`; `QueryProvider` clears the TanStack cache whenever the user id changes (A → null → B), before children render |
| Dev mode | `AUTH_PROVIDER=dev` (HMAC cookie) only when NODE_ENV is development/test **and** the DB is local PGlite; refused otherwise | — |

## Data ownership model

Every user-owned row is reachable from `profiles.id = auth.users.id`:

```
profiles(id) ─┬─ goals(owner_id) ─┬─ outcomes(goal_id)          the 8 key areas
              │                   ├─ actions(goal_id, outcome_id) the 8×8 action cells
              │                   │     composite FK (outcome_id, goal_id) → outcomes(id, goal_id)
              │                   │     └─ routine_checks(action_id)   completion records
              │                   ├─ reflections(goal_id)        journal
              │                   └─ goal_events(goal_id)        progress history, append-only
              └─ daily_focus(owner_id, action_id)                today's picks
```

- **Policies:** `owner_id = auth.uid()` for goals, daily_focus and profiles. Child tables use `owns_goal(goal_id)`
  or `owns_action(action_id)`. These are `SECURITY DEFINER` and `search_path=''`, and they only answer for the
  current user. Every INSERT/UPDATE has a `WITH CHECK`, so ownership cannot be reassigned. The composite FK
  stops an action from being attached to another goal's key area. `daily_focus` checks both the row owner and
  the action owner.
- **Grants (exact):** anon has nothing. `authenticated` has SELECT/INSERT/UPDATE/DELETE only where needed:
  - goal_events: no UPDATE/DELETE.
  - routine_checks and daily_focus: no UPDATE.
  - profiles: UPDATE on three columns only.
  - No TRUNCATE, TRIGGER or REFERENCES anywhere.
  - Default privileges are revoked.
- **Write path (D-017):** a statement-level trigger on every table rejects writes by anon/authenticated unless
  `harada.write_path='on'`. Only `begin_write()` sets it, and since SEC-DB-01 only when called from inside a
  public RPC wrapper. The trusted server's UnitOfWork also sets it. Each wrapper turns it off again before
  returning. The RPCs re-validate every input (types, lengths, ids, dates, numeric bounds) because client
  validation is not trusted.
- **Deletion:** goals can only be deleted once archived (enforced by RLS policy and by the RPC's title
  confirmation). Account deletion goes through Supabase Auth admin and cascades through `profiles` to every row.

## Web-facing protections

- Headers:
  - `Content-Security-Policy` with a per-request script nonce (no inline script execution), `frame-ancestors 'none'`, `object-src 'none'`.
  - HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
  - The image optimizer is disabled.
- Server actions: Next's built-in Origin/Host check (no `allowedOrigins` override), a 1 MB body limit, and zod
  validation with explicit field copying (unknown keys are dropped).
- Errors: clients get fixed messages only (`toAppError`, `rpc-errors.ts`). Logs get `safeErrorSummary()`, which
  carries no query parameters, database messages or tokens.
- CORS: not applicable to the native app. The Edge Function answers preflight only for `ALLOWED_ORIGINS`
  (the Expo web build).

## Known gaps

See `SECURITY_AUDIT.md` → Open items: sign-in throttling design (SEC-AUTH-03), GitHub settings (SEC-REPO-02),
the mobile tooling advisories (SEC-DEP-03), quotas (SEC-DB-05), and the live-Supabase verification that has not run yet.
