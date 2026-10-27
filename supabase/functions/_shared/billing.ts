/**
 * Harada Pro billing with Stripe: checkout, the customer portal and the webhook (docs/PREMIUM_SYSTEM.md).
 *
 * Pure and dependency-injected (standard Request/Response and fetch only), so it runs under Deno in the Edge
 * Functions (billing-checkout, billing-portal, stripe-webhook) and is unit-tested under Node. Self-contained on
 * purpose: Deno needs `.ts` import suffixes that the app's TypeScript config refuses.
 *
 * What is trusted: only Stripe's signed webhook changes a subscription (billing_apply, service role). Checkout
 * and portal merely send the signed-in user to Stripe; their own responses never grant anything.
 */

export type BillingErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'CONFLICT'
  | 'NOT_CONFIGURED'
  | 'UNAVAILABLE'
  | 'INTERNAL';

export interface PriceRow {
  id: string;
  stripePriceId: string | null;
  amountCents: number;
  currency: string;
  interval: 'month' | 'year';
  active: boolean;
}

export interface BillingConfig {
  /** Stripe secret key (sk_test_… or sk_live_…). Unset: billing answers NOT_CONFIGURED. */
  stripeSecretKey?: string;
  /** Live keys are refused unless this is true (a non-production deploy can only ever use Stripe test mode). */
  allowLiveMode?: boolean;
  /** Public web app origin for Stripe's return pages, e.g. https://harada.app. */
  appUrl?: string;
  allowedOrigins?: readonly string[];
}

export interface CheckoutDeps {
  getUser(accessToken: string): Promise<{ id: string; email: string | null } | null>;
  getPrice(id: string): Promise<PriceRow | null>;
  /** The user's plan as the database computes it, and whether a Stripe subscription currently backs it. */
  getPlan(userId: string): Promise<{ plan: 'free' | 'pro'; stripeActive: boolean }>;
  customerOf(userId: string): Promise<string | null>;
  linkCustomer(userId: string, customerId: string): Promise<void>;
  track?(userId: string, name: string, props: Record<string, string | number | boolean>): Promise<void>;
  fetch: typeof fetch;
  logError?(message: string, detail: unknown): void;
}

export interface WebhookDeps {
  webhookSecret?: string;
  /** public.billing_apply (service role): 'applied' | 'duplicate' | 'ignored'. */
  apply(event: NormalizedEvent): Promise<string>;
  linkCustomer(userId: string, customerId: string): Promise<void>;
  /** Fetches a subscription (to normalise checkout.session.completed); injected for tests. */
  fetchSubscription?(id: string): Promise<StripeSubscription | null>;
  logError?(message: string, detail: unknown): void;
  /** Seconds since the epoch; injected for tests. */
  now?(): number;
}

const MAX_BODY_BYTES = 4096;
const MAX_WEBHOOK_BYTES = 512 * 1024;
const SIGNATURE_TOLERANCE_S = 300;
const STRIPE_API = 'https://api.stripe.com/v1';

// ---------------------------------------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------------------------------------

function corsHeaders(req: Request, allowed: readonly string[] = []): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    vary: 'Origin',
  };
}

function responder(req: Request, allowed?: readonly string[]) {
  const cors = corsHeaders(req, allowed);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
  const fail = (status: number, code: BillingErrorCode, message: string) => json(status, { ok: false, error: { code, message } });
  return { cors, json, fail };
}

async function readJson(req: Request, max = MAX_BODY_BYTES): Promise<unknown | Error> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return new Error('too large');
  const text = await req.text();
  if (text.length > max) return new Error('too large');
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    return new Error('invalid');
  }
}

/** Configuration problems a deploy must fix, or null when billing can talk to Stripe. */
export function billingConfigError(config: BillingConfig): string | null {
  const key = config.stripeSecretKey ?? '';
  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(key) && !/^rk_(test|live)_[A-Za-z0-9]+$/.test(key)) return 'STRIPE_SECRET_KEY is not set';
  if (/_live_/.test(key) && !config.allowLiveMode) return 'A live Stripe key is set but ALLOW_LIVE_BILLING is not true';
  if (!config.appUrl || !/^https?:\/\/[^/]+$/.test(config.appUrl)) return 'APP_URL must be an origin like https://harada.app';
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Stripe REST (form-encoded)
// ---------------------------------------------------------------------------------------------------------

export function formEncode(params: Record<string, string | number | boolean | undefined>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) out.append(k, String(v));
  return out.toString();
}

export class StripeError extends Error {
  constructor(public readonly status: number, public readonly stripeCode: string | undefined) {
    super(`Stripe request failed (${status}${stripeCode ? `, ${stripeCode}` : ''})`);
  }
}

export async function stripeRequest<T>(
  doFetch: typeof fetch,
  key: string,
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  idempotencyKey?: string,
): Promise<T> {
  const res = await doFetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: method === 'POST' ? formEncode(params ?? {}) : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
  if (!res.ok) throw new StripeError(res.status, body.error?.code);
  return body as T;
}

// ---------------------------------------------------------------------------------------------------------
// Checkout and portal
// ---------------------------------------------------------------------------------------------------------

/**
 * POST {priceId: 'pro_monthly' | 'pro_annual'} with the user's bearer token → {url} of a Stripe Checkout page.
 * Refuses when the user already has an active Stripe subscription (they manage it in the portal instead), and
 * when Stripe's price differs from the price Harada displays (amount, currency or interval).
 */
export async function handleCheckout(req: Request, config: BillingConfig, deps: CheckoutDeps): Promise<Response> {
  const { cors, json, fail } = responder(req, config.allowedOrigins);
  if (req.method === 'OPTIONS') return new Response(null, { status: cors['access-control-allow-origin'] ? 204 : 403, headers: cors });
  if (req.method !== 'POST') return fail(405, 'VALIDATION', 'Use POST');
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) return fail(401, 'UNAUTHENTICATED', 'Please sign in');
  const body = await readJson(req);
  if (body instanceof Error) return fail(400, 'VALIDATION', 'Invalid request body');
  const priceId = (body as { priceId?: unknown }).priceId;
  if (priceId !== 'pro_monthly' && priceId !== 'pro_annual') return fail(400, 'VALIDATION', 'Choose monthly or annual billing');

  const configError = billingConfigError(config);
  if (configError) {
    deps.logError?.('billing-checkout not configured', configError);
    return fail(503, 'NOT_CONFIGURED', 'Upgrades are not available yet. Nothing was charged.');
  }
  const key = config.stripeSecretKey!;

  try {
    const user = await deps.getUser(token);
    if (!user) return fail(401, 'UNAUTHENTICATED', 'Please sign in');
    const price = await deps.getPrice(priceId);
    if (!price || !price.active || !price.stripePriceId) {
      deps.logError?.('billing-checkout price not configured', priceId);
      return fail(503, 'NOT_CONFIGURED', 'This plan is not available yet. Nothing was charged.');
    }
    const plan = await deps.getPlan(user.id);
    if (plan.stripeActive) {
      return fail(409, 'CONFLICT', 'You already have Harada Pro. Manage or change it from Billing.');
    }

    const stripePrice = await stripeRequest<{ active: boolean; unit_amount: number | null; currency: string; recurring: { interval: string } | null }>(
      deps.fetch, key, 'GET', `/prices/${encodeURIComponent(price.stripePriceId)}`);
    if (!stripePrice.active || stripePrice.unit_amount !== price.amountCents || stripePrice.currency !== price.currency
        || stripePrice.recurring?.interval !== price.interval) {
      deps.logError?.('billing-checkout price mismatch', { priceId });
      return fail(503, 'NOT_CONFIGURED', 'This plan is not available right now. Nothing was charged.');
    }

    let customer = await deps.customerOf(user.id);
    if (!customer) {
      const created = await stripeRequest<{ id: string }>(deps.fetch, key, 'POST', '/customers', {
        email: user.email ?? undefined,
        'metadata[user_id]': user.id,
      }, `customer-${user.id}`);
      customer = created.id;
      await deps.linkCustomer(user.id, customer);
    }

    const session = await stripeRequest<{ url: string }>(deps.fetch, key, 'POST', '/checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      'line_items[0][price]': price.stripePriceId,
      'line_items[0][quantity]': 1,
      'subscription_data[metadata][user_id]': user.id,
      'metadata[user_id]': user.id,
      success_url: `${config.appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appUrl}/billing/cancel`,
    });
    await deps.track?.(user.id, 'checkout_started', { price: priceId, interval: price.interval }).catch(() => undefined);
    return json(200, { ok: true, data: { url: session.url } });
  } catch (e) {
    deps.logError?.('billing-checkout failed', e instanceof Error ? e.message : 'unknown');
    return fail(502, 'UNAVAILABLE', 'Could not reach the payment provider. Nothing was charged — please try again.');
  }
}

/** POST (no body) with the user's bearer token → {url} of the Stripe customer portal (update card, cancel, switch plan). */
export async function handlePortal(req: Request, config: BillingConfig, deps: Pick<CheckoutDeps, 'getUser' | 'customerOf' | 'fetch' | 'logError'>): Promise<Response> {
  const { cors, json, fail } = responder(req, config.allowedOrigins);
  if (req.method === 'OPTIONS') return new Response(null, { status: cors['access-control-allow-origin'] ? 204 : 403, headers: cors });
  if (req.method !== 'POST') return fail(405, 'VALIDATION', 'Use POST');
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) return fail(401, 'UNAUTHENTICATED', 'Please sign in');
  const configError = billingConfigError(config);
  if (configError) {
    deps.logError?.('billing-portal not configured', configError);
    return fail(503, 'NOT_CONFIGURED', 'Billing is not available yet.');
  }
  try {
    const user = await deps.getUser(token);
    if (!user) return fail(401, 'UNAUTHENTICATED', 'Please sign in');
    const customer = await deps.customerOf(user.id);
    if (!customer) return fail(409, 'CONFLICT', 'There is no billing account yet. Upgrade first.');
    const session = await stripeRequest<{ url: string }>(deps.fetch, config.stripeSecretKey!, 'POST', '/billing_portal/sessions', {
      customer,
      return_url: `${config.appUrl}/account/billing`,
    });
    return json(200, { ok: true, data: { url: session.url } });
  } catch (e) {
    deps.logError?.('billing-portal failed', e instanceof Error ? e.message : 'unknown');
    return fail(502, 'UNAVAILABLE', 'Could not reach the payment provider. Please try again.');
  }
}

// ---------------------------------------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------------------------------------

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Stripe's v1 scheme: HMAC-SHA256 of `${t}.${payload}` with the endpoint secret, within a 5-minute window. */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string, nowS: number): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.trim().split('=') as [string, string]);
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false;
  if (Math.abs(nowS - Number(t)) > SIGNATURE_TOLERANCE_S) return false;
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(`${t}.${payload}`)));
  return signatures.some((s) => timingSafeEqual(s, expected));
}

export interface StripeSubscription {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  current_period_end?: number;
  metadata?: Record<string, string>;
  discount?: { coupon?: { percent_off?: number | null; amount_off?: number | null } } | null;
  items?: { data?: { quantity?: number; current_period_end?: number; price?: { id: string; unit_amount?: number | null; recurring?: { interval?: string } | null } }[] };
}

/** The shape public.billing_apply takes. */
export interface NormalizedEvent {
  eventId: string;
  eventType: string;
  created: number;
  customerId: string;
  userId?: string;
  subscriptionId?: string;
  status?: string;
  stripePriceId?: string;
  amountCents?: number;
  interval?: string;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: number | null;
}

const idOf = (x: string | { id: string } | null | undefined) => (typeof x === 'string' ? x : x?.id);

/** Subscription state as billing_apply stores it. The amount is what one interval costs after a simple coupon. */
export function normalizeSubscription(eventId: string, eventType: string, created: number, s: StripeSubscription): NormalizedEvent {
  const item = s.items?.data?.[0];
  const base = (item?.price?.unit_amount ?? 0) * (item?.quantity ?? 1);
  const coupon = s.discount?.coupon;
  let amount = base;
  if (coupon?.percent_off) amount = Math.round(base * (1 - coupon.percent_off / 100));
  else if (coupon?.amount_off) amount = Math.max(0, base - coupon.amount_off);
  return {
    eventId,
    eventType,
    created,
    customerId: idOf(s.customer)!,
    userId: s.metadata?.user_id,
    subscriptionId: s.id,
    status: s.status,
    stripePriceId: item?.price?.id,
    amountCents: item?.price ? amount : undefined,
    interval: item?.price?.recurring?.interval,
    // Newer Stripe API versions report the period on the item rather than the subscription.
    currentPeriodEnd: s.current_period_end ?? item?.current_period_end,
    cancelAtPeriodEnd: s.cancel_at_period_end ?? false,
    canceledAt: s.canceled_at ?? null,
  };
}

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed',
]);
const RECORDED_EVENTS = new Set(['invoice.payment_failed', 'invoice.paid', 'invoice.payment_succeeded']);

/**
 * The Stripe webhook. Verifies the signature against the raw body, then applies subscription events through
 * billing_apply (idempotent on the event id, ordered by event time). Answers 200 for events it does not use,
 * 400 for a bad signature, and 500 (Stripe retries) only when the database could not be updated.
 */
export async function handleStripeWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  if (!deps.webhookSecret || !deps.webhookSecret.startsWith('whsec_')) {
    deps.logError?.('stripe-webhook not configured', 'STRIPE_WEBHOOK_SECRET is not set');
    return json(503, { error: 'not configured' });
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_WEBHOOK_BYTES) return json(413, { error: 'too large' });
  const payload = await req.text();
  if (payload.length > MAX_WEBHOOK_BYTES) return json(413, { error: 'too large' });
  const now = deps.now?.() ?? Math.floor(Date.now() / 1000);
  if (!(await verifyStripeSignature(payload, req.headers.get('stripe-signature'), deps.webhookSecret, now))) {
    return json(400, { error: 'invalid signature' });
  }

  let event: { id: string; type: string; created: number; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return json(400, { error: 'invalid payload' });
  }

  try {
    const obj = event.data?.object ?? {};
    if (SUBSCRIPTION_EVENTS.has(event.type)) {
      const result = await deps.apply(normalizeSubscription(event.id, event.type, event.created, obj as unknown as StripeSubscription));
      return json(200, { received: true, result });
    }
    if (event.type === 'checkout.session.completed') {
      const session = obj as { customer?: string | { id: string }; client_reference_id?: string | null; subscription?: string | { id: string } | null; mode?: string };
      const customer = idOf(session.customer);
      const userId = session.client_reference_id ?? undefined;
      if (session.mode !== 'subscription' || !customer) return json(200, { received: true, result: 'ignored' });
      if (userId && /^[0-9a-f-]{36}$/.test(userId)) await deps.linkCustomer(userId, customer);
      const subId = idOf(session.subscription);
      const sub = subId && deps.fetchSubscription ? await deps.fetchSubscription(subId) : null;
      const result = await deps.apply(sub
        ? { ...normalizeSubscription(event.id, event.type, event.created, sub), userId: userId ?? sub.metadata?.user_id }
        : { eventId: event.id, eventType: event.type, created: event.created, customerId: customer, userId, subscriptionId: subId });
      return json(200, { received: true, result });
    }
    if (RECORDED_EVENTS.has(event.type)) {
      const invoice = obj as { customer?: string | { id: string }; subscription?: string | { id: string } | null };
      const customer = idOf(invoice.customer);
      if (!customer) return json(200, { received: true, result: 'ignored' });
      const result = await deps.apply({ eventId: event.id, eventType: event.type, created: event.created, customerId: customer, subscriptionId: idOf(invoice.subscription) });
      return json(200, { received: true, result });
    }
    return json(200, { received: true, result: 'unused' });
  } catch (e) {
    deps.logError?.('stripe-webhook failed', e instanceof Error ? e.message : 'unknown');
    return json(500, { error: 'not applied' });
  }
}
