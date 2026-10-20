import { expect, test, describe } from 'vitest';
import { createOutcome, updateOutcome, setMeasureCurrent, archiveOutcome, restoreOutcome } from './outcome.js';
import { Instant, Outcome } from './types.js';

describe('outcome', () => {
  const now = new Date() as Instant;

  test('createOutcome and limits', () => {
    const o = createOutcome({ id: 'o1', goalId: 'g1', title: 'O1' }, [], now);
    expect(o.title).toBe('O1');
    expect(o.position).toBe(0);

    const siblings = Array(8).fill(null).map((_, i) => ({ id: `s${i}`, position: i } as Outcome));
    expect(() => createOutcome({ id: 'o9', goalId: 'g1', title: 'O9' }, siblings, now)).toThrowError(/Max outcomes reached/);
  });

  test('updateOutcome', () => {
    let o = createOutcome({ id: 'o1', goalId: 'g1', title: 'O1' }, [], now);
    const { outcome: next, changed } = updateOutcome(o, { title: 'O2', measure: { target: 10, current: 0, unit: 'kg' } }, now);
    expect(next.title).toBe('O2');
    expect(next.measure?.target).toBe(10);
    expect(changed).toContain('title');
    expect(changed).toContain('measure');
  });

  test('setMeasureCurrent', () => {
    let o = createOutcome({ id: 'o1', goalId: 'g1', title: 'O1', measure: { target: 10, current: 0, unit: 'kg' } }, [], now);
    const res = setMeasureCurrent(o, 5, now);
    expect(res.outcome.measure?.current).toBe(5);
    expect(res.from).toBe(0);
    expect(res.to).toBe(5);
  });

  test('archive and restore outcome', () => {
    const o1 = createOutcome({ id: 'o1', goalId: 'g1', title: 'O1' }, [], now);
    const o2 = createOutcome({ id: 'o2', goalId: 'g1', title: 'O2' }, [o1], now); // pos 1
    const o3 = createOutcome({ id: 'o3', goalId: 'g1', title: 'O3' }, [o1, o2], now); // pos 2

    const res = archiveOutcome(o1, [o1, o2, o3], now);
    expect(res.outcome.archivedAt).not.toBeNull();
    expect(res.outcome.position).toBeNull();
    // o2 pos 1 -> 0, o3 pos 2 -> 1
    expect(res.positions).toEqual([{ id: 'o2', position: 0 }, { id: 'o3', position: 1 }]);

    const restored = restoreOutcome(res.outcome, [o2, o3], now);
    expect(restored.archivedAt).toBeNull();
    expect(restored.position).toBe(2); // appended
  });
});
