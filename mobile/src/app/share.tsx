import { router, useLocalSearchParams } from 'expo-router';

import { useFocusedGoal } from '@/data/hooks';
import { ShareComposer, isCardKind } from '@/features/sharing';
import { combine, Gate } from '@/screens/queryState';
import { EmptyState, Screen } from '@/ui';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Share progress (modal): `?goalId=…&kind=progress|weekly|challenge`. Defaults: the focused goal, a progress card. */
export default function ShareScreen() {
  const params = useLocalSearchParams<{ goalId?: string | string[]; kind?: string | string[] }>();
  const requested = first(params.goalId);
  const kindParam = first(params.kind);
  const kind = isCardKind(kindParam) ? kindParam : 'progress';
  const goal = useFocusedGoal(requested);

  if (requested) return <ShareComposer goalId={requested} kind={kind} />;
  return (
    <Gate state={combine(goal)}>
      {goal.data ? (
        <ShareComposer goalId={goal.data.id} kind={kind} />
      ) : (
        <Screen>
          <EmptyState
            title="Nothing to share yet"
            message="Create a goal first. Cards show only what you choose from it."
            action={{ label: 'Create your goal', onPress: () => router.push('/goal/new') }}
          />
        </Screen>
      )}
    </Gate>
  );
}
