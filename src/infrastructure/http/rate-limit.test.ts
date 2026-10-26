import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedWindowLimiter, clientIp } from './rate-limit';

describe('FixedWindowLimiter', () => {
  it('allows `limit` requests per window per key, then resets', () => {
    const l = new FixedWindowLimiter(3, 1000);
    expect([1, 2, 3, 4].map(() => l.consume('a', 0))).toEqual([true, true, true, false]);
    expect(l.consume('b', 0)).toBe(true);
    expect(l.consume('a', 1001)).toBe(true);
  });
  it('stays bounded under a flood of distinct keys', () => {
    const l = new FixedWindowLimiter(1, 60_000, 100);
    for (let i = 0; i < 1000; i++) l.consume(`k${i}`, 0);
    expect((l as unknown as { windows: Map<string, unknown> }).windows.size).toBeLessThanOrEqual(100);
  });
  it('reads the first X-Forwarded-For hop', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('middleware on /s/<token>', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('AUTH_PROVIDER', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('marks share pages private/no-store and noindex, and answers 429 after 60 requests a minute per IP', async () => {
    const { middleware } = await import('../../middleware');
    const { NextRequest } = await import('next/server');
    const req = (ip: string) =>
      new NextRequest(`https://app.example/s/${'a'.repeat(64)}`, { headers: { 'x-forwarded-for': ip } });
    const first = await middleware(req('203.0.113.1'));
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('private, no-store');
    expect(first.headers.get('x-robots-tag')).toContain('noindex');
    for (let i = 0; i < 59; i++) await middleware(req('203.0.113.1'));
    const limited = await middleware(req('203.0.113.1'));
    expect(limited.status).toBe(429);
    expect((await middleware(req('203.0.113.2'))).status).toBe(200);
    // Other routes are not affected by the share limiter.
    const other = await middleware(new NextRequest('https://app.example/pricing', { headers: { 'x-forwarded-for': '203.0.113.1' } }));
    expect(other.status).toBe(200);
    expect(other.headers.get('x-robots-tag')).toBeNull();
  });
});
