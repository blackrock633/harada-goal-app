import { expect, test, describe } from 'vitest';
import { createAction, updateAction, completeTask, reopenTask, archiveAction, moveAction, validateCheckDate } from './action.js';
import { Instant, Action, Outcome } from './types.js';

describe('action', () => {
  const now = new Date() as Instant;

  test('createAction task', () => {
    const a = createAction({ id: 'a1', goalId: 'g1', outcomeId: 'o1', title: 'Task', kind: 'task' }, [], '2024-01-01', now);
    expect(a.kind).toBe('task');
    expect(a.schedule).toBeNull();
  });

  test('createAction routine', () => {
    const a = createAction({ id: 'a1', goalId: 'g1', outcomeId: 'o1', title: 'Routine', kind: 'routine', schedule: { type: 'daily' } }, [], '2024-01-01', now);
    expect(a.kind).toBe('routine');
    expect(a.schedule?.type).toBe('daily');
    expect(a.startDate).toBe('2024-01-01');
  });

  test('updateAction kind change', () => {
    let a = createAction({ id: 'a1', goalId: 'g1', outcomeId: 'o1', title: 'Task', kind: 'task' }, [], '2024-01-01', now);
    const { action: next } = updateAction(a, { kind: 'routine', schedule: { type: 'daily' } }, '2024-01-02', now);
    expect(next.kind).toBe('routine');
    expect(next.startDate).toBe('2024-01-02');
    expect(next.dueDate).toBeNull();
  });

  test('complete and reopen task', () => {
    let a = createAction({ id: 'a1', goalId: 'g1', outcomeId: 'o1', title: 'Task', kind: 'task' }, [], '2024-01-01', now);
    const { action: completed, changed } = completeTask(a, now);
    expect(completed.completedAt).toBe(now);
    expect(changed).toBe(true);

    const reopened = reopenTask(completed, now);
    expect(reopened.completedAt).toBeNull();
  });

  test('moveAction same outcome', () => {
    const a1 = createAction({ id: 'a1', goalId: 'g1', outcomeId: 'o1', title: 'A1', kind: 'task' }, [], '2024-01-01', now);
    const a2 = createAction({ id: 'a2', goalId: 'g1', outcomeId: 'o1', title: 'A2', kind: 'task' }, [a1], '2024-01-01', now);
    const a3 = createAction({ id: 'a3', goalId: 'g1', outcomeId: 'o1', title: 'A3', kind: 'task' }, [a1, a2], '2024-01-01', now);

    const out = { id: 'o1', goalId: 'g1', archivedAt: null } as Outcome;
    const res = moveAction(a1, [a1, a2, a3], [a1, a2, a3], out, 2, now);
    
    expect(res.action.position).toBe(2);
    expect(res.positions).toEqual([{ id: 'a2', outcomeId: 'o1', position: 0 }, { id: 'a3', outcomeId: 'o1', position: 1 }]);
  });

  test('moveAction different outcome', () => {
    const a1 = createAction({ id: 'a1', goalId: 'g1', outcomeId: 'o1', title: 'A1', kind: 'task' }, [], '2024-01-01', now);
    const out2 = { id: 'o2', goalId: 'g1', archivedAt: null } as Outcome;

    const res = moveAction(a1, [a1], [], out2, 0, now);
    expect(res.action.outcomeId).toBe('o2');
    expect(res.action.position).toBe(0);
    expect(res.positions.length).toBe(0);
  });

  test('validateCheckDate', () => {
    const a = createAction({ id: 'a1', goalId: 'g1', outcomeId: 'o1', title: 'R', kind: 'routine', schedule: { type: 'daily' } }, [], '2024-01-02', now);
    expect(() => validateCheckDate(a, '2024-01-01', '2024-01-03')).toThrowError(/before routine start date/);
    expect(() => validateCheckDate(a, '2024-01-04', '2024-01-03')).toThrowError(/future dates/);
    expect(() => validateCheckDate(a, '2024-01-02', '2024-01-03')).not.toThrow();
  });
});
