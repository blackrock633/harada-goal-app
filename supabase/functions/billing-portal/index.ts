// Supabase Edge Function (Deno): opens the Stripe customer portal (payment method, invoices, plan change, cancel).
// Deploy: `supabase functions deploy billing-portal`. Same secrets as billing-checkout. Keep JWT verification on.
import { handlePortal } from '../_shared/billing.ts';
import { checkoutDeps, config } from '../_shared/billing-deps.ts';

Deno.serve((req: Request) => handlePortal(req, config, checkoutDeps));
