import { describe, it, expect } from 'vitest';
import { DatabaseUnavailableError, NotOwnedError, UniqueViolationError } from '@/application/ports';
import { mapPgError } from './pg-errors';

// MOCKED: constructed error objects shaped like Drizzle-wrapped driver errors.
describe('mapPgError (mocked driver errors)', () => {
  const wrapped = (cause: object) => Object.assign(new Error('Failed query'), { cause });

  it('unwraps Drizzle errors and maps unique/exclusion violations', () => {
    expect(mapPgError(wrapped({ code: '23505', constraint: 'pk' }))).toBeInstanceOf(UniqueViolationError);
    expect(mapPgError(wrapped({ code: '23P01', constraint: 'outcomes_goal_position_excl' }))).toBeInstanceOf(UniqueViolationError);
  });

  it('maps RLS and FK failures to NotOwnedError', () => {
    expect(mapPgError(wrapped({ code: '42501' }))).toBeInstanceOf(NotOwnedError);
    expect(mapPgError(wrapped({ code: '23503', constraint: 'actions_outcome_same_goal_fk' }))).toBeInstanceOf(NotOwnedError);
  });

  it('maps connection failures to DatabaseUnavailableError', () => {
    expect(mapPgError(wrapped({ code: 'ECONNREFUSED' }))).toBeInstanceOf(DatabaseUnavailableError);
    expect(mapPgError(Object.assign(new Error('closed'), { code: 'CONNECTION_CLOSED' }))).toBeInstanceOf(DatabaseUnavailableError);
    expect(mapPgError(wrapped({ code: '08006' }))).toBeInstanceOf(DatabaseUnavailableError);
  });

  it('leaves unrelated errors untouched', () => {
    const e = new Error('boom');
    expect(mapPgError(e)).toBe(e);
  });
});
