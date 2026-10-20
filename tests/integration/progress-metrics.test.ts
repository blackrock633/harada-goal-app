/**
 * Progress semantics against the final metrics API (data/supabase >= 761b5b1).
 * Successor to tests/integration/progress-semantics.test.ts (which targets the removed blended API).
 * Spec: docs/HARADA_SPEC.md §5 — planning, action completion and goal attainment are separate.
 */
import { describe, expect, it } from 'vitest';
import { computeGoalMetrics, PLANNING_TOTAL } from '@/domain/progress';
import { completeTask, reopenTask } from '@/domain/action';
import type { Action, Goal, Id, LocalDate, Outcome } from '@/domain/types';

const T0 = new Date('2026-01-01T00:00:00Z');
const TODAY: LocalDate = '2026-03-01';

// Spread over the real type so fields added later (e.g. successCriteria) don't break the fixtures.
function goal(patch: Partial<Goal> = {}): Goal {
  return {
    id: 'g1', ownerId: 'u1', title: 'Run a marathon', vision: '', targetDate: '2026-12-31',
    status: 'active', statusBeforeArchive: null,
    purpose: { selfTangible: '', selfIntangible: '', othersTangible: '', othersIntangible: '' },
    activatedOn: '2026-01-01', achievedAt: null, archivedAt: null, createdAt: T0, updatedAt: T0,
    ...patch,
  } as Goal;
}
const outcome = (id: Id, position: number, patch: Partial<Outcome> = {}): Outcome =>
  ({ id, goalId: 'g1', title: id, description: '', measure: null, position, archivedAt: null, createdAt: T0, updatedAt: T0, ...patch }) as Outcome;
const task = (id: Id, outcomeId: Id, position: number | null, done = false, patch: Partial<Action> = {}): Action =>
  ({
    id, goalId: 'g1', outcomeId, title: id, notes: '', kind: 'task', position,
    dueDate: null, completedAt: done ? T0 : null, schedule: null, startDate: null,
    archivedAt: null, createdAt: T0, updatedAt: T0, ...patch,
  }) as Action;
const routine = (id: Id, outcomeId: Id, position: number): Action =>
  task(id, outcomeId, position, false, { kind: 'routine', schedule: { type: 'daily' }, startDate: '2026-02-01' });

const metrics = (outcomes: Outcome[], actions: Action[], g = goal(), checks = new Map<Id, LocalDate[]>()) =>
  computeGoalMetrics(g, outcomes, actions, checks, TODAY);

describe('planning completeness (filled / 72)', () => {
  it('the denominator is 72 non-central positions', () => expect(PLANNING_TOTAL).toBe(72));

  it('an empty matrix is 0/72, with completion and attainment not measurable', () => {
    const m = metrics([], []);
    expect(m.planning).toEqual({ filled: 0, total: 72, ratio: 0 });
    expect(m.tasks.ratio).toBeNull();
    expect(m.attainment).toBeNull();
    expect(m.pace).toBe('unknown');
  });

  it('counts key areas plus actions; archived ones do not count', () => {
    const m = metrics(
      [outcome('A', 0), outcome('B', 1), outcome('Z', null as unknown as number, { archivedAt: T0, position: null })],
      [task('a1', 'A', 0), task('a2', 'A', 1), task('b1', 'B', 0), task('x', 'A', null, false, { archivedAt: T0 })],
    );
    expect(m.planning.filled).toBe(2 + 3);
  });
});

describe('action completion (documented denominator)', () => {
  const outcomes = [outcome('A', 0), outcome('B', 1)];
  const actions = [task('a0', 'A', 0, true), ...Array.from({ length: 7 }, (_, i) => task(`b${i}`, 'B', i))];

  it('QA P-2: is a flat count, 1 of 8 tasks done = 1/8 (not a mean of per-area means)', () => {
    expect(metrics(outcomes, actions).tasks).toEqual({ completed: 1, total: 8, ratio: 1 / 8 });
  });

  it('QA P-4: routines are reported separately and never enter the task denominator', () => {
    const m = metrics([outcome('A', 0)], [task('t', 'A', 0, true), routine('r', 'A', 1)]);
    expect(m.tasks).toEqual({ completed: 1, total: 1, ratio: 1 });
    expect(m.routines.count).toBe(1);
  });

  it('reopening a task lowers the count again', () => {
    const { action: done } = completeTask(task('t', 'A', 0), T0);
    expect(metrics([outcome('A', 0)], [done]).tasks.completed).toBe(1);
    expect(metrics([outcome('A', 0)], [reopenTask(done, T0)]).tasks.completed).toBe(0);
  });

  it('an action moved to another key area counts once, under its new key area', () => {
    const m = metrics([outcome('A', 0), outcome('B', 1)], [task('t', 'B', 0, true)]);
    const byId = Object.fromEntries(m.outcomes.map((o) => [o.outcomeId, o.tasks.completed]));
    expect(byId).toEqual({ A: 0, B: 1 });
    expect(m.tasks.completed).toBe(1);
  });
});

describe('goal attainment is never inferred from execution', () => {
  it('QA P-1: every task done and no measures → attainment not measurable, pace unknown, status unchanged', () => {
    const g = goal();
    const m = metrics([outcome('A', 0)], [task('t1', 'A', 0, true), task('t2', 'A', 1, true)], g);
    expect(m.tasks.ratio).toBe(1);
    expect(m.attainment).toBeNull();
    expect(m.pace).toBe('unknown');
    expect(g.status).toBe('active');
  });

  it('QA P-3: a met measure gives attainment without touching task completion', () => {
    const m = metrics([outcome('A', 0, { measure: { target: 10, current: 10, unit: 'km' } })], [task('t', 'A', 0)]);
    expect(m.attainment).toBe(1);
    expect(m.tasks).toEqual({ completed: 0, total: 1, ratio: 0 });
  });

  it('attainment is unit-agnostic: each measure is normalised to its own target before averaging', () => {
    const m = metrics([
      outcome('A', 0, { measure: { target: 42, current: 21, unit: 'km' } }),
      outcome('B', 1, { measure: { target: 4, current: 4, unit: 'clients' } }),
    ], []);
    expect(m.attainment).toBeCloseTo((0.5 + 1) / 2);
  });

  it('archived goals report pace unknown', () => {
    const m = metrics([outcome('A', 0, { measure: { target: 10, current: 1, unit: '' } })], [], goal({ status: 'archived' }));
    expect(m.pace).toBe('unknown');
  });
});
