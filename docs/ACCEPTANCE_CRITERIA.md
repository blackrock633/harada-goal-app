# Acceptance Criteria — Harada Goal App

> Status: PROPOSED (Subagent B). Terminology follows the code: **Outcome** = Harada key area, **Action** = action position (task or routine).
> "Matrix" = 1 goal + up to 8 outcomes + up to 8 actions each = 72 non-central positions (8 + 64). The goal occupies the central position and is not counted as a "position to fill".

## 0. How to read this

Columns: **ID** | Given / When / Then | **Layer** (domain / repo / use-case / UI) | **Testable now?**

Testable-now legend (checked against `src/` on 2026-10-19):
- **yes** = the code exists today (domain pure functions in `src/domain/*`, Zod in `src/application/schemas.ts`, repos in `src/infrastructure/db/repositories/*`, primitives in `src/ui/primitives/*`).
- **B-UC** = blocked: use case does not exist (`src/application/` has only `dto.ts`, `ports.ts`, `result.ts`, `schemas.ts`; no `use-cases/`).
- **B-PAGE** = blocked: feature page/route does not exist (`src/app/` has only `page.tsx`, `api/health`, `(dev)/styleguide`).
- **B-AUTH** = blocked: sign-up/sign-in/session-validation use cases and middleware do not exist (only `password-hasher.ts`, `rate-limiter.ts`, `session-tokens.ts`, `session-repo.ts`).
- **B-SPEC** = blocked: requirement is undefined or contradictory; see section 12 (`M-nn`).
- Entries with two tags need both.

Global preconditions for all use-case ACs: a signed-in user U1 with time zone set; an injected clock; a fresh PGlite DB.

## 1. Goal creation (AC-GOAL)

| ID | Given / When / Then | Layer | Testable now? |
|---|---|---|---|
| AC-GOAL-01 | Given a title of 1..120 chars after trim, when `createGoal` runs, then a goal with status `draft`, empty purpose, null `activatedOn` is created and a `goal_created` event is written in the same transaction. | domain | yes (`goal.test.ts` covers create) |
| AC-GOAL-02 | Given a use case call with valid input, when it succeeds, then goal + `goal_created` event are committed atomically; if the event insert fails, no goal row exists. | use-case | B-UC (UoW rollback itself: yes, `db.test.ts`) |
| AC-GOAL-03 | Given an empty/whitespace title or a title > 120, vision > 2000, a purpose quadrant > 1000, or a malformed `targetDate`, when submitted, then `VALIDATION` with `fieldErrors` keyed by field and nothing is stored. | domain + schema | yes (`createGoalSchema`, `createGoal`) |
| AC-GOAL-04 | Given a `targetDate` earlier than today, when creating or updating, then it is accepted (DOMAIN_MODEL.md:81). | domain | yes |
| AC-GOAL-05 | Given a goal with 0 outcomes and 0 actions, when the user views it, then it is a valid draft; the form needs only a title (vision, date, purpose optional). | UI | B-PAGE |
| AC-GOAL-06 | Given a draft with >= 1 active outcome and >= 1 active action, when `activateGoal` runs, then status is `active` and `activatedOn` is set once (not overwritten on later re-activation). | domain | yes |
| AC-GOAL-07 | Given a draft with 0 outcomes or 0 actions, when activating, then `INVALID_STATE` and the UI explains which piece is missing. | domain / UI | domain: yes; UI: B-PAGE |
| AC-GOAL-08 | Given a goal in any status, when status transitions run, then only the table at DOMAIN_MODEL.md:71-78 is allowed; every other transition is `INVALID_STATE`. | domain | yes |
| AC-GOAL-09 | Given an archived goal, when editing title/vision/purpose/date, then `INVALID_STATE`; restore returns it to `statusBeforeArchive`. | domain | yes |
| AC-GOAL-10 | Given a non-archived goal, when `deleteGoalPermanently` runs, then `INVALID_STATE`; given an archived goal and `confirmTitle` != title exactly, then `VALIDATION`; given exact match, goal and all children are cascade-deleted. | domain / repo / use-case | domain: yes; cascade: yes (repo); use case: B-UC |
| AC-GOAL-11 | Given a template id, when `createGoalFromTemplate` runs, then a new `draft` goal with its outcomes and actions is created and no existing goal/outcome/action row of the user changes (D-001 legacy bug). | domain / use-case | domain `instantiateTemplate`: yes; use case: B-UC |
| AC-GOAL-12 | Given a goal is intended to have its own success criteria (what "achieved" means), when the user creates or edits the goal, then they can state and later review those criteria. | UI / domain | B-SPEC (M-01, M-02) |

## 2. Matrix initialization and structure (AC-MTX)

| ID | Given / When / Then | Layer | Testable now? |
|---|---|---|---|
| AC-MTX-01 | Given a goal with 8 active outcomes, when adding a 9th, then `LIMIT_REACHED`; the 8 existing outcomes are unchanged. | domain | yes (`outcome.test.ts`) |
| AC-MTX-02 | Given an outcome with 8 active actions, when adding a 9th, then `LIMIT_REACHED`. | domain | yes |
| AC-MTX-03 | Given a goal at the max (8 outcomes x 8 actions), then exactly 64 action positions and 72 non-central positions exist; no 73rd can be created by any path (add, restore, move). | domain + repo | yes (`restoreOutcome`, `restoreAction`, `moveAction` guards); repo unique index: yes |
| AC-MTX-04 | Given any state, then active outcome positions are exactly `0..n-1` and active action positions per outcome exactly `0..m-1` (dense, unique) after add, archive, restore, move and reorder. | domain + repo | yes (domain); repo partial unique indexes: yes (`db.test.ts` covers outcomes only; actions index untested, add test) |
| AC-MTX-05 | Given a goal with 3 of 8 outcomes and an outcome with 0 of 8 actions, then the matrix is valid, empty slots are shown as add affordances, and no error or warning blocks any other feature. | UI | B-PAGE |
| AC-MTX-06 | Given a draft goal with 1 outcome and 1 action, when the user activates it, then the Today list shows that action even though 71 positions are empty. | use-case + UI | B-UC, B-PAGE |
| AC-MTX-07 | Given an active goal with unfilled positions, when the user completes/checks actions, then nothing prompts or forces filling the remaining positions. | UI | B-PAGE |
| AC-MTX-08 | Given an outcome whose parent goal differs from the action's `goalId`, when persisted, then rejected (`goalId` must equal `outcome.goalId`; DOMAIN_MODEL.md:124). | domain / repo | domain: yes; repo: add test |
| AC-MTX-09 | Given 2 concurrent adds racing for the last outcome slot, then exactly one succeeds and the other gets `LIMIT_REACHED` or `CONFLICT`, never a 9th row. | repo / use-case | repo constraint: yes (partial unique index); use case: B-UC |
| AC-MTX-10 | Given desktop >= 1024 px, the Plan shows a 9x9 grid (centre = goal + 8 outcomes); given < 768 px, an accordion list of outcomes with actions; both expose the same add/edit/archive operations. | UI | B-PAGE |
| AC-MTX-11 | Given the Plan grid, then arrow keys move between cells and Enter opens the editor; empty cells are reachable by keyboard and labelled ("Add action to <outcome>, slot 3"). | UI | B-PAGE |

## 3. Outcome (key-area) editing (AC-OUT)

| ID | Given / When / Then | Layer | Testable now? |
|---|---|---|---|
| AC-OUT-01 | Given title 1..120 / description <= 1000 / unit <= 24, when updated, then values are trimmed and stored; otherwise `VALIDATION` with the field name. | domain + schema | yes |
| AC-OUT-02 | Given a measure with target <= 0, negative current, or non-finite numbers, then `VALIDATION`; `current > target` is allowed. | domain | yes |
| AC-OUT-03 | Given `measure: null` on update, then the measure is cleared and outcome progress reverts to the action mean. | domain | yes |
| AC-OUT-04 | Given `updateMeasureCurrent`, then a `measure_updated` event with from/to is written in the same transaction. | use-case | B-UC |
| AC-OUT-05 | Given an outcome is archived, then its remaining outcome positions compact, its actions are excluded from lists/progress/Today, their data is retained, and `outcome_archived` is logged. | domain + use-case | domain: yes; events: B-UC |
| AC-OUT-06 | Given 8 active outcomes and an archived one, when restoring, then `LIMIT_REACHED`; given < 8, then appended at the end. | domain | yes |
| AC-OUT-07 | Given `reorderOutcomes` with an exact permutation of active ids, then positions update with the two-step +100 scheme without constraint violation; given any other id set, then `CONFLICT`. | domain + repo + use-case | `computeReorder` yes; repo: add test; use case: B-UC |
| AC-OUT-08 | Given the editor on a 360x640 screen, the user can edit title, description and measure and reach Save without horizontal scroll. | UI | B-PAGE |

## 4. Action editing (AC-ACT)

| ID | Given / When / Then | Layer | Testable now? |
|---|---|---|---|
| AC-ACT-01 | Given title 1..160 and notes <= 2000, when an action is added/updated, then trimmed and stored; else `VALIDATION`. | domain + schema | yes |
| AC-ACT-02 | Given kind `task`, then `schedule` and `startDate` are null; given kind `routine`, then `schedule` and `startDate` are set and `dueDate`/`completedAt` are null (DOMAIN_MODEL.md:144-145). A routine without a schedule is `VALIDATION`. | domain | yes |
| AC-ACT-03 | Given a `weekdays` schedule that is empty, has duplicates or unsorted days, or a `weekly` with times outside 1..7 (or non-integer), then rejected (empty) or normalized (dupes/sort). | domain + schema | yes (`normalizeSchedule`, `scheduleSchema`) |
| AC-ACT-04 | Given a completed task with a due date, when changed to routine with a schedule, then `completedAt` and `dueDate` are cleared, `startDate = today`, and history is not deleted. | domain | yes |
| AC-ACT-05 | Given a task to routine change with no schedule supplied, then `VALIDATION` and the action is unchanged. | domain | yes |
| AC-ACT-06 | Given a routine with checks, when changed to task, then `schedule`/`startDate` are cleared, the `routine_checks` rows are retained and not counted in progress (DOMAIN_MODEL.md:147). | domain + repo | domain: yes; retention: B-UC (no update path touching checks tested) |
| AC-ACT-07 | Given a routine to task to routine round trip, then the new `startDate` is the date of the second change and old checks before it do not affect adherence (or are explicitly counted; decision required). | domain | B-SPEC (M-09) |
| AC-ACT-08 | Given `moveAction` to another active outcome in the same goal with < 8 active actions, then it lands at `toPosition`, source positions compact, `action_moved` is logged, and `goalId` is unchanged. | domain + use-case | domain: yes; event: B-UC |
| AC-ACT-09 | Given a move to a full outcome, an archived outcome, or an outcome in another goal/another user, then `LIMIT_REACHED` / `INVALID_STATE` / `NOT_FOUND` respectively, with no partial change. | domain / use-case | domain: yes; cross-goal/user: B-UC |
| AC-ACT-10 | Given a completed task is moved, then `completedAt` is preserved and its completion still counts in the new outcome. | domain | yes |
| AC-ACT-11 | Given `archiveAction`, then it disappears from Today, plan counts and progress; `position` is null; history (checks, completion) remains; `restoreAction` appends at the end or `LIMIT_REACHED`. | domain | yes |
| AC-ACT-12 | Given archive, then an "Undo" toast restores it in one tap (DESIGN_SYSTEM.md:88). | UI | B-PAGE |
| AC-ACT-13 | Given an archived goal or outcome, when mutating its actions, then `INVALID_STATE` (DOMAIN_MODEL.md:151). | domain / use-case | B-UC (no domain guard function takes goal status for actions; confirm) |
| AC-ACT-14 | Given `reorderActions` with a non-exact id set (stale client after another device added/archived), then `CONFLICT` and nothing changes. | domain / use-case | `computeReorder` returns null: yes; mapping to `CONFLICT`: B-UC |
| AC-ACT-15 | Given an edit form on a phone, a save failure leaves all typed input intact and focus moves to the first invalid field. | UI | B-PAGE |

## 5. Daily execution (AC-EXE)

| ID | Given / When / Then | Layer | Testable now? |
|---|---|---|---|
| AC-EXE-01 | Given active goals, then Today lists (1) routines due today and unchecked, then (2) open tasks ordered overdue (oldest first), due today, future (soonest), undated (outcome then action position) (DOMAIN_MODEL.md:267-269). | domain | yes (`next.test.ts`) |
| AC-EXE-02 | Given draft, achieved or archived goals, or archived outcomes/actions, then none appear in "Next up". | domain | yes |
| AC-EXE-03 | Given weekdays schedule [Mon,Wed] and today is Tue, then the routine is not due; given weekly(3) with 3 checks in the current ISO week (Mon-Sun), then not due. | domain | yes |
| AC-EXE-04 | Given a day boundary in the user's time zone (23:30 local that is already tomorrow in UTC), then "today" is the local date, not the UTC date. | domain | yes (`dates.test.ts`, `localDateInZone`); wired into ctx: B-UC |
| AC-EXE-05 | Given an open task, when `completeAction`, then `completedAt` is set, an `action_completed` event is logged, and the task moves to "Done today". | domain + use-case | domain: yes; event: B-UC |
| AC-EXE-06 | Given a completed task, when `completeAction` is called again (double tap, retry), then no state change, no second event, and the call returns ok. | domain + use-case | domain `changed:false`: yes; no duplicate event: B-UC |
| AC-EXE-07 | Given a completed task, when `reopenAction`, then `completedAt` is null and the task returns to "Next up"; calling it twice is a no-op. | domain | yes |
| AC-EXE-08 | Given a routine, `completeAction`/`reopenAction` return `INVALID_STATE`; given a task, `checkRoutine`/`uncheckRoutine` return `INVALID_STATE`. | domain | yes |
| AC-EXE-09 | Given a routine started 2026-10-10 and today 2026-10-19, `checkRoutine` for 2026-10-19 and for a past date >= startDate succeeds; a date after today or before startDate returns `VALIDATION`. | domain | yes (`validateCheckDate`) |
| AC-EXE-10 | Given a routine checked for D, when `checkRoutine` for D repeats (retry or two tabs), then exactly one row exists for (action, D) and the call returns ok (`ON CONFLICT DO NOTHING`). | repo | yes (repo); use case: B-UC |
| AC-EXE-11 | Given a routine unchecked for D, when `uncheckRoutine` repeats, then ok with no error and no rows. | repo | yes |
| AC-EXE-12 | Given the UI check control, when toggled, then it flips immediately, is disabled while pending, reconciles to server state on response, and exposes `aria-pressed` with the action title as its label. | UI | partly yes (`CheckCircle`, `primitives.test.tsx`); wiring: B-PAGE, B-UC |
| AC-EXE-13 | Given check/uncheck on routines, then no `GoalEvent` is written (DOMAIN_MODEL.md:215). | use-case | B-UC |
| AC-EXE-14 | Given a user with no goals, then Today shows one empty state with one primary action (create goal); given only draft goals, it links to them. | UI | B-PAGE |
| AC-EXE-15 | Given a streak of consecutive kept periods, then it is shown as information only; an unchecked today does not break it. | domain | yes (`routineStreak`) |
| AC-EXE-16 | Given the routine sheet, past days can be toggled; future days cannot; scheduled days are outlined and checked days filled with a non-colour cue (see AC-MOB-07). | UI | B-PAGE |

## 6. Progress: three separate metrics (AC-PRG)

Three metrics must be computed, stored/displayed, and labelled separately. None may be derived from another.

| Metric | Definition (proposed where the docs are silent) |
|---|---|
| **A. Planning completeness** | `populated non-central positions / 72`. A position is populated when it holds an active outcome (<= 8) or an active action (<= 64) with a non-blank title. Archived items and the goal itself do not count. Always an integer fraction `n/72`; goals with fewer than 8 outcomes still use 72 as the denominator. |
| **B. Action completion** | Two numbers, never blended: tasks = `completed active tasks / active tasks` (denominator excludes archived actions and actions in archived outcomes, includes tasks with no due date); routines = rolling 28-day adherence per routine (DOMAIN_MODEL.md:224-237), summarised as mean adherence over routines with non-null adherence. Empty denominators render "—", not 0%. |
| **C. Goal attainment** | Progress against the goal's own success criteria (e.g. a measurable target, or a user-stated "achieved when" check). Independent of A and B. |

| ID | Given / When / Then | Layer | Testable now? |
|---|---|---|---|
| AC-PRG-01 | Given a goal with 3 outcomes and 10 actions all with titles, then planning completeness is `13/72` regardless of any completion state. | domain | B-SPEC (M-03); function does not exist |
| AC-PRG-02 | Given an empty goal, planning completeness is `0/72` (a value, not null); given the full matrix, `72/72`. | domain | B-SPEC (M-03) |
| AC-PRG-03 | Given archived outcomes/actions, then they are excluded from the numerator; archiving then restoring returns the same value. | domain | B-SPEC (M-03) |
| AC-PRG-04 | Given task t1 done, t2 open, t3 archived, then task completion is `1/2`. | domain | partly: `taskProgress` exists; the aggregate over the documented denominator does not (M-04) |
| AC-PRG-05 | Given a task completed then reopened, then completion drops back; the `action_completed` and `action_reopened` events remain in history. | domain + use-case | domain: yes; events: B-UC |
| AC-PRG-06 | Given a daily routine that began 3 days ago with checks on 2 of the 3 prior days and today unchecked, then adherence is `2/3`; once today is checked it is `3/4`. | domain | yes (`progress.test.ts`) |
| AC-PRG-07 | Given a routine whose `startDate` is today with no check, then adherence is null ("—"), never 0 or 100. | domain | yes |
| AC-PRG-08 | Given weekdays [Mon,Wed,Fri], a check on a Tuesday does not count toward `kept` (off-schedule). | domain | yes |
| AC-PRG-09 | Given weekly(3) with 5 checks in one ISO week, then `kept` is capped at 3 for that week and total adherence <= 1. | domain | yes |
| AC-PRG-10 | Given an outcome with a measure (current 5, target 10), then the outcome's measure progress is 0.5; given current > target, 1; given a task completion, the measure progress does not change. | domain | yes |
| AC-PRG-11 | Given an outcome with a measure AND completed actions, then the UI shows both the measure and the action completion, not a single number that hides the other. | UI / domain | B-SPEC (M-05) |
| AC-PRG-12 | Given a goal where 100% of tasks are complete and routine adherence is 100%, then goal attainment is NOT shown as achieved/100% unless the success criteria say so. | domain / UI | B-SPEC (M-01) |
| AC-PRG-13 | Given a goal with no success criteria set, then goal attainment renders "Not set" (not 0% and not a value inferred from A or B). | domain / UI | B-SPEC (M-01) |
| AC-PRG-14 | Given the goal overview, then A, B and C are shown as three labelled values with their denominators visible ("13 of 72 positions", "6 of 9 tasks", "attainment: not set"). | UI | B-PAGE, B-SPEC |
| AC-PRG-15 | Given `null` progress, `ProgressBar` shows "—" with "Not measurable yet" and `role="progressbar"` has no misleading `aria-valuenow`. | UI | yes (primitives) |
| AC-PRG-16 | Given pace (ahead/on_track/behind/overdue/unknown), then the badge states what it compares (elapsed time vs which metric), and it is only labelled "pace", never "attainment". | domain / UI | B-SPEC (M-06) |
| AC-PRG-17 | Given active goal, target > activatedOn, today after target, then pace is `overdue` regardless of progress; with null progress and today in range, `unknown`. | domain | yes |
| AC-PRG-18 | Given progress >= elapsed+0.10 `ahead`; >= elapsed-0.15 `on_track`; else `behind`. | domain | yes |
| AC-PRG-19 | Given no gamification, then no XP, level, badge or confetti element appears anywhere (D-006). | UI | B-PAGE |

## 7. Reflection (AC-REF)

| ID | Given / When / Then | Layer | Testable now? |
|---|---|---|---|
| AC-REF-01 | Given all three fields blank/whitespace, when added, then `VALIDATION`; given at least one non-blank, stored trimmed (each <= 4000). | domain + schema | yes |
| AC-REF-02 | Given `date` after today, then `VALIDATION`; given today or past, accepted. | domain | yes |
| AC-REF-03 | Given two reflections on the same date for one goal, both are stored and listed. | repo | yes (no unique index; add test) |
| AC-REF-04 | Given a weekly reflection with any date in an ISO week (Mon-Sun), it is listed under that week. | domain / use-case | B-UC |
| AC-REF-05 | Given an edit that blanks all three fields, then `VALIDATION` and the saved text is unchanged. | domain | yes |
| AC-REF-06 | Given delete, the UI requires confirmation; after confirm the row is hard-deleted and not recoverable. | UI + repo | repo: yes; UI: B-PAGE |
| AC-REF-07 | Given an archived goal, reflections cannot be added (read-only) but remain visible. | use-case | B-UC, B-SPEC (M-10) |
| AC-REF-08 | Given a reflection draft typed on a phone, when the save fails, then the text remains in the field (no loss). | UI | B-PAGE |
| AC-REF-09 | Given reflections and GoalEvents, the Journal interleaves them reverse-chronologically; reflections write no GoalEvent. | use-case / UI | B-UC, B-PAGE |

## 8. Error recovery (AC-ERR)

| ID | Given / When / Then | Layer | Testable now? |
|---|---|---|---|
| AC-ERR-01 | Given a DB error mid-use-case, then the transaction rolls back (no partial goal/event), the caller receives `INTERNAL` with a generic message and details are logged server-side only. | use-case | UoW rollback: yes (`db.test.ts`); mapping: B-UC |
| AC-ERR-02 | Given a failed write, then the UI never shows success state or "Saved" toast; it shows the error next to the control and offers Retry. | UI | B-PAGE |
| AC-ERR-03 | Given optimistic UI (check circle), when the server rejects, then the control reverts to server truth and an error is announced via a polite live region. | UI | B-PAGE |
| AC-ERR-04 | Given a network timeout where the server did commit, when the user retries `addAction`/`addOutcome`/`createGoal`, then exactly one row results (idempotency key or dedupe); today a retried add creates a duplicate. | use-case | B-SPEC (M-07) |
| AC-ERR-05 | Given retried `completeAction`, `reopenAction`, `checkRoutine`, `uncheckRoutine`, archive/restore, then the second call is a no-op returning the current state and no duplicate event is written. | use-case | B-UC |
| AC-ERR-06 | Given device A and B both showing the same plan, when B archives an action and A then reorders, then A gets `CONFLICT` and refreshes to current state with its draft input retained. | use-case | B-UC (reorder CONFLICT defined at API_CONTRACTS.md:99,107) |
| AC-ERR-07 | Given device A and B both editing the same action's title, when A saves after B, then A is told the item changed (`CONFLICT`) rather than silently overwriting. | use-case | B-SPEC (M-08): no version token in `schemas.ts` |
| AC-ERR-08 | Given a unique violation on email at sign-up, then `CONFLICT` with the generic message from API_CONTRACTS.md:82; no account enumeration. | use-case | B-AUTH |
| AC-ERR-09 | Given a rate-limited sign-in, then `RATE_LIMITED` with retry guidance and the form keeps the email. | use-case / UI | rate limiter exists; wiring: B-AUTH |
| AC-ERR-10 | Given a route segment throwing, then `error.tsx` shows what happened plus a Retry; navigation to other tabs still works. | UI | B-PAGE |
| AC-ERR-11 | Given the app is offline, a write attempt shows "not saved" and does not queue silently. | UI | B-PAGE, B-SPEC (M-11) |

## 9. Mobile usability (AC-MOB)

Viewports: V1 = 360x640, V2 = 390x844. Applies to Today, Plan (accordion), action/outcome editor, goal form, routine sheet, journal, sign-in/up, settings.

| ID | Given / When / Then | Layer | Testable now? |
|---|---|---|---|
| AC-MOB-01 | Given V1 and V2, then no page scrolls horizontally and no content is clipped (document width == viewport width). | UI | B-PAGE |
| AC-MOB-02 | Given V1/V2, every interactive element (button, link, check circle, menu trigger, tab, input) has a hit area >= 44x44 CSS px with >= 8 px gap to neighbours. | UI | partly: `CheckCircle` is 44px (`CheckCircle.tsx:21`); `Button` sm=32px / md=40px height (`Button.tsx:17`) FAILS (M-12) |
| AC-MOB-03 | Given an editor open and the on-screen keyboard shown (visual viewport height ~ 40-50% of the screen), then the Save/Cancel controls and the focused field remain visible or reachable without dismissing the keyboard (sticky footer or scroll-into-view; use `dvh`, not `vh`). | UI | B-PAGE |
| AC-MOB-04 | Given a form with an invalid field, then focus moves to it and it is scrolled above the keyboard. | UI | B-PAGE |
| AC-MOB-05 | Given browser text scaled to 200% (and 16 px minimum body), then at V1 no text is truncated without a way to read it, no overlap, no horizontal scroll, all actions reachable (WCAG 1.4.4/1.4.10 reflow). | UI | B-PAGE |
| AC-MOB-06 | Given the grid cell "2-line clamp" (DESIGN_SYSTEM.md:80), then the full title is available (tap opens the editor or the accordion shows it unclamped), including at 200% text. | UI | B-PAGE |
| AC-MOB-07 | Given any state (done, overdue, checked, scheduled, today, error, pace), then it is conveyed by text, icon shape or pattern in addition to colour; a greyscale screenshot remains unambiguous. | UI | partly: `Badge` uses text; routine sheet and cells: B-PAGE |
| AC-MOB-08 | Given text/UI contrast, then body >= 4.5:1 and UI/large >= 3:1 in light and dark; `--ink-faint` never carries essential text. | UI | yes (token check can be automated on `globals.css`) |
| AC-MOB-09 | Given `prefers-reduced-motion`, then transitions are disabled. | UI | yes (CSS check) |
| AC-MOB-10 | Given the bottom tab bar (< 768 px), it does not cover the last list item or the Save footer, and respects safe-area insets. | UI | B-PAGE (`AppShell.tsx` exists; no pages) |
| AC-MOB-11 | Given a screen reader, each check circle announces "<action title>, pressed/not pressed", dialogs trap focus and return it on close, and the toast region is polite. | UI | partly yes (primitives) |
| AC-MOB-12 | Given V1, a user can complete the core loop in <= 3 taps from Today: check a routine, complete a task. | UI | B-PAGE |

## 10. Authentication and session (AC-AUTH)

| ID | Given / When / Then | Layer | Testable now? |
|---|---|---|---|
| AC-AUTH-01 | Given valid sign-up input, then the user, a session and an httpOnly `hga_session` cookie (SameSite=Lax, Secure in prod, 30-day) are created; the password is stored only as an Argon2id hash. | use-case | B-AUTH (hasher exists) |
| AC-AUTH-02 | Given a session with `expires_at <= now`, when any page/action/query is requested, then it behaves as signed out: pages redirect to `/signin`, actions return `UNAUTHENTICATED`, and the expired row is not renewed. | use-case / UI | repo contract defined (`ports.ts:46`); B-AUTH |
| AC-AUTH-03 | Given a session that expires while a form is open, when saving, then the user is told the session expired, their typed input is preserved, and after re-sign-in they return to the same page. | UI | B-AUTH, B-PAGE, B-SPEC (M-13) |
| AC-AUTH-04 | Given a session with < 15 days left, when used, then expiry is extended to 30 days; given >= 15 days, not extended. | use-case | B-AUTH |
| AC-AUTH-05 | Given sign-out, then the session row is deleted, the cookie cleared, and the old token no longer authenticates (back button shows no private data, requests return `UNAUTHENTICATED`). | use-case / UI | B-AUTH |
| AC-AUTH-06 | Given unknown email vs. wrong password, then identical message, status and (approximately) timing. | use-case | B-AUTH |
| AC-AUTH-07 | Given `changePassword`, then all other sessions are invalidated and the current one remains. | use-case | B-AUTH |
| AC-AUTH-08 | Given user U2's goal/outcome/action/reflection/routine-check id, when U1 calls any read or write with it, then `NOT_FOUND` (never `FORBIDDEN`, never leaking existence); the response is indistinguishable from a random uuid. | repo + use-case | repo scoping by `ownerId`: yes (add cross-user tests per repo); use case: B-UC |
| AC-AUTH-09 | Given U1 moves an action to an outcome id owned by U2, or reorders with U2's ids, then `NOT_FOUND`, no change. | use-case | B-UC |
| AC-AUTH-10 | Given `GET /api/export`, then only the session user's data is returned; unauthenticated is 401. | route | B-UC, B-AUTH |
| AC-AUTH-11 | Given `userId` in a request body/query, then it is ignored; identity comes only from the session (API_CONTRACTS.md:11). | use-case | B-UC |
| AC-AUTH-12 | Given deleteAccount with the wrong password or confirmation != `DELETE`, then no deletion; given correct, all rows cascade and the session ends. | use-case / repo | schema: yes; repo cascade: yes; use case: B-AUTH |

## 11. Summary of coverage (to be updated when use cases land)

See the final reply of the author for counts; recompute with: `grep -c '^| AC-' docs/ACCEPTANCE_CRITERIA.md`.

## 12. Missing or contradictory requirements

| # | Finding | Evidence | Needed decision |
|---|---|---|---|
| M-01 | **No goal-attainment metric exists.** The only goal number is `progress`, the mean of outcome progress, i.e. derived from action completion/adherence (or measures). This is exactly "inferred from action completion". There is no goal-level success-criteria field. | `DOMAIN_MODEL.md:243-244`; `progress.ts:104-126`; `dto.ts:50,106`; `API_CONTRACTS.md:44`; `types.ts:26-40` (no field) | Add a goal success criterion (e.g. `successCriteria` text plus optional measure) and a separate attainment value; `markGoalAchieved` should reference it. |
| M-02 | **Is `vision` a success criterion?** Vision is free text "What does achieving this look and feel like?" (0..2000), not measurable and not checkable. `markGoalAchieved` has no preconditions and no criteria, so achievement is a bare status flip. | `DOMAIN_MODEL.md:56,74`; `goal.ts:109` | Decide: vision stays narrative; add separate criteria. Define who decides "achieved" (user manually vs. measure reached). |
| M-03 | **No planning-completeness metric** (populated / 72) anywhere in domain, DTOs or contracts; "populated" is undefined (title present? archived?). The DTO only has counts `outcomeCount`/`actionCount`. | `API_CONTRACTS.md:43-48`; `dto.ts`; `progress.ts` | Define the function and DTO field; confirm 72 is the fixed denominator even for goals with < 8 outcomes (D-005 allows fewer). |
| M-04 | **Action-completion denominator undefined and heterogeneous.** Tasks are 0/1; routines are fractional 28-day adherence; both are averaged together into outcome and goal progress, so one done task equals one perfect routine, and an empty outcome vanishes from the mean (null excluded) so it does not drag progress down. Archived-outcome actions excluded. | `progress.ts:87-101`; `DOMAIN_MODEL.md:239-244` | Pick and document the denominator (proposal in section 6, metric B) and whether blended display is allowed. |
| M-05 | **A measure replaces action progress.** If an outcome has a measure, its action completion is ignored in outcome and goal progress; the user can see 100% with no action done (or vice versa). | `progress.ts:81-85`; `DOMAIN_MODEL.md:240` | Decide whether measure is attainment (metric C) rather than part of "progress". Most consistent: measure feeds attainment, actions feed completion. |
| M-06 | **Pace compares time elapsed to a blended progress number.** "On track" therefore claims attainment while measuring action completion; pace is named after the goal, with thresholds (+0.10 / -0.15) undocumented in rationale. Pace needs `targetDate` and activation; draft goals get none. | `progress.ts:128-143`; `DOMAIN_MODEL.md:246-255` | Define which metric pace uses and rename or relabel. |
| M-07 | **No idempotency key for creates.** `createGoal`/`addOutcome`/`addAction`/`addReflection` retry after a timeout creates duplicates (only checks/complete are idempotent). | `API_CONTRACTS.md:89,95,101,109`; `schemas.ts:52,80,115,150` (no `requestId`) | Add a client request id with a unique index, or document an accepted risk. |
| M-08 | **No optimistic-concurrency token on updates.** `CONFLICT` is defined only for unique violations and reorder permutations; `updateGoal/Outcome/Action` take no `updatedAt`/version, so stale clients last-write-wins silently. | `API_CONTRACTS.md:22,99,107`; `schemas.ts:59,86,123` | Add `expectedUpdatedAt` to update schemas and map mismatch to `CONFLICT`. |
| M-09 | **Routine <-> task round trip undefined.** Old checks are retained "but no longer counted", yet converting back to routine resets `startDate = today`; whether older checks resurface is not stated. Also `moveAction` of a routine and `startDate` edits are unspecified; `startDate` is not editable in `updateActionSchema`. | `DOMAIN_MODEL.md:146-147,135`; `schemas.ts:123-130` | Specify. |
| M-10 | **Reflection/execution rules on non-active goals unspecified.** Can reflections be added to draft, achieved or archived goals? Can tasks be completed in an achieved goal (they are hidden from Today)? Archive rule only covers actions. | `DOMAIN_MODEL.md:151,188-190`; `next.ts` filters active goals | Specify. |
| M-11 | **No offline/queued-write policy**, and no requirement for "Saved" state wording or retry UX beyond toasts (auto-dismiss 4 s must not be the only error signal on forms; fine) . | `DESIGN_SYSTEM.md:72,86-89` | Declare "online-only, fail loudly". |
| M-12 | **Touch-target contradiction.** Design says min touch target 44 px on mobile, but `Button` sizes are 32/40 px high with only `min-w-[44px]`. | `DESIGN_SYSTEM.md:62` vs `Button.tsx:17` | Add `min-h-[44px]` at < 768 px or change sizes. |
| M-13 | **Session-expiry UX unspecified.** Middleware only checks cookie presence (a stale cookie passes), so expiry is discovered inside actions; no spec for preserving form data or return-to path, and no password reset/email verification (limitation). | `API_CONTRACTS.md:140`; `PROJECT_STATUS.md` limitations; `DECISIONS.md` D-004 | Specify `UNAUTHENTICATED` handling in server actions. |
| M-14 | **Execution precondition conflicts with "act before matrix is full".** Activation needs >= 1 outcome AND >= 1 action, and Today shows only active goals. A user with a draft goal cannot execute, and a user with an outcome but no action cannot activate. Probably acceptable but should be explicit; also a minimal matrix of 1 action under 1 outcome is "2/72". | `DOMAIN_MODEL.md:73,267` | Confirm. |
| M-15 | **Docs vs. code drift on `PROJECT_STATUS`**: unit domain tests exist (`*.test.ts`) but status says "unit (domain)" not started; the tracker is stale for phase 2/3. | `PROJECT_STATUS.md` testing table | Update. |
| M-16 | **Time-zone change semantics.** Changing `timeZone` shifts "today"; effects on `startDate`, streaks and a routine already checked "today" are unspecified. | `DECISIONS.md` D-010; `API_CONTRACTS.md:85` | Specify. |

## 13. Suggested test placement

- Domain ACs: extend `src/domain/*.test.ts` (Vitest).
- Repo ACs (unique indexes, cross-user scoping, idempotent check insert, cascade): extend `src/infrastructure/testing/db.test.ts` using `create-test-deps.ts` on PGlite. Currently only outcome position uniqueness and UoW rollback are covered.
- Use-case ACs: new `src/application/use-cases/*.test.ts` on PGlite with a fake clock.
- UI ACs: Playwright at 360x640 and 390x844 with 200% text zoom; axe-core for contrast/target size where possible.
