import type { Metadata } from 'next';
import * as q from '@/application/queries';
import { getDeps } from '@/infrastructure/container';
import { requireCtx } from '@/app/lib/session';
import { resolveFocusedGoal, unwrap } from '@/app/lib/focus';
import { addReflectionAction } from '@/app/actions/review';
import { Screen, ScreenHeader } from '@/ui/layout';
import { ReflectionForm, ReviewView } from '@/ui/features/review';

export const metadata: Metadata = { title: 'Review' };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCtx();
  const deps = await getDeps();
  const { goal, goals } = await resolveFocusedGoal(ctx, (await searchParams).goal);
  const [reflections, events] = await Promise.all([
    q.listReflections(deps, ctx, { goalId: goal.id }).then(unwrap),
    q.getGoalHistory(deps, ctx, { goalId: goal.id }).then(unwrap),
  ]);
  const summary = goals.find((g) => g.id === goal.id);

  return (
    <Screen width="reading">
      <ScreenHeader eyebrow="Review" title={goal.title} />
      <ReviewView
        reflectionForm={<ReflectionForm goalId={goal.id} today={ctx.today} addReflection={addReflectionAction} />}
        completedThisWeek={summary?.completedThisWeek ?? 0}
        outcomes={goal.outcomes}
        reflections={reflections}
        events={events}
      />
    </Screen>
  );
}
