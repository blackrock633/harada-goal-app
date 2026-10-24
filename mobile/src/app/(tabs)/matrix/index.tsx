import { router } from 'expo-router';

import { useMutations } from '@/data/hooks';
import { MatrixOverview } from '@/features/matrix';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useGoalScreen } from '@/screens/useGoalScreen';
import { EmptyState, Screen, useLayout } from '@/ui';

export default function MatrixScreen() {
  const { state, detail, noGoals, refetchDetail } = useGoalScreen();
  const mutations = useMutations();
  const { wide } = useLayout();

  if (noGoals) {
    return (
      <Screen>
        <EmptyState
          title="The matrix is empty"
          message="Create a goal and its eight key areas will appear here."
          action={{ label: 'Create your goal', onPress: () => router.push('/goal/new') }}
        />
      </Screen>
    );
  }
  if (state.error) return <ErrorScreen error={state.error} onRetry={state.refetch} />;
  if (state.loading || !detail) return <LoadingScreen />;

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refetch} maxWidth={wide ? 'full' : undefined}>
      <MatrixOverview
        goal={detail}
        matrix={mutations}
        onChanged={refetchDetail}
        onReloadLatest={refetchDetail}
        onOpenArea={(position) =>
          router.push({ pathname: '/matrix/[position]', params: { position: String(position), goal: detail.id } })
        }
      />
    </Screen>
  );
}
