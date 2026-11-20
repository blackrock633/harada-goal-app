import { admin, checkoutDeps } from './billing-deps.ts';
import type { NativeConfig, NativeDeps } from './native-billing.ts';
export const nativeConfig: NativeConfig = {
  apiKey: Deno.env.get('REVENUECAT_SECRET_KEY'),
  webhookAuthorization: Deno.env.get('REVENUECAT_WEBHOOK_AUTHORIZATION'),
  entitlement: Deno.env.get('REVENUECAT_ENTITLEMENT') ?? 'harada_pro',
  environment: Deno.env.get('BILLING_ENVIRONMENT') === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX',
  products: (Deno.env.get('REVENUECAT_PRODUCT_IDS') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(','),
};
export const nativeDeps: NativeDeps = {
  getUser: checkoutDeps.getUser,
  fetch,
  async identityFor(user) {
    const { data, error } = await admin.rpc('billing_identity_for', { p_user: user });
    if (error) throw error;
    return data;
  },
  async userFor(identity) {
    const { data, error } = await admin.rpc('billing_user_for', { p_identity: identity });
    if (error) throw error;
    return data;
  },
  async nextGeneration() {
    const { data, error } = await admin.rpc('billing_next_generation');
    if (error) throw error;
    return data;
  },
  async apply(user, event, generation, state) {
    const { data, error } = await admin.rpc('native_billing_apply', {
      p_user: user,
      p_event: event,
      p_generation: generation,
      p_state: state,
    });
    if (error) throw error;
    return data;
  },
  logError(code) {
    console.error(JSON.stringify({ component: 'native-billing', code }));
  },
};
