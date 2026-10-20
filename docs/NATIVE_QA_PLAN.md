# Native QA Plan — Expo / React Native

_QA monitor · 2026-10-20 · follows the user's decision to **rebuild as Expo/React Native** (relayed to both orchestrators)._

## 1. What carries over unchanged

| Asset | Why it still applies | Suite |
|---|---|---|
| `src/domain` (pure TS: matrix limits, metrics, schedules) | No React/Next dependency; the native app imports it as-is | domain unit tests, `tests/integration/progress-metrics`, `matrix-structure` (layout model, if the native matrix reuses it) |
| Supabase schema, RLS, grants, triggers | The native client talks to the same database | `rls.rls.test.ts`, `tests/integration/rls-adversarial`, `data-integrity` |
| Zod schemas / DTO contracts | Shared validation for native forms and any API | application tests |
| `docs/HARADA_SPEC.md`, `docs/ACCEPTANCE_CRITERIA.md` | Platform-neutral product rules | — |

**Security shift:** if the app calls Supabase directly with supabase-js, **RLS and grants are the only authorization
boundary**; there is no server-action layer in front. The adversarial RLS suite and a live `\dp public.*` check on
the staging project become release-blocking.

## 2. What must be re-verified natively

The 15 web journeys (`tests/e2e/journeys.spec.ts`) become Maestro flows (`.maestro/*.yaml`) against the Expo app in
the iOS Simulator. Same intent, same assertions:

| # | Journey | Native-specific additions |
|---|---|---|
| 1 | Create goal → persists | Persists across **app kill + relaunch** (not just reload) |
| 2 | Matrix 1 + 8 + 64 | Key-area pager, long titles at Dynamic Type sizes |
| 3 | Today complete/reopen | Persists after kill/relaunch; optimistic state reconciled |
| 4 | Metrics distinct | Same texts: planning N/72, tasks X of Y, attainment not inferred |
| 5 | Two-user isolation | Against **staging Supabase** with two real accounts |
| 6/6b | Failed / lost-response save | Airplane mode toggle; retry → exactly one row |
| 7 | Mobile editing | Software keyboard never hides the save control (KeyboardAvoidingView) |
| 8 | Auth transitions | Token in `expo-secure-store`; sign-out clears it; relaunch while signed out |
| 9 | Session ends mid-edit | Refresh-token revoked server-side → honest error, input kept |
| 10 | Forged session | Tampered stored token is rejected by Supabase |
| 11 | Pre-hydration input (HYD-01) | N/A on native (no SSR); replaced by "input survives app backgrounding" |
| 12 | Accessibility | VoiceOver labels via Maestro `id`/accessibility queries; 44 pt targets |
| 13 | Pending write on leave (EXEC-01) | **App backgrounded or killed** mid-write: must persist, or be retried on next launch |
| 14 | Offline save | Airplane mode; queued vs. refused must be explicit, never silent |
| 15 | 200% text | iOS Dynamic Type XXXL / Android font scale 2.0: no clipped controls |

New native-only risks to cover: deep links (`harada://goal/<id>` must not open another user's data), Android
hardware back button, app-switcher snapshot privacy, push-notification permission prompts (if reminders ship),
and the **expo-updates / store-build** path (a release build, not just Expo Go).

## 3. Prerequisites on this machine (checked 2026-10-20)

| Tool | Status | Needed for |
|---|---|---|
| Xcode (full) + iOS Simulator runtime | **MISSING** (Command Line Tools only; `simctl` absent) | iOS Simulator |
| Free disk | **25 GB**: likely too little for Xcode plus a simulator runtime (typically 35–40 GB+) | Xcode install |
| Java 17+ | **MISSING** (`/usr/bin/java` is a stub) | Maestro |
| Maestro CLI | MISSING | native E2E |
| Android SDK / emulator / adb | MISSING | Android (not requested yet) |
| Expo CLI / EAS | via `npx expo` once the app exists | builds |

## 4. Staging Supabase (user will provide)

Put these in a **local, uncommitted** `.env.local`: `NEXT_PUBLIC_SUPABASE_URL` (or the Expo `EXPO_PUBLIC_*`
equivalents), the anon/publishable key, and, for QA's grant checks only, a `DATABASE_URL` for a non-production
project. QA will then run: the migrations check, `\dp public.*`, `rls-adversarial` against real PostgREST, and the
journeys with real GoTrue sign-up, refresh and expiry. Never point QA at production data.

## 5. Order of work

1. Orchestrators agree the native architecture (supabase-js direct + RPC functions for atomic writes, or an API).
2. User: free disk, install Xcode + Java 17; QA installs Maestro.
3. User: staging Supabase env → QA runs the RLS/grants suite live (independent of the native UI).
4. Frontend: Expo shell + auth → QA ports journeys 8, 1, 2 first, then the rest.
5. Release gate: all native journeys green on the iOS Simulator **and** one real-device pass (TestFlight or Expo dev build).
