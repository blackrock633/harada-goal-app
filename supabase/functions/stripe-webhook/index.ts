// Supabase Edge Function (Deno): receives Stripe events. Stripe cannot send a Supabase JWT, so deploy with
// `supabase functions deploy stripe-webhook --no-verify-jwt`; the Stripe signature is the authentication.
// Secrets: STRIPE_WEBHOOK_SECRET (whsec_…), STRIPE_SECRET_KEY (to read the subscription after checkout).
import {
  readStripeState,
  billingConfigError,
  handleStripeWebhook,
  stripeRequest,
} from '../_shared/billing.ts';
import { admin, config } from '../_shared/billing-deps.ts';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

Deno.serve((req: Request) =>
  billingConfigError(config)
    ? Promise.resolve(new Response(null, { status: 503 }))
    : handleStripeWebhook(req, {
        expectedLiveMode: config.allowLiveMode === true && /_live_/.test(stripeKey),
        async nextGeneration() {
          const { data, error } = await admin.rpc('billing_next_generation');
          if (error) throw error;
          return data;
        },
        async fetchInvoice(id) {
          return stripeRequest(fetch, stripeKey, 'GET', `/invoices/${encodeURIComponent(id)}`);
        },
        webhookSecret: Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? undefined,
        async apply(event) {
          const { data, error } = await admin.rpc('billing_apply', { p_event: event });
          if (error) throw error;
          return data as string;
        },
        async linkCustomer(userId, customerId) {
          const { error } = await admin.rpc('billing_link_customer', {
            p_user: userId,
            p_customer: customerId,
          });
          if (error) throw error;
        },
        async fetchSubscription(id) {
          if (!stripeKey) return null;
          return await readStripeState(fetch, stripeKey, id);
        },
        logError(message, detail) {
          console.error(message, detail);
        },
      }),
);
