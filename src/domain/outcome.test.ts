import { expect, test, describe } from 'vitest';
import { createOutcome, updateOutcome, setMeasureCurrent, archiveOutcome, restoreOutcome, firstFreePosition, assertSlotFree } from './outcome.js';
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
    const o = createOutcome({ id: 'o1', goalId: 'g1', title: 'O1' }, [], now);
    const { outcome: next, changed } = updateOutcome(o, { title: 'O2', measure: { target: 10, current: 0, unit: 'kg' } }, now);
    expect(next.title).toBe('O2');
    expect(next.measure?.target).toBe(10);
    expect(changed).toContain('title');
    expect(changed).toContain('measure');
  });

  test('setMeasureCurrent', () => {
    const o = createOutcome({ id: 'o1', goalId: 'g1', title: 'O1', measure: { target: 10, current: 0, unit: 'kg' } }, [], now);
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
    expect(res.positions).toEqual([]); // no compaction

    const restored = restoreOutcome(res.outcome, [o2, o3], now);
    expect(restored.archivedAt).toBeNull();
    expect(restored.position).toBe(0); // first free slot
  });

  test('slot helpers and explicit position', () => {
    expect(firstFreePosition([])).toBe(0);
    expect(firstFreePosition([0, 1, 3])).toBe(2);
    expect(firstFreePosition([0, 1, 2, 3, 4, 5, 6, 7])).toBeNull();
    expect(() => assertSlotFree([1], 1)).toThrowError(/already filled/);
    expect(() => assertSlotFree([], -1)).toThrowError(/between 0 and 7/);
    expect(() => assertSlotFree([], 1.5)).toThrowError(/between 0 and 7/);
    expect(() => assertSlotFree([], 3)).not.toThrow();
    const o = createOutcome({ id: 'o', goalId: 'g', title: 'O', position: 6 }, [], now);
    expect(o.position).toBe(6);
    expect(() => createOutcome({ id: 'p', goalId: 'g', title: 'P', position: 6 }, [o], now)).toThrowError(/already filled/);
    expect(createOutcome({ id: 'q', goalId: 'g', title: 'Q' }, [o], now).position).toBe(0);
  });
});
