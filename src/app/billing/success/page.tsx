import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchMyPlan } from '@/infrastructure/supabase/public-data';
import { userSupabase } from '@/infrastructure/supabase/server';
import { PublicShell } from '@/ui/features/marketing';
import { ButtonLink } from '@/ui/primitives';
import { routes } from '@/ui/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Upgrade', robots: { index: false, follow: false } };

const SESSION_ID_RE = /^cs_[A-Za-z0-9_]{1,200}$/;

/**
 * Stripe sends the buyer here after checkout. This page never claims success on its own: it says Pro is active
 * only when get_my_plan (the database, updated by the Stripe webhook) reports plan === 'pro'.
 */
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sessionId = typeof params.session_id === 'string' && SESSION_ID_RE.test(params.session_id) ? params.session_id : null;
  const self = sessionId ? `/billing/success?session_id=${encodeURIComponent(sessionId)}` : '/billing/success';
  const plan = await fetchMyPlan(await userSupabase().catch(() => null));

  return (
    <PublicShell signedIn={!!plan}>
      <div className="mx-auto w-full max-w-[720px] px-4 py-14 md:px-8">
        {plan?.plan === 'pro' ? (
          <>
            <h1 className="font-serif text-3xl font-medium text-ink">Harada Pro is active</h1>
            <p className="mt-3 text-ink-muted">
              Thank you. You can now keep several goals active at once and use the Pro reviews and history.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={routes.today} className="w-full sm:w-auto">Go to Today</ButtonLink>
              <ButtonLink href={routes.accountBilling} variant="secondary" className="w-full sm:w-auto">View billing</ButtonLink>
            </div>
          </>
        ) : plan ? (
          <>
            <h1 className="font-serif text-3xl font-medium text-ink">Payment received by Stripe — confirming…</h1>
            <p role="status" className="mt-3 text-ink-muted">
              Your account still shows the Free plan. Stripe usually tells Harada within a few moments; refresh in a
              moment. If it still shows Free after a few minutes, check{' '}
              <Link href={routes.accountBilling} className="font-medium text-accent underline underline-offset-2">Billing</Link>.
            </p>
            <div className="mt-8">
              <ButtonLink href={self} className="w-full sm:w-auto">Refresh</ButtonLink>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-serif text-3xl font-medium text-ink">Confirming your upgrade</h1>
            <p role="status" className="mt-3 text-ink-muted">
              We couldn’t check your plan right now. Sign in, or refresh in a moment, to see your current plan.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={self} className="w-full sm:w-auto">Refresh</ButtonLink>
              <ButtonLink href={`${routes.signIn}?next=${encodeURIComponent(routes.accountBilling)}`} variant="secondary" className="w-full sm:w-auto">
                Sign in
              </ButtonLink>
            </div>
          </>
        )}
      </div>
    </PublicShell>
  );
}
