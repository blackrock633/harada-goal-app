import { DatabaseUnavailableError, NotOwnedError, UniqueViolationError } from '@/application/ports';

interface PgErrorLike {
  code?: string;
  constraint?: string;
  constraint_name?: string;
  table?: string;
  table_name?: string;
}

/** Drizzle wraps driver errors; the SQLSTATE lives on the innermost `cause`. */
export function pgErrorOf(e: unknown): PgErrorLike | null {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i++) {
    const c = cur as PgErrorLike & { cause?: unknown };
    if (typeof c.code === 'string' && /^[0-9A-Z]{5}$/.test(c.code)) return c;
    cur = c.cause;
  }
  return null;
}

// Node socket errors and postgres-js connection errors, plus SQLSTATE class 08 (connection exception)
// and 57P01-03 (server shutting down / cannot connect now).
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN',
  'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'CONNECTION_DESTROYED', 'CONNECT_TIMEOUT',
  '57P01', '57P02', '57P03',
]);

function unavailableCodeOf(e: unknown): string | null {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && (UNAVAILABLE_CODES.has(code) || code.startsWith('08'))) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

/** Maps integrity/RLS/connectivity failures to port errors; returns other errors unchanged. */
export function mapPgError(e: unknown): unknown {
  const down = unavailableCodeOf(e);
  if (down) return new DatabaseUnavailableError(down);
  const pg = pgErrorOf(e);
  if (!pg) return e;
  const constraint = pg.constraint ?? pg.constraint_name ?? 'unknown';
  switch (pg.code) {
    case '23505': // unique_violation
    case '23P01': // exclusion_violation (position slots)
      return new UniqueViolationError(constraint);
    case '42501': // insufficient_privilege / RLS with-check failure
      return new NotOwnedError(pg.table ?? pg.table_name ?? 'row');
    case '23503': // foreign_key_violation (parent missing, or outcome in another goal)
      return new NotOwnedError(constraint);
    default:
      return e;
  }
}
