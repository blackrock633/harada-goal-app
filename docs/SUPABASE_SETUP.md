# Supabase setup

These are one-time steps a project owner must do. Nothing here can be done from this repo without credentials.

## 1. Create the project and apply migrations

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push            # applies supabase/migrations/*.sql in order
```

Never apply `supabase/tests/auth-shim.sql` to a Supabase project. It is a local test shim only.

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
