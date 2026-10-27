import type { AppError, AppErrorCode } from '@shared/application/result';

/** The subset of supabase-js's PostgrestError we rely on. */
export interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
  details?: string | null;
}

/** HG4xx codes are raised by the RPCs themselves; their `message` is written for the user. */
const APP_CODES: Record<string, AppErrorCode> = {
  HG400: 'VALIDATION',
  HG401: 'UNAUTHENTICATED',
  /** An entitlement check: needs Harada Pro. The message names the benefit; screens offer the upgrade. */
  HG402: 'UPGRADE_REQUIRED',
  HG404: 'NOT_FOUND',
  HG409: 'CONFLICT',
  HG422: 'INVALID_STATE',
  HG429: 'LIMIT_REACHED',
};

/** Postgres / PostgREST codes. Their raw messages can expose SQL, so the user sees safe text. */
const SYSTEM_CODES: Record<string, { code: AppErrorCode; message: string }> = {
  '23505': { code: 'CONFLICT', message: 'This was changed at the same time somewhere else. Reload and try again.' },
  '23P01': { code: 'CONFLICT', message: 'This was changed at the same time somewhere else. Reload and try again.' },
  '23514': { code: 'VALIDATION', message: 'Some of these values are not allowed.' },
  '22P02': { code: 'VALIDATION', message: 'Some of these values are not in the right format.' },
  '42501': { code: 'NOT_FOUND', message: "That item doesn't exist or isn't yours." },
  PGRST301: { code: 'UNAUTHENTICATED', message: 'Please sign in again.' },
  PGRST303: { code: 'UNAUTHENTICATED', message: 'Please sign in again.' },
};

/**
 * Map a supabase-js RPC failure to the shared AppError (docs/API_CONTRACTS.md §7), so native
 * screens handle errors exactly like the web's use-case Results. `status` is the HTTP status
 * supabase-js reports; network failures arrive as an error with status 0, not a throw.
 */
export function toAppError(error: PostgrestLikeError | null | undefined, status?: number): AppError {
  const pgCode = error?.code ?? '';

  const app = APP_CODES[pgCode];
  if (app) {
    const message = error?.message?.trim() || 'Something went wrong.';
    const hint = error?.hint?.trim();
    if (app === 'VALIDATION' && hint) return { code: app, message, fieldErrors: { [hint]: [message] } };
    return { code: app, message };
  }

  const system = SYSTEM_CODES[pgCode];
  if (system) return { ...system };

  if (status === 401) return { code: 'UNAUTHENTICATED', message: 'Please sign in again.' };
  if (status === undefined || status === 0 || status >= 500) {
    return { code: 'UNAVAILABLE', message: "Couldn't reach the server." };
  }
  return { code: 'INTERNAL', message: 'Something went wrong.' };
}

/** A thrown exception around a request (fetch rejected, JSON parse, …) is treated as unreachable. */
export function thrownToAppError(): AppError {
  return { code: 'UNAVAILABLE', message: "Couldn't reach the server." };
}
