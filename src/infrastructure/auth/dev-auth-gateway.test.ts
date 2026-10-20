import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGatewayError } from '@/application/ports';
import { createTestDeps, type TestDeps } from '../testing/create-test-deps';

// MOCKED: next/headers cookies() is replaced by an in-memory jar. Dev auth only; not Supabase.
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));

import { DevAuthGateway } from './dev-auth-gateway';
import { createAuthGateway } from './index';

describe('DevAuthGateway (dev-only, mocked cookies)', () => {
  let t: TestDeps;
  let gw: DevAuthGateway;
  beforeAll(async () => {
    vi.stubEnv('AUTH_PROVIDER', 'dev');
    vi.stubEnv('DEV_AUTH_SECRET', 'test-secret-test-secret');
    t = await createTestDeps();
    gw = new DevAuthGateway(t.db);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await t.close();
  });
  beforeEach(() => jar.clear());

  it('signs up, creates the profile via the real trigger, and reads the user back', async () => {
    const { user, confirmed } = await gw.signUp({ email: 'D@Example.test', password: 'longenough1', displayName: 'Dee', timeZone: 'Europe/Paris' });
    expect(confirmed).toBe(true);
    expect(user.email).toBe('d@example.test');
    expect((await gw.getUser())?.id).toBe(user.id);
    const p = await t.deps.uow.run(user.id, (r) => r.profiles.findById(user.id));
    expect(p).toMatchObject({ displayName: 'Dee', timeZone: 'Europe/Paris' });
  });

  it('rejects duplicate email, weak password, bad credentials', async () => {
    await expect(gw.signUp({ email: 'd@example.test', password: 'longenough1', displayName: 'x', timeZone: 'UTC' })).rejects.toMatchObject({ reason: 'EMAIL_TAKEN' });
    await expect(gw.signUp({ email: 'w@example.test', password: 'short', displayName: 'x', timeZone: 'UTC' })).rejects.toMatchObject({ reason: 'WEAK_PASSWORD' });
    await expect(gw.signIn('d@example.test', 'wrong-password')).rejects.toBeInstanceOf(AuthGatewayError);
    await expect(gw.signIn('nobody@example.test', 'whatever123')).rejects.toMatchObject({ reason: 'INVALID_CREDENTIALS' });
    expect(await gw.verifyPassword('d@example.test', 'longenough1')).toBe(true);
    expect(await gw.verifyPassword('d@example.test', 'nope')).toBe(false);
  });

  it('rejects a forged or tampered session cookie', async () => {
    const u = await gw.signIn('d@example.test', 'longenough1');
    const good = jar.get('harada_dev_session')!;
    jar.set('harada_dev_session', `${u.id}.AAAA`);
    expect(await gw.getUser()).toBeNull();
    jar.set('harada_dev_session', good);
    expect((await gw.getUser())?.id).toBe(u.id);
    await gw.signOut();
    expect(await gw.getUser()).toBeNull();
  });

  it('refuses to construct in production or without a secret; factory picks by env', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => new DevAuthGateway(t.db)).toThrow(/AUTH_PROVIDER=dev/);
    expect(() => createAuthGateway(t.db)).toThrow(/not allowed in production/);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEV_AUTH_SECRET', '');
    expect(() => new DevAuthGateway(t.db)).toThrow(/DEV_AUTH_SECRET/);
    vi.stubEnv('DEV_AUTH_SECRET', 'test-secret-test-secret');
    expect(createAuthGateway(t.db)).toBeInstanceOf(DevAuthGateway);
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    expect(createAuthGateway().constructor.name).toBe('SupabaseAuthGateway');
  });
});
