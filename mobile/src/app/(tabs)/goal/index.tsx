import { Redirect, router } from 'expo-router';

import { useMutations } from '@/data/hooks';
import { GoalOverview } from '@/features/goal';
import { RefreshScreen } from '@/screens/RefreshScreen';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useGoalScreen } from '@/screens/useGoalScreen';

export default function GoalScreen() {
  const { state, detail, today, noGoals } = useGoalScreen();
  const mutations = useMutations();

  if (noGoals) return <Redirect href="/goal/new" />;
  if (state.error) return <ErrorScreen error={state.error} onRetry={state.refetch} />;
  if (state.loading || !detail || !today) return <LoadingScreen />;

  const goal = detail.id;
  return (
    <RefreshScreen refreshing={state.refreshing} onRefresh={state.refetch}>
      <GoalOverview
        goal={detail}
        today={today}
        activateGoal={mutations.activateGoal}
        onEdit={() => router.push({ pathname: '/goal/edit', params: { goal } })}
        onOpenMatrix={() => router.push({ pathname: '/matrix', params: { goal } })}
        onReview={() => router.push({ pathname: '/review', params: { goal } })}
        onOpenArea={(position) =>
          router.push({ pathname: '/matrix/[position]', params: { position: String(position), goal } })
        }
      />
    </RefreshScreen>
  );
}
