import { RateLimiter } from '@/application/ports';

/**
 * In-memory fixed window rate limiter.
 * Note: this is per-process and will not scale horizontally without a shared store like Redis.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    // Periodically clean up expired windows to prevent memory leaks
    setInterval(() => this.cleanup(), 60000).unref();
  }

  consume(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    let window = this.windows.get(key);

    if (!window || now > window.resetAt) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }

    if (window.count >= limit) {
      return false;
    }

    window.count++;
    return true;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, window] of this.windows.entries()) {
      if (now > window.resetAt) {
        this.windows.delete(key);
      }
    }
  }
}
