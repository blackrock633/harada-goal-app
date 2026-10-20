import { expect, test, describe } from 'vitest';
import { planningCompleteness, goalAttainment, outcomeAttainment, computeGoalMetrics, taskProgress, routineAdherence, pace, routineStreak } from './progress.js';
import { Action, Outcome, Goal } from './types.js';

describe('progress', () => {
  test('taskProgress', () => {
    const a = { kind: 'task', completedAt: null, archivedAt: null } as Action;
    expect(taskProgress(a)).toBe(0);
    a.completedAt = new Date();
    expect(taskProgress(a)).toBe(1);
    a.archivedAt = new Date();
    expect(taskProgress(a)).toBeNull();
  });

  test('routineAdherence daily', () => {
    const a = { kind: 'routine', startDate: '2024-01-01', schedule: { type: 'daily' }, archivedAt: null } as Action;
    expect(routineAdherence(a, [], '2024-01-01')).toBeNull(); // today checked logic
    expect(routineAdherence(a, ['2024-01-01'], '2024-01-01')).toBe(1);
    expect(routineAdherence(a, ['2024-01-01'], '2024-01-02')).toBe(1); // 1 expected, 1 kept
    expect(routineAdherence(a, [], '2024-01-02')).toBe(0);
  });

  test('routineAdherence weekdays', () => {
    const a = { kind: 'routine', startDate: '2024-01-01', schedule: { type: 'weekdays', days: [1,2,3,4,5] }, archivedAt: null } as Action;
    // Jan 1 2024 is Monday. Jan 2 is Tuesday.
    expect(routineAdherence(a, ['2024-01-01'], '2024-01-02')).toBe(1);
    // Jan 6 is Saturday. Jan 7 is Sunday.
    // expected 5 (Jan 1, 2, 3, 4, 5). Kept 1 (Jan 5). Result 1/5 = 0.2.
    expect(routineAdherence(a, ['2024-01-05'], '2024-01-07')).toBe(0.2);
    expect(routineAdherence(a, [], '2024-01-07')).toBe(0);
  });

  test('routineAdherence weekly', () => {
    const a = { kind: 'routine', startDate: '2024-01-01', schedule: { type: 'weekly', timesPerWeek: 3 }, archivedAt: null } as Action;
    expect(routineAdherence(a, ['2024-01-01', '2024-01-03', '2024-01-05'], '2024-01-08')).toBe(1); // week 1: 3 kept, 3 expected
    expect(routineAdherence(a, ['2024-01-01'], '2024-01-08')).toBe(1/3);
  });

  test('pace (attainment-driven)', () => {
    const g = { status: 'active', activatedOn: '2024-01-01', targetDate: '2024-01-11' } as Goal;
    // elapsed is 5/10 = 0.5
    expect(pace(g, 0.6, '2024-01-06')).toBe('ahead');
    expect(pace(g, 0.5, '2024-01-06')).toBe('on_track');
    expect(pace(g, 0.4, '2024-01-06')).toBe('on_track');
    expect(pace(g, 0.2, '2024-01-06')).toBe('behind');
    expect(pace(g, 0.5, '2024-01-12')).toBe('overdue');
  });

  test('routineStreak daily', () => {
    const a = { kind: 'routine', startDate: '2024-01-01', schedule: { type: 'daily' }, archivedAt: null } as Action;
    expect(routineStreak(a, ['2024-01-01', '2024-01-02', '2024-01-03'], '2024-01-03')).toBe(3);
    // unchecked today doesn't break
    expect(routineStreak(a, ['2024-01-01', '2024-01-02'], '2024-01-03')).toBe(2);
    // missing middle breaks
    expect(routineStreak(a, ['2024-01-01', '2024-01-03'], '2024-01-03')).toBe(1);
  });

  test('routineStreak weekly', () => {
    const a = { kind: 'routine', startDate: '2024-01-01', schedule: { type: 'weekly', timesPerWeek: 1 }, archivedAt: null } as Action;
    expect(routineStreak(a, ['2024-01-01', '2024-01-08'], '2024-01-15')).toBe(2); // week 1 and week 2
    expect(routineStreak(a, ['2024-01-01', '2024-01-08', '2024-01-15'], '2024-01-15')).toBe(3);
  });
});

describe('canonical metrics', () => {
  const T = '2024-01-06';
  const goal = { status: 'active', activatedOn: '2024-01-01', targetDate: '2024-01-11' } as Goal;
  const out = (id: string, o: Partial<Outcome> = {}) =>
    ({ id, goalId: 'g', title: `T${id}`, measure: null, archivedAt: null, ...o }) as Outcome;
  const task = (id: string, outcomeId: string, done = false, o: Partial<Action> = {}) =>
    ({ id, outcomeId, kind: 'task', completedAt: done ? new Date() : null, archivedAt: null, ...o }) as Action;
  const ms = (target: number, current: number) => ({ target, current, unit: 'x' });
  const finite = (n: number | null) => n === null || Number.isFinite(n);

  test('empty matrix', () => {
    const m = computeGoalMetrics(goal, [], [], new Map(), T);
    expect(m.planning).toEqual({ filled: 0, total: 72, ratio: 0 });
    expect(m.tasks).toEqual({ completed: 0, total: 0, ratio: null });
    expect(m.routines).toEqual({ count: 0, adherence: null });
    expect(m.attainment).toBeNull();
    expect(m.pace).toBe('unknown');
    expect(m.outcomes).toEqual([]);
  });

  test('full 8x8 is 72/72', () => {
    const os = Array.from({ length: 8 }, (_, i) => out(`o${i}`));
    const as = os.flatMap(o => Array.from({ length: 8 }, (_, j) => task(`${o.id}a${j}`, o.id)));
    const p = planningCompleteness(os, as);
    expect(p).toEqual({ filled: 72, total: 72, ratio: 1 });
  });

  test('planning excludes archived, orphaned and blank-title', () => {
    const os = [out('o1'), out('o2', { archivedAt: new Date() }), out('o3', { title: '   ' })];
    const as = [
      task('a1', 'o1'),
      task('a2', 'o1', false, { archivedAt: new Date() }),
      task('a3', 'o2'), // under archived outcome
      task('a4', 'o3') // under blank outcome still counts as an action
    ];
    expect(planningCompleteness(os, as).filled).toBe(1 + 2);
  });

  test('tasks exclude archived actions and archived outcomes', () => {
    const os = [out('o1'), out('o2', { archivedAt: new Date() })];
    const as = [
      task('a1', 'o1', true), task('a2', 'o1'),
      task('a3', 'o1', true, { archivedAt: new Date() }),
      task('a4', 'o2', true)
    ];
    const m = computeGoalMetrics(goal, os, as, new Map(), T);
    expect(m.tasks).toEqual({ completed: 1, total: 2, ratio: 0.5 });
    expect(m.outcomes.map(o => o.outcomeId)).toEqual(['o1']);
  });

  test('tasks and routines are separate, never blended', () => {
    const os = [out('o1')];
    const r = { id: 'r1', outcomeId: 'o1', kind: 'routine', startDate: '2024-01-01', schedule: { type: 'daily' }, archivedAt: null } as Action;
    const checks = new Map([['r1', ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']]]);
    const m = computeGoalMetrics(goal, os, [task('a1', 'o1'), r], checks, T);
    expect(m.tasks).toEqual({ completed: 0, total: 1, ratio: 0 });
    expect(m.routines).toEqual({ count: 1, adherence: 1 });
    expect(m.outcomes[0]!.tasks.ratio).toBe(0);
    expect(m.outcomes[0]!.routines.adherence).toBe(1);
    // routine with no measurable adherence: counted, adherence null
    const fresh = { ...r, startDate: T } as Action;
    expect(computeGoalMetrics(goal, os, [fresh], new Map(), T).routines).toEqual({ count: 1, adherence: null });
    // mean over routines with adherence
    const half = { ...r, id: 'r2' } as Action;
    const m2 = computeGoalMetrics(goal, os, [r, half], new Map([['r1', checks.get('r1')!]]), T);
    expect(m2.routines).toEqual({ count: 2, adherence: 0.5 });
  });

  test('attainment: clamp, missing/zero target excluded, archived excluded', () => {
    expect(outcomeAttainment(out('a', { measure: ms(10, 25) }))).toBe(1);
    expect(outcomeAttainment(out('a', { measure: ms(10, -5) }))).toBe(0);
    expect(outcomeAttainment(out('a', { measure: ms(0, 5) }))).toBeNull();
    expect(outcomeAttainment(out('a', { measure: { current: 5, unit: 'x' } as never }))).toBeNull();
    expect(outcomeAttainment(out('a', { measure: ms(10, 5), archivedAt: new Date() }))).toBeNull();
    expect(outcomeAttainment(out('a'))).toBeNull();
    const os = [out('a', { measure: ms(10, 25) }), out('b', { measure: ms(10, 0) }), out('c'), out('d', { measure: ms(10, 10), archivedAt: new Date() })];
    expect(goalAttainment(os)).toBe(0.5);
    expect(goalAttainment([out('c')])).toBeNull();
  });

  test('QA P-1: completing tasks moves execution, not attainment', () => {
    const os = [out('o1', { measure: ms(10, 2) })];
    const before = [task('a1', 'o1'), task('a2', 'o1')];
    const after = [task('a1', 'o1', true), task('a2', 'o1')];
    const m0 = computeGoalMetrics(goal, os, before, new Map(), T);
    const m1 = computeGoalMetrics(goal, os, after, new Map(), T);
    expect(m0.tasks.ratio).toBe(0);
    expect(m1.tasks.ratio).toBe(0.5);
    expect(m1.attainment).toBe(0.2);
    expect(m1.attainment).toBe(m0.attainment);
    expect(m1.outcomes[0]).toMatchObject({ outcomeId: 'o1', attainment: 0.2 });
    expect(m1.outcomes[0]!.tasks.ratio).toBe(0.5);
  });

  test('QA P-2: pace unknown when only actions are complete and no measure', () => {
    const os = [out('o1')];
    const m = computeGoalMetrics(goal, os, [task('a1', 'o1', true)], new Map(), T);
    expect(m.tasks.ratio).toBe(1);
    expect(m.attainment).toBeNull();
    expect(m.pace).toBe('unknown');
  });

  test('pace follows attainment; overdue unchanged', () => {
    const os = [out('o1', { measure: ms(10, 8) })];
    expect(computeGoalMetrics(goal, os, [], new Map(), T).pace).toBe('ahead');
    expect(computeGoalMetrics(goal, os, [], new Map(), '2024-01-12').pace).toBe('overdue');
    expect(computeGoalMetrics(goal, [out('o1')], [task('a', 'o1', true)], new Map(), '2024-01-12').pace).toBe('overdue');
  });

  test('no NaN anywhere', () => {
    const os = [out('o1', { measure: ms(0, 0) }), out('o2', { measure: ms(3, 1) })];
    const m = computeGoalMetrics(goal, os, [task('a', 'o2')], new Map(), T);
    for (const v of [m.planning.ratio, m.tasks.ratio, m.routines.adherence, m.attainment, ...m.outcomes.flatMap(o => [o.tasks.ratio, o.routines.adherence, o.attainment])]) {
      expect(finite(v)).toBe(true);
    }
  });
});
