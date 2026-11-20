import { admin, config, checkoutDeps } from './billing-deps.ts';
import {
  readStripeState,
  billingConfigError,
  normalizeSubscription,
  stripeRequest,
  type StripeSubscription,
} from './billing.ts';
import { nativeConfig, nativeDeps } from './native-billing-deps.ts';
import { syncNative } from './native-billing.ts';

export async function reconcileUser(user: string) {
  const customer = await checkoutDeps.customerOf(user);
  if (customer) {
    if (billingConfigError(config)) throw new Error('stripe_not_configured');
    const { data: generation, error } = await admin.rpc('billing_next_generation');
    if (error) throw error;
    const { data: existing, error: readError } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user)
      .single();
    if (readError) throw readError;
    let sub: StripeSubscription | undefined;
    if (existing.stripe_subscription_id)
      sub = await readStripeState(fetch, config.stripeSecretKey!, existing.stripe_subscription_id);
    else {
      const list = await stripeRequest<{ data: StripeSubscription[] }>(
        fetch,
        config.stripeSecretKey!,
        'GET',
        `/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`,
      );
      const live = list.data.filter((s) => !['canceled', 'incomplete_expired'].includes(s.status));
      if (live.length > 1) throw new Error('multiple_subscriptions_require_review');
      sub = live[0] ?? list.data[0];
    }
    if (sub) {
      sub = await readStripeState(fetch, config.stripeSecretKey!, sub.id);
      // Refund state is sticky in Postgres until a later paid period is verified.
      const event = {
        ...normalizeSubscription(
          `reconcile:${crypto.randomUUID()}`,
          'reconciliation',
          Date.now() / 1000,
          sub,
        ),
        generation,
        livemode: config.environment === 'PRODUCTION',
      };
      const { error: writeError } = await admin.rpc('billing_apply', { p_event: event });
      if (writeError) throw writeError;
    }
  }
  if (nativeConfig.apiKey && nativeConfig.products.length)
    await syncNative(user, `reconcile:${crypto.randomUUID()}`, nativeConfig, nativeDeps);
}
