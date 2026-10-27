import { useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Platform, ScrollView, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';

import type { MatrixMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { IconButton, ProgressBar, SegmentedControl, Text, useLayout } from '@/ui';
import { useSwipeLock } from '@/ui/navigation';
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
import { DENSE_BELOW, GoalCell, HEAVY_RULE, KeyAreaCell, RuledGrid, useMeasuredWidth } from './SheetGrid';

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
        <ZoomableSheet>
          <MatrixSheet areas={m.areas} goalTitle={goal.title} cellSize={PHONE_SHEET_CELL} {...handlers} />
        </ZoomableSheet>
      )}
      <PlanMetrics goal={goal} m={m} />
      {editor}
    </View>
  );
}

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.25;
const ZOOM_STEP = 0.25;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function touchDistance(e: GestureResponderEvent): number | null {
  const touches = e.nativeEvent.touches;
  if (!touches || touches.length < 2) return null;
  const dx = (touches[0]!.pageX ?? 0) - (touches[1]!.pageX ?? 0);
  const dy = (touches[0]!.pageY ?? 0) - (touches[1]!.pageY ?? 0);
  return Math.hypot(dx, dy);
}

/**
 * The phone's full 9x9 sheet in an interactive viewport: pinch to zoom in or out, and drag/scroll
 * horizontally (left to right) and vertically once zoomed in or out.
 */
function ZoomableSheet({ children }: { children: ReactNode }) {
  // Dragging sideways here moves the sheet, never the page.
  useSwipeLock(true);
  return Platform.OS === 'ios' ? <NativeZoomSheet>{children}</NativeZoomSheet> : <FallbackZoomSheet>{children}</FallbackZoomSheet>;
}

/** Zoom percentage and +/- buttons; tapping the percentage toggles between 100% and fit-to-width. */
function ZoomControls({ scale, fitScale, onScale }: { scale: number; fitScale: number; onScale: (s: number) => void }) {
  const { colors, radius, space } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.ruleStrong,
        borderRadius: radius.sm,
      }}
    >
      <IconButton icon="remove" accessibilityLabel="Zoom out" onPress={() => onScale(scale - ZOOM_STEP)} />
      <Text
        variant="caption"
        tabular
        accessibilityRole="button"
        accessibilityLabel={`Zoom ${Math.round(scale * 100)}%`}
        accessibilityHint="Switches between 100% and the whole sheet"
        onPress={() => onScale(Math.abs(scale - 1) < 0.01 && fitScale < 1 ? fitScale : 1)}
        style={{ paddingHorizontal: space[1] }}
      >
        {`${Math.round(scale * 100)}%`}
      </Text>
      <IconButton icon="add" accessibilityLabel="Zoom in" onPress={() => onScale(scale + ZOOM_STEP)} />
    </View>
  );
}

/**
 * iOS: one native zooming scroll view. Pinch zooms, and one finger moves the sheet in any direction at
 * any zoom (sideways included). Below the width of the screen the sheet is centred.
 */
function NativeZoomSheet({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  const { height } = useWindowDimensions();
  const [width, onLayout] = useMeasuredWidth();
  const sheetSize = PHONE_SHEET_CELL * 9 + 2 * HEAVY_RULE;
  const fitScale = width > 0 ? clamp(width / sheetSize, MIN_ZOOM, 1) : 1;
  const [scale, setScale] = useState(1);
  const [requested, setRequested] = useState(1);
  const setZoom = (next: number) => {
    const z = Math.round(clamp(next, Math.min(MIN_ZOOM, fitScale), MAX_ZOOM) * 100) / 100;
    setRequested(z);
    setScale(z);
  };
  // Tall enough to work in, never taller than most of the screen.
  const viewportHeight = Math.max(320, Math.min(Math.round(height * 0.62), width > 0 ? width + 160 : 520));
  return (
    <View onLayout={onLayout} style={{ gap: space[2] }}>
      <ZoomControls scale={scale} fitScale={fitScale} onScale={setZoom} />
      {width > 0 ? (
        <ScrollView
          testID="sheet-zoom"
          style={{ width, height: viewportHeight }}
          minimumZoomScale={Math.min(MIN_ZOOM, fitScale)}
          maximumZoomScale={MAX_ZOOM}
          zoomScale={requested}
          centerContent
          bouncesZoom
          directionalLockEnabled={false}
          showsHorizontalScrollIndicator
          showsVerticalScrollIndicator
          scrollEventThrottle={32}
          onScroll={(e) => {
            const z = e.nativeEvent.zoomScale;
            if (typeof z === 'number' && Math.abs(z - scale) >= 0.01) setScale(Math.round(z * 100) / 100);
          }}
          accessibilityLabel="Full sheet. Pinch to zoom; drag to move in any direction"
          // The scrollable area is the sheet itself in both directions. Without this iOS sizes it to the
          // screen's width, so after zooming out there was nothing left to scroll sideways.
          contentContainerStyle={{ width: sheetSize, height: sheetSize }}
        >
          <View style={{ width: sheetSize, height: sheetSize }}>{children}</View>
        </ScrollView>
      ) : null}
    </View>
  );
}

/** Android and web: no native zoom, so pinch is read from touches and the sheet scrolls both ways. */
function FallbackZoomSheet({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  const [width, onLayout] = useMeasuredWidth();
  const sheetSize = PHONE_SHEET_CELL * 9 + 2 * HEAVY_RULE;
  const fitScale = width > 0 ? clamp(width / sheetSize, MIN_ZOOM, 1) : 1;
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  scaleRef.current = scale;

  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);

  const applyScale = (next: number) => {
    const clamped = Math.round(clamp(next, Math.min(MIN_ZOOM, fitScale), MAX_ZOOM) * 100) / 100;
    scaleRef.current = clamped;
    setScale(clamped);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (e) => (e.nativeEvent.touches?.length ?? 0) >= 2,
        onMoveShouldSetPanResponder: (e) => (e.nativeEvent.touches?.length ?? 0) >= 2,
        onPanResponderGrant: (e) => {
          const dist = touchDistance(e);
          if (dist !== null && dist > 0) {
            pinchStartDist.current = dist;
            pinchStartScale.current = scaleRef.current;
          }
        },
        onPanResponderMove: (e) => {
          const dist = touchDistance(e);
          if (dist !== null && dist > 0) {
            if (pinchStartDist.current === null) {
              pinchStartDist.current = dist;
              pinchStartScale.current = scaleRef.current;
            } else {
              applyScale(pinchStartScale.current * (dist / pinchStartDist.current));
            }
          }
        },
        onPanResponderRelease: () => {
          pinchStartDist.current = null;
        },
        onPanResponderTerminate: () => {
          pinchStartDist.current = null;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fitScale],
  );

  const scaledSize = Math.ceil(sheetSize * scale);
  const viewportHeight = width > 0 ? Math.min(Math.max(width, 320), Math.max(width, scaledSize)) : 360;

  return (
    <View onLayout={onLayout} style={{ gap: space[2] }} {...panResponder.panHandlers}>
      <ZoomControls scale={scale} fitScale={fitScale} onScale={applyScale} />

      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled={false}
        showsHorizontalScrollIndicator
        bounces
        contentContainerStyle={{ minWidth: width > 0 ? width : undefined }}
        accessibilityLabel="Full sheet, pinch to zoom, drag to move"
      >
        <ScrollView
          nestedScrollEnabled
          directionalLockEnabled={false}
          showsVerticalScrollIndicator
          bounces
          style={Platform.OS === 'web' ? undefined : { maxHeight: viewportHeight }}
        >
          <View
            style={{
              width: scaledSize,
              height: scaledSize,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: sheetSize,
                height: sheetSize,
                transform: [
                  { translateX: (scaledSize - sheetSize) / 2 },
                  { translateY: (scaledSize - sheetSize) / 2 },
                  { scale },
                ],
              }}
            >
              {children}
            </View>
          </View>
        </ScrollView>
      </ScrollView>
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
