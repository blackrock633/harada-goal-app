import { View } from 'react-native';

import {
  COMPASS,
  SLOT_COUNT,
  cellAt,
  type CellRef,
  type MatrixArea,
  type MatrixSlot,
} from '@shared/application/matrix';

import { ActionCell, DENSE_BELOW, GoalCell, HEAVY_RULE, KeyAreaCell, RuledGrid, useMeasuredWidth } from './SheetGrid';

export interface SheetHandlers {
  /** Open a key area (also used to create an empty one). */
  onOpenArea?: (areaPosition: number) => void;
  /** Open the editor for a placed action. */
  onOpenAction?: (areaPosition: number, slot: MatrixSlot) => void;
  /** Add an action at an empty position of an existing key area. */
  onAddAction?: (areaPosition: number, slotPosition: number) => void;
}

interface CellContext extends SheetHandlers {
  areas: MatrixArea[];
  goalTitle: string;
  dense: boolean;
  size: number;
  /** The first key area without an outcome: the one empty hub that carries the accent. */
  nextEmptyArea?: number;
}

function renderRef(ref: CellRef, ctx: CellContext) {
  if (ref.kind === 'goal') return <GoalCell title={ctx.goalTitle} dense={ctx.dense} cellSize={ctx.size} />;
  const area = ctx.areas[ref.areaPosition!]!;
  const n = area.position + 1;
  if (ref.kind === 'hub' || ref.kind === 'centre') {
    const o = area.outcome;
    const label = o
      ? `Key area ${n}, ${o.title}, ${area.actionCount} of ${SLOT_COUNT} actions`
      : `Add key area ${n}`;
    return (
      <KeyAreaCell
        area={area}
        dense={ctx.dense}
        label={label}
        onPress={ctx.onOpenArea ? () => ctx.onOpenArea!(area.position) : undefined}
        testID={`sheet-${ref.kind}-${area.position}`}
        addStyle={ref.kind !== 'hub' ? 'none' : area.position === ctx.nextEmptyArea ? 'accent' : 'muted'}
        focusable={ref.kind === 'hub'}
      />
    );
  }
  const slot = area.slots[ref.slotPosition!]!;
  const j = slot.position + 1;
  const act = slot.action;
  if (act) {
    const state = act.kind === 'routine' ? ', routine' : act.completedAt ? ', done' : '';
    return (
      <ActionCell
        action={act}
        dense={ctx.dense}
        label={`Action ${j} of key area ${n}: ${act.title}${state}`}
        onPress={ctx.onOpenAction ? () => ctx.onOpenAction!(area.position, slot) : undefined}
        testID={`sheet-action-${area.position}-${slot.position}`}
      />
    );
  }
  // Only a key area that exists can take actions; the first open position carries the quiet "+".
  const canAdd = !!area.outcome && !!ctx.onAddAction;
  const firstEmpty = area.slots.find((s) => !s.action)?.position;
  return (
    <ActionCell
      action={null}
      dense={ctx.dense}
      label={canAdd ? `Add action ${j} to key area ${n}` : `Action ${j} of key area ${n}: empty`}
      showAdd={canAdd && firstEmpty === slot.position}
      onPress={canAdd ? () => ctx.onAddAction!(area.position, slot.position) : undefined}
      testID={`sheet-action-${area.position}-${slot.position}`}
    />
  );
}

/** Position of the first key area not yet written, if any. */
export function firstEmptyArea(areas: MatrixArea[]) {
  return areas.find((a) => !a.outcome)?.position;
}

export interface MatrixSheetProps extends SheetHandlers {
  areas: MatrixArea[];
  goalTitle: string;
  /** Fixed cell size in points. Without it the sheet fits the width it is given (max `maxCell`). */
  cellSize?: number;
  maxCell?: number;
}

/** The whole Open Window 64: 9x9 ruled cells, heavier rules between the nine 3x3 blocks. */
export function MatrixSheet({ areas, goalTitle, cellSize, maxCell = 128, ...handlers }: MatrixSheetProps) {
  const [width, onLayout] = useMeasuredWidth();
  const size = cellSize ?? Math.min(maxCell, Math.max(0, Math.floor((width - 2 * HEAVY_RULE) / 9)));
  const ctx: CellContext = { areas, goalTitle, dense: size < DENSE_BELOW, size, nextEmptyArea: firstEmptyArea(areas), ...handlers };
  return (
    <View onLayout={cellSize ? undefined : onLayout} style={{ width: cellSize ? undefined : '100%' }}>
      {size > 0 ? (
        <RuledGrid
          n={9}
          heavyEvery={3}
          cellSize={size}
          testID="matrix-sheet"
          accessibilityLabel="Open Window 64, the full 9 by 9 sheet"
          renderCell={(r, c) => renderRef(cellAt(r, c)!, ctx)}
        />
      ) : null}
    </View>
  );
}

export interface AreaBlockProps extends SheetHandlers {
  areas: MatrixArea[];
  goalTitle: string;
  areaPosition: number;
  cellSize: number;
}

/** One key area's 3x3 block from the sheet: the key area in the centre, its actions around it. */
export function AreaBlock({ areas, goalTitle, areaPosition, cellSize, ...handlers }: AreaBlockProps) {
  const [br, bc] = COMPASS[areaPosition]!;
  const ctx: CellContext = { areas, goalTitle, dense: cellSize < DENSE_BELOW, size: cellSize, nextEmptyArea: firstEmptyArea(areas), ...handlers };
  return (
    <RuledGrid
      n={3}
      cellSize={cellSize}
      testID={`area-block-${areaPosition}`}
      accessibilityLabel={`Key area ${areaPosition + 1} block`}
      renderCell={(r, c) => renderRef(cellAt(br * 3 + r, bc * 3 + c)!, ctx)}
    />
  );
}
