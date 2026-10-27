import type { Metadata } from 'next';
import Link from 'next/link';
import type { MyPlanDTO } from '@/application/web-public';
import { fetchMyPlan } from '@/infrastructure/supabase/public-data';
import { userSupabase } from '@/infrastructure/supabase/server';
import { requireCtx } from '@/app/lib/session';
import { openBillingPortalAction } from '@/app/actions/billing';
import { SubmitButton, billingErrorMessage, formatBillingDate, intervalLabel, subscriptionLine } from '@/ui/features/marketing';
import { Screen, ScreenHeader, Section } from '@/ui/layout';
import { ButtonLink } from '@/ui/primitives';
import { routes } from '@/ui/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Billing', robots: { index: false, follow: false } };

export default async function AccountBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCtx();
  const params = await searchParams;
  const error = billingErrorMessage(params.error, 'portal');
  const plan = await fetchMyPlan(await userSupabase().catch(() => null));

  return (
    <Screen width="reading">
      <ScreenHeader title="Billing" back={{ href: routes.settings, label: 'Settings' }} />
      {error && (
        <p role="alert" className="mb-4 rounded-[var(--radius-sm)] border border-danger px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {!plan ? (
        <p role="status" className="text-ink-muted">
          Your plan couldn’t be loaded right now. Please refresh in a moment.
        </p>
      ) : (
        <PlanDetails plan={plan} />
      )}
    </Screen>
  );
}

function PlanDetails({ plan }: { plan: MyPlanDTO }) {
  const isPro = plan.plan === 'pro';
  const line = subscriptionLine(plan);
  const s = plan.subscription;
  const grantEnds = plan.grant ? formatBillingDate(plan.grant.expiresAt) : null;

  return (
    <>
      <Section title="Your plan">
        <dl className="divide-y divide-rule">
          <div className="py-3">
            <dt className="text-sm text-ink-muted">Plan</dt>
            <dd className="text-ink" data-testid="plan-name">{isPro ? 'Harada Pro' : 'Free'}</dd>
          </div>
          {s && intervalLabel(s.priceId) && (
            <div className="py-3">
              <dt className="text-sm text-ink-muted">Billing</dt>
              <dd className="text-ink">{intervalLabel(s.priceId)}</dd>
            </div>
          )}
          {line && (
            <div className="py-3">
              <dt className="text-sm text-ink-muted">Status</dt>
              <dd className={line.tone === 'warning' ? 'text-warning' : 'text-ink'} role={line.tone === 'warning' ? 'alert' : undefined}>
                {line.text}
              </dd>
            </div>
          )}
          {plan.grant && (
            <div className="py-3">
              <dt className="text-sm text-ink-muted">Complimentary access</dt>
              <dd className="text-ink">
                {grantEnds ? `Harada Pro is included for you until ${grantEnds}.` : 'Harada Pro is included for you.'}
              </dd>
            </div>
          )}
          <div className="py-3">
            <dt className="text-sm text-ink-muted">Active goals</dt>
            <dd className="text-ink">
              {plan.maxActiveGoals === null ? `${plan.activeGoals} (no limit)` : `${plan.activeGoals} of ${plan.maxActiveGoals}`}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {!isPro && <ButtonLink href={routes.pricing} className="w-full sm:w-auto">Upgrade to Pro</ButtonLink>}
          {s?.hasBillingAccount && (
            <form action={openBillingPortalAction}>
              <SubmitButton variant={isPro ? 'primary' : 'secondary'} className="w-full sm:w-auto">Manage billing</SubmitButton>
            </form>
          )}
        </div>
        {s?.hasBillingAccount && (
          <p className="mt-3 text-sm text-ink-muted">
            Manage billing opens Stripe, where you can update your card, see invoices, switch between monthly and yearly,
            or cancel.
          </p>
        )}
      </Section>

      {plan.overLimit && (
        <Section title="More active goals than the Free plan allows">
          <div role="status" className="space-y-3 text-ink-muted">
            <p>
              You have {plan.activeGoals} active goals and the Free plan includes {plan.maxActiveGoals ?? 1}. Nothing has
              been deleted: every goal and all of its history is kept.
            </p>
            <p>
              Choose which goal stays active from the goal list in the Harada app. The others are archived, not deleted,
              and you can bring them back later. Until you choose, your{' '}
              <Link href={routes.today} className="font-medium text-accent underline underline-offset-2">goals</Link> keep
              working as they are, but you can’t activate another one on Free.
            </p>
          </div>
        </Section>
      )}
    </>
  );
}
