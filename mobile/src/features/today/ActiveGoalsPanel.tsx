import { View } from 'react-native';

import type { GoalSummaryDTO } from '@shared/application/dto';
import type { Pace } from '@shared/domain/types';
import { Badge, ListRow, Section, type BadgeTone } from '@/ui';

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
  if (goals.length === 0) return null;
  return (
    <Section title={goals.length === 1 ? 'Active goal' : 'Active goals'}>
      <View>
        {goals.map((g, i) => {
          const parts = [`${g.dueTodayCount} due today`];
          if (g.metrics.totalTasks > 0) parts.push(`${g.metrics.completedTasks} of ${g.metrics.totalTasks} tasks done`);
          parts.push(`${g.metrics.planning.filled} of ${g.metrics.planning.total} positions planned`);
          return (
            <ListRow
              key={g.id}
              title={g.title}
              meta={parts.join(' · ')}
              onPress={onOpenGoal ? () => onOpenGoal(g.id) : undefined}
              accessibilityLabel={g.title}
              chevron={!!onOpenGoal}
              divider={i < goals.length - 1}
              trailing={g.pace !== 'unknown' ? <Badge text={`${PACE_LABEL[g.pace]} (by measures)`} tone={PACE_TONE[g.pace]} /> : undefined}
            />
          );
        })}
      </View>
    </Section>
  );
}
