import { useState } from 'react';
import { View } from 'react-native';

import { useFocusedGoal, useGoalDetail } from '@/data/hooks';
import { hasFeature, useHistory, usePlan } from '@/data/premium';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { EmptyState, Screen, Text } from '@/ui';

import { ACTIVITY_NOTE, HistoryView, type HistoryRange } from './HistoryView';
import { UpgradePrompt } from './UpgradePrompt';

/**
 * /insights?goalId=: progress history for a goal (Pro). Free sees what it would show and the way
 * to Harada Pro; the history request is never made without the feature.
 */
export function HistoryScreen({ goalId: requested }: { goalId?: string }) {
  const { space } = useTheme();
  const plan = usePlan();
  const goals = useFocusedGoal(requested);
  const goal = goals.data;
  const [range, setRange] = useState<HistoryRange>(12);
  const allowed = hasFeature(plan.data ?? undefined, 'progress_history');
  const history = useHistory(goal?.id, range, allowed);
  const detail = useGoalDetail(allowed ? goal?.id : undefined);

  if (plan.isPending || goals.isPending) return <LoadingScreen label="Loading history" />;
  if (!plan.data) return <ErrorScreen error={plan.error} onRetry={() => void plan.refetch()} />;
  if (goals.isError) return <ErrorScreen error={goals.error} onRetry={() => void goals.refetch()} />;
  if (!goal) {
    return (
      <Screen>
        <EmptyState title="No goal yet" message="Create a goal, and its week-by-week history will appear here." />
      </Screen>
    );
  }

  if (!allowed) {
    return (
      <Screen>
        <View style={{ gap: space[4] }}>
          <Text variant="title" accessibilityRole="header">
            Progress history
          </Text>
          <Text tone="muted">
            Week by week for “{goal.title}”: tasks due and done, tasks completed, routine days checked and
            reflections. {ACTIVITY_NOTE}
          </Text>
          <UpgradePrompt feature="progress_history" trigger="gate" />
        </View>
      </Screen>
    );
  }

  if (history.isError && !history.data) return <ErrorScreen error={history.error} onRetry={() => void history.refetch()} />;
  if (history.isPending) return <LoadingScreen label="Loading history" />;

  return (
    <Screen refreshing={history.isRefetching} onRefresh={() => void Promise.all([history.refetch(), detail.refetch()])}>
      <HistoryView
        goalTitle={goal.title}
        range={range}
        onRangeChange={setRange}
        weeks={history.data ?? []}
        outcomes={detail.data?.outcomes ?? []}
        insights={hasFeature(plan.data, 'insights')}
      />
    </Screen>
  );
}
