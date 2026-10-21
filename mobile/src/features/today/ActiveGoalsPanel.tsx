import { Pressable, View } from 'react-native';

import type { GoalSummaryDTO } from '@shared/application/dto';
import type { Pace } from '@shared/domain/types';
import { useTheme } from '@/theme';
import { Badge, Text, type BadgeTone } from '@/ui';

const PACE_LABEL: Record<Exclude<Pace, 'unknown'>, string> = {
  ahead: 'Ahead',
  on_track: 'On track',
  behind: 'Behind',
  overdue: 'Overdue',
};
const PACE_TONE: Record<Exclude<Pace, 'unknown'>, BadgeTone> = {
  ahead: 'success',
  on_track: 'accent',
  behind: 'warning',
  overdue: 'danger',
};

export type ActiveGoalsPanelProps = {
  goals: GoalSummaryDTO[];
  onOpenGoal?: (goalId: string) => void;
};

/**
 * Honest counts only: tasks done, plan completeness and due-today. Never a merged percentage bar.
 * Pace appears only when known, and derives from measured attainment alone.
 */
export function ActiveGoalsPanel({ goals, onOpenGoal }: ActiveGoalsPanelProps) {
  const { colors, radius, space } = useTheme();
  if (goals.length === 0) return null;
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="meta" tone="muted" accessibilityRole="header" style={{ fontFamily: 'Inter_600SemiBold' }}>
        Active goals
      </Text>
      {goals.map((g) => (
        <View
          key={g.id}
          style={{
            gap: space[1],
            padding: space[4],
            borderWidth: 1,
            borderColor: colors.rule,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[2] }}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={g.title}
              disabled={!onOpenGoal}
              onPress={() => onOpenGoal?.(g.id)}
              style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
            >
              <Text variant="heading">{g.title}</Text>
            </Pressable>
            <Badge text={g.status.charAt(0).toUpperCase() + g.status.slice(1)} tone="accent" />
          </View>
          <Text variant="meta" tone="muted">{`${g.dueTodayCount} due today`}</Text>
          {g.metrics.totalTasks > 0 ? (
            <Text variant="meta" tone="muted">{`${g.metrics.completedTasks} of ${g.metrics.totalTasks} tasks done`}</Text>
          ) : null}
          <Text variant="meta" tone="muted">{`${g.metrics.planning.filled}/${g.metrics.planning.total} planned`}</Text>
          {g.pace !== 'unknown' ? (
            <View style={{ marginTop: space[1] }}>
              <Badge text={`${PACE_LABEL[g.pace]} (by measures)`} tone={PACE_TONE[g.pace]} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
