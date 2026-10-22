# Native journeys against the real database

QA's real-DB harness for the Expo app. The app's **real screens and data layer** (TanStack reads,
RPC mutations) run in Jest against PGlite with every Supabase migration, RLS and the real SQL RPCs,
acting as a given user.

Verified on native/app `b490d93`: **6/6 journeys** in three consecutive QA runs:
J1 create goal → reopen · J2 matrix (2 key areas, 3 actions) → reopen · J3 Today complete/reopen ·
J4 metrics stay separate · J5 two-user isolation · J6 lost response → retry → exactly one row.

**Mutation-checked:** with `create_goal`'s transaction silently rolled back (the app sees success,
nothing is stored), all 6 fail. So the passing runs prove real persistence.

These files belong in `mobile/` (owned by the frontend orchestrator), which is not on this branch.
They are stored here for hand-off and excluded from the web tsc and eslint:

| File | Destination |
|---|---|
| `pglite-supabase.ts` | `mobile/src/data/test-support/` |
| `qa-journeys.test.tsx` | `mobile/src/__tests__/` |
| `jest.qa.config.js` | `mobile/` (adds the root `node_modules` to `modulePaths`; maps `@/infrastructure/*` → `../src/infrastructure/*`) |

Also needed: a `mobile/supabase → ../supabase` symlink (migrations resolve from `process.cwd()`).

Run (Node 24):
`NODE_OPTIONS=--experimental-vm-modules npx jest -c jest.qa.config.js src/__tests__/qa-journeys.test.tsx --forceExit`

PGlite needs `globalThis.window` hidden while it boots under jest-expo; the test does this.

**Not covered** (needs staging or a simulator): HTTP/PostgREST, real GoTrue auth and token refresh,
real network failures, device rendering and keyboard.
