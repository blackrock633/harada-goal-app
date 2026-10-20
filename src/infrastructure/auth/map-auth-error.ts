import { AuthGatewayError } from '@/application/ports';

/**
 * Maps a Supabase Auth error (AuthError / AuthApiError / AuthRetryableFetchError, or a raw fetch
 * failure) to an expected AuthGatewayError, or null when it is not an expected failure (the caller
 * rethrows it so it surfaces as INTERNAL). Structural, so it is unit-testable without Supabase.
 */
export function mapSupabaseAuthError(error: unknown): AuthGatewayError | null {
  if (error instanceof AuthGatewayError) return error;
  if (typeof error !== 'object' || error === null) return null;
  const e = error as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : undefined;
  const status = typeof e.status === 'number' ? e.status : undefined;
  const name = typeof e.name === 'string' ? e.name : '';

  switch (code) {
    case 'invalid_credentials':
      return new AuthGatewayError('INVALID_CREDENTIALS');
    case 'user_already_exists':
    case 'email_exists':
      return new AuthGatewayError('EMAIL_TAKEN');
    case 'weak_password':
      return new AuthGatewayError('WEAK_PASSWORD');
    case 'email_not_confirmed':
      return new AuthGatewayError('EMAIL_NOT_CONFIRMED');
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return new AuthGatewayError('RATE_LIMITED');
  }
  if (status === 429) return new AuthGatewayError('RATE_LIMITED');

  if (
    name === 'AuthRetryableFetchError' ||
    status === 0 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    (error instanceof TypeError && /fetch/i.test(String(e.message ?? '')))
  ) {
    return new AuthGatewayError('UNAVAILABLE');
  }
  return null;
}

/** True when the error just means "there is no valid session" (not a failure). */
export function isNoSessionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { name?: unknown; code?: unknown; status?: unknown };
  if (e.name === 'AuthSessionMissingError') return true;
  const code = typeof e.code === 'string' ? e.code : '';
  if (['bad_jwt', 'session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used', 'user_not_found'].includes(code)) {
    return true;
  }
  return e.status === 401 || e.status === 403;
}
