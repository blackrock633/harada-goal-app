/**
 * Progress semantics audit (docs/HARADA_SPEC.md §5).
 *
 * The product must keep three metrics apart:
 *   1. planning completeness   – populated non-central positions / 72
 *   2. action completion       – completed tasks / active tasks (documented denominator)
 *   3. goal attainment         – the goal's own success criteria; never inferred from 1 or 2
 *
 * Tests marked `it.fails` reproduce a documented defect (see docs/QA_REPORT.md, ids P-n).
 * They are expected to fail against the current code and will flip to "unexpectedly passed"
 * once the defect is fixed — at which point drop the `.fails`.
 */
import { describe, expect, it } from 'vitest';
import { computeGoalProgress, goalProgress, outcomeProgress, pace } from '@/domain/progress';
import { completeTask, reopenTask } from '@/domain/action';
import type { Action, Goal, Id, LocalDate, Outcome } from '@/domain/types';

const T0 = new Date('2026-01-01T00:00:00Z');
const TODAY: LocalDate = '2026-03-01';

function goal(patch: Partial<Goal> = {}): Goal {
  return {
    id: 'g1', ownerId: 'u1', title: 'Run a marathon', vision: 'Finish under 4h', targetDate: '2026-12-31',
    status: 'active', statusBeforeArchive: null,
    purpose: { selfTangible: '', selfIntangible: '', othersTangible: '', othersIntangible: '' },
    activatedOn: '2026-01-01', achievedAt: null, archivedAt: null, createdAt: T0, updatedAt: T0,
    ...patch,
  };
}

function outcome(id: Id, position: number, patch: Partial<Outcome> = {}): Outcome {
  return { id, goalId: 'g1', title: id, description: '', measure: null, position, archivedAt: null, createdAt: T0, updatedAt: T0, ...patch };
}

function task(id: Id, outcomeId: Id, position: number, done = false, patch: Partial<Action> = {}): Action {
  return {
    id, goalId: 'g1', outcomeId, title: id, notes: '', kind: 'task', position,
    dueDate: null, completedAt: done ? T0 : null, schedule: null, startDate: null,
    archivedAt: null, createdAt: T0, updatedAt: T0, ...patch,
  };
}

const byOutcome = (actions: Action[]) => {
  const m = new Map<Id, Action[]>();
  for (const a of actions) m.set(a.outcomeId, [...(m.get(a.outcomeId) ?? []), a]);
  return m;
};
const noChecks = new Map<Id, LocalDate[]>();

describe('zero denominators and empty matrices', () => {
  it('a goal with no key areas has no measurable progress (null, not 0%)', () => {
    expect(goalProgress([], new Map(), noChecks, TODAY)).toBeNull();
  });

  it('a key area with no actions is not measurable (null), and is excluded from the goal mean', () => {
    const outcomes = [outcome('o1', 0), outcome('o2', 1)];
    const actions = [task('a1', 'o1', 0, true)];
    expect(outcomeProgress(outcomes[1]!, [], noChecks, TODAY)).toBeNull();
    expect(goalProgress(outcomes, byOutcome(actions), noChecks, TODAY)).toBe(1);
  });

  it('pace is "unknown" when progress is not measurable', () => {
    expect(pace(goal(), null, TODAY)).toBe('unknown');
  });
});

describe('reopened, archived and moved actions', () => {
  it('reopening a completed task returns its contribution to 0', () => {
    const o = outcome('o1', 0);
    const { action: done } = completeTask(task('a1', 'o1', 0), T0);
    expect(outcomeProgress(o, [done], noChecks, TODAY)).toBe(1);
    const reopened = reopenTask(done, T0);
    expect(outcomeProgress(o, [reopened], noChecks, TODAY)).toBe(0);
  });

  it('archived actions are excluded from the denominator', () => {
    const o = outcome('o1', 0);
    const actions = [task('a1', 'o1', 0, true), task('a2', 'o1', null as unknown as number, false, { archivedAt: T0, position: null })];
    expect(outcomeProgress(o, actions, noChecks, TODAY)).toBe(1);
  });

  it('an action moved to another key area counts only under its new key area', () => {
    const outcomes = [outcome('o1', 0), outcome('o2', 1)];
    const moved = task('a1', 'o2', 0, true);
    const r = computeGoalProgress(goal(), outcomes, [moved, task('a2', 'o1', 0)], noChecks, TODAY);
    expect(r.outcomes.get('o1')).toBe(0);
    expect(r.outcomes.get('o2')).toBe(1);
  });

  it('archived goals report pace "unknown" (no false "behind")', () => {
    expect(pace(goal({ status: 'archived' }), 0, TODAY)).toBe('unknown');
  });
});

describe('goal attainment is not inferred from action completion', () => {
  // Every planned action done, but the goal (finish a marathon under 4h) has not happened.
  const outcomes = [outcome('o1', 0)];
  const actions = [task('a1', 'o1', 0, true), task('a2', 'o1', 1, true)];

  it('goal status stays active when all actions are complete (status is user-controlled)', () => {
    const g = goal();
    computeGoalProgress(g, outcomes, actions, noChecks, TODAY);
    expect(g.status).toBe('active');
    expect(g.achievedAt).toBeNull();
  });

  // DEFECT P-1: the only goal-level number is `progress`, which reaches 100% from action
  // completion alone, and `pace` then reports "ahead". DTOs/UI expose this as goal progress
  // (API_CONTRACTS §2 GoalSummaryDTO.progress), which reads as attainment.
  it.fails('P-1: goal-level progress must not report 100% while the goal is not achieved', () => {
    const r = computeGoalProgress(goal(), outcomes, actions, noChecks, TODAY);
    expect(r.goal).toBeLessThan(1);
  });

  it.fails('P-1: pace must not claim "ahead" based solely on action completion', () => {
    const r = computeGoalProgress(goal(), outcomes, actions, noChecks, TODAY);
    expect(r.pace).not.toBe('ahead');
  });
});

describe('action completion uses a documented denominator', () => {
  // Key area A: 1 task, done. Key area B: 7 tasks, none done. 1 of 8 actions are complete.
  const outcomes = [outcome('A', 0), outcome('B', 1)];
  const actions = [
    task('a0', 'A', 0, true),
    ...Array.from({ length: 7 }, (_, i) => task(`b${i}`, 'B', i)),
  ];

  // DEFECT P-2: goal progress is a mean of per-key-area means, so a key area with 1 action
  // weighs the same as one with 7 — an implicit weighting no document defines.
  // The user sees 50% while 1 of 8 actions (12.5%) are complete.
  it.fails('P-2: goal-level completion equals completed / active actions (1/8)', () => {
    const r = computeGoalProgress(goal(), outcomes, actions, noChecks, TODAY);
    expect(r.goal).toBeCloseTo(1 / 8);
  });

  it('characterisation: current implementation reports 0.5 for this matrix', () => {
    const r = computeGoalProgress(goal(), outcomes, actions, noChecks, TODAY);
    expect(r.goal).toBe(0.5);
  });

  // DEFECT P-3: a key area with a numeric measure ignores its actions entirely, and is
  // averaged with action-based key areas into one number of mixed meaning.
  it('characterisation: a met measure yields 100% for the key area with zero actions complete', () => {
    const o = outcome('o1', 0, { measure: { target: 10, current: 10, unit: 'km' } });
    expect(outcomeProgress(o, [task('a1', 'o1', 0)], noChecks, TODAY)).toBe(1);
  });
});
