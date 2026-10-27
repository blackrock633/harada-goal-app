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

type ErrorSummary = { name: string; code?: string; constraint?: string; message?: string; stack?: string[] };

/**
 * What may be logged about an unexpected error: names, SQLSTATE/driver codes, constraint names and stack
 * frames along the cause chain. Never messages from query or database errors: drizzle's DrizzleQueryError
 * embeds the SQL and its params (reflection text, titles, the JWT claims), and Postgres messages can echo
 * input values. Other messages are kept to their first line and 200 characters.
 */
export function safeErrorSummary(e: unknown): ErrorSummary[] | string {
  if (!(e instanceof Error)) return typeof e;
  const out: ErrorSummary[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur instanceof Error; i++) {
    const c = cur as Error & { code?: unknown; constraint?: unknown; constraint_name?: unknown; query?: unknown; params?: unknown };
    const code = typeof c.code === 'string' ? c.code : undefined;
    const isDb = 'query' in c || 'params' in c || (code !== undefined && /^[0-9A-Z]{5}$/.test(code));
    const constraint = c.constraint ?? c.constraint_name;
    out.push({
      name: c.name,
      ...(code ? { code } : {}),
      ...(typeof constraint === 'string' ? { constraint } : {}),
      ...(isDb ? {} : { message: c.message.split('\n')[0]!.slice(0, 200) }),
      ...(i === 0 && c.stack ? { stack: c.stack.split('\n').filter((l) => /^\s+at /.test(l)).slice(0, 8) } : {}),
    });
    cur = c.cause;
  }
  return out;
}

/** Messages of the database's entitlement checks (HG402), keyed by the feature they name in the hint. */
const UPGRADE_MESSAGES: Record<string, string> = {
  multiple_goals: 'The Free plan has one active goal. Upgrade to Harada Pro to work on several at once.',
  advanced_reviews:
    "Reflect. Learn. Improve. Weekly reflections help you evaluate your progress, identify what's holding you back, and adjust your approach. Unlock weekly reflections with Harada Pro.",
  challenge:
    'Commit to 30 Days of Progress. Turn your goal into a structured daily practice with the Harada 30-Day Challenge. Unlock the full challenge with Harada Pro.',
  premium_templates: 'This template is part of Harada Pro.',
};

const HG_CODES: Record<string, AppErrorCode> = {
  HG400: 'VALIDATION',
  HG401: 'UNAUTHENTICATED',
  HG404: 'NOT_FOUND',
  HG409: 'CONFLICT',
  HG422: 'INVALID_STATE',
  HG429: 'LIMIT_REACHED',
};

/** The upgrade message when `e` (or its cause) is an HG402 raised by an entitlement check. */
function upgradeRequired(e: unknown): string | null {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur instanceof Error; i++) {
    const c = cur as Error & { code?: unknown; hint?: unknown };
    if (c.code === 'HG402') {
      return UPGRADE_MESSAGES[typeof c.hint === 'string' ? c.hint : ''] ?? 'This is part of Harada Pro.';
    }
    cur = c.cause;
  }
  return null;
}

/** Maps an HG4xx error raised by a Postgres RPC to an AppError. */
function hgRpcError(e: unknown): AppError | null {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur instanceof Error; i++) {
    const c = cur as Error & { code?: unknown; hint?: unknown };
    const code = typeof c.code === 'string' ? HG_CODES[c.code] : undefined;
    if (code) {
      const msg = c.message.split('\n')[0]?.trim() || 'Invalid request';
      const hint = typeof c.hint === 'string' ? c.hint.trim() : '';
      return hint ? { code, message: msg, fieldErrors: { [hint]: [msg] } } : { code, message: msg };
    }
    cur = c.cause;
  }
  return null;
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
  const upgrade = upgradeRequired(e);
  if (upgrade) return { code: 'UPGRADE_REQUIRED', message: upgrade };
  const hg = hgRpcError(e);
  if (hg) return hg;
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
  logger.error('Unexpected error in use case', { error: safeErrorSummary(e) });
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
