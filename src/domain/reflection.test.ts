import { expect, test, describe } from 'vitest';
import { createReflection, updateReflection } from './reflection.js';
import { Instant } from './types.js';

describe('reflection', () => {
  const now = new Date() as Instant;

  test('createReflection', () => {
    const r = createReflection({ id: 'r1', goalId: 'g1', date: '2024-01-01', kind: 'daily', wentWell: 'Everything' }, '2024-01-02', now);
    expect(r.wentWell).toBe('Everything');
    expect(r.didntGoWell).toBe('');
    expect(r.nextChange).toBe('');
  });

  test('createReflection future date', () => {
    expect(() => createReflection({ id: 'r1', goalId: 'g1', date: '2024-01-03', kind: 'daily', wentWell: 'X' }, '2024-01-02', now)).toThrowError(/cannot be in the future/);
  });

  test('createReflection all empty', () => {
    expect(() => createReflection({ id: 'r1', goalId: 'g1', date: '2024-01-01', kind: 'daily' }, '2024-01-02', now)).toThrowError(/At least one/);
  });

  test('updateReflection', () => {
    const r = createReflection({ id: 'r1', goalId: 'g1', date: '2024-01-01', kind: 'daily', wentWell: 'Everything' }, '2024-01-02', now);
    const { reflection: next, changed } = updateReflection(r, { didntGoWell: 'Nothing' }, '2024-01-02', now);
    expect(next.wentWell).toBe('Everything');
    expect(next.didntGoWell).toBe('Nothing');
    expect(changed).toContain('didntGoWell');
  });

  test('updateReflection to all empty throws', () => {
    const r = createReflection({ id: 'r1', goalId: 'g1', date: '2024-01-01', kind: 'daily', wentWell: 'Everything' }, '2024-01-02', now);
    expect(() => updateReflection(r, { wentWell: '' }, '2024-01-02', now)).toThrowError(/At least one/);
  });
});
