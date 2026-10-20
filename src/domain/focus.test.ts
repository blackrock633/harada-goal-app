import { describe, expect, test } from 'vitest';
import { planFocusAdd } from './focus.js';
import type { Action, DailyFocus, Goal, Outcome } from './types.js';

describe('planFocusAdd', () => {
  const today = '2024-01-10';
  const action = { id: 'a1', archivedAt: null } as Action;
  const outcome = { id: 'o1', archivedAt: null } as Outcome;
  const goal = { id: 'g1', status: 'active' } as Goal;
  const focus = (actionId: string, slot: number) => ({ actionId, slot, date: today }) as DailyFocus;
  const plan = (o: Partial<Parameters<typeof planFocusAdd>[0]> = {}) =>
    planFocusAdd({ action, outcome, goal, existing: [], date: today, today, ...o });

  test('date window', () => {
    expect(plan()).toEqual({ kind: 'add', slot: 0 });
    expect(plan({ date: '2024-01-17' })).toEqual({ kind: 'add', slot: 0 });
    expect(() => plan({ date: '2024-01-09' })).toThrowError(expect.objectContaining({ code: 'VALIDATION' }));
    expect(() => plan({ date: '2024-01-18' })).toThrowError(expect.objectContaining({ code: 'VALIDATION' }));
  });

  test('live plan required', () => {
    const invalid = expect.objectContaining({ code: 'INVALID_STATE' });
    expect(() => plan({ action: { ...action, archivedAt: new Date() } })).toThrowError(invalid);
    expect(() => plan({ outcome: { ...outcome, archivedAt: new Date() } })).toThrowError(invalid);
    expect(() => plan({ goal: { ...goal, status: 'archived' } })).toThrowError(invalid);
    expect(() => plan({ goal: { ...goal, status: 'achieved' } })).toThrowError(invalid);
    expect(plan({ goal: { ...goal, status: 'draft' } })).toEqual({ kind: 'add', slot: 0 });
  });

  test('re-adding is a no-op', () => {
    expect(plan({ existing: [focus('a1', 2)] })).toEqual({ kind: 'already_focused' });
  });

  test('slots fill 0..4, reuse gaps, and cap at 5', () => {
    expect(plan({ existing: [focus('x', 0), focus('y', 1)] })).toEqual({ kind: 'add', slot: 2 });
    expect(plan({ existing: [focus('x', 0), focus('y', 2)] })).toEqual({ kind: 'add', slot: 1 });
    const four = [0, 1, 2, 3].map(i => focus(`f${i}`, i));
    expect(plan({ existing: four })).toEqual({ kind: 'add', slot: 4 });
    expect(plan({ existing: [focus('f0', 0), focus('f1', 1), focus('f2', 2), focus('f4', 4)] })).toEqual({ kind: 'add', slot: 3 });
    const five = [0, 1, 2, 3, 4].map(i => focus(`f${i}`, i));
    expect(() => plan({ existing: five })).toThrowError(expect.objectContaining({ code: 'LIMIT_REACHED' }));
  });
});
