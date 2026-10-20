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
    const clean = { ...meta };
    if ('password' in clean) clean.password = '[REDACTED]';
    if ('passwordHash' in clean) clean.passwordHash = '[REDACTED]';
    if ('token' in clean) clean.token = '[REDACTED]';
    return clean;
  }
}
