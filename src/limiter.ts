/**
 * A fixed-window rate limiter, held in memory: at most `limit` hits per key in each window.
 * Good enough for one small process; nothing is shared between replicas.
 */
export interface Limiter {
  /** Counts a hit. Returns 0 if it is allowed, or the seconds to wait if it is not. */
  hit(key: string): number;
}

export function createLimiter(limit: number, windowMs: number, now: () => number = Date.now): Limiter {
  let windowStart = now();
  let hits = new Map<string, number>();

  return {
    hit(key) {
      const time = now();
      if (time - windowStart >= windowMs) {
        windowStart = time;
        hits = new Map();
      }
      const count = (hits.get(key) ?? 0) + 1;
      hits.set(key, count);
      return count <= limit ? 0 : Math.ceil((windowStart + windowMs - time) / 1000);
    },
  };
}
