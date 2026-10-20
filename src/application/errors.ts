import { ZodError } from 'zod';
import { isDomainError } from '@/domain/errors';
import { AuthGatewayError, DatabaseUnavailableError, Logger, NotOwnedError, UniqueViolationError } from './ports';
import { AppError, AppErrorCode, Result, fail } from './result';

/** Throw inside a unit of work to abort (roll back) with a specific application error. */
export class AppFail extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppFail';
  }
}

export const STALE_MESSAGE = 'This was changed elsewhere — reload';
export const notFound = (what = 'Not found') => new AppFail('NOT_FOUND', what);

function zodFieldErrors(e: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of e.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** The single place where thrown errors become AppErrors. Unexpected errors are logged, never leaked. */
export function toAppError(e: unknown, logger: Logger): AppError {
  if (e instanceof AppFail) {
    return e.fieldErrors
      ? { code: e.code, message: e.message, fieldErrors: e.fieldErrors }
      : { code: e.code, message: e.message };
  }
  if (e instanceof ZodError) {
    return { code: 'VALIDATION', message: 'Please check the highlighted fields', fieldErrors: zodFieldErrors(e) };
  }
  if (isDomainError(e)) {
    const err: AppError = { code: e.code, message: e.message };
    if (e.field) err.fieldErrors = { [e.field]: [e.message] };
    return err;
  }
  if (e instanceof UniqueViolationError) {
    return { code: 'CONFLICT', message: STALE_MESSAGE };
  }
  if (e instanceof DatabaseUnavailableError) {
    logger.warn('Database unavailable', { detail: e.detail });
    return { code: 'UNAVAILABLE', message: 'Could not reach the server. Your changes were not saved — please try again.' };
  }
  if (e instanceof NotOwnedError) {
    return { code: 'NOT_FOUND', message: 'Not found' };
  }
  if (e instanceof AuthGatewayError) {
    switch (e.reason) {
      case 'INVALID_CREDENTIALS':
        return { code: 'VALIDATION', message: 'Email or password is incorrect' };
      case 'EMAIL_TAKEN':
        return { code: 'CONFLICT', message: 'Could not create account with that email' };
      case 'WEAK_PASSWORD':
        return {
          code: 'VALIDATION',
          message: 'That password is too weak. Use a longer, less common password.',
          fieldErrors: { password: ['That password is too weak'] },
        };
      case 'EMAIL_NOT_CONFIRMED':
        return { code: 'UNAUTHENTICATED', message: 'Confirm your email address (check your inbox) before signing in' };
      case 'RATE_LIMITED':
        return { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a moment and try again.' };
      case 'UNAVAILABLE':
        return { code: 'UNAVAILABLE', message: 'The service is temporarily unavailable. Please try again.' };
    }
  }
  logger.error('Unexpected error in use case', {
    error: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : String(e),
  });
  return { code: 'INTERNAL', message: 'Something went wrong. Please try again.' };
}

/** Runs `fn`, converting any thrown error into a failed Result. */
export async function guard<T>(logger: Logger, fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const err = toAppError(e, logger);
    return fail(err.code, err.message, err.fieldErrors);
  }
}
