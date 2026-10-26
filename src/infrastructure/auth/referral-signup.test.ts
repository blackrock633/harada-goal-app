import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as uc from '@/application/use-cases';
import { createTestDeps, type TestDeps } from '../testing/create-test-deps';

/**
 * Referral capture: /signup?ref=<code> → hidden form field → signUp use case → `referral_code` in Supabase sign-up
 * metadata → the handle_new_user trigger attributes the referral. The trigger runs for real on PGlite here.
 */
const signUpCalls: unknown[] = [];
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      signUp: async (args: unknown) => {
        signUpCalls.push(args);
        return { data: { user: { id: 'new-user', email: 'x@example.com' }, session: null }, error: null };
      },
    },
  })),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));

describe('referral sign-up (PGlite + real trigger)', () => {
  let t: TestDeps;
  beforeEach(async () => {
    t = await createTestDeps();
  });
  afterEach(async () => {
    await t.close();
  });

  async function codeOf(userId: string): Promise<string> {
    const r = await t.client.query<{ referral_code: string }>('select referral_code from public.profiles where id = $1', [userId]);
    return r.rows[0]!.referral_code;
  }
  async function referralsOf(referrerId: string) {
    return (await t.client.query('select referred_id from public.referrals where referrer_id = $1', [referrerId])).rows;
  }

  it('a valid code from the form attributes the referral', async () => {
    const referrer = await t.createUser();
    const code = await codeOf(referrer);
    const res = await uc.signUp(t.deps, {
      email: 'friend@example.com', password: 'longenough1', displayName: 'Friend', timeZone: 'UTC', referralCode: code,
    });
    expect(res.ok).toBe(true);
    const rows = await referralsOf(referrer);
    expect(rows).toHaveLength(1);
    expect((rows[0] as { referred_id: string }).referred_id).toBe(res.ok ? res.data.userId : '');
  });

  it('an invalid code is dropped and sign-up still succeeds', async () => {
    const referrer = await t.createUser();
    const res = await uc.signUp(t.deps, {
      email: 'friend2@example.com', password: 'longenough1', displayName: 'Friend', timeZone: 'UTC', referralCode: "x' or 1=1",
    });
    expect(res.ok).toBe(true);
    expect(await referralsOf(referrer)).toHaveLength(0);
  });

  it('no code: no referral', async () => {
    const referrer = await t.createUser();
    await uc.signUp(t.deps, { email: 'f3@example.com', password: 'longenough1', displayName: 'F', timeZone: 'UTC' });
    expect(await referralsOf(referrer)).toHaveLength(0);
  });
});

describe('SupabaseAuthGateway.signUp metadata', () => {
  beforeEach(() => {
    signUpCalls.length = 0;
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-anon-key');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('passes referral_code in the sign-up metadata when present', async () => {
    const { SupabaseAuthGateway } = await import('./supabase-auth-gateway');
    await new SupabaseAuthGateway().signUp({
      email: 'x@example.com', password: 'longenough1', displayName: 'X', timeZone: 'UTC', referralCode: 'abcdef0123',
    });
    expect(signUpCalls[0]).toMatchObject({
      options: { data: { display_name: 'X', time_zone: 'UTC', referral_code: 'abcdef0123' } },
    });
  });

  it('omits referral_code when there is none', async () => {
    const { SupabaseAuthGateway } = await import('./supabase-auth-gateway');
    await new SupabaseAuthGateway().signUp({ email: 'x@example.com', password: 'longenough1', displayName: 'X', timeZone: 'UTC' });
    const data = (signUpCalls[0] as { options: { data: Record<string, unknown> } }).options.data;
    expect(data).not.toHaveProperty('referral_code');
  });
});
