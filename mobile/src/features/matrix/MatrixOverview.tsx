import { useMemo, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

import type { MatrixMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { ProgressBar, SegmentedControl, Text, useLayout } from '@/ui';
import type { GoalDetailDTO } from '@shared/application/dto';
import {
  AREA_COUNT,
  SLOT_COUNT,
  buildMatrix,
  cellAt,
  type MatrixModel,
  type MatrixSlot,
} from '@shared/application/matrix';

import { ActionEditorSheet, type ActionEditorMode } from './ActionEditorSheet';
import { MatrixSheet, firstEmptyArea } from './MatrixSheet';
import { DENSE_BELOW, GoalCell, KeyAreaCell, RuledGrid, useMeasuredWidth } from './SheetGrid';

export interface MatrixOverviewProps {
  goal: GoalDetailDTO;
  /** Called with the key area position 0..7; the route layer navigates. */
  onOpenArea: (position: number) => void;
  /** When given, tapping an action on the full sheet opens its editor in place. */
  matrix?: Pick<MatrixMutations, 'addAction' | 'updateAction'>;
  onChanged?: () => void;
  onReloadLatest?: () => void;
}

type View_ = 'areas' | 'sheet';
const VIEWS = [
  { value: 'areas', label: 'Key areas' },
  { value: 'sheet', label: 'Full sheet' },
] as const;

/** Readable cell size for the full sheet on a phone; the sheet scrolls to fit. */
const PHONE_SHEET_CELL = 100;
const SHEET_MAX_WIDTH = 1100;
const SIDE_WIDTH = 260;

/**
 * The matrix as a ruled form. Phone: the centre 3x3 (goal and key areas) with a switch to the
 * whole 9x9 sheet. Wide: the whole sheet is the hero, with the plan metrics beside or under it.
 */
export function MatrixOverview({ goal, onOpenArea, matrix, onChanged, onReloadLatest }: MatrixOverviewProps) {
  const { space } = useTheme();
  const { wide, width } = useLayout();
  const { height } = useWindowDimensions();
  // Fit the whole hero sheet in the viewport height, but never so small that action titles cram
  // into three caption lines (floor 104 pt = the non-dense size; below that the page scrolls).
  const maxCell = Math.max(DENSE_BELOW, Math.floor((height - 190) / 9));
  const m = useMemo(() => buildMatrix(goal), [goal]);
  const [view, setView] = useState<View_>('areas');
  const [sheet, setSheet] = useState<{ id: number; mode: ActionEditorMode } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const counter = useRef(0);

  function openEditor(mode: ActionEditorMode) {
    counter.current += 1;
    setSheet({ id: counter.current, mode });
    setSheetOpen(true);
  }

  const handlers = {
    onOpenArea,
    onOpenAction: (areaPosition: number, slot: MatrixSlot) => {
      if (matrix && slot.action) openEditor({ type: 'edit', action: slot.action });
      else onOpenArea(areaPosition);
    },
    onAddAction: matrix
      ? (areaPosition: number, slotPosition: number) => {
          const area = m.areas[areaPosition]!;
          if (!area.outcome) return onOpenArea(areaPosition);
          openEditor({
            type: 'add',
            outcomeId: area.outcome.id,
            position: slotPosition,
            heading: `${area.outcome.title}: action ${slotPosition + 1} of ${SLOT_COUNT}`,
          });
        }
      : undefined,
  };

  const editor = sheet && matrix ? (
    <ActionEditorSheet
      key={sheet.id}
      visible={sheetOpen}
      onClose={() => setSheetOpen(false)}
      mode={sheet.mode}
      mutations={matrix}
      onReloadLatest={onReloadLatest}
      onSaved={() => onChanged?.()}
    />
  ) : null;

  if (wide) {
    const side = width >= 1024;
    return (
      <View style={{ width: '100%', maxWidth: SHEET_MAX_WIDTH + (side ? SIDE_WIDTH + space[6] : 0), alignSelf: 'center', gap: space[6] }}>
        <View style={{ flexDirection: side ? 'row' : 'column', alignItems: 'flex-start', justifyContent: 'center', gap: space[6] }}>
          <View style={{ flex: side ? 1 : undefined, width: side ? undefined : '100%', maxWidth: Math.min(SHEET_MAX_WIDTH, maxCell * 9 + 3), minWidth: 0 }}>
            <MatrixSheet areas={m.areas} goalTitle={goal.title} maxCell={maxCell} {...handlers} />
          </View>
          <View style={{ width: side ? SIDE_WIDTH : '100%' }}>
            <PlanMetrics goal={goal} m={m} />
          </View>
        </View>
        {editor}
      </View>
    );
  }

  return (
    <View accessibilityLabel="Key area map" style={{ gap: space[4] }}>
      <SegmentedControl label="Matrix view" options={VIEWS} value={view} onChange={setView} />
      {view === 'areas' ? (
        <KeyAreaGrid m={m} goalTitle={goal.title} onOpenArea={onOpenArea} />
      ) : (
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator accessibilityLabel="Full sheet, scrolls sideways">
          <MatrixSheet areas={m.areas} goalTitle={goal.title} cellSize={PHONE_SHEET_CELL} {...handlers} />
        </ScrollView>
      )}
      <PlanMetrics goal={goal} m={m} />
      {editor}
    </View>
  );
}

/** The centre 3x3 of the sheet: goal in the middle, key areas around it. */
function KeyAreaGrid({ m, goalTitle, onOpenArea }: { m: MatrixModel; goalTitle: string; onOpenArea: (p: number) => void }) {
  const [width, onLayout] = useMeasuredWidth();
  const next = firstEmptyArea(m.areas);
  return (
    <View onLayout={onLayout}>
      <RuledGrid
        n={3}
        minCellHeight={width > 0 ? Math.floor((width - 2) / 3) : 112}
        renderCell={(r, c) => {
          const ref = cellAt(3 + r, 3 + c)!;
          if (ref.kind === 'goal') return <GoalCell title={goalTitle} dense={false} />;
          const area = m.areas[ref.areaPosition!]!;
          const n = area.position + 1;
          const o = area.outcome;
          const label = o
            ? `Key area ${n}: ${o.title}, ${area.actionCount} of ${SLOT_COUNT} actions planned. Actions: ${area.doneCount} of ${area.actionCount} done`
            : `Add key area ${n}`;
          return (
            <KeyAreaCell
              area={area}
              dense={false}
              label={label}
              addStyle={area.position === next ? 'labelled' : 'muted'}
              onPress={() => onOpenArea(area.position)}
            />
          );
        }}
      />
    </View>
  );
}

/** Planning and task completion, each in its own words and never blended into "progress". */
function PlanMetrics({ goal, m }: { goal: GoalDetailDTO; m: MatrixModel }) {
  const { space } = useTheme();
  const { completedTasks, totalTasks } = goal.metrics;
  const pct = m.totalPositions === 0 ? 0 : (m.filledPositions / m.totalPositions) * 100;
  return (
    <View testID="completeness" style={{ gap: space[3] }}>
      <View style={{ gap: space[2] }}>
        <Text variant="headline" tabular>
          {`${m.filledPositions} of ${m.totalPositions} positions planned`}
        </Text>
        <ProgressBar value={pct} showValue={false} accessibilityLabel="Positions planned" />
        <Text variant="caption" tone="muted" tabular>
          {`${m.filledAreas} of ${AREA_COUNT} key areas · ${m.filledActions} of ${AREA_COUNT * SLOT_COUNT} actions`}
        </Text>
      </View>
      <Text variant="body" weight="medium" tabular>
        {totalTasks === 0 ? 'No tasks yet' : `${completedTasks} of ${totalTasks} ${totalTasks === 1 ? 'task' : 'tasks'} done`}
      </Text>
    </View>
  );
}
