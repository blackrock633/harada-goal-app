import { describe, expect, it } from 'vitest';
import { AuthGatewayError } from '@/application/ports';
import { isNoSessionError, mapSupabaseAuthError } from './map-auth-error';

// MOCKED: these are hand-built objects shaped like supabase-js AuthError / AuthApiError values.
// They prove our mapping table, not Supabase's behaviour.
const apiErr = (code: string, status = 400, name = 'AuthApiError') => ({ name, code, status, message: code });

describe('mapSupabaseAuthError (mocked error objects)', () => {
  it.each([
    ['invalid_credentials', 'INVALID_CREDENTIALS'],
    ['user_already_exists', 'EMAIL_TAKEN'],
    ['email_exists', 'EMAIL_TAKEN'],
    ['weak_password', 'WEAK_PASSWORD'],
    ['email_not_confirmed', 'EMAIL_NOT_CONFIRMED'],
    ['over_request_rate_limit', 'RATE_LIMITED'],
  ])('maps code %s to %s', (code, reason) => {
    expect(mapSupabaseAuthError(apiErr(code))?.reason).toBe(reason);
  });

  it('maps HTTP 429 without a code to RATE_LIMITED', () => {
    expect(mapSupabaseAuthError({ name: 'AuthApiError', status: 429, message: 'x' })?.reason).toBe('RATE_LIMITED');
  });

  it('maps retryable fetch errors, status 0 and 503 to UNAVAILABLE', () => {
    expect(mapSupabaseAuthError({ name: 'AuthRetryableFetchError', status: 0, message: 'x' })?.reason).toBe('UNAVAILABLE');
    expect(mapSupabaseAuthError({ name: 'AuthUnknownError', status: 0, message: 'x' })?.reason).toBe('UNAVAILABLE');
    expect(mapSupabaseAuthError(apiErr('unexpected_failure', 503))?.reason).toBe('UNAVAILABLE');
    expect(mapSupabaseAuthError(new TypeError('fetch failed'))?.reason).toBe('UNAVAILABLE');
  });

  it('returns null for unexpected errors so callers rethrow', () => {
    expect(mapSupabaseAuthError(apiErr('unexpected_failure', 500))).toBeNull();
    expect(mapSupabaseAuthError(new Error('boom'))).toBeNull();
    expect(mapSupabaseAuthError(null)).toBeNull();
    expect(mapSupabaseAuthError('str')).toBeNull();
  });

  it('passes AuthGatewayError through', () => {
    const e = new AuthGatewayError('RATE_LIMITED');
    expect(mapSupabaseAuthError(e)).toBe(e);
  });
});

describe('isNoSessionError (mocked error objects)', () => {
  it('recognises missing/invalid sessions but not outages', () => {
    expect(isNoSessionError({ name: 'AuthSessionMissingError', status: 400 })).toBe(true);
    expect(isNoSessionError(apiErr('bad_jwt', 403))).toBe(true);
    expect(isNoSessionError(apiErr('session_not_found', 403))).toBe(true);
    expect(isNoSessionError({ name: 'AuthRetryableFetchError', status: 0 })).toBe(false);
    expect(isNoSessionError(apiErr('unexpected_failure', 500))).toBe(false);
  });
});
