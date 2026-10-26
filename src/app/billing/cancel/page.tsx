import type { Metadata } from 'next';
import { PublicShell } from '@/ui/features/marketing';
import { ButtonLink } from '@/ui/primitives';
import { routes } from '@/ui/routes';

export const metadata: Metadata = { title: 'Checkout cancelled', robots: { index: false, follow: false } };

/** Stripe sends the buyer here when they leave checkout without paying. */
export default function BillingCancelPage() {
  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[720px] px-4 py-14 md:px-8">
        <h1 className="font-serif text-3xl font-medium text-ink">Checkout cancelled</h1>
        <p className="mt-3 text-ink-muted">No charge was made. Your plan hasn’t changed.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={routes.today} className="w-full sm:w-auto">Back to Today</ButtonLink>
          <ButtonLink href={routes.pricing} variant="secondary" className="w-full sm:w-auto">See pricing</ButtonLink>
        </div>
      </div>
    </PublicShell>
  );
}
