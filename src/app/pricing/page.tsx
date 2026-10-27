import type { Metadata } from 'next';
import Link from 'next/link';
import type { PriceDTO } from '@/application/web-public';
import { fetchMyPlan, fetchPricingCatalog } from '@/infrastructure/supabase/public-data';
import { anonSupabase, userSupabase } from '@/infrastructure/supabase/server';
import { getCtx } from '@/app/lib/session';
import { startCheckoutAction, trackBrowserEventAction } from '@/app/actions/billing';
import { PricingPlans, PublicShell, SubmitButton, TrackView, billingErrorMessage } from '@/ui/features/marketing';
import { ButtonLink } from '@/ui/primitives';
import { routes } from '@/ui/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Harada is free with one active goal. Harada Pro adds several active goals, full history and advanced reviews.',
};

async function signedIn(): Promise<boolean> {
  try {
    return !!(await getCtx());
  } catch {
    return false;
  }
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = billingErrorMessage(params.error, 'checkout');
  const isSignedIn = await signedIn();
  const [catalog, myPlan] = await Promise.all([
    fetchPricingCatalog(anonSupabase()),
    isSignedIn ? userSupabase().then(fetchMyPlan).catch(() => null) : Promise.resolve(null),
  ]);
  const isPro = myPlan?.plan === 'pro';

  const renderUpgrade = (price: PriceDTO) => {
    const label = price.interval === 'year' ? 'Upgrade — billed yearly' : 'Upgrade — billed monthly';
    if (!isSignedIn) {
      return (
        <ButtonLink href={routes.signUpWith({ next: routes.pricing })} className="w-full sm:w-auto">
          {label}
        </ButtonLink>
      );
    }
    if (isPro) return null;
    return (
      <form action={startCheckoutAction}>
        <input type="hidden" name="priceId" value={price.id} />
        <SubmitButton className="w-full sm:w-auto">{label}</SubmitButton>
      </form>
    );
  };

  return (
    <PublicShell signedIn={isSignedIn}>
      <TrackView name="upgrade_page_viewed" track={trackBrowserEventAction} />
      <div className="mx-auto w-full max-w-[1120px] px-4 py-10 md:px-8 md:py-14">
        <h1 className="font-serif text-3xl font-medium text-ink md:text-4xl">Pricing</h1>
        <p className="mt-3 max-w-[64ch] text-ink-muted">
          Harada is free for one active goal. Harada Pro is for people working on several goals at once, or who want
          the deeper review and history tools.
        </p>

        {error && (
          <p role="alert" className="mt-6 rounded-[var(--radius-sm)] border border-danger px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {isPro && (
          <p role="status" className="mt-6 rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-sm text-ink">
            You’re on Harada Pro.{' '}
            <Link href={routes.accountBilling} className="font-medium text-accent underline underline-offset-2">
              Manage billing
            </Link>
          </p>
        )}

        <div className="mt-8">
          <PricingPlans
            catalog={catalog}
            headingLevel="h2"
            renderUpgrade={renderUpgrade}
            freeAction={
              isSignedIn ? null : (
                <ButtonLink href={routes.signUp} variant="secondary" className="w-full sm:w-auto">
                  Start free
                </ButtonLink>
              )
            }
          />
        </div>

        <section aria-labelledby="terms-heading" className="mt-12 max-w-[720px]">
          <h2 id="terms-heading" className="font-serif text-2xl text-ink">Renewal and cancelling</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-muted">
            <li>Renews every month/year until you cancel.</li>
            <li>Cancel anytime from Billing; you keep Pro until the end of the paid period.</li>
            <li>
              If you go back to Free with more than one active goal, nothing is deleted: every goal is kept, and you
              choose which one stays active.
            </li>
          </ul>
        </section>

        <section aria-labelledby="how-billing-heading" className="mt-10 max-w-[720px]">
          <h2 id="how-billing-heading" className="font-serif text-2xl text-ink">How billing works</h2>
          <div className="mt-4 space-y-3 text-ink-muted">
            <p>
              Payments are handled by Stripe. When you upgrade you’re sent to Stripe’s checkout page; your card details
              go straight to Stripe and never touch Harada’s servers.
            </p>
            <p>
              Your plan changes once Stripe confirms the payment to Harada. Invoices, card changes and
              cancelling are all in{' '}
              <Link href={routes.accountBilling} className="font-medium text-accent underline underline-offset-2">
                Billing
              </Link>{' '}
              in your account.
            </p>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
