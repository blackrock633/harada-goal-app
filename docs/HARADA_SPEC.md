# Harada Specification — Product Rules

> **Status: PROPOSED (QA orchestrator, 2026-10-19).** Defines what the app means by "the Harada
> matrix" and how its metrics are computed. Sources and confidence levels are in
> `research/HARADA_METHOD_SOURCES.md`. No primary source (Bodek 2012, Harada Education Institute)
> was retrievable, so rules are tagged:
> **[M]** method (consistently reported by secondary sources) · **[A]** product adaptation (our choice) ·
> **[?]** unverified; treat as adaptation until confirmed.
>
> Code vocabulary: *key area* = `Outcome`, *action position* = `Action`. Renaming is not required, but
> UI copy should say "key area" / "action".

## 1. Structure

| Element | Count | Rule |
|---|---|---|
| Central goal | 1 | **[M]** One long-term goal with a target date. It is the centre cell. |
| Key areas | 8 positions (0–7) | **[M]** Eight elements that support the goal. Each one is a child of exactly one goal. |
| Action positions | 8 per key area, 64 total | **[M]** Concrete behaviours that support one key area. Each one is a child of exactly one key area, in the same goal. |
| Non-central positions | 72 = 8 + 64 | The denominator for planning completeness (§5.1). |

- **9×9 layout [M]:** the centre 3×3 block holds the goal plus its 8 key areas. Each outer 3×3 block repeats one key area in its centre, surrounded by that key area's 8 actions. The repeated key area is a *view* of the same record, never a copy.
- **Partial matrices are valid [A]:** the method shows a full chart, but the app allows empty positions. Activation needs ≥ 1 key area with ≥ 1 action (DOMAIN_MODEL §3.1). Users can execute before the matrix is full.
- **Position integrity:** a key-area position is unique among the goal's active key areas, and an action position is unique within its key area. `action.goalId` must equal its key area's `goalId`. The database must enforce this; the current schema does not (QA_REPORT D-4).
- Positions are slots, not identity. Moving or reordering never changes an action's id or history.

## 2. Concepts that must not be confused

| Concept | What it is | What it is not |
|---|---|---|
| Central goal | The objective and its success criteria | A task to tick off |
| Key area | A domain of effort | A measurement of the goal |
| Action position | A planned behaviour, either a one-off task or a routine **[?]** | Evidence the goal was achieved |
| Daily selection | What the user commits to today, chosen from the matrix | A new entry typed in from scratch |
| Action completion | A task marked done, or a routine checked on a date | Goal attainment |
| Goal attainment | The success criteria are met, as declared by the user or measured | Something derived from completion counts |

**A fully planned and fully executed matrix does not mean the goal is achieved.** Only an explicit
user action (`markGoalAchieved`) or a met measurable criterion that the user confirms changes attainment.

## 3. User journey

1. **Define the goal [M]:** title (required). Target date, motivation/purpose, and success criteria are optional but prompted. The 4-quadrant purpose (self/others × tangible/intangible) is **[?]**: keep it, but label it as a prompt, not as "the method".
2. **Identify key areas [M]:** up to 8. Suggestions and templates are allowed **only as explicit user choices**. They create a *new draft* and never overwrite existing content (DOMAIN_MODEL §8).
3. **Define actions [M]:** up to 8 per key area. Titles should be concrete and executable ("Run 5 km Tue/Thu", not "Fitness").
4. **Execute [M]:** the Routine Check Sheet and daily plan **[M]** are drawn from the matrix. Today shows due routines and open tasks with no re-entry. The method advises ≤ 10 tracked routines **[M]**; the app may warn past 10 but must not block.
5. **Reflect and adapt [M]:** dated reflections (what went well, what didn't, what to change). Plan edits are recorded as GoalEvents **[A]**. Renaming or moving an action keeps its id, completion, and check history. Archiving hides the action but does not delete it.

Product features that are **not** the method and must not be presented as such: task/routine schedules,
28-day adherence, streaks, pace badges, templates, weekly reflections, goal status lifecycle, and
any AI suggestions **[A]**.

## 4. Generated content

AI is optional and must not be needed for any core flow. If it is added, suggestions must be stored or shown as
*suggestions* (distinct styling plus a "Suggested" label), accepted per item, and never written over
user-authored text.

## 5. Metrics

All metrics are computed **once, in `src/domain`**, and returned in DTOs. The UI never recomputes them.
Each metric has its own name in DTOs and UI copy, and none of them is called "goal progress".

### 5.1 Planning completeness
`filled / 72`, where `filled` = active key areas + active actions with a non-blank title.
Archived records don't count. Always defined (0/72 for an empty matrix). Show it as "N of 72 positions planned".
*Status: not implemented (no domain function).*

### 5.2 Action completion
- **Tasks:** `completedTasks / activeTasks` across the goal's active key areas (a flat count with no
  per-key-area averaging). `null` when `activeTasks = 0`. Reopening decrements the count.
- **Routines:** adherence per DOMAIN_MODEL §4.2 **[A]**, reported **separately** from tasks
  ("Routines kept: 82% over 28 days"). Tasks and routines are not mixed into one number.
- Archived actions, and actions in archived key areas, are excluded. A moved action counts under its new key area.

*Status: DIVERGES.* `goalProgress` is a mean of per-key-area means, which mixes tasks, routine
adherence, and measures. It gives an undefined weighting (1 of 8 actions done shows 50%) — QA_REPORT P-2.

### 5.3 Goal attainment
- `achieved` is an explicit status the user sets. It is never set automatically.
- If key areas carry numeric measures, show each one as "current / target unit". An aggregate is
  allowed only when every measure shares a unit and the user designates them as the success criteria.
- Qualitative criteria are shown as text with "Achieved? yes/no" self-assessment. There is no percentage.
- **Pace** (ahead/behind) may only compare *measured attainment* against elapsed time. It must not use
  action completion (QA_REPORT P-1). When no measure exists, pace is `unknown`.

*Status: DIVERGES.* There is no success-criteria field on Goal (`vision` is closest), and pace is computed from the mixed `progress`.

### 5.4 Edge cases (tested in `tests/integration/progress-semantics.test.ts`)
Empty matrix → planning 0/72, completion `null`, attainment not achieved. Zero denominators → `null`,
shown as "—", never 0% or 100%. Reopened task → its count drops. Archived goal → pace `unknown`.
Changed or moved action → history kept, counted once under its current key area.
