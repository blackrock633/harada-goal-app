import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  billingConfigError,
  handleCheckout,
  handlePortal,
  handleStripeWebhook,
  normalizeSubscription,
  verifyStripeSignature,
  type CheckoutDeps,
  type WebhookDeps,
} from '../../../supabase/functions/_shared/billing';

/** Logic of the billing Edge Functions with Supabase and Stripe mocked (the Deno wiring is untested here). */
const ALICE = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.com' };
const CONFIG = { stripeSecretKey: 'sk_test_abc123', appUrl: 'https://harada.example' };
const PRICE = { id: 'pro_monthly', stripePriceId: 'price_m', amountCents: 799, currency: 'usd', interval: 'month' as const, active: true };

function stripeFetch(over: { price?: Record<string, unknown> } = {}) {
  const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: String(init?.body ?? ''), headers: (init?.headers ?? {}) as Record<string, string> });
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.includes('/prices/')) return ok({ active: true, unit_amount: 799, currency: 'usd', recurring: { interval: 'month' }, ...over.price });
    if (u.endsWith('/customers')) return ok({ id: 'cus_new' });
    if (u.endsWith('/checkout/sessions')) return ok({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    if (u.endsWith('/billing_portal/sessions')) return ok({ url: 'https://billing.stripe.com/p/session/1' });
    return new Response('{}', { status: 404 });
  });
  return { f: f as unknown as typeof fetch, calls };
}

function deps(over: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return {
    getUser: vi.fn(async (token: string) => (token === 'good' ? ALICE : null)),
    getPrice: vi.fn(async (id: string) => (id === 'pro_monthly' ? PRICE : null)),
    getPlan: vi.fn(async () => ({ plan: 'free' as const, stripeActive: false })),
    customerOf: vi.fn(async () => null),
    linkCustomer: vi.fn(async () => {}),
    track: vi.fn(async () => {}),
    fetch: stripeFetch().f,
    ...over,
  };
}

const post = (path: string, body: unknown, token: string | null = 'good') =>
  new Request(`https://x/functions/v1/${path}`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('billing configuration', () => {
  it('refuses missing keys, live keys without ALLOW_LIVE_BILLING, and a missing app URL', () => {
    expect(billingConfigError({})).toMatch(/STRIPE_SECRET_KEY/);
    expect(billingConfigError({ stripeSecretKey: 'sk_live_x1', appUrl: 'https://a.b' })).toMatch(/ALLOW_LIVE_BILLING/);
    expect(billingConfigError({ stripeSecretKey: 'sk_live_x1', appUrl: 'https://a.b', allowLiveMode: true })).toBeNull();
    expect(billingConfigError({ stripeSecretKey: 'sk_test_x1' })).toMatch(/APP_URL/);
    expect(billingConfigError(CONFIG)).toBeNull();
  });
});

describe('checkout', () => {
  it('creates a customer once, links it, and returns the Stripe Checkout URL for the configured price', async () => {
    const s = stripeFetch();
    const d = deps({ fetch: s.f });
    const res = await handleCheckout(post('billing-checkout', { priceId: 'pro_monthly' }), CONFIG, d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { url: 'https://checkout.stripe.com/c/pay/cs_test_1' } });
    expect(d.linkCustomer).toHaveBeenCalledWith(ALICE.id, 'cus_new');
    const session = new URLSearchParams(s.calls.find((c) => c.url.endsWith('/checkout/sessions'))!.body);
    expect(session.get('mode')).toBe('subscription');
    expect(session.get('customer')).toBe('cus_new');
    expect(session.get('line_items[0][price]')).toBe('price_m');
    expect(session.get('client_reference_id')).toBe(ALICE.id);
    expect(session.get('subscription_data[metadata][user_id]')).toBe(ALICE.id);
    expect(session.get('success_url')).toBe('https://harada.example/billing/success?session_id={CHECKOUT_SESSION_ID}');
    expect(s.calls.every((c) => c.headers.authorization === 'Bearer sk_test_abc123')).toBe(true);
    expect(d.track).toHaveBeenCalledWith(ALICE.id, 'checkout_started', { price: 'pro_monthly', interval: 'month' });
  });

  it('reuses an existing customer', async () => {
    const s = stripeFetch();
    const d = deps({ fetch: s.f, customerOf: vi.fn(async () => 'cus_old') });
    await handleCheckout(post('billing-checkout', { priceId: 'pro_monthly' }), CONFIG, d);
    expect(s.calls.some((c) => c.url.endsWith('/customers'))).toBe(false);
    expect(new URLSearchParams(s.calls.at(-1)!.body).get('customer')).toBe('cus_old');
  });

  it('refuses when Stripe charges a different amount than Harada shows', async () => {
    const res = await handleCheckout(post('billing-checkout', { priceId: 'pro_monthly' }), CONFIG, deps({ fetch: stripeFetch({ price: { unit_amount: 999 } }).f }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('NOT_CONFIGURED');
  });

  it('refuses a second subscription, unknown plans, bad tokens and unconfigured billing', async () => {
    let res = await handleCheckout(post('billing-checkout', { priceId: 'pro_monthly' }), CONFIG,
      deps({ getPlan: vi.fn(async () => ({ plan: 'pro' as const, stripeActive: true })) }));
    expect(res.status).toBe(409);
    res = await handleCheckout(post('billing-checkout', { priceId: 'pro_lifetime' }), CONFIG, deps());
    expect(res.status).toBe(400);
    res = await handleCheckout(post('billing-checkout', { priceId: 'pro_monthly' }, 'bad'), CONFIG, deps());
    expect(res.status).toBe(401);
    res = await handleCheckout(post('billing-checkout', { priceId: 'pro_monthly' }, null), CONFIG, deps());
    expect(res.status).toBe(401);
    const d = deps();
    res = await handleCheckout(post('billing-checkout', { priceId: 'pro_monthly' }), {}, d);
    expect(res.status).toBe(503);
    expect(d.getUser).not.toHaveBeenCalled();
    res = await handleCheckout(post('billing-checkout', { priceId: 'pro_monthly' }), CONFIG,
      deps({ getPrice: vi.fn(async () => ({ ...PRICE, stripePriceId: null })) }));
    expect(res.status).toBe(503);
  });

  it('reports a Stripe outage as such, without claiming a charge', async () => {
    const res = await handleCheckout(post('billing-checkout', { priceId: 'pro_monthly' }), CONFIG,
      deps({ fetch: (async () => new Response('{"error":{"code":"api_error"}}', { status: 500 })) as unknown as typeof fetch }));
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toMatch(/Nothing was charged/);
  });
});

describe('portal', () => {
  it('opens the portal for a user with a billing account, refuses one without', async () => {
    const s = stripeFetch();
    let res = await handlePortal(post('billing-portal', undefined), CONFIG, { ...deps({ customerOf: vi.fn(async () => 'cus_1') }), fetch: s.f });
    expect(await res.json()).toEqual({ ok: true, data: { url: 'https://billing.stripe.com/p/session/1' } });
    expect(new URLSearchParams(s.calls[0]!.body).get('return_url')).toBe('https://harada.example/account/billing');
    res = await handlePortal(post('billing-portal', undefined), CONFIG, deps());
    expect(res.status).toBe(409);
  });
});

describe('webhook', () => {
  const SECRET = 'whsec_test_secret';
  const NOW = 1_800_000_000;
  const sign = (payload: string, t = NOW, secret = SECRET) =>
    `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
  const sub = {
    id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, canceled_at: null,
    metadata: { user_id: ALICE.id },
    items: { data: [{ quantity: 1, current_period_end: NOW + 2_592_000, price: { id: 'price_m', unit_amount: 799, recurring: { interval: 'month' } } }] },
  };
  const event = (type: string, object: unknown, id = 'evt_1') => JSON.stringify({ id, type, created: NOW, data: { object } });
  const hook = (payload: string, signature: string | null) =>
    new Request('https://x/functions/v1/stripe-webhook', { method: 'POST', headers: signature ? { 'stripe-signature': signature } : {}, body: payload });
  const wdeps = (over: Partial<WebhookDeps> = {}): WebhookDeps => ({
    webhookSecret: SECRET,
    apply: vi.fn(async () => 'applied'),
    linkCustomer: vi.fn(async () => {}),
    fetchSubscription: vi.fn(async () => sub),
    now: () => NOW,
    ...over,
  });

  it('verifies Stripe signatures: right secret and fresh timestamp only', async () => {
    const p = '{"a":1}';
    expect(await verifyStripeSignature(p, sign(p), SECRET, NOW)).toBe(true);
    expect(await verifyStripeSignature(p, sign(p, NOW, 'whsec_other'), SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(p + ' ', sign(p), SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(p, sign(p, NOW - 301), SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(p, `t=${NOW},v1=deadbeef`, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(p, null, SECRET, NOW)).toBe(false);
  });

  it('rejects unsigned or forged events without touching the database', async () => {
    const d = wdeps();
    const p = event('customer.subscription.updated', sub);
    expect((await handleStripeWebhook(hook(p, null), d)).status).toBe(400);
    expect((await handleStripeWebhook(hook(p, sign(p, NOW, 'whsec_attacker')), d)).status).toBe(400);
    expect(d.apply).not.toHaveBeenCalled();
    expect((await handleStripeWebhook(hook(p, sign(p)), wdeps({ webhookSecret: undefined }))).status).toBe(503);
  });

  it('applies subscription events in normalised form', async () => {
    const d = wdeps();
    const p = event('customer.subscription.updated', { ...sub, cancel_at_period_end: true });
    const res = await handleStripeWebhook(hook(p, sign(p)), d);
    expect(await res.json()).toEqual({ received: true, result: 'applied' });
    expect(d.apply).toHaveBeenCalledWith({
      eventId: 'evt_1', eventType: 'customer.subscription.updated', created: NOW, customerId: 'cus_1', userId: ALICE.id,
      subscriptionId: 'sub_1', status: 'active', stripePriceId: 'price_m', amountCents: 799, interval: 'month',
      currentPeriodEnd: NOW + 2_592_000, cancelAtPeriodEnd: true, canceledAt: null,
    });
  });

  it('checkout.session.completed links the customer and applies the subscription it created', async () => {
    const d = wdeps();
    const p = event('checkout.session.completed', { mode: 'subscription', customer: 'cus_1', client_reference_id: ALICE.id, subscription: 'sub_1' });
    await handleStripeWebhook(hook(p, sign(p)), d);
    expect(d.linkCustomer).toHaveBeenCalledWith(ALICE.id, 'cus_1');
    expect(d.fetchSubscription).toHaveBeenCalledWith('sub_1');
    expect(d.apply).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', userId: ALICE.id, subscriptionId: 'sub_1' }));
  });

  it('acknowledges unused events and asks Stripe to retry when the database fails', async () => {
    const p = event('customer.created', { id: 'cus_1' });
    expect(await (await handleStripeWebhook(hook(p, sign(p)), wdeps())).json()).toEqual({ received: true, result: 'unused' });
    const q = event('customer.subscription.deleted', { ...sub, status: 'canceled' });
    const res = await handleStripeWebhook(hook(q, sign(q)), wdeps({ apply: vi.fn(async () => { throw new Error('db down'); }) }));
    expect(res.status).toBe(500);
  });

  it('normalises coupons into the amount actually charged', () => {
    expect(normalizeSubscription('e', 't', 1, { ...sub, discount: { coupon: { percent_off: 25 } } }).amountCents).toBe(599);
    expect(normalizeSubscription('e', 't', 1, { ...sub, discount: { coupon: { amount_off: 1000 } } }).amountCents).toBe(0);
    expect(normalizeSubscription('e', 't', 1, { ...sub, current_period_end: 5 }).currentPeriodEnd).toBe(5);
  });
});
