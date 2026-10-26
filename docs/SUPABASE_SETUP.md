# Supabase setup

These are one-time steps a project owner must do. Nothing here can be done from this repo without credentials.

## 1. Create the project and apply migrations

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push            # applies supabase/migrations/*.sql in order
```

Never apply `supabase/tests/auth-shim.sql` to a Supabase project. It is a local test shim only.

Then deploy the account-deletion Edge Function (the native app calls it; it holds the service-role key server-side):

```bash
npx supabase functions deploy delete-account   # keep "Verify JWT" on (the default)
# Only if the Expo web build calls it from a browser (native apps need no CORS):
npx supabase secrets set ALLOWED_ORIGINS=https://<your-web-origin>
```

For Harada Pro (Stripe, planning suggestions), the challenge and sharing, also follow the deploy steps in
`docs/PREMIUM_SYSTEM.md` §8–9.

Deploy the function only **after** `db push`: it calls `public.consume_password_attempt` (security migration
`20261025120000`), and without that function every deletion attempt fails with a 500.

After `db push`, confirm the write path (D-017): `\df+ public.*` shows the 30 RPCs as `security invoker` with
`search_path=""`, executable by `authenticated` only; every table has an enabled `<table>_write_path` trigger.

**Disable GraphQL** (the apps don't use it): Database → Extensions → turn off `pg_graphql`, or remove
`graphql_public` from API → Exposed schemas. Writes are already blocked there by the guard trigger, and the
write-path flag closes at the end of every RPC (QA SEC-01), so this only removes surface. QA verifies it on staging.

## 2. Environment (server)

| Variable | Where from | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable key) | Project Settings → API | public; RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API | **server only**: account deletion. Never prefix with `NEXT_PUBLIC_` |
| `DATABASE_URL` | Connect → Transaction pooler (port 6543) | used by Drizzle; prepared statements are disabled for the pooler |

All four are required in every deployed environment (preview and production). The app fails closed without
them: auth pages return HTTP 500 ("Supabase is not configured") rather than falling back to anything.
`NEXT_PUBLIC_*` values are inlined at build time, so set them before `next build`. `AUTH_PROVIDER=dev` is
refused in production.

## 3. Dashboard configuration

- **Authentication → Providers → Email:** enabled. Decide on "Confirm email". If enabled, sign-up returns
  "check your inbox" and sign-in fails with `EMAIL_NOT_CONFIRMED` until confirmed.
- **Authentication → URL configuration:** set Site URL and redirect URLs to the deployed origin (and
  `http://localhost:3000` for dev).
- **Authentication → SMTP:** configure a real SMTP provider before launch. The built-in sender is heavily
  rate-limited and is for testing only.
- **Authentication → Passwords:** minimum length 8 (matches the app's validation) or stricter.
- **Authentication → Rate limits / Bot protection:** keep the sign-in and sign-up limits on and enable CAPTCHA
  before launch. App-level web throttling is per process only (SECURITY_AUDIT SEC-AUTH-03), and mobile reaches
  Auth directly, so these limits are the real brute-force control.
- **Authentication → Sessions:** set an inactivity timeout or a time-box. The web session cookie's own
  lifetime is fixed at 400 days by `@supabase/ssr`, so the server side is where sessions end.
- **Authentication → Passwords → leaked password protection:** enable it if your plan includes it.
- **Keep "Confirm email" on:** with it off, Supabase Auth itself tells sign-up callers which emails exist.
- **Database → Roles:** the `postgres` role used by `DATABASE_URL` must be able to `SET ROLE authenticated`
  (true by default on Supabase).

## 4. Generated types for a future supabase-js client (optional)

The Next.js server types queries via Drizzle (`src/infrastructure/db/schema.ts`). A future mobile client
using supabase-js directly should generate types from the linked project:

```bash
npx supabase gen types typescript --linked > src/infrastructure/supabase/database.types.ts
```

## 5. Local development without Supabase

Docker isn't required. Leave the Supabase variables unset and use:

```
DATABASE_URL=pglite://.data/dev
AUTH_PROVIDER=dev
DEV_AUTH_SECRET=<any long random string>
```

That runs embedded Postgres with the auth shim and every migration (RLS active), plus a dev-only auth
gateway that refuses to start in production.
