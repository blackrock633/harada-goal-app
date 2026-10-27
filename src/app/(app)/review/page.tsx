import type { Metadata } from 'next';
import * as q from '@/application/queries';
import { getDeps } from '@/infrastructure/container';
import { fetchMyPlan } from '@/infrastructure/supabase/public-data';
import { userSupabase } from '@/infrastructure/supabase/server';
import { requireCtx } from '@/app/lib/session';
import { resolveFocusedGoal, unwrap } from '@/app/lib/focus';
import { Screen, ScreenHeader } from '@/ui/layout';
import { ReviewView } from '@/ui/features/review';
import { ReflectionFormScreen } from './ReflectionFormScreen';

export const metadata: Metadata = { title: 'Review' };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCtx();
  const deps = await getDeps();
  const { goal, goals } = await resolveFocusedGoal(ctx, (await searchParams).goal);
  const [reflections, events, plan] = await Promise.all([
    q.listReflections(deps, ctx, { goalId: goal.id }).then(unwrap),
    q.getGoalHistory(deps, ctx, { goalId: goal.id }).then(unwrap),
    fetchMyPlan(await userSupabase()),
  ]);
  const summary = goals.find((g) => g.id === goal.id);
  const advanced = plan?.plan === 'pro' || (plan?.features.includes('advanced_reviews') ?? false);
  const visibleReflections = advanced ? reflections : reflections.filter((r) => r.kind === 'daily');

  return (
    <Screen width="reading">
      <ScreenHeader eyebrow="Review" title={goal.title} />
      <ReviewView
        reflectionForm={<ReflectionFormScreen goalId={goal.id} today={ctx.today} advanced={advanced} />}
        completedThisWeek={summary?.completedThisWeek ?? 0}
        outcomes={goal.outcomes}
        reflections={visibleReflections}
        events={events}
      />
    </Screen>
  );
}
