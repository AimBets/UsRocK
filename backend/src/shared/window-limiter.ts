import type { preHandlerAsyncHookHandler, FastifyRequest } from "fastify";
import { errors } from "./errors.js";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface WindowLimiterOptions {
  max: number;
  windowMs: number;
  /** Bounds memory: expired buckets are purged first, then the oldest are evicted. */
  maxKeys?: number;
  now?: () => number;
}

/**
 * In-memory fixed-window counter for keys other than the client IP (e.g. per account).
 * @fastify/rate-limit runs a single limiter per request, so the per-IP route limit and this
 * per-key limit must be separate mechanisms. Single-instance only, like the global limiter.
 */
export function createWindowLimiter({ max, windowMs, maxKeys = 10_000, now = Date.now }: WindowLimiterOptions) {
  const buckets = new Map<string, Bucket>();

  function evict(current: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(key);
    }
    for (const key of buckets.keys()) {
      if (buckets.size < maxKeys) break;
      buckets.delete(key);
    }
  }

  return {
    hit(key: string): { allowed: boolean; retryAfterSeconds: number } {
      const current = now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= current) {
        if (!bucket && buckets.size >= maxKeys) evict(current);
        bucket = { count: 0, resetAt: current + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return { allowed: bucket.count <= max, retryAfterSeconds: Math.ceil((bucket.resetAt - current) / 1000) };
    },
    size: () => buckets.size,
  };
}

/** preHandler that throttles by a key derived from the (already validated) request. */
export function limitBy(
  limiter: ReturnType<typeof createWindowLimiter>,
  keyOf: (request: FastifyRequest) => string,
): preHandlerAsyncHookHandler {
  return async (request, reply) => {
    const { allowed, retryAfterSeconds } = limiter.hit(keyOf(request));
    if (!allowed) {
      reply.header("retry-after", String(retryAfterSeconds));
      throw errors.rateLimited();
    }
  };
}
