import { router } from 'expo-router';
import { useState } from 'react';

import type { ReflectionDTO } from '@shared/application/dto';
import { useMutations, useReview } from '@/data/hooks';
import { hasFeature, usePlan } from '@/data/premium';
import { insightsHref } from '@/features/premium/routes';
import { ReflectionForm, ReviewView } from '@/features/review';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useGoalScreen } from '@/screens/useGoalScreen';
import { EmptyState, Screen } from '@/ui';

export default function ReviewScreen() {
  const { state, summary, detail, today, noGoals, extra: review } = useGoalScreen(useReview);
  const mutations = useMutations();
  // The plan never holds up the screen; until it loads the review is the Free one.
  const plan = usePlan();
  const advanced = hasFeature(plan.data ?? undefined, 'advanced_reviews');
  const [editing, setEditing] = useState<ReflectionDTO | null>(null);

  if (noGoals) {
    return (
      <Screen>
        <EmptyState
          title="Nothing to review yet"
          message="Create a goal, then reflections and plan changes will appear here."
          action={{ label: 'Create your goal', onPress: () => router.push('/goal/new') }}
        />
      </Screen>
    );
  }
  if (state.error) return <ErrorScreen error={state.error} onRetry={state.refetch} />;
  if (state.loading || !summary || !detail || !today || !review?.data) return <LoadingScreen />;

  // ReviewView supplies its own Screen scroll area.
  return (
    <ReviewView
      reflectionForm={
        <ReflectionForm
          key={editing?.id ?? 'new'}
          goalId={summary.id}
          today={today}
          addReflection={mutations.addReflection}
          updateReflection={mutations.updateReflection}
          advanced={advanced}
          editing={editing}
          onDoneEditing={() => setEditing(null)}
        />
      }
      completedThisWeek={summary.completedThisWeek}
      outcomes={detail.outcomes}
      reflections={review.data.reflections}
      events={review.data.events}
      refreshing={state.refreshing}
      onRefresh={state.refetch}
      onEditReflection={setEditing}
      onOpenHistory={() => router.push(insightsHref(summary.id))}
      historyLocked={!hasFeature(plan.data ?? undefined, 'progress_history')}
    />
  );
}
