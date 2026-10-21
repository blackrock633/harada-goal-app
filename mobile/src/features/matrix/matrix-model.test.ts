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
import { mkAction, mkGoal, mkOutcome, sampleGoal } from './test-fixtures';

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

  it('reads goal.matrix.outcomes / outcome.slots by index, with gaps', () => {
    const goal = mkGoal([
      mkOutcome(1, 'B', [mkAction({ n: 1, position: 6, title: 'late' }), mkAction({ n: 2, position: 2, title: 'mid' })]),
      mkOutcome(6, 'G', [mkAction({ n: 3, position: 0, title: 'x', completedAt: '2026-02-01T00:00:00.000Z' })]),
    ]);
    // The dense lists are deliberately scrambled: only the positioned shape matters.
    goal.outcomes.reverse();
    goal.outcomes.forEach((o) => o.actions.reverse());
    const m = buildMatrix(goal);
    expect(m.areas[0]!.outcome).toBeNull();
    expect(m.areas[1]!.outcome?.title).toBe('B');
    expect(m.areas[6]!.outcome?.title).toBe('G');
    expect(m.areas[1]!.slots[6]!.action?.title).toBe('late');
    expect(m.areas[1]!.slots[2]!.action?.title).toBe('mid');
    expect(m.areas[1]!.slots[0]!.action).toBeNull();
    expect(m.filledAreas).toBe(2);
    expect(m.filledActions).toBe(3);
    expect(m.completedActions).toBe(1);
    expect(m.filledPositions).toBe(5);
  });

  it('is defensive about missing or short arrays', () => {
    const goal = mkGoal([mkOutcome(0, 'A', [mkAction({ n: 1, position: 1 })]), mkOutcome(2, 'C')]);
    goal.matrix.outcomes = goal.matrix.outcomes.slice(0, 1); // short: area 2 vanishes
    goal.matrix.outcomes[0]!.slots = [null, goal.matrix.outcomes[0]!.slots[1]!]; // short slots
    const m = buildMatrix(goal);
    expect(m.areas).toHaveLength(8);
    expect(m.areas[0]!.slots).toHaveLength(8);
    expect(m.areas[0]!.slots[1]!.action).not.toBeNull();
    expect(m.areas[2]!.outcome).toBeNull();
    expect(m.filledPositions).toBe(2);
    const bare = mkGoal([]);
    delete (bare as { matrix?: unknown }).matrix;
    expect(buildMatrix(bare).filledPositions).toBe(0);
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
