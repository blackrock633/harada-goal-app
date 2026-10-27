import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SEC-AUTH-01/02: the Supabase session cookies (access + 400-day refresh token) must be httpOnly and Secure.
 * @supabase/ssr defaults to httpOnly: false, so every createServerClient call has to override it.
 * MOCKED: @supabase/ssr (captures the options) and next/headers.
 */
const created: { cookieOptions?: Record<string, unknown> }[] = [];
const signUpResult = { current: { data: { user: null as unknown, session: null as unknown }, error: null as unknown } };
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url: string, _key: string, opts: { cookieOptions?: Record<string, unknown> }) => {
    created.push(opts);
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        signOut: async () => ({ error: null }),
        signUp: async () => signUpResult.current,
      },
    };
  }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

import { supabaseCookieOptions } from '../supabase/env';

describe('Supabase session cookies (SEC-AUTH-01)', () => {
  beforeEach(() => {
    created.length = 0;
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-anon-key');
    vi.stubEnv('AUTH_PROVIDER', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('are httpOnly everywhere and Secure outside development/test', () => {
    for (const env of ['production', 'staging', undefined]) {
      expect(supabaseCookieOptions({ NODE_ENV: env } as NodeJS.ProcessEnv)).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
    }
    expect(supabaseCookieOptions({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toMatchObject({ httpOnly: true, secure: false });
  });

  it('the auth gateway passes them to @supabase/ssr', async () => {
    const { SupabaseAuthGateway } = await import('./supabase-auth-gateway');
    await new SupabaseAuthGateway().getUser();
    expect(created).toHaveLength(1);
    expect(created[0]!.cookieOptions).toMatchObject({ httpOnly: true });
  });

  it('the middleware passes them to @supabase/ssr', async () => {
    const { middleware } = await import('../../middleware');
    const { NextRequest } = await import('next/server');
    await middleware(new NextRequest('https://app.example/today'));
    expect(created).toHaveLength(1);
    expect(created[0]!.cookieOptions).toMatchObject({ httpOnly: true });
  });

  // SEC-AUTH-02: sign-up must not reveal whether an email already has an account.
  it('sign-up answers an already-registered email exactly like a new one', async () => {
    const { SupabaseAuthGateway } = await import('./supabase-auth-gateway');
    const input = { email: 'taken@example.com', password: 'correct-horse-battery', displayName: 'X', timeZone: 'UTC' };
    signUpResult.current = { data: { user: { id: 'obfuscated', email: input.email, identities: [] }, session: null }, error: null };
    const existing = await new SupabaseAuthGateway().signUp(input);
    signUpResult.current = { data: { user: { id: 'new', email: input.email, identities: [{ id: 'i' }] }, session: null }, error: null };
    const fresh = await new SupabaseAuthGateway().signUp(input);
    expect(existing.confirmed).toBe(false);
    expect(fresh.confirmed).toBe(false);
  });
});
