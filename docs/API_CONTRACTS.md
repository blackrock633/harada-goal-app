# API Contracts — Application Layer

> **Status: CANONICAL.** The application layer (`src/application/`) exposes **use cases** (commands)
> and **queries**. Next.js server actions and route handlers in `src/app/` are thin adapters:
> authenticate → parse input → call use case → map the result → revalidate.

## 1. Calling convention

```ts
interface Ctx {
  userId: string;          // from the verified server session, never from client input
  now: Date;               // injected clock
  today: LocalDate;        // `now` in the user's time zone
}

type AppErrorCode =
  | 'VALIDATION'           // bad input (Zod or DomainError VALIDATION)
  | 'INVALID_STATE'        // transition not allowed
  | 'LIMIT_REACHED'        // 8×8 caps
  | 'NOT_FOUND'            // missing OR owned by someone else
  | 'UNAUTHENTICATED'
  | 'CONFLICT'             // unique/concurrency violation (e.g. a concurrent add took the last slot)
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'          // database or Supabase Auth unreachable; nothing was saved, safe to retry
  | 'INTERNAL';            // unexpected; message is generic, details are logged server-side only

interface AppError { code: AppErrorCode; message: string; fieldErrors?: Record<string, string[]> }
type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

type UseCase<I, O> = (deps: Deps, ctx: Ctx, input: unknown) => Promise<Result<O>>;
```

- Every use case parses `input` with its **Zod schema** (`src/application/schemas.ts`). Schemas are
  shared with client forms for instant feedback, but the server is authoritative.
- Use cases never throw for expected failures. Unexpected errors are caught, logged, and returned as `INTERNAL`.
- Writes that touch more than one row (or write a row plus a GoalEvent) run in a single transaction.
- `Deps` = `{ uow, ids: () => string, auth: AuthGateway, rateLimiter, logger }` (`src/application/ports.ts`).
- Every unit of work runs as `uow.run(ctx.userId, …)`: one transaction under the `authenticated` role with
  the user's JWT claims, so Supabase RLS applies (DATABASE.md "Security model").
- **Idempotent creates:** create inputs accept an optional client-generated `id` (uuid). Retrying with the
  same id returns the existing entity instead of creating a duplicate. An id owned by someone else → `CONFLICT`.
- **Optimistic concurrency:** update inputs accept an optional `expectedUpdatedAt` (ISO). A mismatch → `CONFLICT`
  ("This was changed elsewhere — reload"); the client keeps the user's input.
- **Never false success:** a use case returns `ok: true` only after its transaction commits.

## 2. DTOs (returned to UI)

DTOs are plain serialisable objects (Instants as ISO strings), defined in code in `src/application/dto.ts`
(**canonical**; the summary below is abridged). Progress fields (DOMAIN_MODEL §4):
`metrics = { planning: {filled, total: 72, ratio}, taskCompletion, completedTasks, totalTasks, routineAdherence,
routineCount, attainment }`. `attainment` comes from outcome measures only, and `pace` derives from it.
`getGoalDetail().matrix.outcomes` is always length 8 (by position); each outcome's `slots` is length 8; `null` = empty cell.
Summary of older fields (`progress` has been replaced by `metrics` / outcome-level fields):

```ts
interface GoalSummaryDTO {
  id; title; status; targetDate; activatedOn; updatedAt;
  progress: number | null; pace: 'ahead'|'on_track'|'behind'|'overdue'|'unknown';
  outcomeCount: number; actionCount: number; openTaskCount: number; dueTodayCount: number;
  lastReflectedOn: LocalDate | null;
}

interface ActionDTO extends ActionFields {
  progress: number | null;          // task 0|1, routine adherence
  dueToday: boolean;                // routines
  checkedToday: boolean;            // routines
  streak: number;                   // routines (informational)
  recentChecks: LocalDate[];        // routines: last 35 days
}
interface OutcomeDTO extends OutcomeFields { progress: number | null; actions: ActionDTO[] }

interface GoalDetailDTO extends GoalFields {
  progress: number | null; pace: Pace;
  outcomes: OutcomeDTO[];           // active, by position
  archivedOutcomes: OutcomeFields[];
  archivedActions: (ActionFields & { outcomeTitle: string })[];
}

interface TodayDTO {
  today: LocalDate;
  next: NextItemDTO[];              // DOMAIN_MODEL §5 order
  doneToday: NextItemDTO[];
  goals: GoalSummaryDTO[];          // active goals
  hasAnyGoals: boolean;
  draftGoals: GoalSummaryDTO[];
}
interface NextItemDTO { action: ActionDTO; goalId; goalTitle; outcomeId; outcomeTitle; overdue: boolean }
```

## 3. Commands

| Use case | Input (Zod) | Output | Notes / errors |
|---|---|---|---|
| **Auth** ||||
| `signUp(deps, input)` | `{ email, password (8..128), displayName (1..80), timeZone }` | `{ userId, needsEmailConfirmation }` | Supabase Auth; profile row created by DB trigger. `CONFLICT` if email taken; rate limited 5/h per email |
| `signIn(deps, input)` | `{ email, password }` | `UserDTO` | Generic `VALIDATION` "Email or password is incorrect"; `UNAUTHENTICATED` if email unconfirmed; 10/15 min per email |
| `signOut` | — | — | Clears this device's Supabase session |
| `updateProfile` | `{ displayName?, timeZone? }` | `UserDTO` | |
| `changePassword` | `{ currentPassword, newPassword }` | — | Re-authenticates, then signs out other sessions |
| `deleteAccount` | `{ password, confirmation: 'DELETE' }` | — | Re-authenticates; `auth.admin.deleteUser` (server-only service role) cascades all data |
| **Goals** ||||
| `createGoal` | `{ title, vision?, targetDate?, purpose? }` | `GoalDetailDTO` | status `draft`; event `goal_created` |
| `createGoalFromTemplate` | `{ templateId }` | `GoalDetailDTO` | draft with outcomes+actions; never touches other data |
| `updateGoal` | `{ goalId, title?, vision?, targetDate?, purpose? }` | `GoalDetailDTO` | not when archived; event `goal_updated` with changed fields |
| `activateGoal` / `markGoalAchieved` / `reopenGoal` / `archiveGoal` / `restoreGoal` | `{ goalId }` | `GoalDetailDTO` | transitions per DOMAIN_MODEL §3.1 |
| `deleteGoalPermanently` | `{ goalId, confirmTitle }` | — | only archived; `confirmTitle` must equal the title exactly |
| **Outcomes** ||||
| `addOutcome` | `{ id?, goalId, title, description?, measure?, position? (0..7) }` | `OutcomeDTO` | Explicit slot taken → `CONFLICT`; else first free slot; `LIMIT_REACHED` at 8 |
| `updateOutcome` | `{ outcomeId, title?, description?, measure? (null clears) }` | `OutcomeDTO` | |
| `updateMeasureCurrent` | `{ outcomeId, current }` | `OutcomeDTO` | event `measure_updated` (from/to) |
| `archiveOutcome` / `restoreOutcome` | `{ outcomeId }` | `GoalDetailDTO` | archive leaves a gap; restore takes the first free slot |
| `reorderOutcomes` | `{ goalId, orderedIds: string[] }` | `GoalDetailDTO` | must be an exact permutation of the active ids, else `CONFLICT` (stale client) |
| **Actions** ||||
| `addAction` | `{ id?, outcomeId, title, notes?, kind, dueDate?, schedule?, position? (0..7) }` | `ActionDTO` | as addOutcome |
| `updateAction` | `{ actionId, title?, notes?, kind?, dueDate?, schedule? }` | `ActionDTO` | kind change rules per DOMAIN_MODEL §3.3 |
| `completeAction` / `reopenAction` | `{ actionId }` | `ActionDTO` | idempotent; tasks only |
| `checkRoutine` / `uncheckRoutine` | `{ actionId, date }` | `ActionDTO` | idempotent; date rules per §3.4 |
| `archiveAction` / `restoreAction` | `{ actionId }` | `GoalDetailDTO` | |
| `moveAction` | `{ actionId, toOutcomeId, toPosition }` | `GoalDetailDTO` | same goal; target slot must be free (`CONFLICT`) |
| `addToToday` / `removeFromToday` | `{ actionId, date? (default today) }` | `ActionDTO` | idempotent; date today..+7; ≤ 5 per day (`LIMIT_REACHED`); live plans only |
| `reorderActions` | `{ outcomeId, orderedIds }` | `OutcomeDTO` | exact permutation else `CONFLICT` |
| **Reflections** ||||
| `addReflection` | `{ goalId, date, kind, wentWell?, didntGoWell?, nextChange? }` | `ReflectionDTO` | ≥ 1 non-blank field; date ≤ today |
| `updateReflection` | `{ reflectionId, … }` | `ReflectionDTO` | |
| `deleteReflection` | `{ reflectionId }` | — | |

## 4. Queries

| Query | Input | Output |
|---|---|---|
| `getCurrentUser` | Supabase session (cookies) | `UserDTO \| null` |
| `getToday` | — | `TodayDTO` |
| `listGoals` | `{ status?: 'active'\|'draft'\|'achieved'\|'archived'\|'all' }` | `GoalSummaryDTO[]` |
| `getGoalDetail` | `{ goalId }` | `GoalDetailDTO` |
| `getGoalHistory` | `{ goalId, limit?=50, before?: ISO }` | `GoalEventDTO[]` |
| `listReflections` | `{ goalId, limit?=30, before?: LocalDate }` | `ReflectionDTO[]` |
| `getRoutineSheet` | `{ goalId, month: 'YYYY-MM' }` | per routine: `{ action, scheduledDates, checkedDates }` |
| `listTemplates` | — | `TemplateSummaryDTO[]` |
| `exportData` | — | JSON of all the user's data (download via `GET /api/export`) |

Queries must not N+1. `getGoalDetail` loads a goal with ≤ 4 queries (goal, outcomes, actions, recent checks).
`getToday` / `listGoals` load all active goals' outcomes/actions/checks in batched `IN (...)` queries.

## 5. HTTP surface

| Route | Purpose |
|---|---|
| Server actions (`src/app/**/actions.ts`) | All commands. Protected by Next's built-in Origin check (CSRF) + session cookie. |
| `GET /api/export` | JSON export download (session required) |
| `GET /api/health` | Liveness + DB check (no data) |

Pages (App Router): `/` (marketing/sign-in redirect), `/signin`, `/signup`, `/today`, `/goals`, `/goals/new`,
`/goals/[goalId]` (overview), `/goals/[goalId]/plan`, `/goals/[goalId]/routines`, `/goals/[goalId]/journal`, `/settings`.
Routes under `(app)` require a session (checked in the layout **and** in every action/query; `middleware.ts` only does a cheap cookie-presence redirect).

## 6. Session

Managed by Supabase Auth through `@supabase/ssr` cookies (`sb-<project>-auth-token*`). `src/middleware.ts`
refreshes them on each request. Server code obtains the user only through `AuthGateway.getUser()`
(`supabase.auth.getUser()`, verified by the Auth server) → `getCtx()` / `requireCtx()` in
`src/app/lib/session.ts`. Middleware redirects are a convenience, not the authorization boundary. Local dev
without Supabase uses `AUTH_PROVIDER=dev` (signed `harada_dev_session` cookie; refuses to run in production).

## 7. Native client (Supabase direct, D-017)

**Reads:** `supabase.from(table).select(columns)` with the user's session. RLS returns only the caller's rows.
Exposed columns for `authenticated` (all columns, snake_case, as in DATABASE.md):

| Table | Columns |
|---|---|
| profiles | id, display_name, time_zone, created_at, updated_at |
| goals | id, owner_id, title, vision, success_criteria, target_date, status, status_before_archive, purpose_self_tangible, purpose_self_intangible, purpose_others_tangible, purpose_others_intangible, activated_on, achieved_at, archived_at, created_at, updated_at |
| outcomes | id, goal_id, title, description, measure_target, measure_current, measure_unit, position, archived_at, created_at, updated_at |
| actions | id, goal_id, outcome_id, title, notes, kind, position, due_date, completed_at, schedule_type, schedule_days, schedule_times_per_week, start_date, archived_at, created_at, updated_at |
| routine_checks | id, action_id, date, created_at |
| daily_focus | id, owner_id, action_id, date, slot, created_at |
| reflections | id, goal_id, date, kind, went_well, didnt_go_well, next_change, created_at, updated_at |
| goal_events | id, goal_id, type, subject_id, summary, data, occurred_at |

`measure_*` are `numeric` and arrive as JSON numbers. Dates are `YYYY-MM-DD`; instants are ISO strings.

**Shared read model (no re-implementation on the device):** select with `SELECT_COLUMNS[table]` from
`src/application/rows.ts`, map with its `*FromRow` functions, then build DTOs with `src/application/read-model.ts`:
`buildGraph(outcomes, actions, checks (from checksFrom(today)), focus rows for today, today)` →
`buildGoalDetail(goal, graph, today)` / `buildTodayDTO(goals, graph, lastReflectedByGoal, today, timeZone)` /
`buildSummaryDTOs(...)`. Both files are pure with relative imports only. `native-read.rls.test.ts` proves the
result equals the web server's `getGoalDetail` / `getToday`.

**Writes:** `supabase.rpc(name, { p_input })` only; direct table writes fail with 42501. `p_input` is exactly
the object the matching Zod schema in `src/application/schemas.ts` accepts (camelCase). Validate on the device
with that schema first, then send it unchanged. Creates take a client uuid `id` (a replay returns the existing
row); updates take `expectedUpdatedAt` (send back the `updated_at` string you read; compared to the millisecond).

| RPC | Input schema | Returns |
|---|---|---|
| create_goal | createGoalSchema, plus optional `templateId` and nested `outcomes[{id?, title, description?, measure?, position?, actions?[addAction fields without outcomeId]}]` (atomic matrix initialisation; templates are instantiated on the device) | goals row |
| update_goal | updateGoalSchema | goals row |
| activate_goal, mark_goal_achieved, reopen_goal, archive_goal, restore_goal | goalIdSchema | goals row |
| delete_goal | deleteGoalPermanentlySchema | void |
| add_outcome / update_outcome / update_measure_current | addOutcomeSchema / updateOutcomeSchema / updateMeasureCurrentSchema | outcomes row |
| archive_outcome, restore_outcome | outcomeIdSchema | outcomes row |
| reorder_outcomes | reorderOutcomesSchema | active outcomes, by position |
| add_action / update_action | addActionSchema / updateActionSchema | actions row |
| complete_action, reopen_action, archive_action, restore_action | actionIdSchema | actions row |
| check_routine, uncheck_routine | routineCheckSchema | actions row |
| move_action | moveActionSchema | actions row |
| reorder_actions | reorderActionsSchema | active actions of the outcome, by position |
| add_to_today | focusSchema (date defaults to the user's today) | daily_focus row |
| remove_from_today | focusSchema | void |
| add_reflection / update_reflection | addReflectionSchema / updateReflectionSchema | reflections row |
| delete_reflection | reflectionIdSchema | void |
| update_profile | updateProfileSchema | profiles row |

"Today" is computed in the database from `profiles.time_zone`. Account deletion is not an RPC (it needs the
service-role key; a Supabase Edge Function is planned).

**Errors** (`PostgrestError.code` → `AppError.code`; `message` is user-facing; `hint` is the field name or ''):

| code | AppError | Notes |
|---|---|---|
| HG400 | VALIDATION | `fieldErrors = { [hint]: [message] }` when hint is non-empty |
| HG401 | UNAUTHENTICATED | no session |
| HG404 | NOT_FOUND | missing **or another user's** row (indistinguishable by design) |
| HG409 | CONFLICT | stale `expectedUpdatedAt`, slot taken, reorder list out of date |
| HG422 | INVALID_STATE | e.g. archived goal, routine "completed" |
| HG429 | LIMIT_REACHED | 8 key areas, 8 actions, 5 focus picks per day |
| 23505, 23P01 | CONFLICT | id reused by another row, concurrent slot race |
| 23514, 22P02 | VALIDATION | constraint/shape failures not caught earlier |
| 42501 | NOT_FOUND | permission or RLS refusal |
| PGRST301/PGRST303, HTTP 401 | UNAUTHENTICATED | expired or invalid JWT |
| network failure, HTTP ≥ 500 | UNAVAILABLE | |
| anything else | INTERNAL | |
