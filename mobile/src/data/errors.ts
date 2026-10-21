/**
 * Shared presentation of mutation failures. Every component that shows an AppError uses these,
 * so the wording (and the promise that input is kept) is consistent across the app.
 */
import * as Crypto from 'expo-crypto';
import type { AppError } from '@shared/application/result';

/** The message to show the user for a failed mutation. */
export function errorMessage(error: AppError): string {
  switch (error.code) {
    case 'UNAVAILABLE':
      return "Couldn't reach the server. Nothing was saved, and your input is kept — try again in a moment.";
    case 'CONFLICT':
      return error.message || 'This was changed somewhere else. Reload the latest version before saving again.';
    case 'UNAUTHENTICATED':
      return 'Your session has ended. Sign in again to continue — nothing was saved.';
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait a moment and try again.';
    case 'INTERNAL':
      return 'Something went wrong and nothing was saved. Please try again.';
    default:
      return error.message;
  }
}

/** True when retrying the same request (same client id) is safe and may succeed. */
export function isRetryable(error: AppError): boolean {
  return error.code === 'UNAVAILABLE' || error.code === 'INTERNAL' || error.code === 'RATE_LIMITED';
}

/** True when the record changed underneath the user (expectedUpdatedAt mismatch or a taken slot). */
export function isConflict(error: AppError): boolean {
  return error.code === 'CONFLICT';
}

/**
 * Client-generated id for create mutations. Generate ONCE per logical create (e.g. when a form
 * opens or on first submit) and reuse it on retries, so a retried create is idempotent.
 */
export function newClientId(): string {
  // Hermes has no reliable global crypto.randomUUID; expo-crypto is the documented source.
  return Crypto.randomUUID();
}
