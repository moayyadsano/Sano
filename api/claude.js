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

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "Anthropic API error",
        detail: data,
      });
    }

    if (!data.content || !Array.isArray(data.content)) {
      return res.status(500).json({ error: "Unexpected Anthropic response shape", detail: data });
    }

    const text = data.content.map((b) => b.text || "").join("").trim();
    return res.status(200).json({ text });

  } catch (err) {
    console.error("Anthropic proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// Exported for unit tests. Not part of the request path.
export const __testing = { isAllowedOrigin, callerOrigin, allowedOrigins, MAX_PROMPT_CHARS };
