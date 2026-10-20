import { describe, expect, it } from 'vitest';
import {
  COMPASS,
  GOAL_COORDS,
  areaCentreCoords,
  areaHubCoords,
  buildMatrix,
  cellAt,
  slotCoords,
  slotLabel,
  hubLabel,
} from './matrix-model';
import { mkAction, mkGoal, mkOutcome, sampleGoal } from './fixtures.test-util';

describe('buildMatrix', () => {
  it('is always 8 areas x 8 slots, even for an empty goal', () => {
    const m = buildMatrix(mkGoal([]));
    expect(m.areas).toHaveLength(8);
    m.areas.forEach((a, i) => {
      expect(a.position).toBe(i);
      expect(a.outcome).toBeNull();
      expect(a.slots).toHaveLength(8);
      a.slots.forEach((s, j) => {
        expect(s.position).toBe(j);
        expect(s.action).toBeNull();
      });
    });
    expect(m.filledPositions).toBe(0);
    expect(m.totalPositions).toBe(72);
  });

  it('places each action in exactly one area/slot and counts', () => {
    const m = buildMatrix(sampleGoal());
    expect(m.areas[2]!.outcome?.title).toBe('Fitness');
    expect(m.areas[2]!.slots[4]!.action?.title).toBe('Run 5k');
    const placed = m.areas.flatMap((a) => a.slots.filter((s) => s.action));
    expect(placed).toHaveLength(3);
    expect(m.filledAreas).toBe(2);
    expect(m.filledActions).toBe(3);
    expect(m.filledPositions).toBe(5);
    expect(m.completedActions).toBe(1);
    expect(m.areas[2]!.doneCount).toBe(1);
  });

  it('does not crash on duplicate, null or out-of-range positions', () => {
    const goal = mkGoal([
      mkOutcome(0, 'A', [
        mkAction({ n: 1, position: 3, title: 'first' }),
        mkAction({ n: 2, position: 3, title: 'dupe' }),
        mkAction({ n: 3, position: 9 }),
        mkAction({ n: 4, position: -1 }),
        mkAction({ n: 5, position: null }),
        mkAction({ n: 6, position: 1.5 }),
      ]),
      mkOutcome(0, 'A-dupe'),
      mkOutcome(8, 'out of range'),
      mkOutcome(3, 'null pos'),
    ]);
    goal.outcomes[3]!.position = null;
    const m = buildMatrix(goal);
    expect(m.areas[0]!.outcome?.title).toBe('A');
    expect(m.areas[0]!.slots[3]!.action?.title).toBe('first');
    expect(m.filledActions).toBe(1);
    expect(m.filledAreas).toBe(1);
  });
});

describe('9x9 coordinates', () => {
  it('uses clockwise-from-top-left order', () => {
    expect(COMPASS[0]).toEqual([0, 0]);
    expect(COMPASS[2]).toEqual([0, 2]);
    expect(COMPASS[4]).toEqual([2, 2]);
    expect(COMPASS[7]).toEqual([1, 0]);
  });

  it('round-trips every cell and covers all 81 exactly once', () => {
    const seen = new Set<string>();
    seen.add(`${GOAL_COORDS.row},${GOAL_COORDS.col}`);
    expect(cellAt(4, 4)?.kind).toBe('goal');
    for (let a = 0; a < 8; a++) {
      const hub = areaHubCoords(a);
      expect(cellAt(hub.row, hub.col)).toEqual({ kind: 'hub', areaPosition: a, slotPosition: null });
      const ctr = areaCentreCoords(a);
      expect(cellAt(ctr.row, ctr.col)).toEqual({ kind: 'centre', areaPosition: a, slotPosition: null });
      seen.add(`${hub.row},${hub.col}`);
      seen.add(`${ctr.row},${ctr.col}`);
      for (let s = 0; s < 8; s++) {
        const c = slotCoords(a, s);
        expect(cellAt(c.row, c.col)).toEqual({ kind: 'action', areaPosition: a, slotPosition: s });
        seen.add(`${c.row},${c.col}`);
      }
    }
    expect(seen.size).toBe(81);
  });

  it('places the outer block at the same compass spot as the hub', () => {
    for (let a = 0; a < 8; a++) {
      const hub = areaHubCoords(a);
      const ctr = areaCentreCoords(a);
      expect(Math.floor(ctr.row / 3)).toBe(hub.row - 3);
      expect(Math.floor(ctr.col / 3)).toBe(hub.col - 3);
    }
  });

  it('returns null outside the grid', () => {
    expect(cellAt(-1, 0)).toBeNull();
    expect(cellAt(0, 9)).toBeNull();
    expect(cellAt(1.5, 0)).toBeNull();
  });
});

describe('labels', () => {
  it('distinguish key areas from actions and keep full titles', () => {
    const m = buildMatrix(sampleGoal());
    expect(slotLabel(m.areas[2]!, m.areas[2]!.slots[4]!)).toBe('Key area 3: Fitness — action 5 of 8: Run 5k, completed');
    expect(slotLabel(m.areas[2]!, m.areas[2]!.slots[7]!)).toBe('Key area 3: Fitness — action 8 of 8: empty, add action');
    expect(hubLabel(m.areas[2]!)).toBe('Key area 3: Fitness, 3 of 8 actions planned');
    expect(hubLabel(m.areas[0]!)).toBe('Key area 1: empty, add key area');
  });
});
