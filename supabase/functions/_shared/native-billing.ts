/** RevenueCat owns native store transactions only. Stripe remains the web billing authority. */
export interface NativeConfig {
  apiKey?: string;
  webhookAuthorization?: string;
  entitlement: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  products: readonly string[];
  allowedOrigins?: readonly string[];
}
export interface NativeState {
  productId: string | null;
  store: string | null;
  expiresAt: string | null;
  status: 'none' | 'active' | 'expired' | 'revoked' | 'grace_period';
  cancelAtPeriodEnd: boolean;
  environment: string;
}
export interface CustomerInfo {
  subscriber: {
    entitlements: Record<
      string,
      {
        product_identifier: string;
        expires_date: string | null;
        grace_period_expires_date?: string | null;
      }
    >;
    subscriptions: Record<
      string,
      {
        is_sandbox: boolean;
        store: string;
        refunded_at?: string | null;
        unsubscribe_detected_at?: string | null;
        billing_issues_detected_at?: string | null;
      }
    >;
  };
}
export interface NativeDeps {
  fetch: typeof fetch;
  getUser(token: string): Promise<{ id: string } | null>;
  identityFor(user: string): Promise<string>;
  userFor(identity: string): Promise<string | null>;
  nextGeneration(): Promise<number>;
  apply(user: string, event: string, generation: number, state: NativeState): Promise<unknown>;
  logError?(code: string): void;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function nativeState(
  info: CustomerInfo,
  config: NativeConfig,
  now = Date.now(),
): NativeState {
  const empty: NativeState = {
    productId: null,
    store: null,
    expiresAt: null,
    status: 'none',
    cancelAtPeriodEnd: false,
    environment: config.environment,
  };
  if (!info.subscriber?.entitlements || !info.subscriber.subscriptions)
    throw new Error('invalid_provider_response');
  const e = info.subscriber.entitlements[config.entitlement];
  if (!e) return empty;
  const sub = info.subscriber.subscriptions[e.product_identifier];
  // No promotional/lifetime, Stripe, unknown product or test-store transaction can grant native access.
  if (
    !sub ||
    !config.products.includes(e.product_identifier) ||
    !['app_store', 'play_store'].includes(sub.store)
  )
    return empty;
  if (typeof sub.is_sandbox !== 'boolean' || sub.is_sandbox !== (config.environment === 'SANDBOX'))
    return empty;
  const expiry = e.grace_period_expires_date ?? e.expires_date;
  if (!expiry || !Number.isFinite(Date.parse(expiry))) return empty;
  return {
    ...empty,
    productId: e.product_identifier,
    store: sub.store,
    expiresAt: expiry,
    status: sub.refunded_at
      ? 'revoked'
      : Date.parse(expiry) <= now
        ? 'expired'
        : e.grace_period_expires_date
          ? 'grace_period'
          : 'active',
    cancelAtPeriodEnd: !!sub.unsubscribe_detected_at,
  };
}
export async function syncNative(
  user: string,
  event: string,
  config: NativeConfig,
  deps: NativeDeps,
) {
  if (!config.apiKey || !config.products.length) throw new Error('not_configured');
  const identity = await deps.identityFor(user);
  const generation = await deps.nextGeneration();
  const res = await deps.fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(identity)}`,
    {
      headers: { authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!res.ok) throw new Error('provider_unavailable');
  return deps.apply(
    user,
    event,
    generation,
    nativeState((await res.json()) as CustomerInfo, config),
  );
}
export async function sameSecret(a: string, b: string) {
  const digest = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  const xx = new Uint8Array(x),
    yy = new Uint8Array(y);
  for (let i = 0; i < xx.length; i++) diff |= xx[i]! ^ yy[i]!;
  return diff === 0;
}
export async function handleNativeBilling(
  req: Request,
  config: NativeConfig,
  deps: NativeDeps,
  webhook = false,
): Promise<Response> {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  };
  if (origin && config.allowedOrigins?.includes(origin))
    Object.assign(headers, {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      vary: 'Origin',
    });
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS' && !webhook)
    return new Response(null, {
      status: headers['access-control-allow-origin'] ? 204 : 403,
      headers,
    });
  if (req.method !== 'POST') return reply(405, { ok: false });
  if (!config.apiKey || !config.products.length)
    return reply(503, {
      ok: false,
      error: { code: 'NOT_CONFIGURED', message: 'Store billing is not configured yet.' },
    });
  try {
    if (webhook) {
      if (!config.webhookAuthorization || config.webhookAuthorization.length < 32)
        return reply(503, { ok: false });
      if (!(await sameSecret(req.headers.get('authorization') ?? '', config.webhookAuthorization)))
        return reply(401, { ok: false });
      const raw = await req.text();
      if (raw.length > 65536) return reply(413, { ok: false });
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply(400, { ok: false });
      }
      const e = body?.event;
      if (!e || typeof e.id !== 'string' || e.id.length > 200) return reply(400, { ok: false });
      if (e.environment !== config.environment)
        return reply(400, { ok: false, error: 'environment_mismatch' });
      // Transfers invalidate the former owners too. Never trust the event's entitlement fields.
      const users = [
        ...new Set([e.app_user_id, ...(e.transferred_from ?? []), ...(e.transferred_to ?? [])]),
      ].filter((id): id is string => typeof id === 'string' && UUID.test(id));
      if (users.length > 20) return reply(400, { ok: false });
      for (const identity of users) {
        const user = await deps.userFor(identity);
        if (user) await syncNative(user, `${e.id}:${user}`, config, deps);
      }
      return reply(200, { ok: true });
    }
    const token = /^Bearer (\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    const user = token ? await deps.getUser(token) : null;
    if (!user)
      return reply(401, {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'Please sign in' },
      });
    await syncNative(user.id, `sync:${crypto.randomUUID()}`, config, deps);
    return reply(200, { ok: true, data: { synchronized: true } });
  } catch {
    deps.logError?.('native_billing_sync_failed');
    return reply(503, {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'Purchase verification is delayed. Check your plan again shortly.',
      },
    });
  }
}
