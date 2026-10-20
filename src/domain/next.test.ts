import { expect, test, describe } from 'vitest';
import { isDueToday, nextActions } from './next.js';
import { Action, Goal, Outcome } from './types.js';

describe('next', () => {
  test('isDueToday', () => {
    const daily = { kind: 'routine', archivedAt: null, startDate: '2024-01-01', schedule: { type: 'daily' } } as Action;
    expect(isDueToday(daily, [], '2024-01-01')).toBe(true);

    const weekdays = { kind: 'routine', archivedAt: null, startDate: '2024-01-01', schedule: { type: 'weekdays', days: [1] } } as Action;
    expect(isDueToday(weekdays, [], '2024-01-01')).toBe(true); // Monday
    expect(isDueToday(weekdays, [], '2024-01-02')).toBe(false); // Tuesday

    const weekly = { kind: 'routine', archivedAt: null, startDate: '2024-01-01', schedule: { type: 'weekly', timesPerWeek: 1 } } as Action;
    expect(isDueToday(weekly, [], '2024-01-01')).toBe(true);
    expect(isDueToday(weekly, ['2024-01-01'], '2024-01-02')).toBe(false); // Already done this week
  });

  test('nextActions', () => {
    const g = { id: 'g1', status: 'active', updatedAt: new Date() } as Goal;
    const o = { id: 'o1', goalId: 'g1', archivedAt: null, position: 0 } as Outcome;
    const a1 = { id: 'a1', goalId: 'g1', outcomeId: 'o1', kind: 'routine', startDate: '2024-01-01', schedule: { type: 'daily' }, archivedAt: null, position: 0 } as Action;
    const a2 = { id: 'a2', goalId: 'g1', outcomeId: 'o1', kind: 'task', dueDate: '2024-01-01', completedAt: null, archivedAt: null, position: 1 } as Action;
    const a3 = { id: 'a3', goalId: 'g1', outcomeId: 'o1', kind: 'task', dueDate: '2023-12-31', completedAt: null, archivedAt: null, position: 2 } as Action; // overdue
    
    const { next, doneToday } = nextActions({
      goals: [g], outcomes: [o], actions: [a1, a2, a3], checksByActionId: new Map()
    }, '2024-01-01', 'UTC');

    expect(next.length).toBe(3);
    // Overdue first for tasks? Wait, routines due today are before tasks.
    expect(next[0].action.id).toBe('a1'); // routine
    expect(next[1].action.id).toBe('a3'); // task overdue
    expect(next[2].action.id).toBe('a2'); // task due today

    expect(doneToday.length).toBe(0);
  });
});
