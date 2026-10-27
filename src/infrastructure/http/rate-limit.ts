/**
 * Edge-safe, in-memory fixed-window limiter for public, unauthenticated routes (e.g. /s/<token>). Usable from
 * middleware (no timers, no Node APIs): expired windows are pruned on access. Per process/isolate only, like
 * InMemoryRateLimiter; put a shared store in front of it before scaling horizontally.
 */
export class FixedWindowLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** true when the request is allowed. */
  consume(key: string, now = Date.now()): boolean {
    let w = this.windows.get(key);
    if (!w || now > w.resetAt) {
      if (this.windows.size >= this.maxKeys) this.prune(now);
      w = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, w);
    }
    if (w.count >= this.limit) return false;
    w.count++;
    return true;
  }

  private prune(now: number) {
    for (const [k, w] of this.windows) if (now > w.resetAt) this.windows.delete(k);
    // Still full (a flood of distinct keys): drop the oldest entries rather than grow without bound.
    if (this.windows.size >= this.maxKeys) {
      const drop = Math.ceil(this.maxKeys / 10);
      let i = 0;
      for (const k of this.windows.keys()) {
        if (i++ >= drop) break;
        this.windows.delete(k);
      }
    }
  }
}

/** The client IP as reported by the proxy in front of the app (first X-Forwarded-For hop), else 'unknown'. */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  const first = xff?.split(',')[0]?.trim();
  if (first) return first.slice(0, 64);
  const real = headers.get('x-real-ip')?.trim();
  return real ? real.slice(0, 64) : 'unknown';
}

/** Public share pages: 60 requests per minute per IP. */
export const shareLimiter = new FixedWindowLimiter(60, 60_000);
/** Visitor analytics from the browser: 30 events per minute per IP. */
export const trackLimiter = new FixedWindowLimiter(30, 60_000);
