// QA: exhaustive structural check of the 9x9 Open Window 64 layout (HARADA_SPEC §1).
import { describe, expect, it } from 'vitest';
import { AREA_COUNT, SLOT_COUNT, TOTAL_POSITIONS, GOAL_COORDS, areaHubCoords, areaCentreCoords, slotCoords, cellAt } from '@/ui/features/matrix/matrix-model';

describe('Open Window 64 layout', () => {
  const cells = [...Array(81)].map((_, i) => cellAt(Math.floor(i / 9), i % 9)!);
  const count = (k: string) => cells.filter((c) => c.kind === k).length;

  it('has 1 goal, 8 hubs, 8 block centres, 64 actions and 72 plannable positions', () => {
    expect([AREA_COUNT, SLOT_COUNT, TOTAL_POSITIONS]).toEqual([8, 8, 72]);
    expect([count('goal'), count('hub'), count('centre'), count('action')]).toEqual([1, 8, 8, 64]);
  });

  it('every (area, slot) pair maps to a distinct cell and back', () => {
    const seen = new Set<string>();
    for (let a = 0; a < 8; a++) for (let s = 0; s < 8; s++) {
      const { row, col } = slotCoords(a, s);
      seen.add(`${row},${col}`);
      expect(cellAt(row, col)).toEqual({ kind: 'action', areaPosition: a, slotPosition: s });
    }
    expect(seen.size).toBe(64);
  });

  it('each key area appears exactly twice (hub around the goal, centre of its own block) and both are the same area', () => {
    for (let a = 0; a < 8; a++) {
      const h = areaHubCoords(a), c = areaCentreCoords(a);
      expect(cellAt(h.row, h.col)).toMatchObject({ kind: 'hub', areaPosition: a });
      expect(cellAt(c.row, c.col)).toMatchObject({ kind: 'centre', areaPosition: a });
    }
    expect(cellAt(GOAL_COORDS.row, GOAL_COORDS.col)?.kind).toBe('goal');
  });

  it('a key area hub sits in the same compass direction as its outer block (spatial consistency)', () => {
    for (let a = 0; a < 8; a++) {
      const h = areaHubCoords(a), c = areaCentreCoords(a);
      expect(Math.sign(h.row - 4)).toBe(Math.sign(c.row - 4));
      expect(Math.sign(h.col - 4)).toBe(Math.sign(c.col - 4));
    }
  });

  it('rejects out-of-range coordinates', () => {
    for (const [r, c] of [[-1, 0], [9, 0], [0, 9], [1.5, 2]] as const) expect(cellAt(r, c)).toBeNull();
  });
});
