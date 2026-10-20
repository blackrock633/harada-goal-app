import { describe, expect, it } from 'vitest';
import { errorMessage, isConflict, isRetryable, newClientId } from './errors';

describe('errorMessage', () => {
  it('tells the user input is kept when the server is unreachable', () => {
    expect(errorMessage({ code: 'UNAVAILABLE', message: 'fetch failed' })).toMatch(/input is kept/);
  });
  it('passes through validation messages', () => {
    expect(errorMessage({ code: 'VALIDATION', message: 'Title is required' })).toBe('Title is required');
  });
  it('never exposes internal error text', () => {
    expect(errorMessage({ code: 'INTERNAL', message: 'relation "goals" does not exist' })).not.toMatch(/relation/);
  });
});

describe('classification', () => {
  it('treats unavailable as retryable and conflict as not', () => {
    expect(isRetryable({ code: 'UNAVAILABLE', message: '' })).toBe(true);
    expect(isRetryable({ code: 'CONFLICT', message: '' })).toBe(false);
    expect(isConflict({ code: 'CONFLICT', message: '' })).toBe(true);
  });
  it('generates uuid client ids', () => {
    expect(newClientId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
