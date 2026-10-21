import type { AppError } from '@shared/application/result';

/**
 * Supabase Auth failure → AppError for the native client. Mirrors the web's server-side
 * classification (src/infrastructure/auth/map-auth-error.ts) and its user-facing wording
 * (src/application/errors.ts), so both apps say the same thing for the same failure.
 * Structural: no supabase-js import, so it is unit-testable.
 */
export function authErrorToAppError(error: unknown): AppError {
  const e = (typeof error === 'object' && error !== null ? error : {}) as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.status === 'number' ? e.status : undefined;
  const name = typeof e.name === 'string' ? e.name : '';

  switch (code) {
    case 'invalid_credentials':
      return { code: 'VALIDATION', message: 'Email or password is incorrect' };
    case 'user_already_exists':
    case 'email_exists':
      return { code: 'CONFLICT', message: 'Could not create account with that email' };
    case 'weak_password':
      return {
        code: 'VALIDATION',
        message: 'That password is too weak. Use a longer, less common password.',
        fieldErrors: { password: ['That password is too weak'] },
      };
    case 'email_not_confirmed':
      return { code: 'UNAUTHENTICATED', message: 'Confirm your email address (check your inbox) before signing in' };
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a moment and try again.' };
  }
  if (status === 429) {
    return { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a moment and try again.' };
  }
  if (
    name === 'AuthRetryableFetchError' ||
    status === 0 ||
    (status !== undefined && status >= 500) ||
    (error instanceof TypeError && /fetch|network/i.test(String(e.message ?? '')))
  ) {
    return { code: 'UNAVAILABLE', message: 'The service is temporarily unavailable. Please try again.' };
  }
  return { code: 'INTERNAL', message: 'Something went wrong.' };
}
