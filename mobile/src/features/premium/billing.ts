/**
 * Stripe's pages (Checkout and the customer portal) open in the browser. When the browser closes
 * the plan is fetched again and shown as the server reports it: the app never decides on its own
 * that a payment or cancellation went through.
 */
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import type { AppError, Result } from '@shared/application/result';

import { errorMessage } from '@/data/errors';
import { openBillingPortal, startCheckout, useRefreshPlan, type Price } from '@/data/premium';

/** The words for a failed billing request. Every message says that nothing was charged or changed. */
export function billingErrorMessage(error: AppError, what: 'checkout' | 'portal'): string {
  // Edge Functions add NOT_CONFIGURED to the app's codes (supabase/functions/_shared/billing.ts).
  switch (error.code as string) {
    case 'NOT_CONFIGURED':
      return what === 'checkout'
        ? 'Upgrades aren’t available yet. Nothing was charged.'
        : 'Billing isn’t available yet. Nothing was changed.';
    case 'UNAVAILABLE':
      return 'Couldn’t reach the server. Nothing was charged or changed — try again in a moment.';
    case 'CONFLICT':
      return error.message || 'Your plan changed in the meantime. Check your plan below.';
    default:
      return errorMessage(error);
  }
}

type Phase = 'idle' | 'opening' | 'returned';

/** Runs one Stripe page at a time: request its URL, open it, refresh the plan when it closes. */
function useStripePage(what: 'checkout' | 'portal') {
  const refreshPlan = useRefreshPlan();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function open(request: () => Promise<Result<{ url: string }>>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setPhase('opening');
    try {
      const res = await request();
      if (!res.ok) {
        setError(billingErrorMessage(res.error, what));
        setPhase('idle');
        return;
      }
      await WebBrowser.openBrowserAsync(res.data.url);
      setPhase('returned');
      await refreshPlan();
    } catch {
      setError(billingErrorMessage({ code: 'UNAVAILABLE', message: '' }, what));
      setPhase('idle');
    } finally {
      inFlight.current = false;
    }
  }

  return { open, busy: phase === 'opening', returned: phase === 'returned', error, refreshPlan };
}

/** Stripe Checkout for a price. Nothing is charged until the user pays on Stripe's page. */
export function useCheckout() {
  const { open, ...rest } = useStripePage('checkout');
  return { ...rest, start: (priceId: Price['id']) => open(() => startCheckout(priceId)) };
}

/** The Stripe customer portal: payment method, invoices, switching or cancelling. */
export function useBillingPortal() {
  const { open, ...rest } = useStripePage('portal');
  return { ...rest, open: () => open(() => openBillingPortal()) };
}
