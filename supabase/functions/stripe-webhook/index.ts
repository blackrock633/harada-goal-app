// Supabase Edge Function (Deno): receives Stripe events. Stripe cannot send a Supabase JWT, so deploy with
// `supabase functions deploy stripe-webhook --no-verify-jwt`; the Stripe signature is the authentication.
// Secrets: STRIPE_WEBHOOK_SECRET (whsec_…), STRIPE_SECRET_KEY (to read the subscription after checkout).
import { handleStripeWebhook, stripeRequest, type StripeSubscription } from '../_shared/billing.ts';
import { admin } from '../_shared/billing-deps.ts';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

Deno.serve((req: Request) =>
  handleStripeWebhook(req, {
    webhookSecret: Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? undefined,
    async apply(event) {
      const { data, error } = await admin.rpc('billing_apply', { p_event: event });
      if (error) throw error;
      return data as string;
    },
    async linkCustomer(userId, customerId) {
      const { error } = await admin.rpc('billing_link_customer', { p_user: userId, p_customer: customerId });
      if (error) throw error;
    },
    async fetchSubscription(id) {
      if (!stripeKey) return null;
      return await stripeRequest<StripeSubscription>(fetch, stripeKey, 'GET', `/subscriptions/${encodeURIComponent(id)}`);
    },
    logError(message, detail) {
      console.error(message, detail);
    },
  }),
);
