'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  EVENT_TOKEN_RE,
  isBrowserEvent,
  isPriceId,
  parseBillingResponse,
  VISITOR_ID_RE,
  type BillingRedirectResult,
} from '@/application/web-public';
import { clientIp, trackLimiter } from '@/infrastructure/http/rate-limit';
import { trackEvent } from '@/infrastructure/supabase/public-data';
import { anonSupabase, callEdgeFunction, userSupabase, verifiedAccessToken } from '@/infrastructure/supabase/server';

/**
 * Visitor page-view analytics from the browser. Re-validates everything (event name allow-list, {source} token,
 * visitor id) and rate limits per IP before calling track_event as `anon`. Never throws.
 */
export async function trackBrowserEventAction(name: unknown, props: unknown, visitorId: unknown): Promise<void> {
  try {
    if (!isBrowserEvent(name) || typeof visitorId !== 'string' || !VISITOR_ID_RE.test(visitorId)) return;
    const source = (props as { source?: unknown } | null)?.source;
    const clean: Record<string, string> = typeof source === 'string' && EVENT_TOKEN_RE.test(source) ? { source } : {};
    if (!trackLimiter.consume(clientIp(await headers()))) return;
    await trackEvent(anonSupabase(), name, clean, visitorId);
  } catch {
    // Analytics is best effort.
  }
}

/** POSTs to a billing Edge Function as the signed-in user. 'UNAUTHENTICATED' when there is no verified session. */
async function billingRedirect(fn: 'billing-checkout' | 'billing-portal', body?: Record<string, unknown>): Promise<BillingRedirectResult> {
  try {
    const client = await userSupabase();
    if (!client) return { ok: false, code: 'NOT_CONFIGURED' };
    const token = await verifiedAccessToken(client);
    if (!token) return { ok: false, code: 'UNAUTHENTICATED' };
    const res = await callEdgeFunction(fn, token, body);
    return parseBillingResponse(res.body);
  } catch {
    return { ok: false, code: 'UNAVAILABLE' };
  }
}

/** Upgrade: opens Stripe Checkout for the chosen price. Failures come back to /pricing?error=<code>. */
export async function startCheckoutAction(form: FormData): Promise<void> {
  const priceId = form.get('priceId');
  if (!isPriceId(priceId)) redirect('/pricing?error=VALIDATION');
  const result = await billingRedirect('billing-checkout', { priceId });
  if (!result.ok) {
    if (result.code === 'UNAUTHENTICATED') redirect('/signin?next=/pricing');
    redirect(`/pricing?error=${result.code}`);
  }
  redirect(result.url);
}

/** "Manage billing": opens the Stripe customer portal. Failures come back to /account/billing?error=<code>. */
export async function openBillingPortalAction(): Promise<void> {
  const result = await billingRedirect('billing-portal');
  if (!result.ok) {
    if (result.code === 'UNAUTHENTICATED') redirect('/signin?next=/account/billing');
    redirect(`/account/billing?error=${result.code}`);
  }
  redirect(result.url);
}
