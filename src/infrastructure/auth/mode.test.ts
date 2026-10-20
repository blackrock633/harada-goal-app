import { describe, it, expect } from 'vitest';
import { isDevAuthEnabled } from './mode';

describe('isDevAuthEnabled (QA H2)', () => {
  const env = (o: Record<string, string | undefined>) => o as unknown as NodeJS.ProcessEnv;

  it('allows dev auth only in development/test with a local database', () => {
    expect(isDevAuthEnabled(env({ AUTH_PROVIDER: 'dev', NODE_ENV: 'development' }))).toBe(true);
    expect(isDevAuthEnabled(env({ AUTH_PROVIDER: 'dev', NODE_ENV: 'test', DATABASE_URL: 'memory://' }))).toBe(true);
    expect(isDevAuthEnabled(env({ AUTH_PROVIDER: 'dev', NODE_ENV: 'development', DATABASE_URL: 'pglite://.data/dev' }))).toBe(true);
  });

  it.each([undefined, 'production', 'Production', 'staging', ''])('refuses NODE_ENV=%s', (nodeEnv) => {
    expect(isDevAuthEnabled(env({ AUTH_PROVIDER: 'dev', NODE_ENV: nodeEnv }))).toBe(false);
  });

  it('refuses a real Postgres DATABASE_URL even in development', () => {
    expect(isDevAuthEnabled(env({ AUTH_PROVIDER: 'dev', NODE_ENV: 'development', DATABASE_URL: 'postgres://u:p@db.example:6543/postgres' }))).toBe(false);
  });

  it('is off unless AUTH_PROVIDER=dev', () => {
    expect(isDevAuthEnabled(env({ NODE_ENV: 'development' }))).toBe(false);
  });
});
