/**
 * Pure model for the Harada "Open Window 64" matrix.
 *
 * Domain mapping: centre = goal; 8 key areas = outcomes at position 0..7; each key area owns
 * 8 action positions = its actions at position 0..7. 8 + 64 = 72 plannable positions.
 *
 * Clockwise order (used for BOTH key areas around the goal and actions around a key area),
 * starting top-left:
 *
 *     0 1 2
 *     7 * 3        (* = centre: the goal / the key area itself)
 *     6 5 4
 *
 * The 9x9 grid is 3x3 blocks. The centre block (block row 1, col 1) holds the goal at its
 * centre and key area k at COMPASS[k]. Outer block k sits at block COMPASS[k] (same compass
 * place as key area k in the centre block), holds key area k at its centre, and action j at
 * COMPASS[j] within the block.
 */
import type { ActionDTO, GoalDetailDTO, OutcomeDTO } from '@shared/application/dto';
import { MAX_ACTIONS_PER_OUTCOME, MAX_OUTCOMES_PER_GOAL } from '@shared/domain/limits';

export const AREA_COUNT = MAX_OUTCOMES_PER_GOAL; // 8
export const SLOT_COUNT = MAX_ACTIONS_PER_OUTCOME; // 8
export const TOTAL_POSITIONS = AREA_COUNT + AREA_COUNT * SLOT_COUNT; // 72

/** [rowOffset, colOffset] within a 3x3 block, clockwise from top-left. */
export const COMPASS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 2],
  [2, 2],
  [2, 1],
  [2, 0],
  [1, 0],
];

export interface MatrixSlot {
  position: number;
  action: ActionDTO | null;
}
export interface MatrixArea {
  position: number;
  outcome: OutcomeDTO | null;
  slots: MatrixSlot[];
  /** Existing (placed) actions in this area. */
  actionCount: number;
  /** Placed tasks that are completed. Routines never count as "done". */
  doneCount: number;
}
export interface MatrixModel {
  center: { id: string; title: string };
  areas: MatrixArea[];
  filledAreas: number;
  filledActions: number;
  /** Tasks with completedAt set (routines are recurring and never "completed"). */
  completedActions: number;
  filledPositions: number;
  totalPositions: number;
}

/**
 * Reads the server's canonical positioned shape: `goal.matrix.outcomes[i]` is the key area at
 * position i (or null) and `outcome.slots[j]` the action at position j (or null). Gaps are
 * normal. Missing or short arrays are treated as empty cells; extra entries are ignored.
 */
export function buildMatrix(goal: GoalDetailDTO): MatrixModel {
  const outcomes = goal.matrix?.outcomes ?? [];
  const areas: MatrixArea[] = Array.from({ length: AREA_COUNT }, (_, position) => {
    const outcome = outcomes[position] ?? null;
    const slots: MatrixSlot[] = Array.from({ length: SLOT_COUNT }, (_, p) => ({
      position: p,
      action: outcome?.slots?.[p] ?? null,
    }));
    const placed = slots.filter((s) => s.action);
    return {
      position,
      outcome,
      slots,
      actionCount: placed.length,
      doneCount: placed.filter((s) => s.action!.kind === 'task' && s.action!.completedAt).length,
    };
  });
  const filledAreas = areas.filter((a) => a.outcome).length;
  const filledActions = areas.reduce((n, a) => n + a.actionCount, 0);
  const completedActions = areas.reduce((n, a) => n + a.doneCount, 0);
  return {
    center: { id: goal.id, title: goal.title },
    areas,
    filledAreas,
    filledActions,
    completedActions,
    filledPositions: filledAreas + filledActions,
    totalPositions: TOTAL_POSITIONS,
  };
}

// ---------- 9x9 coordinates ----------

export type CellKind = 'goal' | 'hub' | 'centre' | 'action';
/**
 * hub    = key area shown in the centre block
 * centre = the same key area shown at the centre of its own outer block
 */
export interface CellRef {
  kind: CellKind;
  /** null for the goal cell. */
  areaPosition: number | null;
  /** only for kind 'action'. */
  slotPosition: number | null;
}

export function areaHubCoords(areaPosition: number): { row: number; col: number } {
  const [r, c] = COMPASS[areaPosition]!;
  return { row: 3 + r, col: 3 + c };
}
export function areaCentreCoords(areaPosition: number): { row: number; col: number } {
  const [br, bc] = COMPASS[areaPosition]!;
  return { row: br * 3 + 1, col: bc * 3 + 1 };
}
export function slotCoords(areaPosition: number, slotPosition: number): { row: number; col: number } {
  const [br, bc] = COMPASS[areaPosition]!;
  const [r, c] = COMPASS[slotPosition]!;
  return { row: br * 3 + r, col: bc * 3 + c };
}
export const GOAL_COORDS = { row: 4, col: 4 } as const;

function compassIndex(r: number, c: number): number {
  return COMPASS.findIndex(([cr, cc]) => cr === r && cc === c);
}

/** Inverse mapping. Returns null when (row, col) is outside 0..8. */
export function cellAt(row: number, col: number): CellRef | null {
  if (![row, col].every((n) => Number.isInteger(n) && n >= 0 && n < 9)) return null;
  const br = Math.floor(row / 3);
  const bc = Math.floor(col / 3);
  const r = row % 3;
  const c = col % 3;
  if (br === 1 && bc === 1) {
    if (r === 1 && c === 1) return { kind: 'goal', areaPosition: null, slotPosition: null };
    return { kind: 'hub', areaPosition: compassIndex(r, c), slotPosition: null };
  }
  const areaPosition = compassIndex(br, bc);
  if (r === 1 && c === 1) return { kind: 'centre', areaPosition, slotPosition: null };
  return { kind: 'action', areaPosition, slotPosition: compassIndex(r, c) };
}

// ---------- labels ----------

/** Human 1-based numbering; position 0..7 -> "1".."8". */
export function areaLabel(area: MatrixArea): string {
  const title = area.outcome ? area.outcome.title : 'empty';
  return `Key area ${area.position + 1}: ${title}`;
}

export function actionStateWord(action: ActionDTO): string {
  if (action.kind === 'task') return action.completedAt ? 'completed' : 'open';
  return action.checkedToday ? 'routine, checked today' : 'routine';
}

/** e.g. "Key area 3: Fitness — action 5 of 8: Run 5k, completed". Full title, never truncated. */
export function slotLabel(area: MatrixArea, slot: MatrixSlot): string {
  const head = `${areaLabel(area)} — action ${slot.position + 1} of ${SLOT_COUNT}`;
  if (!slot.action) return `${head}: empty${area.outcome ? ', add action' : ''}`;
  return `${head}: ${slot.action.title}, ${actionStateWord(slot.action)}`;
}

export function hubLabel(area: MatrixArea): string {
  if (!area.outcome) return `Key area ${area.position + 1}: empty, add key area`;
  return `${areaLabel(area)}, ${area.actionCount} of ${SLOT_COUNT} actions planned`;
}

/** "Actions: X of Y done" - Y is the number of existing actions, never 64. */
export function doneLabel(done: number, existing: number): string {
  return `Actions: ${done} of ${existing} done`;
}
