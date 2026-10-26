// Supabase Edge Function (Deno): starts a Stripe Checkout for Harada Pro. Deploy: `supabase functions deploy billing-checkout`.
// Secrets: STRIPE_SECRET_KEY, APP_URL, optional ALLOW_LIVE_BILLING=true and ALLOWED_ORIGINS. Keep JWT verification on.
import { handleCheckout } from '../_shared/billing.ts';
import { checkoutDeps, config } from '../_shared/billing-deps.ts';

Deno.serve((req: Request) => handleCheckout(req, config, checkoutDeps));
