# Domain Model — Harada Goal App

> **Status: CANONICAL.** This is the single source of truth for domain concepts.
> Code in `src/domain/` implements exactly this. Changes require updating this file
> and `docs/DECISIONS.md` first (see the change protocol in `ARCHITECTURE.md`).

## 1. The Harada Method in this product

Takashi Harada's method moves a person from a meaningful long-term goal to daily
execution and self-reliant reflection. The product models the method's core tools:

| Harada tool | Product concept |
|---|---|
| Long-Term Goal Form (goal, date, purpose analysis) | **Goal** with `vision`, `targetDate`, 4-quadrant **Purpose** |
| Open Window 64 (1 goal → 8 supporting areas → 8 actions each) | **Outcomes** (≤ 8 per goal) and **Actions** (≤ 8 per outcome) |
| One-off tasks vs. routine habits | `Action.kind = 'task' \| 'routine'` |
| Routine Check Sheet | **RoutineCheck** (one per routine action per local date) |
| Daily Diary / self-reflection | **Reflection** (dated entries, daily or weekly) |
| Adjusting the plan | **GoalEvent** history + editable plan |

The user journey: **Vision → Goal → Measurable Outcomes → Actions → Execution → Progress → Reflection → Adjustment.**

Explicitly **out of scope**: XP, levels, ranks, achievements, sound effects, streak multipliers.
Streaks may be *displayed* as information (current run of consecutive scheduled days kept), never as currency.

## 2. Value types

```ts
type Id = string;                 // opaque (UUID); generated outside the domain
type LocalDate = string;          // 'YYYY-MM-DD' in the user's time zone. Never a Date object.
type Instant = Date;              // absolute timestamp (UTC)
type Weekday = 0|1|2|3|4|5|6;     // 0 = Sunday … 6 = Saturday
```

- Week boundaries (for `weekly` schedules and weekly reflections) are **ISO weeks: Monday–Sunday**.
- "Today" is always a `LocalDate` supplied by the caller (derived from the user's IANA time zone). The domain never reads the system clock.

## 3. Entities

### 3.1 Goal

```ts
type GoalStatus = 'draft' | 'active' | 'achieved' | 'archived';

interface Purpose {               // Harada 4-quadrant purpose analysis; each 0..1000 chars
  selfTangible: string;           // For me, tangible   (e.g. "a starting spot on the team")
  selfIntangible: string;         // For me, intangible (e.g. "confidence under pressure")
  othersTangible: string;         // For others, tangible
  othersIntangible: string;       // For others, intangible
}

interface Goal {
  id: Id;
  ownerId: Id;
  title: string;                  // 1..120 chars, trimmed, required
  vision: string;                 // 0..2000 — "What does achieving this look and feel like?"
  targetDate: LocalDate | null;
  status: GoalStatus;
  statusBeforeArchive: Exclude<GoalStatus,'archived'> | null; // set only while archived
  purpose: Purpose;
  activatedOn: LocalDate | null;  // first activation date (used for on-track pacing)
  achievedAt: Instant | null;
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}
```

**Status transitions**

| From → To | Operation | Preconditions |
|---|---|---|
| draft → active | `activateGoal` | ≥ 1 active outcome AND ≥ 1 active action in the goal. Sets `activatedOn` if null. |
| active → achieved | `markGoalAchieved` | — Sets `achievedAt`. |
| achieved → active | `reopenGoal` | — Clears `achievedAt`. |
| draft/active/achieved → archived | `archiveGoal` | — Stores `statusBeforeArchive`, sets `archivedAt`. |
| archived → previous | `restoreGoal` | Returns to `statusBeforeArchive`. |
| archived → (gone) | `deleteGoalPermanently` | **Only from `archived`.** UI requires typing the goal title. |

Any other transition throws `DomainError('INVALID_STATE')`.
`targetDate` may be in the past (the user may be behind); there is no validation against today.
Editing title/vision/purpose/targetDate is allowed in every status except `archived`
(archived goals are read-only until restored).

### 3.2 Outcome (Open Window pillar)

```ts
interface Measure {               // optional numeric success measure
  target: number;                 // > 0, finite
  current: number;                // >= 0, finite (may exceed target)
  unit: string;                   // 0..24 chars, e.g. "km", "clients", "%"
}

interface Outcome {
  id: Id;
  goalId: Id;
  title: string;                  // 1..120
  description: string;            // 0..1000 — what "done" looks like for this area
  measure: Measure | null;
  position: number | null;        // 0..7 while active (dense, unique per goal); null while archived
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}
```

Invariants:
- **At most 8 active outcomes per goal** (`LIMIT_REACHED` otherwise).
- Active outcome positions are exactly `0..n-1` (dense). Archiving compacts positions; restoring appends at the end (fails with `LIMIT_REACHED` if 8 active exist).
- Archiving an outcome does **not** archive its actions' data, but they are excluded from progress and lists while the outcome is archived.

### 3.3 Action

```ts
type ActionKind = 'task' | 'routine';

type Schedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: Weekday[] }        // non-empty, unique, sorted ascending
  | { type: 'weekly'; timesPerWeek: number };    // integer 1..7, any days within the ISO week

interface Action {
  id: Id;
  goalId: Id;                     // denormalised; must equal outcome.goalId
  outcomeId: Id;
  title: string;                  // 1..160
  notes: string;                  // 0..2000
  kind: ActionKind;
  position: number | null;        // 0..7 while active (dense, unique per outcome); null while archived
  // task fields
  dueDate: LocalDate | null;      // tasks only (must be null for routines)
  completedAt: Instant | null;    // tasks only
  // routine fields
  schedule: Schedule | null;      // required for routines, null for tasks
  startDate: LocalDate | null;    // routines only: first day adherence is measured (defaults to today on create)
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}
```

Invariants:
- **At most 8 active actions per outcome.**
- `kind === 'task'` ⇒ `schedule === null && startDate === null`.
- `kind === 'routine'` ⇒ `schedule !== null && startDate !== null && dueDate === null && completedAt === null`.
- Changing kind task→routine clears `dueDate`/`completedAt`, sets `schedule` (required in input) and `startDate = today`.
  Changing routine→task clears `schedule`/`startDate`; existing RoutineChecks are retained as history but no longer counted.
- `completeAction` only for tasks; idempotent (completing a completed task is a no-op that returns the task unchanged).
- `reopenAction` only for tasks; idempotent.
- Moving an action to another outcome: target outcome must be in the same goal, be active, and have < 8 active actions.
- Actions cannot be mutated (except restore of the parent) while their goal is `archived` or their outcome is archived.

### 3.4 RoutineCheck

```ts
interface RoutineCheck {
  id: Id;
  actionId: Id;
  date: LocalDate;                // unique per (actionId, date)
  createdAt: Instant;
}
```

- Valid dates: `startDate <= date <= today`. Future dates → `VALIDATION`.
  Dates before `startDate` → `VALIDATION`.
- Checks may be recorded on any day (including unscheduled days); see adherence rules for how they count.
- `checkRoutine` / `uncheckRoutine` are **idempotent**.
- Only routines may be checked (`INVALID_STATE` for tasks).

### 3.5 Reflection

```ts
type ReflectionKind = 'daily' | 'weekly';

interface Reflection {
  id: Id;
  goalId: Id;
  date: LocalDate;                // the day (daily) or any date within the ISO week (weekly)
  kind: ReflectionKind;
  wentWell: string;               // 0..4000
  didntGoWell: string;            // 0..4000
  nextChange: string;             // 0..4000 — "What will I adjust?"
  createdAt: Instant;
  updatedAt: Instant;
}
```

- At least one of the three text fields must be non-blank.
- `date <= today`. Multiple reflections per date are allowed.
- Reflections may be edited and deleted (delete requires confirmation in UI).

### 3.6 GoalEvent (history)

```ts
type GoalEventType =
  | 'goal_created' | 'goal_updated' | 'goal_activated' | 'goal_achieved' | 'goal_reopened'
  | 'goal_archived' | 'goal_restored'
  | 'outcome_added' | 'outcome_updated' | 'outcome_archived' | 'outcome_restored' | 'outcomes_reordered'
  | 'measure_updated'
  | 'action_added' | 'action_updated' | 'action_archived' | 'action_restored'
  | 'action_moved' | 'actions_reordered' | 'action_completed' | 'action_reopened';

interface GoalEvent {
  id: Id;
  goalId: Id;
  type: GoalEventType;
  subjectId: Id | null;           // outcome/action id where relevant
  summary: string;                // human-readable, e.g. 'Renamed outcome "Speed" → "Acceleration"'
  data: Record<string, unknown>;  // small JSON payload (changed fields, from/to values)
  occurredAt: Instant;
}
```

Events are appended by the application layer **in the same transaction** as the change.
Routine check/uncheck and reflections do **not** emit events (they have their own records).

## 4. Progress semantics (pure functions, `src/domain/progress.ts`)

All progress values are numbers in **[0, 1]** or **`null`** ("not yet measurable"). The UI formats them.

### 4.1 Task
`taskProgress = completedAt ? 1 : 0`

### 4.2 Routine adherence (rolling 28-day window)

```
windowStart = max(startDate, today − 27 days)
evaluated days = [windowStart, today − 1]  ∪  ({today} if today has a check)
```
Today is excluded unless already checked, so the user isn't penalised before the day is over.

- **daily**: `expected` = number of evaluated days; `kept` = checks on evaluated days.
- **weekdays**: `expected` = evaluated days whose weekday ∈ `days`; `kept` = checks on those scheduled days (off-schedule checks don't count).
- **weekly(N)**: for each ISO week overlapping the evaluated range, let `d` = evaluated days of that week in range;
  `expectedWeek = N × d / 7` (fractional, so partial weeks are prorated), `keptWeek = min(checks in that week's evaluated days, N)`.
  Sum both over weeks.
- `adherence = expected === 0 ? null : min(1, kept / expected)`.

### 4.3 Outcome
- If `measure` is set: `clamp(current / target, 0, 1)`.
- Else: mean of non-null progress of its **active** actions; `null` if none are measurable.

### 4.4 Goal
Mean of non-null progress of its **active** outcomes; `null` if none.

### 4.5 Pace ("am I on track?")
For `active` goals with `targetDate` and `activatedOn` and `targetDate > activatedOn`:
```
elapsed = clamp((today − activatedOn) / (targetDate − activatedOn), 0, 1)
pace = progress === null ? 'unknown'
     : progress >= elapsed + 0.10 ? 'ahead'
     : progress >= elapsed − 0.15 ? 'on_track'
     : 'behind'
```
Otherwise `'unknown'`. If `today > targetDate` and status is active → `'overdue'`.

### 4.6 Streak (informational only)
For a routine: the number of consecutive scheduled periods kept, counting back from the most recent
completed period (today counts only if checked; an unchecked today does not break the streak).
- daily: consecutive days; weekdays: consecutive scheduled days; weekly(N): consecutive ISO weeks with ≥ N checks (current week counts only if already met).

## 5. "What should I do next?" (`src/domain/next.ts`)

`dueToday(action, checks, today)` for routines:
- daily → true; weekdays → `today`'s weekday ∈ days; weekly(N) → checks in current ISO week < N.

`nextActions(goals, today)` across **active** goals (only active outcomes/actions):
1. **Routines due today and not yet checked today**, ordered by goal (most recently updated first), outcome position, action position.
2. **Open tasks**, ordered: overdue (dueDate < today, oldest first) → due today → future due date (soonest first) → no due date (by outcome position, action position).

Routines checked today and tasks completed today appear in a separate "Done today" list.

## 6. Domain errors

```ts
type DomainErrorCode = 'VALIDATION' | 'INVALID_STATE' | 'LIMIT_REACHED';
class DomainError extends Error { code: DomainErrorCode; field?: string; }
```
The application layer adds `NOT_FOUND`, `UNAUTHENTICATED`, `CONFLICT`, `INTERNAL` (see `API_CONTRACTS.md`).

## 7. Limits (constants in `src/domain/limits.ts`)

| Constant | Value |
|---|---|
| `MAX_OUTCOMES_PER_GOAL` | 8 |
| `MAX_ACTIONS_PER_OUTCOME` | 8 |
| `ADHERENCE_WINDOW_DAYS` | 28 |
| Title lengths | goal 120, outcome 120, action 160 |
| Text lengths | vision 2000, purpose quadrant 1000, outcome description 1000, action notes 2000, reflection field 4000, unit 24 |
| `MAX_ACTIVE_GOALS` | none (no artificial cap) |

## 8. Example templates (non-destructive)

Starting templates (e.g. "Run a marathon", "Launch a product", "Make the varsity roster", "Earn a 4.0")
create a **new draft goal** pre-filled with outcomes and actions. They never touch existing data.
Template content lives in `src/domain/templates.ts` as plain data.
