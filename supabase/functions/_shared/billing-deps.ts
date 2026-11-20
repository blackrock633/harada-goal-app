// Deno wiring shared by the billing Edge Functions. Not type-checked by the app's tsc (Deno globals, npm:
// specifiers); the logic lives in billing.ts, which is unit-tested.
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';
import type { BillingConfig, CheckoutDeps, PriceRow } from './billing.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const config: BillingConfig = {
  environment: Deno.env.get('BILLING_ENVIRONMENT') === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX',
  stripeSecretKey: Deno.env.get('STRIPE_SECRET_KEY') ?? undefined,
  allowLiveMode: Deno.env.get('ALLOW_LIVE_BILLING') === 'true',
  appUrl: Deno.env.get('APP_URL') ?? undefined,
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

export const checkoutDeps: CheckoutDeps = {
  async getUser(token) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
  async getPrice(id) {
    const mode = await admin.rpc('billing_environment');
    if (mode.error || mode.data !== config.environment)
      throw new Error('billing_environment_mismatch');
    const { data, error } = await admin
      .from('prices')
      .select('id, stripe_price_id, amount_cents, currency, billing_interval, active')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      stripePriceId: data.stripe_price_id,
      amountCents: data.amount_cents,
      currency: data.currency,
      interval: data.billing_interval,
      active: data.active,
    } as PriceRow;
  },
  async getPlan(userId) {
    const { data: plan, error } = await admin.rpc('user_has_feature', {
      p_user: userId,
      p_feature: 'multiple_goals',
    });
    if (error) throw error;
    const { data: sub, error: e2 } = await admin
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (e2) throw e2;
    const stripeActive =
      !!sub &&
      ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(sub.status);
    return { plan: plan ? 'pro' : 'free', stripeActive };
  },
  async checkoutAttempt(userId, priceId) {
    const { data, error } = await admin.rpc('billing_checkout_attempt', {
      p_user: userId,
      p_price: priceId,
    });
    if (error) throw error;
    return data;
  },
  async customerOf(userId) {
    const { data, error } = await admin.rpc('billing_customer_of', { p_user: userId });
    if (error) throw error;
    return (data as string | null) ?? null;
  },
  async linkCustomer(userId, customerId) {
    const { error } = await admin.rpc('billing_link_customer', {
      p_user: userId,
      p_customer: customerId,
    });
    if (error) throw error;
  },
  async track(userId, name, props) {
    await admin.from('analytics_events').insert({ name, user_id: userId, props });
  },
  fetch: (input, init) => fetch(input, init),
  logError(message, detail) {
    console.error(message, detail);
  },
};
