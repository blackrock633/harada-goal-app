import { toAppError } from '../rpc-errors';

describe('toAppError (API_CONTRACTS §7)', () => {
  it.each([
    ['HG400', 'VALIDATION'],
    ['HG401', 'UNAUTHENTICATED'],
    ['HG404', 'NOT_FOUND'],
    ['HG409', 'CONFLICT'],
    ['HG422', 'INVALID_STATE'],
    ['HG429', 'LIMIT_REACHED'],
  ])('maps RPC code %s to %s with the user-facing message', (code, expected) => {
    const e = toAppError({ code, message: 'You already have 8 key areas.', hint: '' }, 400);
    expect(e).toEqual({ code: expected, message: 'You already have 8 key areas.' });
  });

  it('turns an HG400 hint into a field error', () => {
    expect(toAppError({ code: 'HG400', message: 'Required', hint: 'title' }, 400)).toEqual({
      code: 'VALIDATION',
      message: 'Required',
      fieldErrors: { title: ['Required'] },
    });
  });

  it.each([
    ['23505', 'CONFLICT'],
    ['23P01', 'CONFLICT'],
    ['23514', 'VALIDATION'],
    ['22P02', 'VALIDATION'],
    ['42501', 'NOT_FOUND'],
    ['PGRST301', 'UNAUTHENTICATED'],
    ['PGRST303', 'UNAUTHENTICATED'],
  ])('maps system code %s to %s without leaking SQL text', (code, expected) => {
    const e = toAppError({ code, message: 'duplicate key value violates unique constraint "actions_pkey"' }, 409);
    expect(e.code).toBe(expected);
    expect(e.message).not.toMatch(/constraint|pkey|violates/);
  });

  it('treats HTTP 401 as UNAUTHENTICATED', () => {
    expect(toAppError({ code: '', message: 'JWT expired' }, 401).code).toBe('UNAUTHENTICATED');
  });

  it('treats network failures (status 0) and 5xx as UNAVAILABLE', () => {
    expect(toAppError({ code: '', message: 'TypeError: Network request failed' }, 0).code).toBe('UNAVAILABLE');
    expect(toAppError({ code: '', message: 'Bad gateway' }, 502).code).toBe('UNAVAILABLE');
  });

  it('falls back to INTERNAL for anything else, with generic text', () => {
    const e = toAppError({ code: 'XX000', message: 'internal_error: relation goals' }, 400);
    expect(e).toEqual({ code: 'INTERNAL', message: 'Something went wrong.' });
  });
});
