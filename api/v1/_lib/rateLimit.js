/**
 * rateLimit.js — bound how often a caller can hit an endpoint
 * ---------------------------------------------------------------------------
 * ── READ THIS BEFORE RELYING ON IT ─────────────────────────────────────────
 *
 * The default store is in-memory, and on Vercel's serverless runtime that is
 * WEAK PROTECTION, not a guarantee. Each function instance has its own memory,
 * instances scale out under load, and a cold start begins with an empty
 * counter. So an attacker sending requests fast enough to matter is also
 * causing new instances to spin up, each handing them a fresh allowance.
 *
 * What the in-memory store genuinely does:
 *   - stops an accidental client loop from making thousands of AI calls
 *   - bounds a single misbehaving session
 *   - makes the limit visible in headers so clients can back off politely
 *
 * What it does NOT do:
 *   - stop a determined attacker
 *   - enforce a true per-hour cost ceiling across the deployment
 *
 * Real enforcement needs a store shared across instances. That arrives in
 * Phase 3 with Supabase, via `setStore()` below — the limiter is written
 * against a tiny store interface precisely so that swap needs no changes
 * here or at any call site.
 *
 * Until then, the meaningful cost control on the AI path is the origin guard
 * and shared secret in /api/claude, plus max_tokens. This module is a seatbelt
 * on top of that, and the comments say so rather than implying a lock.
 *
 * ── the limits, from the plan ──────────────────────────────────────────────
 *   auth endpoints        10 / minute per IP
 *   report generation      5 / hour   per physician   (the expensive one)
 *   algorithm endpoints   60 / minute per user
 *   general API          100 / minute per user
 */

export const LIMITS = {
  auth:      { max: 10,  windowMs: 60_000,     by: "ip",   label: "authentication" },
  report:    { max: 5,   windowMs: 3_600_000,  by: "user", label: "report generation" },
  algorithm: { max: 60,  windowMs: 60_000,     by: "user", label: "algorithm" },
  general:   { max: 100, windowMs: 60_000,     by: "user", label: "API" },
};

/**
 * Store interface:
 *   hit(key, windowMs) -> { count, resetAt }  // increments, returns new state
 *   reset(key)                                // testing only
 *
 * A Supabase-backed implementation in Phase 3 does the same thing with an
 * upsert and a window column.
 */
function createMemoryStore() {
  const buckets = new Map();

  // A long-lived instance would otherwise accumulate a key per caller for
  // ever. Cleared opportunistically rather than on a timer, because a timer
  // keeps a serverless function alive.
  const sweep = (now) => {
    if (buckets.size < 5000) return;
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  };

  return {
    hit(key, windowMs) {
      const now = Date.now();
      sweep(now);
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + windowMs };
        buckets.set(key, fresh);
        return { ...fresh };
      }
      existing.count += 1;
      return { ...existing };
    },
    reset(key) { if (key === undefined) buckets.clear(); else buckets.delete(key); },
    get size() { return buckets.size; },
    kind: "memory",
  };
}

let store = createMemoryStore();

/** Swap in a shared store (Phase 3, Supabase). */
export function setStore(next) { store = next; }
export function getStore() { return store; }
/** Testing only. */
export function __resetAll() { store.reset(); }

/**
 * The identity a limit is counted against.
 * Per-user where we know the user, per-IP otherwise — an unauthenticated
 * caller must not get a fresh allowance simply by having no account.
 */
export function identify(req, by) {
  if (by === "user" && req.user && req.user.id) return "user:" + req.user.id;
  return "ip:" + clientIp(req);
}

/**
 * Vercel sits behind a proxy, so the socket address is the proxy's.
 * x-forwarded-for is a client-controlled header and can be forged, which is
 * another reason the in-memory limiter is not a security control: its key can
 * be rotated at will by the caller. The leftmost entry is used because that is
 * the convention Vercel follows for the original client.
 */
export function clientIp(req) {
  const xff = req.headers && (req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"]);
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff.length) return String(xff[0]).trim();
  const real = req.headers && req.headers["x-real-ip"];
  if (typeof real === "string" && real.length) return real.trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

/**
 * Check and record one request.
 * @returns { allowed, limit, remaining, resetAt, retryAfterSeconds }
 */
export function check(req, kind = "general", { route = "" } = {}) {
  const limit = LIMITS[kind] || LIMITS.general;
  const key = `${kind}:${route}:${identify(req, limit.by)}`;
  const { count, resetAt } = store.hit(key, limit.windowMs);

  const remaining = Math.max(0, limit.max - count);
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

  return {
    allowed: count <= limit.max,
    limit: limit.max,
    remaining,
    resetAt,
    retryAfterSeconds,
    label: limit.label,
    key,
  };
}

/** Standard headers, so a well-behaved client can pace itself. */
export function setHeaders(res, r) {
  res.setHeader("X-RateLimit-Limit", String(r.limit));
  res.setHeader("X-RateLimit-Remaining", String(r.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(r.resetAt / 1000)));
}

/**
 * Enforce a limit, or send 429 and return false.
 * Usage: `if (!enforce(req, res, "report", fail)) return;`
 */
export function enforce(req, res, kind, fail, opts = {}) {
  const r = check(req, kind, opts);
  setHeaders(res, r);
  if (r.allowed) return true;
  fail(res, "RATE_LIMITED", {
    requestId: req.requestId,
    retryAfterSeconds: r.retryAfterSeconds,
    message: `Too many ${r.label} requests. Try again in ${r.retryAfterSeconds} seconds.`,
  });
  return false;
}
