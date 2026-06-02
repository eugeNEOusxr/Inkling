const buckets = new Map();

/**
 * Simple in-memory rate limiter (per IP + route key).
 * @param {string} key
 * @param {{ limit?: number, windowMs?: number }} opts
 */
export function rateLimit(key, opts = {}) {
  const limit = opts.limit ?? 30;
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }
  return { ok: true, remaining: limit - entry.count };
}

export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}
