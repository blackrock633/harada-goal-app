import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback } from 'react';

import { useGoals, useMutations, useProfile, useReadContext, useToday } from '@/data/hooks';
import { useChallengeSummary, useEnrollments } from '@/data/premium';
import { ChallengeDashboard, ChallengeLanding, activeEnrollment } from '@/features/challenge';
import { combine, Gate } from '@/screens/queryState';

/** The 30-Day Challenge: the dashboard while one runs, otherwise what it is and how to join. */
export default function ChallengeScreen() {
  const qc = useQueryClient();
  const profile = useProfile();
  const ctx = useReadContext();
  const enrollments = useEnrollments();
  const goals = useGoals();
  const current = activeEnrollment(enrollments.data);
  const summary = useChallengeSummary(current?.id);
  const today = useToday();
  const mutations = useMutations();

  // Every challenge query shares the ['challenge'] prefix (enrollments and summaries).
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ['challenge'] }), [qc]);
  const state = current ? combine(profile, enrollments, goals, summary) : combine(profile, enrollments, goals);

  return (
    <Gate state={state}>
      {current && summary.data ? (
        <ChallengeDashboard
          summary={summary.data}
          todayData={today.data}
          mutations={mutations}
          onChanged={refresh}
          onLeft={refresh}
          onOpenToday={() => router.navigate('/today')}
          onOpenReview={(goal) => router.navigate({ pathname: '/review', params: { goal } })}
          onComplete={(id) => router.push({ pathname: '/challenge/complete', params: { id } })}
          onShare={(goalId) => router.push({ pathname: '/share', params: { goalId, kind: 'challenge' } })}
          refreshing={state.refreshing}
          onRefresh={state.refetch}
        />
      ) : !current && goals.data && ctx ? (
        <ChallengeLanding
          goals={goals.data}
          today={ctx.today}
          history={(enrollments.data ?? []).filter((e) => e.status !== 'active')}
          onJoined={refresh}
          onCreateGoal={() => router.push('/goal/new')}
          onOpenGoal={(goal) => router.navigate({ pathname: '/goal', params: { goal } })}
          onOpenReport={(id) => router.push({ pathname: '/challenge/complete', params: { id } })}
          refreshing={state.refreshing}
          onRefresh={state.refetch}
        />
      ) : null}
    </Gate>
  );
}
