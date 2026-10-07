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
  | 'INTERNAL';            // unexpected; message is generic, details are logged server-side only

interface AppError { code: AppErrorCode; message: string; fieldErrors?: Record<string, string[]> }
type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

type UseCase<I, O> = (deps: Deps, ctx: Ctx, input: unknown) => Promise<Result<O>>;
```

- Every use case parses `input` with its **Zod schema** (`src/application/schemas.ts`). Schemas are
  shared with client forms for instant feedback, but the server is authoritative.
- Use cases never throw for expected failures. Unexpected errors are caught, logged, and returned as `INTERNAL`.
- Writes that touch more than one row (or write a row plus a GoalEvent) run in a single transaction.
- `Deps` = `{ repos/uow, ids: () => string, hasher, logger }` (see `ARCHITECTURE.md` §Ports).

## 2. DTOs (returned to UI)

DTOs are plain serialisable objects (Instants as ISO strings). They mirror the domain types with these additions:

```ts
interface GoalSummaryDTO {
  id; title; status; targetDate; activatedOn; updatedAt;
  progress: number | null; pace: 'ahead'|'on_track'|'behind'|'overdue'|'unknown';
  outcomeCount: number; actionCount: number; openTaskCount: number; dueTodayCount: number;
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
| `signUp` | `{ email, password (8..128), displayName (1..80), timeZone }` | `{ userId }` + session | `CONFLICT` if email taken (message: generic "Could not create account with that email") |
| `signIn` | `{ email, password }` | session | Generic `VALIDATION` "Email or password is incorrect"; constant-time-ish (hash a dummy on unknown email); rate limited per email+IP |
| `signOut` | — | — | Invalidates the session |
| `updateProfile` | `{ displayName?, timeZone? }` | `UserDTO` | |
| `changePassword` | `{ currentPassword, newPassword }` | — | Invalidates other sessions |
| `deleteAccount` | `{ password, confirmation: 'DELETE' }` | — | Hard cascade |
| **Goals** ||||
| `createGoal` | `{ title, vision?, targetDate?, purpose? }` | `GoalDetailDTO` | status `draft`; event `goal_created` |
| `createGoalFromTemplate` | `{ templateId }` | `GoalDetailDTO` | draft with outcomes+actions; never touches other data |
| `updateGoal` | `{ goalId, title?, vision?, targetDate?, purpose? }` | `GoalDetailDTO` | not when archived; event `goal_updated` with changed fields |
| `activateGoal` / `markGoalAchieved` / `reopenGoal` / `archiveGoal` / `restoreGoal` | `{ goalId }` | `GoalDetailDTO` | transitions per DOMAIN_MODEL §3.1 |
| `deleteGoalPermanently` | `{ goalId, confirmTitle }` | — | only archived; `confirmTitle` must equal the title exactly |
| **Outcomes** ||||
| `addOutcome` | `{ goalId, title, description?, measure? }` | `OutcomeDTO` | `LIMIT_REACHED` at 8; appended |
| `updateOutcome` | `{ outcomeId, title?, description?, measure? (null clears) }` | `OutcomeDTO` | |
| `updateMeasureCurrent` | `{ outcomeId, current }` | `OutcomeDTO` | event `measure_updated` (from/to) |
| `archiveOutcome` / `restoreOutcome` | `{ outcomeId }` | `GoalDetailDTO` | positions compacted / appended |
| `reorderOutcomes` | `{ goalId, orderedIds: string[] }` | `GoalDetailDTO` | must be an exact permutation of the active ids, else `CONFLICT` (stale client) |
| **Actions** ||||
| `addAction` | `{ outcomeId, title, notes?, kind, dueDate?, schedule? }` | `ActionDTO` | `LIMIT_REACHED` at 8 |
| `updateAction` | `{ actionId, title?, notes?, kind?, dueDate?, schedule? }` | `ActionDTO` | kind change rules per DOMAIN_MODEL §3.3 |
| `completeAction` / `reopenAction` | `{ actionId }` | `ActionDTO` | idempotent; tasks only |
| `checkRoutine` / `uncheckRoutine` | `{ actionId, date }` | `ActionDTO` | idempotent; date rules per §3.4 |
| `archiveAction` / `restoreAction` | `{ actionId }` | `GoalDetailDTO` | |
| `moveAction` | `{ actionId, toOutcomeId, toPosition }` | `GoalDetailDTO` | same goal, target < 8 |
| `reorderActions` | `{ outcomeId, orderedIds }` | `OutcomeDTO` | exact permutation else `CONFLICT` |
| **Reflections** ||||
| `addReflection` | `{ goalId, date, kind, wentWell?, didntGoWell?, nextChange? }` | `ReflectionDTO` | ≥ 1 non-blank field; date ≤ today |
| `updateReflection` | `{ reflectionId, … }` | `ReflectionDTO` | |
| `deleteReflection` | `{ reflectionId }` | — | |

## 4. Queries

| Query | Input | Output |
|---|---|---|
| `getCurrentUser` | session token | `UserDTO \| null` |
| `getToday` | — | `TodayDTO` |
| `listGoals` | `{ status?: 'active'\|'draft'\|'achieved'\|'archived'\|'all' }` | `GoalSummaryDTO[]` |
| `getGoalDetail` | `{ goalId }` | `GoalDetailDTO` |
| `getGoalHistory` | `{ goalId, limit?=50, before?: ISO }` | `GoalEventDTO[]` |
| `listReflections` | `{ goalId, limit?=30, before?: LocalDate }` | `ReflectionDTO[]` |
| `getRoutineSheet` | `{ goalId, month: 'YYYY-MM' }` | per routine: `{ action, scheduledDates, checkedDates }` |
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

## 6. Session cookie

`hga_session`: httpOnly, `SameSite=Lax`, `Secure` in production, `Path=/`, 30-day max-age, sliding renewal.
