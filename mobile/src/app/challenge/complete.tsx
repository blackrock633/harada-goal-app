import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';

import { useChallengeSummary, useEnrollments } from '@/data/premium';
import { ChallengeReport, activeEnrollment } from '@/features/challenge';
import { combine, Gate } from '@/screens/queryState';
import { EmptyState, Screen } from '@/ui';

/** The report of one challenge (`?id=`), or of the running one when no id is given. */
export default function ChallengeCompleteScreen() {
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const requested = (Array.isArray(params.id) ? params.id[0] : params.id) || undefined;
  const enrollments = useEnrollments();
  const id = requested ?? activeEnrollment(enrollments.data)?.id;
  const summary = useChallengeSummary(id);

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
