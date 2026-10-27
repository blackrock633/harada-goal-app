import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { useGoals, useMutations, useProfile, useReadContext, useToday } from '@/data/hooks';
import { hasFeature, useChallengeSummary, useEnrollments, usePlan } from '@/data/premium';
import { ChallengeDashboard, ChallengeLanding, activeEnrollment } from '@/features/challenge';
import { UpgradePrompt } from '@/features/premium/UpgradePrompt';
import { combine, ErrorScreen, Gate, LoadingScreen } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { Screen, Text } from '@/ui';

/** The 30-Day Challenge: the dashboard while one runs, otherwise what it is and how to join. */
export default function ChallengeScreen() {
  const { space } = useTheme();
  const qc = useQueryClient();
  const plan = usePlan();
  const allowed = hasFeature(plan.data ?? undefined, 'challenge');
  const profile = useProfile();
  const ctx = useReadContext();
  const enrollments = useEnrollments(allowed);
  const goals = useGoals();
  const current = activeEnrollment(enrollments.data);
  const summary = useChallengeSummary(current?.id, allowed);
  const today = useToday();
  const mutations = useMutations();

  // Every challenge query shares the ['challenge'] prefix (enrollments and summaries).
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ['challenge'] }), [qc]);

  if (plan.isPending) return <LoadingScreen label="Loading challenge" />;
  if (!plan.data) return <ErrorScreen error={plan.error} onRetry={() => void plan.refetch()} />;

  if (!allowed) {
    return (
      <Screen>
        <View style={{ gap: space[4] }}>
          <Text variant="title" accessibilityRole="header">
            The 30-Day Challenge
          </Text>
          <UpgradePrompt feature="challenge" trigger="gate" />
        </View>
      </Screen>
    );
  }

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
        />
      ) : null}
    </Gate>
  );
}
