import type { Metadata } from 'next';
import Link from 'next/link';
import * as q from '@/application/queries';
import { getDeps } from '@/infrastructure/container';
import { fetchMyPlan } from '@/infrastructure/supabase/public-data';
import { userSupabase } from '@/infrastructure/supabase/server';
import { requireCtx } from '@/app/lib/session';
import { unwrap } from '@/app/lib/focus';
import { Screen } from '@/ui/layout';
import { routes } from '@/ui/routes';
import { NewGoalScreen } from './NewGoalScreen';

export const metadata: Metadata = { title: 'New goal' };

export default async function NewGoalPage() {
  const ctx = await requireCtx();
  const deps = await getDeps();
  const [templates, activeGoals, plan] = await Promise.all([
    q.listTemplates(deps, ctx).then(unwrap),
    q.listGoals(deps, ctx, { status: 'active' }).then(unwrap),
    fetchMyPlan(await userSupabase()),
  ]);
  const isPro = plan?.plan === 'pro' || (plan?.features.includes('multiple_goals') ?? false);
  const maxActive = plan?.maxActiveGoals ?? 1;
  const atActiveLimit = !isPro && activeGoals.length >= maxActive;

  return (
    <Screen width="reading">
      {atActiveLimit && (
        <div
          role="region"
          aria-label="Multiple active goals require Harada Pro"
          data-testid="upgrade-prompt-multiple_goals"
          className="mb-6 space-y-2 rounded-[var(--radius-md)] border border-accent/40 bg-surface-sunken/60 p-4 text-sm text-ink"
        >
          <p className="font-serif text-lg font-medium text-ink">More Goals. More Possibilities.</p>
          <p className="text-ink-muted">
            Work toward multiple ambitions simultaneously. Unlock multiple active goals with Harada Pro.
          </p>
          <p className="text-ink-muted">
            You already have an active goal. You can plan this goal as a draft now, or finish or archive your current
            active goal before activating this one.
          </p>
          <p>
            <Link href={routes.pricing} className="inline-flex min-h-[44px] items-center font-medium text-accent underline underline-offset-2">
              See Harada Pro
            </Link>
          </p>
        </div>
      )}
      <NewGoalScreen today={ctx.today} templates={templates} />
    </Screen>
  );
}
