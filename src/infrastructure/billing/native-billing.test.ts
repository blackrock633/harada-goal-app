import { describe, it, expect, vi } from 'vitest';
import {
  handleNativeBilling,
  nativeState,
  type NativeConfig,
  type NativeDeps,
  type CustomerInfo,
} from '../../../supabase/functions/_shared/native-billing';
const USER = '11111111-1111-4111-8111-111111111111';
const config: NativeConfig = {
  apiKey: 'secret',
  webhookAuthorization: 'Bearer ' + 'a'.repeat(40),
  entitlement: 'harada_pro',
  environment: 'SANDBOX',
  products: ['monthly', 'annual'],
};
function info(over: Record<string, unknown> = {}): CustomerInfo {
  return {
    subscriber: {
      entitlements: {
        harada_pro: { product_identifier: 'monthly', expires_date: '2099-01-01T00:00:00Z' },
      },
      subscriptions: { monthly: { store: 'app_store', is_sandbox: true, ...over } },
    },
  };
}
function deps(over: Partial<NativeDeps> = {}): NativeDeps {
  return {
    fetch: vi.fn(async () => Response.json(info())),
    getUser: vi.fn(async (t) => (t === 'good' ? { id: USER } : null)),
    identityFor: vi.fn(async () => USER),
    userFor: vi.fn(async () => USER),
    nextGeneration: vi.fn(async () => 12),
    apply: vi.fn(async () => 'applied'),
    ...over,
  };
}
const req = (body: unknown, auth: string | null = config.webhookAuthorization!) =>
  new Request('https://example.test', {
    method: 'POST',
    headers: auth ? { authorization: auth } : {},
    body: JSON.stringify(body),
  });
describe('native billing authority', () => {
  it.each(['monthly', 'annual'])('allows verified %s native subscriptions', (product) => {
    const i = info();
    i.subscriber.entitlements.harada_pro!.product_identifier = product;
    i.subscriber.subscriptions[product] = i.subscriber.subscriptions.monthly!;
    expect(nativeState(i, config).status).toBe('active');
  });
  it('preserves cancellation until expiration and handles refunds', () => {
    expect(nativeState(info({ unsubscribe_detected_at: '2026-01-01' }), config)).toMatchObject({
      status: 'active',
      cancelAtPeriodEnd: true,
    });
    expect(nativeState(info({ refunded_at: '2026-01-01' }), config).status).toBe('revoked');
    expect(nativeState(info(), config, Date.parse('2100-01-01')).status).toBe('expired');
  });
  it('uses only provider grace, and denies missing expiry', () => {
    const i = info();
    i.subscriber.entitlements.harada_pro!.grace_period_expires_date = '2099-02-01';
    expect(nativeState(i, config).status).toBe('grace_period');
    i.subscriber.entitlements.harada_pro!.grace_period_expires_date = null;
    i.subscriber.entitlements.harada_pro!.expires_date = null;
    expect(nativeState(i, config).status).toBe('none');
  });
  it('rejects production/test mixing, Stripe imports and unknown products', () => {
    expect(nativeState(info(), { ...config, environment: 'PRODUCTION' }).status).toBe('none');
    expect(nativeState(info({ store: 'stripe' }), config).status).toBe('none');
    expect(nativeState(info(), { ...config, products: ['other'] }).status).toBe('none');
  });
  it('rejects forged and wrong-environment webhooks', async () => {
    const d = deps();
    expect(
      (await handleNativeBilling(req({ event: { id: 'a' } }, 'wrong'), config, d, true)).status,
    ).toBe(401);
    expect(
      (
        await handleNativeBilling(
          req({ event: { id: 'a', environment: 'PRODUCTION' } }),
          config,
          d,
          true,
        )
      ).status,
    ).toBe(400);
    expect(d.fetch).not.toHaveBeenCalled();
  });
  it('retrieves current state instead of trusting event entitlement claims', async () => {
    const d = deps();
    const response = await handleNativeBilling(
      req({ event: { id: 'evt', environment: 'SANDBOX', app_user_id: USER, expiration_at_ms: 0 } }),
      config,
      d,
      true,
    );
    expect(response.status).toBe(200);
    expect(d.apply).toHaveBeenCalledWith(
      USER,
      `evt:${USER}`,
      12,
      expect.objectContaining({ status: 'active' }),
    );
  });
  it('does not erase valid state on provider failure; returns retryable error', async () => {
    const d = deps({ fetch: vi.fn(async () => new Response(null, { status: 500 })) });
    expect(
      (
        await handleNativeBilling(
          req({ event: { id: 'evt', environment: 'SANDBOX', app_user_id: USER } }),
          config,
          d,
          true,
        )
      ).status,
    ).toBe(503);
    expect(d.apply).not.toHaveBeenCalled();
  });
  it('authenticates restoration and ignores client user/status claims', async () => {
    const d = deps();
    expect((await handleNativeBilling(req({}, null), config, d)).status).toBe(401);
    expect(
      (
        await handleNativeBilling(
          req({ userId: 'victim', status: 'active' }, 'Bearer good'),
          config,
          d,
        )
      ).status,
    ).toBe(200);
    expect(d.identityFor).toHaveBeenCalledWith(USER);
  });
  it('reconciles both sides of transfers', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    const d = deps({ userFor: vi.fn(async (x) => x) });
    await handleNativeBilling(
      req({
        event: {
          id: 'transfer',
          environment: 'SANDBOX',
          transferred_from: [USER],
          transferred_to: [other],
        },
      }),
      config,
      d,
      true,
    );
    expect(d.apply).toHaveBeenCalledTimes(2);
  });
});
