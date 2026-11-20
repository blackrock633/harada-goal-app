import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDeps, type TestDeps } from '@/infrastructure/testing/create-test-deps';
import type { Transaction } from '@electric-sql/pglite';
let t: TestDeps;
async function as<T>(user: string, fn: (tx: Transaction) => Promise<T>) {
  return t.client.transaction(async (tx) => {
    await tx.query(
      `select set_config('role','authenticated',true),set_config('request.jwt.claims',$1,true)`,
      [JSON.stringify({ sub: user, role: 'authenticated' })],
    );
    return fn(tx);
  });
}
async function call<T = unknown>(user: string, name: string, args: unknown[] = []) {
  return as(
    user,
    async (tx) =>
      (
        await tx.query<{ v: T }>(
          `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) v`,
          args,
        )
      ).rows[0]!.v,
  );
}
const plan = (u: string) => call<{ plan: string }>(u, 'get_my_plan');
const apply = (u: string, id: string, generation: number, state: unknown) =>
  t.client.query('select public.native_billing_apply($1,$2,$3,$4)', [
    u,
    id,
    generation,
    JSON.stringify(state),
  ]);
const state = {
  productId: 'monthly',
  store: 'app_store',
  expiresAt: '2099-01-01',
  status: 'active',
  environment: 'SANDBOX',
};
beforeAll(async () => {
  t = await createTestDeps();
});
afterAll(() => t?.close());
describe('monetization security and lifecycle', () => {
  it('grants/revokes are authorized and audited independently of founding identity', async () => {
    const admin = await t.createUser(),
      user = await t.createUser();
    await expect(call(user, 'admin_entitlement', [user, 'grant', 'self grant'])).rejects.toThrow(
      'Administrator',
    );
    await t.client.query('insert into public.admins(user_id) values($1)', [admin]);
    await call(admin, 'admin_entitlement', [user, 'founding', 'Approved founding application']);
    expect((await plan(user)).plan).toBe('free');
    const grant = await call<string>(admin, 'admin_entitlement', [
      user,
      'grant',
      'Complimentary founding access',
    ]);
    expect((await plan(user)).plan).toBe('pro');
    await call(admin, 'admin_entitlement', [user, 'revoke', 'Complimentary access revoked', grant]);
    expect((await plan(user)).plan).toBe('free');
    expect(
      (await t.client.query('select * from public.founding_members where user_id=$1', [user])).rows,
    ).toHaveLength(1);
    expect(
      (await t.client.query('select * from public.entitlement_audit where user_id=$1', [user]))
        .rows,
    ).toHaveLength(3);
  });
  it('enforces the Founding 100 capacity transactionally', async () => {
    const admin = await t.createUser();
    await t.client.query('insert into public.admins(user_id) values($1)', [admin]);
    // Fill remaining capacity without creating grants; the final allocation must fail without side effects.
    const max = (
      await t.client.query<{ n: number }>('select max(member_number) n from founding_members')
    ).rows[0]!.n;
    for (let i = max + 1; i <= 100; i++) {
      const u = await t.createUser();
      await call(admin, 'admin_entitlement', [u, 'founding', 'Approved application']);
    }
    const extra = await t.createUser();
    await expect(
      call(admin, 'admin_entitlement', [extra, 'founding', 'Over capacity']),
    ).rejects.toThrow('full');
    expect((await t.client.query('select * from founding_members')).rows).toHaveLength(100);
  });
  it('keeps native subscriptions isolated and supports expiry, cancellation, replay and stale-response protection', async () => {
    const user = await t.createUser(),
      other = await t.createUser();
    await apply(user, 'native1', 10, { ...state, cancelAtPeriodEnd: true });
    expect((await plan(user)).plan).toBe('pro');
    expect((await plan(other)).plan).toBe('free');
    await apply(user, 'native2', 12, { ...state, status: 'revoked' });
    expect((await plan(user)).plan).toBe('free');
    await apply(user, 'native3', 11, state);
    expect((await plan(user)).plan).toBe('free');
    await apply(user, 'native2', 13, state);
    expect((await plan(user)).plan).toBe('free');
    await apply(user, 'native4', 14, state);
    expect((await plan(user)).plan).toBe('pro');
    await apply(user, 'native5', 15, { ...state, expiresAt: '2000-01-01' });
    expect((await plan(user)).plan).toBe('free');
    await expect(
      apply(user, 'native6', 16, { ...state, environment: 'PRODUCTION' }),
    ).rejects.toThrow('environment');
    await expect(
      as(user, (tx) => tx.query('update native_subscriptions set expires_at=$1', ['2099-01-01'])),
    ).rejects.toThrow();
    await expect(
      as(other, (tx) => tx.query('select * from native_subscriptions')),
    ).rejects.toThrow();
    await expect(
      call(user, 'native_billing_apply', [user, 'forged', 99, JSON.stringify(state)]),
    ).rejects.toThrow();
  });
  it('billing identities are stable across devices and inaccessible to other users', async () => {
    const a = await t.createUser(),
      b = await t.createUser();
    const id = await call(a, 'my_billing_identity');
    expect(await call(a, 'my_billing_identity')).toBe(id);
    expect(id).not.toBe(a);
    expect(await call(b, 'my_billing_identity')).not.toBe(id);
    await expect(call(b, 'billing_identity_for', [a])).rejects.toThrow();
  });
  it('checkout retries reuse one attempt and reject competing plans', async () => {
    const u = await t.createUser();
    const q = (p: string) =>
      t.client.query<{ v: unknown }>('select billing_checkout_attempt($1,$2) v', [u, p]);
    expect((await q('pro_monthly')).rows[0]!.v).toEqual((await q('pro_monthly')).rows[0]!.v);
    await expect(q('pro_annual')).rejects.toThrow('already open');
    await expect(call(u, 'billing_checkout_attempt', [u, 'pro_monthly'])).rejects.toThrow();
  });
  it('null Stripe expiry cannot grant indefinite access; refunds cannot be undone by delayed active state', async () => {
    const u = await t.createUser();
    await t.client.query("update prices set stripe_price_id='price_pro' where id='pro_monthly'");
    await t.client.query("select billing_link_customer($1,'cus_refund')", [u]);
    const base = {
      eventId: 'evt_refund1',
      eventType: 'subscription',
      customerId: 'cus_refund',
      subscriptionId: 'sub_refund',
      status: 'active',
      stripePriceId: 'price_pro',
      created: Date.now() / 1000,
      generation: 20,
      livemode: false,
    };
    const write = (s: unknown) => t.client.query('select billing_apply($1)', [JSON.stringify(s)]);
    await write(base);
    expect((await plan(u)).plan).toBe('free');
    await write({ ...base, eventId: 'evt_refund2', generation: 21, currentPeriodEnd: 4000000000 });
    expect((await plan(u)).plan).toBe('pro');
    await write({
      ...base,
      eventId: 'evt_refund3',
      generation: 22,
      currentPeriodEnd: 4000000000,
      revoked: true,
    });
    expect((await plan(u)).plan).toBe('free');
    await write({ ...base, eventId: 'evt_refund4', generation: 23, currentPeriodEnd: 4000000000 });
    expect((await plan(u)).plan).toBe('free');
    await expect(
      write({ ...base, eventId: 'evt_wrong_mode', generation: 24, livemode: true }),
    ).rejects.toThrow('environment');
    await expect(
      write({ ...base, eventId: 'evt_wrong_owner', generation: 24, userId: await t.createUser() }),
    ).rejects.toThrow('ownership');
  });
});
