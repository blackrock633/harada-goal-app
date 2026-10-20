import { expect, test, describe } from 'vitest';
import { taskProgress, routineAdherence, actionProgress, outcomeProgress, goalProgress, pace, routineStreak } from './progress.js';
import { Action, Outcome, Goal, LocalDate } from './types.js';

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

  test('outcomeProgress measure', () => {
    const o = { archivedAt: null, measure: { target: 10, current: 5, unit: 'km' } } as Outcome;
    expect(outcomeProgress(o, [], new Map(), '2024-01-01')).toBe(0.5);
  });

  test('outcomeProgress actions', () => {
    const o = { id: 'o1', archivedAt: null, measure: null } as Outcome;
    const a1 = { id: 'a1', outcomeId: 'o1', kind: 'task', completedAt: new Date(), archivedAt: null } as Action;
    const a2 = { id: 'a2', outcomeId: 'o1', kind: 'task', completedAt: null, archivedAt: null } as Action;
    expect(outcomeProgress(o, [a1, a2], new Map(), '2024-01-01')).toBe(0.5);
  });

  test('goalProgress', () => {
    const o1 = { id: 'o1', archivedAt: null, measure: { target: 10, current: 10, unit: 'x' } } as Outcome;
    const o2 = { id: 'o2', archivedAt: null, measure: { target: 10, current: 0, unit: 'x' } } as Outcome;
    const map = new Map<string, Action[]>();
    map.set('o1', []); map.set('o2', []);
    expect(goalProgress([o1, o2], map, new Map(), '2024-01-01')).toBe(0.5);
  });

  test('pace', () => {
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
