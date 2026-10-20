import type { Metadata } from 'next';
import { requireCtx } from '@/app/lib/session';
import { resolveFocusedGoal } from '@/app/lib/focus';
import { activateGoalAction } from '@/app/actions/goals';
import { Screen } from '@/ui/layout';
import { GoalOverview, GoalSwitcher } from '@/ui/features/goal';

export const metadata: Metadata = { title: 'My Goal' };

export default async function GoalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCtx();
  const { goal, goals } = await resolveFocusedGoal(ctx, (await searchParams).goal);
  return (
    <Screen width="reading">
      <div className="mb-6 flex justify-end">
        <GoalSwitcher goals={goals} currentGoalId={goal.id} />
      </div>
      <GoalOverview goal={goal} today={ctx.today} activateGoal={activateGoalAction} />
    </Screen>
  );
}
