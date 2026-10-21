import { router } from 'expo-router';

import { useMutations } from '@/data/hooks';
import { GoalForm } from '@/features/goal';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useGoalScreen } from '@/screens/useGoalScreen';
import { EmptyState, Screen } from '@/ui';

export default function EditGoalScreen() {
  const { state, detail, today, noGoals, refetchDetail } = useGoalScreen();
  const mutations = useMutations();

  if (noGoals) {
    return (
      <Screen>
        <EmptyState
          title="No goal to edit"
          message="Create your goal first."
          action={{ label: 'Create your goal', onPress: () => router.replace('/goal/new') }}
        />
      </Screen>
    );
  }
  if (state.error) return <ErrorScreen error={state.error} onRetry={state.refetch} />;
  if (state.loading || !detail) return <LoadingScreen />;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/goal', params: { goal: detail.id } }));
  return (
    <Screen>
      <GoalForm
        // Remount with fresh fields after "Reload latest".
        key={detail.updatedAt}
        mode="edit"
        goal={detail}
        today={today}
        mutations={mutations}
        onReloadLatest={refetchDetail}
        onSaved={goBack}
        onCancel={goBack}
      />
    </Screen>
  );
}
