import { router } from 'expo-router';

import { useProfile, useMutations, useToday } from '@/data/hooks';
import { useEnrollments } from '@/data/premium';
import { combine, Gate } from '@/screens/queryState';
import { ChallengeEntry } from '@/features/challenge';
import { TodayView } from '@/features/today';

export default function TodayScreen() {
  const profile = useProfile();
  const today = useToday();
  const mutations = useMutations();
  // Not part of the gate: the challenge row appears when its read lands and never delays Today.
  const enrollments = useEnrollments();
  const state = combine(profile, today);

  return (
    <Gate state={state}>
      {today.data ? (
        <TodayView
          data={today.data}
          mutations={mutations}
          focusMutations={mutations}
          refreshing={state.refreshing}
          onRefresh={state.refetch}
          // TodayView shows failed-change messages in its own inline banner.
          onOpenAction={(goal, position) =>
            router.push({ pathname: '/matrix/[position]', params: { position: String(position), goal } })
          }
          onOpenGoal={(goal) => router.push({ pathname: '/goal', params: { goal } })}
          onOpenMatrix={(goal) => router.push({ pathname: '/matrix', params: { goal } })}
          onCreateGoal={() => router.push('/goal/new')}
          activateGoal={mutations.activateGoal}
          onOpenReview={(goal) => router.push({ pathname: '/review', params: { goal } })}
          challengeEntry={
            <ChallengeEntry enrollments={enrollments.data} today={today.data.today} onPress={() => router.push('/challenge')} />
          }
        />
      ) : null}
    </Gate>
  );
}
