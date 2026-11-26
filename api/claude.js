/**
 * /api/claude.js
 * Vercel Serverless Function — Anthropic API proxy
 *
 * - Keeps ANTHROPIC_API_KEY on the server, never exposed to the browser
 * - Accepts POST { prompt: string }
 * - Returns { text: string }
 *
 * ── PH2-API-01: this endpoint used to be an open proxy ─────────────────────
 * It previously sent `Access-Control-Allow-Origin: *` with no authentication
 * and no rate limiting, so anyone who found the URL could spend the owner's
 * Anthropic credit, and any other website's JavaScript could call it from a
 * visitor's browser. The guards below close that.
 *
 * What is enforced here:
 *   1. Same-origin only. CORS is echoed back solely for allowed origins, so a
 *      browser on another site cannot read the response.
 *   2. Origin/Referer must match an allowed host. This blocks the casual
 *      direct call, including curl with no Origin header.
 *   3. An optional shared secret (SANO_API_SECRET). When set, the request must
 *      carry it. This is the only guard that survives a forged Origin header.
 *   4. Prompt size cap, so a single request cannot run up a large bill.
 *
 * What this is NOT: real authentication. Origin and Referer are trivially
 * forged outside a browser, so guard 2 raises the effort required rather than
 * making abuse impossible. Per-user authentication and durable rate limiting
 * arrive with Supabase in Phase 3, where there is somewhere to store sessions
 * and counters. Until then, SANO_API_SECRET is the meaningful lock, and it is
 * worth setting.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  (required)  the Anthropic key
 *   SANO_ALLOWED_ORIGINS (optional) comma-separated; defaults below
 *   SANO_API_SECRET    (optional, recommended) shared secret the frontend sends
 */

import { generate, AiError, createBudget, PER_CALL_TIMEOUT_MS } from "./v1/_lib/aiClient.js";
import { createUsageTracker, recordFailure } from "./v1/_lib/usage.js";

export const maxDuration = 60; // allow up to 60s for AI response

// Origins permitted to call this endpoint. Vercel preview deployments get
// generated subdomains, so *.vercel.app under the project name is matched by
// suffix rather than listed one by one.
const DEFAULT_ALLOWED = [
  "https://sano-eight.vercel.app",
  "http://localhost:5173",   // vite dev server
  "http://localhost:4173",   // vite preview
];

function allowedOrigins() {
  const fromEnv = (process.env.SANO_ALLOWED_ORIGINS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_ALLOWED;
}

/**
 * @param origin  the caller's origin
 * @param host    this deployment's own Host header
 *
 * The same-host comparison is the important one. The frontend and this
 * function are deployed together, so a request from Sano's own page always
 * has an origin whose host equals this deployment's host — whatever that host
 * happens to be. That covers production, every preview deployment, and any
 * custom domain added later, with no code change and no list to maintain.
 * Hardcoding "sano-eight.vercel.app" would have broken the live site the day
 * a custom domain was pointed at it.
 */
function isAllowedOrigin(origin, host) {
  if (!origin) return false;

  let originHost;
  try { originHost = new URL(origin).host; } catch { return false; }

  // Same-origin: the page calling us is served by this very deployment.
  if (host && originHost === host) return true;

  // Explicitly configured origins (SANO_ALLOWED_ORIGINS, or the dev defaults).
  if (allowedOrigins().includes(origin)) return true;

  return false;
}

/** The caller's origin, falling back to the Referer's origin. */
function callerOrigin(req) {
  const origin = req.headers.origin;
  if (origin) return origin;
  const referer = req.headers.referer || req.headers.referrer;
  if (!referer) return null;
  try { return new URL(referer).origin; } catch { return null; }
}

// A single report is four calls; this caps what any one of them can cost.
const MAX_PROMPT_CHARS = 24000;

export default async function handler(req, res) {
  const origin = callerOrigin(req);
  const originOk = isAllowedOrigin(origin, req.headers.host);

  // Reflect the origin only when it is allowed. Never "*": that let any site
  // read the response from a visitor's browser.
  if (originOk) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Sano-Key");

  if (req.method === "OPTIONS") {
    return res.status(originOk ? 200 : 403).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Guard: shared secret, when configured ──
  // Checked before the origin so that a correctly keyed server-to-server
  // caller (the evaluation runner's live mode, for instance) is not refused
  // for having no browser Origin header.
  const secret = process.env.SANO_API_SECRET;
  const presented = req.headers["x-sano-key"];
  const secretOk = secret ? presented === secret : false;

  if (secret && !secretOk && !originOk) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!secret && !originOk) {
    // No secret configured: the origin check is the only guard there is.
    return res.status(403).json({ error: "Forbidden" });
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing or invalid prompt" });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(413).json({
      error: `Prompt too large (${prompt.length} characters, limit ${MAX_PROMPT_CHARS})`,
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY not configured. Add it in Vercel → Settings → Environment Variables.",
    });
  }

  // ── PH2-API-02 ──
  // Previously this called fetch() with no timeout, so a hung upstream ran
  // until Vercel killed the whole function at 60s. A killed function returns
  // no body at all, which the frontend reported as a non-JSON response: the
  // least actionable failure available. The client below bounds each call,
  // retries once where retrying can help, and always returns a real body.
  const requestId = (globalThis.crypto && globalThis.crypto.randomUUID)
    ? globalThis.crypto.randomUUID() : "req_" + Date.now().toString(36);
  res.setHeader("X-Request-Id", requestId);

  const usage = createUsageTracker({ requestId });
  const budget = createBudget();

  try {
    const result = await generate(prompt, {
      apiKey: process.env.ANTHROPIC_API_KEY,
      budget,
      timeoutMs: PER_CALL_TIMEOUT_MS,
      onUsage: (u) => usage.record(u),
      label: "report-step",
    });
    usage.flush({ outcome: "success" });
    return res.status(200).json({ text: result.text });

  } catch (err) {
    const e = err instanceof AiError ? err : new AiError("INTERNAL_ERROR", "Analysis failed.", { detail: String(err) });
    recordFailure({ requestId, step: "generate", error: e, budgetSpentMs: budget.spent() });
    usage.flush({ outcome: "failed", errorCode: e.code });

    // Map to an HTTP status the frontend can act on, and return a message
    // that is true and safe to show. No upstream payloads, no stack traces.
    const status = e.code === "AI_TIMEOUT" ? 504
                 : e.code === "AI_UNAVAILABLE" ? 503
                 : e.code === "NOT_CONFIGURED" ? 500
                 : e.code === "VALIDATION_FAILED" ? 400
                 : 502;
    return res.status(status).json({ error: e.message, code: e.code, requestId });
  }
}

// Exported for unit tests. Not part of the request path.
export const __testing = { isAllowedOrigin, callerOrigin, allowedOrigins, MAX_PROMPT_CHARS };
