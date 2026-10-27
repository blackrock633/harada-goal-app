import type { Metadata } from 'next';
import Link from 'next/link';
import * as uc from '@/application/use-cases';
import { fetchMyPlan } from '@/infrastructure/supabase/public-data';
import { userSupabase } from '@/infrastructure/supabase/server';
import { requireCtx } from '@/app/lib/session';
import { getDeps } from '@/infrastructure/container';
import { resolveFocusedGoal } from '@/app/lib/focus';
import { activateGoalAction } from '@/app/actions/goals';
import { Screen } from '@/ui/layout';
import { GoalOverview, GoalSwitcher } from '@/ui/features/goal';
import { GoalVisibilityBar } from '@/ui/features/social';
import { routes } from '@/ui/routes';

export const metadata: Metadata = { title: 'My Goal' };

export default async function GoalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCtx();
  const deps = await getDeps();
  const [{ goal, goals }, plan] = await Promise.all([
    resolveFocusedGoal(ctx, (await searchParams).goal),
    fetchMyPlan(await userSupabase()),
  ]);
  const visRes = await uc.getGoalVisibility(deps, ctx, { goalId: goal.id });
  const initialVisibility = visRes.ok ? visRes.data.visibility : 'private';
  return (
    <Screen width="reading">
      {plan?.overLimit && (
        <div
          role="region"
          aria-label="Active goal limit"
          data-testid="over-limit-notice"
          className="mb-6 space-y-2 rounded-[var(--radius-md)] border border-warning/40 bg-warning/5 p-4 text-sm text-ink"
        >
          <p className="font-medium">
            You have {plan.activeGoals} active goals, and the Free plan includes {plan.maxActiveGoals ?? 1}.
          </p>
          <p className="text-ink-muted">
            Nothing was deleted or deactivated. You can keep working on your existing goals, or complete or archive
            goals until you have {plan.maxActiveGoals ?? 1} active goal before activating another.
          </p>
          <p>
            <Link href={routes.pricing} className="inline-flex min-h-[44px] items-center font-medium text-accent underline underline-offset-2">
              See Harada Pro
            </Link>
          </p>
        </div>
      )}
      <div className="mb-4 flex justify-end">
        <GoalSwitcher goals={goals} currentGoalId={goal.id} />
      </div>
      <div className="mb-6">
        <GoalVisibilityBar
          goalId={goal.id}
          goalStatus={goal.status}
          initialVisibility={initialVisibility}
        />
      </div>
      <GoalOverview goal={goal} today={ctx.today} activateGoal={activateGoalAction} />
    </Screen>
  );
}
