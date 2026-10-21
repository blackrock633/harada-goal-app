import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui';
import type { GoalDetailDTO } from '@shared/application/dto';

import { SLOT_COUNT, buildMatrix, cellAt, doneLabel, type MatrixArea } from './matrix-model';

export interface MatrixOverviewProps {
  goal: GoalDetailDTO;
  /** Called with the key area position 0..7; the route layer navigates. */
  onOpenArea: (position: number) => void;
}

const TILE_HEIGHT = 112;

/** Phone-first 3x3 map: the goal in the middle, 8 key areas around it (clockwise from top-left). */
export function MatrixOverview({ goal, onOpenArea }: MatrixOverviewProps) {
  const { colors, radius, space } = useTheme();
  const m = useMemo(() => buildMatrix(goal), [goal]);
  const rows = [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => {
      const ref = cellAt(3 + r, 3 + c)!;
      if (ref.kind === 'goal') {
        return (
          <View
            key="goal"
            accessible
            accessibilityLabel={`Goal: ${goal.title}`}
            testID="overview-goal"
            style={{
              flex: 1,
              minHeight: TILE_HEIGHT,
              minWidth: 0,
              padding: space[2],
              justifyContent: 'center',
              backgroundColor: colors.accent,
              borderRadius: radius.md,
            }}
          >
            <Text variant="meta" style={{ color: colors.accentInk, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' }}>
              Goal
            </Text>
            <Text variant="meta" numberOfLines={3} style={{ color: colors.accentInk, fontFamily: 'Inter_600SemiBold', flexShrink: 1 }}>
              {goal.title}
            </Text>
          </View>
        );
      }
      return <AreaTile key={ref.areaPosition} area={m.areas[ref.areaPosition!]!} onOpenArea={onOpenArea} />;
    }),
  );
  return (
    <View accessibilityLabel="Key area map" style={{ gap: space[3] }}>
      <View style={{ gap: space[2] }}>
        {rows.map((tiles, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space[2] }}>
            {tiles}
          </View>
        ))}
      </View>
      <View testID="completeness" style={{ gap: 2 }}>
        <Text variant="body" style={{ fontFamily: 'Inter_600SemiBold' }}>
          {`Plan: ${m.filledPositions} of ${m.totalPositions} positions filled`}
        </Text>
        <Text variant="meta" tone="muted">
          {`${m.filledAreas} of 8 key areas · ${m.filledActions} of 64 actions`}
        </Text>
        <Text variant="meta" tone="muted">
          {doneLabel(m.completedActions, m.filledActions)}
        </Text>
      </View>
    </View>
  );
}

function AreaTile({ area, onOpenArea }: { area: MatrixArea; onOpenArea: (position: number) => void }) {
  const { colors, radius, space } = useTheme();
  const n = area.position + 1;
  const o = area.outcome;
  const base = {
    flex: 1,
    minHeight: TILE_HEIGHT,
    minWidth: 0,
    padding: space[2],
    borderRadius: radius.md,
  } as const;
  if (!o) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add key area ${n}`}
        onPress={() => onOpenArea(area.position)}
        style={[base, { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.ruleStrong, alignItems: 'center', justifyContent: 'center', gap: 4 }]}
      >
        <Text variant="meta" tone="muted" style={{ fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>
          {`Key area ${n}`}
        </Text>
        <Text variant="meta" tone="accent" style={{ fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>
          + Add
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Key area ${n}: ${o.title}, ${area.actionCount} of ${SLOT_COUNT} actions planned. ${doneLabel(area.doneCount, area.actionCount)}`}
      onPress={() => onOpenArea(area.position)}
      style={[base, { borderWidth: 1, borderColor: colors.ruleStrong, backgroundColor: colors.accentSoft, justifyContent: 'space-between' }]}
    >
      <View style={{ minWidth: 0 }}>
        <Text variant="meta" tone="muted" style={{ fontFamily: 'Inter_600SemiBold' }}>
          {`Key area ${n}`}
        </Text>
        <Text variant="meta" numberOfLines={2} style={{ fontFamily: 'Inter_500Medium', flexShrink: 1 }}>
          {o.title}
        </Text>
      </View>
      <View style={{ gap: 4 }}>
        <Text variant="meta" tone="muted">
          {`${area.actionCount}/${SLOT_COUNT} actions`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {area.slots.map((s) => (
            <View
              key={s.position}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                borderWidth: s.action && !(s.action.kind === 'task' && s.action.completedAt) ? 1 : 0,
                borderColor: colors.inkFaint,
                backgroundColor: !s.action ? colors.rule : s.action.kind === 'task' && s.action.completedAt ? colors.success : 'transparent',
              }}
            />
          ))}
        </View>
      </View>
    </Pressable>
  );
}
