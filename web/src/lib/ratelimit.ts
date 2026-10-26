interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Sliding window limiter held in memory. It protects a single server instance.
 * For a multi instance deployment move this to a shared store.
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 5000) {
    const first = buckets.keys().next().value;
    if (first !== undefined) buckets.delete(first);
  }
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSec: 0 };
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return ip;
}
