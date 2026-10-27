import { Logger as LoggerPort } from '@/application/ports';

export class ConsoleLogger implements LoggerPort {
  info(msg: string, meta?: Record<string, unknown>): void {
    this.log('info', msg, meta);
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this.log('warn', msg, meta);
  }

  error(msg: string, meta?: Record<string, unknown>): void {
    this.log('error', msg, meta);
  }

  private log(level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) {
    // Never log passwords or tokens
    const safeMeta = this.sanitize(meta);

    if (process.env.NODE_ENV === 'production') {
      console[level](JSON.stringify({ level, msg, ...safeMeta, timestamp: new Date().toISOString() }));
    } else {
      if (safeMeta && Object.keys(safeMeta).length > 0) {
        console[level](`[${level.toUpperCase()}] ${msg}`, safeMeta);
      } else {
        console[level](`[${level.toUpperCase()}] ${msg}`);
      }
    }
  }

  private sanitize(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!meta) return undefined;
    return redact(meta, 0) as Record<string, unknown>;
  }
}

/** Keys whose values are never logged, at any depth: credentials, tokens, emails and raw query params. */
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|email|params/i;

function redact(v: unknown, depth: number): unknown {
  if (depth > 6 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(x, depth + 1);
  return out;
}
