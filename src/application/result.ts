import type { LocalDate } from '../domain/types.js';

export type AppErrorCode =
  | 'VALIDATION'
  | 'INVALID_STATE'
  | 'LIMIT_REACHED'
  /** Needs Harada Pro (the database's HG402); clients show an upgrade prompt for it. */
  | 'UPGRADE_REQUIRED'
  | 'NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'INTERNAL';

export interface AppError {
  code: AppErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const fail = (
  code: AppErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): { ok: false; error: AppError } => ({
  ok: false,
  error: fieldErrors ? { code, message, fieldErrors } : { code, message },
});

/** Request context. `userId` always comes from the verified session. */
export interface Ctx {
  userId: string;
  now: Date;
  today: LocalDate;
}
