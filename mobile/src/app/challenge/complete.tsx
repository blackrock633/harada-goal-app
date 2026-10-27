import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { hasFeature, useChallengeSummary, useEnrollments, usePlan } from '@/data/premium';
import { ChallengeReport, activeEnrollment } from '@/features/challenge';
import { UpgradePrompt } from '@/features/premium/UpgradePrompt';
import { combine, ErrorScreen, Gate, LoadingScreen } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { EmptyState, Screen, Text } from '@/ui';

/** The report of one challenge (`?id=`), or of the running one when no id is given. */
export default function ChallengeCompleteScreen() {
  const { space } = useTheme();
  const qc = useQueryClient();
  const plan = usePlan();
  const allowed = hasFeature(plan.data ?? undefined, 'challenge');
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const requested = (Array.isArray(params.id) ? params.id[0] : params.id) || undefined;
  const enrollments = useEnrollments(allowed);
  const id = requested ?? activeEnrollment(enrollments.data)?.id;
  const summary = useChallengeSummary(id, allowed);

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

  if (!requested && enrollments.data && !id) {
    return (
      <Screen>
        <EmptyState
          title="No challenge to report on"
          message="Start a 30-Day Challenge first; the report is written on day 30."
          action={{ label: 'See the challenge', onPress: () => router.replace('/challenge') }}
        />
      </Screen>
    );
  }

  const state = requested ? combine(summary) : combine(enrollments, summary);
  return (
    <Gate state={state}>
      {summary.data ? (
        <ChallengeReport
          summary={summary.data}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['challenge'] })}
          onShare={(goalId) => router.push({ pathname: '/share', params: { goalId, kind: 'challenge' } })}
          onStartAnother={() => router.dismissTo('/challenge')}
          onKeepGoing={() => router.navigate('/today')}
        />
      ) : null}
    </Gate>
  );
}
