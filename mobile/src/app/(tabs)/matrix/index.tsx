import { router } from 'expo-router';

import { MatrixOverview } from '@/features/matrix';
import { RefreshScreen } from '@/screens/RefreshScreen';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useGoalScreen } from '@/screens/useGoalScreen';
import { EmptyState, Screen } from '@/ui';

export default function MatrixScreen() {
  const { state, detail, noGoals } = useGoalScreen();

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
    <RefreshScreen refreshing={state.refreshing} onRefresh={state.refetch}>
      <MatrixOverview
        goal={detail}
        onOpenArea={(position) =>
          router.push({ pathname: '/matrix/[position]', params: { position: String(position), goal: detail.id } })
        }
      />
    </RefreshScreen>
  );
}
