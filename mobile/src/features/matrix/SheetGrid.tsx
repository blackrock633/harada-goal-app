import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '@/theme';
import { Icon, Text } from '@/ui';
import type { ActionDTO } from '@shared/application/dto';
import { SLOT_COUNT, type MatrixArea } from '@shared/application/matrix';

/** Heavier rule between 3x3 blocks, and the outer frame of a form. */
export const HEAVY_RULE = 1.5;
/** Below this cell size the sheet switches to its dense (caption) type. */
export const DENSE_BELOW = 104;

/** Width of a laid-out view; 0 until the first layout. */
export function useMeasuredWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width)), []);
  return [width, onLayout] as const;
}

export interface RuledGridProps {
  /** Cells per side (3 or 9). */
  n: number;
  /** Heavy rules every this many cells (3 for the 9x9 sheet); 0 for none. */
  heavyEvery?: number;
  /** Fixed cell width/min-height. Without it cells share the width equally with `minCellHeight`. */
  cellSize?: number;
  minCellHeight?: number;
  renderCell: (row: number, col: number) => ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * A ruled form: one outer frame, cells that share their rules, square corners, no gaps. Rows
 * stretch to their tallest cell, so large text grows a row instead of clipping.
 */
export function RuledGrid({ n, heavyEvery = 0, cellSize, minCellHeight = 0, renderCell, accessibilityLabel, testID }: RuledGridProps) {
  const { colors } = useTheme();
  const frame = heavyEvery ? HEAVY_RULE : 1;
  const frameColor = heavyEvery ? colors.ink : colors.ruleStrong;
  const idx = Array.from({ length: n }, (_, i) => i);
  const line = (i: number) => {
    if (i >= n - 1) return { width: 0, color: colors.rule };
    const heavy = heavyEvery > 0 && i % heavyEvery === heavyEvery - 1;
    return heavy ? { width: HEAVY_RULE, color: colors.ink } : { width: StyleSheet.hairlineWidth, color: colors.rule };
  };
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={{ borderWidth: frame, borderColor: frameColor, alignSelf: cellSize ? 'flex-start' : 'stretch', backgroundColor: colors.paper }}
    >
      {idx.map((r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {idx.map((c) => {
            const right = line(c);
            const bottom = line(r);
            return (
              <View
                key={c}
                style={[
                  cellSize ? { width: cellSize, minHeight: cellSize } : { flex: 1, minWidth: 0, minHeight: minCellHeight },
                  {
                    borderRightWidth: right.width,
                    borderRightColor: right.color,
                    borderBottomWidth: bottom.width,
                    borderBottomColor: bottom.color,
                  },
                ]}
              >
                {renderCell(r, c)}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** A pressable (or plain, accessible) cell that fills its slot in the grid. */
function CellBody({
  label,
  onPress,
  children,
  padding,
  background,
  testID,
  focusable = true,
}: {
  label: string;
  onPress?: () => void;
  /** false: still tappable, but skipped by keyboard Tab (a repeated view of a record reachable elsewhere). */
  focusable?: boolean;
  children: ReactNode;
  padding: number;
  background?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const style = { flex: 1, minWidth: 0, padding, backgroundColor: background } as const;
  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={label} style={style}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      focusable={focusable}
      style={({ pressed }) => [style, pressed ? { backgroundColor: colors.surfaceSunken } : null]}
    >
      {children}
    </Pressable>
  );
}

/** The goal: the one inverted cell, the anchor of the form. */
export function GoalCell({ title, dense }: { title: string; dense: boolean }) {
  const { colors, space } = useTheme();
  return (
    <CellBody
      testID="overview-goal"
      label={`Goal: ${title}`}
      padding={dense ? space[1] : space[2]}
      background={colors.ink}
    >
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text
          variant="heading"
          numberOfLines={dense ? 4 : 5}
          style={[{ color: colors.paper }, dense ? { fontSize: 12, lineHeight: 16 } : null]}
        >
          {title}
        </Text>
      </View>
    </CellBody>
  );
}

/** 8 ticks, one per action position; filled for a planned action, outlined when open. */
export function TickRuler({ slots }: { slots: { action: ActionDTO | null }[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {slots.map((s, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 5,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: s.action ? colors.ink : colors.ruleStrong,
            backgroundColor: s.action ? colors.ink : 'transparent',
          }}
        />
      ))}
    </View>
  );
}

export interface KeyAreaCellProps {
  area: MatrixArea;
  dense: boolean;
  label: string;
  onPress?: () => void;
  testID?: string;
  /** Empty cell: 'accent' plus + caption, 'muted' (default), or 'none' (just the position number). */
  addStyle?: 'accent' | 'muted' | 'none';
  /** See CellBody: false for the repeated key-area views in the outer blocks. */
  focusable?: boolean;
}

/** A key area as a cell: number, name, "3/8" and the 8-tick ruler. Empty: a quiet add affordance. */
export function KeyAreaCell({ area, dense, label, onPress, testID, addStyle = 'muted', focusable = true }: KeyAreaCellProps) {
  const { colors, space } = useTheme();
  const n = area.position + 1;
  const o = area.outcome;
  const padding = dense ? space[1] : space[2];
  if (!o) {
    return (
      <CellBody testID={testID} label={label} onPress={onPress} padding={padding} focusable={focusable}>
        <Text variant="caption" tone="faint" tabular>
          {n}
        </Text>
        {addStyle === 'none' ? null : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[1] }}>
            <Icon name="add" size={dense ? 18 : 22} color={addStyle === 'accent' ? colors.accent : colors.inkMuted} weight="medium" />
            {dense ? null : (
              <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
                Add key area
              </Text>
            )}
          </View>
        )}
      </CellBody>
    );
  }
  return (
    <CellBody testID={testID} label={label} onPress={onPress} padding={padding} focusable={focusable}>
      <View style={{ flex: 1, justifyContent: 'space-between', gap: space[2] }}>
        <View style={{ gap: 2, minWidth: 0 }}>
          <Text variant="caption" tone="faint" tabular>
            {n}
          </Text>
          <Text
            variant={dense ? 'caption' : 'headline'}
            weight={dense ? 'semibold' : undefined}
            numberOfLines={dense ? 4 : 3}
            style={[{ flexShrink: 1 }, dense ? { fontSize: 12, lineHeight: 16 } : null]}
          >
            {o.title}
          </Text>
        </View>
        <View style={{ gap: space[1] }}>
          <Text variant="caption" tone="muted" tabular>
            {`${area.actionCount}/${SLOT_COUNT}`}
          </Text>
          <TickRuler slots={area.slots} />
        </View>
      </View>
    </CellBody>
  );
}

export interface ActionCellProps {
  action: ActionDTO | null;
  dense: boolean;
  label: string;
  /** Show the faint add icon in this empty cell. */
  showAdd?: boolean;
  onPress?: () => void;
  testID?: string;
}

/** An action position: title, a routine icon and a check when done. Empty positions are blank ruled cells. */
export function ActionCell({ action, dense, label, showAdd = false, onPress, testID }: ActionCellProps) {
  const { colors, space } = useTheme();
  const padding = dense ? space[1] : space[2];
  if (!action) {
    return (
      <CellBody testID={testID} label={label} onPress={onPress} padding={padding}>
        {showAdd ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="add" size={16} color={colors.inkFaint} />
          </View>
        ) : null}
      </CellBody>
    );
  }
  const done = action.kind === 'task' && !!action.completedAt;
  const routine = action.kind === 'routine';
  return (
    <CellBody testID={testID} label={label} onPress={onPress} padding={padding}>
      <Text variant="caption" tone={done ? 'muted' : 'default'} numberOfLines={dense ? 3 : 4} style={{ flexShrink: 1 }}>
        {action.title}
      </Text>
      {routine || done ? (
        <View
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[1],
            paddingLeft: 2,
            backgroundColor: colors.paper,
          }}
        >
          {routine ? <Icon name="routine" size={12} color={colors.inkMuted} /> : null}
          {done ? <Icon name="check" size={12} color={colors.inkMuted} weight="semibold" /> : null}
        </View>
      ) : null}
    </CellBody>
  );
}
