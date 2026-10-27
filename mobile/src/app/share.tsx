import { router, useLocalSearchParams } from 'expo-router';

import { useGoals } from '@/data/hooks';
import { PostComposer } from '@/features/social/PostComposer';
import { combine, Gate } from '@/screens/queryState';
import { EmptyState, Screen } from '@/ui';
import type { SocialPostType } from '@shared/application/social';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** What a link into sharing asks for: `?type=` directly, or the older `?kind=` of a card. */
function initialType(type?: string, kind?: string): SocialPostType {
  const types: SocialPostType[] = ['goal_completed', 'milestone', 'progress_update', 'general_achievement', 'goal_started'];
  if (type && (types as string[]).includes(type)) return type as SocialPostType;
  return kind === 'challenge' ? 'milestone' : 'progress_update';
}

/** Share progress (modal): `?goalId=…&type=goal_completed|milestone|progress_update|…`. */
export default function ShareScreen() {
  const params = useLocalSearchParams<{ goalId?: string | string[]; type?: string | string[]; kind?: string | string[] }>();
  const goals = useGoals();
  return (
    <Gate state={combine(goals)}>
      {goals.data && goals.data.length > 0 ? (
        <PostComposer goals={goals.data} initialGoalId={first(params.goalId)} initialType={initialType(first(params.type), first(params.kind))} />
      ) : (
        <Screen>
          <EmptyState title="Nothing to share yet" message="Create a goal first." action={{ label: 'Create your goal', onPress: () => router.push('/goal/new') }} />
        </Screen>
      )}
    </Gate>
  );
}
