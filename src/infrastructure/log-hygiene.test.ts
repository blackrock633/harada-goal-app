import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { safeErrorSummary, toAppError } from '@/application/errors';
import { ConsoleLogger } from './logger';

/** SEC-LOG-01: unexpected errors must not put user content, ids or credentials into server logs. */
const SECRET = 'MY PRIVATE REFLECTION TEXT';
const USER = '11111111-1111-4111-8111-111111111111';

function dbError() {
  const pg = Object.assign(new Error(`new row violates check constraint; value "${SECRET}"`), {
    code: '23514',
    constraint: 'reflections_fields_len_check',
  });
  return new DrizzleQueryError('insert into reflections ... values ($1, $2)', [SECRET, JSON.stringify({ sub: USER })], pg);
}

describe('log hygiene (SEC-LOG-01)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('safeErrorSummary keeps codes and constraint names but no query, params or DB messages', () => {
    const out = JSON.stringify(safeErrorSummary(dbError()));
    expect(out).toContain('23514');
    expect(out).toContain('reflections_fields_len_check');
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(USER);
    expect(out).not.toContain('insert into');
  });

  it('toAppError logs the summary and returns generic text', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const err = toAppError(dbError(), logger);
    expect(err).toEqual({ code: 'INTERNAL', message: 'Something went wrong. Please try again.' });
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(USER);
  });

  it('ConsoleLogger redacts sensitive keys at any depth', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    new ConsoleLogger().error('x', { user: { email: 'a@b.c', session: { access_token: 't0k', refresh_token: 'r3f' } }, password: 'pw' });
    const logged = JSON.stringify(spy.mock.calls);
    for (const s of ['a@b.c', 't0k', 'r3f', '"pw"']) expect(logged).not.toContain(s);
  });
});
