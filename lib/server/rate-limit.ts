export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

export type RateLimiter = { check: (key: string) => RateLimitResult };

/**
 * Small in-memory sliding-window limiter. It is per-process: fine for a single Node server,
 * but put a shared store (Redis, edge KV) behind the same interface before scaling out.
 * A `limit` of 0 disables limiting.
 */
export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  const hits = new Map<string, number[]>();

  return {
    check(key) {
      if (limit <= 0) return { ok: true, remaining: Infinity, retryAfterSec: 0 };
      const t = now();
      const recent = (hits.get(key) ?? []).filter((ts) => t - ts < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return {
          ok: false,
          remaining: 0,
          retryAfterSec: Math.ceil((recent[0] + windowMs - t) / 1000),
        };
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 5_000) {
        for (const [k, v] of hits) if (v.every((ts) => t - ts >= windowMs)) hits.delete(k);
      }
      return { ok: true, remaining: limit - recent.length, retryAfterSec: 0 };
    },
  };
}

/**
 * Best-effort client key. `x-forwarded-for` is only trustworthy behind a proxy you control;
 * otherwise everyone shares the "local" bucket, which errs on the safe (stricter) side.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "local";
}
