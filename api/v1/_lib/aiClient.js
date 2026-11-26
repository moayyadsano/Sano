/**
 * aiClient.js — one place where Sano talks to Anthropic
 * ---------------------------------------------------------------------------
 * Before this module, /api/claude called fetch() with no timeout. A slow or
 * hung upstream therefore ran until Vercel killed the whole function at 60
 * seconds, and the physician saw a generic failure with nothing to act on and
 * no record of what happened. Worse, a report is FOUR sequential calls: one
 * call hanging for 60s means the other three never run, and the first thing
 * anyone learns about it is a blank screen.
 *
 * What this module adds:
 *   - a hard per-call timeout, so one slow call cannot eat the whole budget
 *   - exactly one retry, and only for faults where retrying can help
 *   - token accounting, so the cost of a report is visible
 *   - structured failures carrying a reason, so the UI can say something true
 *
 * ── the time budget ───────────────────────────────────────────────────────
 * A report is four model calls, but they are four SEPARATE HTTP requests from
 * the browser — App.jsx calls askAI() four times in sequence, and each one is
 * its own fetch to /api/claude. So each serverless invocation handles exactly
 * one call and gets the whole 60s `maxDuration` to itself.
 *
 * This matters more than it sounds. Sizing the timeout as "60s shared between
 * four calls plus a retry" gives 11s each, and a Sonnet call producing 800
 * tokens routinely takes 8-16s. That version would have started timing out
 * perhaps half of all normal report steps — introducing failures into a
 * working system in the name of reliability.
 *
 * The real constraint is one call plus at most one retry inside one
 * invocation:
 *     (1 call + 1 retry) * timeout <= 60s - 5s headroom  ->  25s each
 *
 * The client also refuses to START a call when too little budget remains.
 * Failing immediately with a clear reason beats being killed mid-flight: a
 * killed function returns no body at all, and the frontend reports that as a
 * non-JSON response, which is the least actionable failure available.
 *
 * ── what is NOT retried ───────────────────────────────────────────────────
 * Retrying a request the server has already rejected on its merits wastes the
 * remaining budget and delays the error the physician needs to see. So:
 *   retry      timeout, network failure, 429, 500, 502, 503, 529
 *   no retry   400, 401, 403, 404, 413, 422 — the request itself is the problem
 */

export const AI_DEFAULTS = {
  model: "claude-sonnet-4-6",
  maxTokens: 800,
  anthropicVersion: "2023-06-01",
  endpoint: "https://api.anthropic.com/v1/messages",
};

/** Vercel's ceiling for this function, minus headroom to return a real error. */
export const FUNCTION_BUDGET_MS = 60_000;
const HEADROOM_MS = 5_000;

/**
 * Attempts one invocation may make: the call itself plus one retry.
 * NOT the four calls of a report — those are four separate invocations, each
 * with its own full budget. See the note at the top of this file.
 */
const ATTEMPTS_PER_INVOCATION = 2;

/**
 * Per-call timeout: 25s, so a call plus one retry fits inside one 60s
 * invocation with headroom to return a real error.
 *
 * The floor matters as much as the ceiling. A Sonnet call producing 800
 * tokens commonly runs 8-16s, so anything much under 20s would start
 * failing healthy requests.
 */
export const PER_CALL_TIMEOUT_MS = Math.floor(
  (FUNCTION_BUDGET_MS - HEADROOM_MS) / ATTEMPTS_PER_INVOCATION
);

/** Below this much remaining budget, a new call is refused rather than started. */
export const MIN_REMAINING_MS = 3_000;

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

/** Thrown for every failure, so callers never have to guess what went wrong. */
export class AiError extends Error {
  constructor(code, message, { status, attempts, detail } = {}) {
    super(message);
    this.name = "AiError";
    this.code = code;          // maps onto the ERRORS catalogue in response.js
    this.status = status;      // upstream HTTP status, when there was one
    this.attempts = attempts;  // how many times we tried
    this.detail = detail;      // server-side only, never sent to a caller
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Track the time budget across the several calls of one report.
 * Created once per request and passed to each call.
 */
export function createBudget(totalMs = FUNCTION_BUDGET_MS - HEADROOM_MS, now = Date.now) {
  const startedAt = now();
  return {
    startedAt,
    remaining: () => totalMs - (now() - startedAt),
    spent: () => now() - startedAt,
  };
}

/**
 * One call to Anthropic, with its own timeout.
 * Separated from the retry loop so the timeout is testable on its own.
 */
async function callOnce(prompt, { apiKey, timeoutMs, fetchImpl, model, maxTokens, signal }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Let a caller-supplied signal also cancel us.
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const res = await fetchImpl(AI_DEFAULTS.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": AI_DEFAULTS.anthropicVersion,
      },
      body: JSON.stringify({
        model: model || AI_DEFAULTS.model,
        max_tokens: maxTokens || AI_DEFAULTS.maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    let data;
    try {
      data = await res.json();
    } catch {
      throw new AiError("UPSTREAM_ERROR", "Upstream returned a response we could not read.",
        { status: res.status });
    }

    if (!res.ok) {
      const retryable = RETRYABLE_STATUS.has(res.status);
      throw new AiError(
        retryable ? "AI_UNAVAILABLE" : "UPSTREAM_ERROR",
        retryable ? "The analysis service is busy." : "The analysis service rejected the request.",
        { status: res.status, detail: data && data.error ? data.error : data }
      );
    }

    if (!data || !Array.isArray(data.content)) {
      throw new AiError("UPSTREAM_ERROR", "Unexpected response shape from the analysis service.",
        { status: res.status, detail: data });
    }

    const text = data.content.map(b => (b && b.text) || "").join("").trim();
    if (!text) {
      // An empty completion is a failure, not an empty report. Returning it
      // would let the parsers produce a confident-looking "no findings".
      throw new AiError("UPSTREAM_ERROR", "The analysis service returned nothing.",
        { status: res.status, detail: data });
    }

    return {
      text,
      usage: {
        inputTokens:  (data.usage && data.usage.input_tokens)  || 0,
        outputTokens: (data.usage && data.usage.output_tokens) || 0,
      },
      stopReason: data.stop_reason || null,
    };

  } catch (err) {
    if (err instanceof AiError) throw err;
    // AbortController surfaces as an AbortError; distinguish our timeout from
    // a genuine network fault, because only one of them says "took too long".
    if (err && (err.name === "AbortError" || /abort/i.test(String(err.message)))) {
      throw new AiError("AI_TIMEOUT", `The analysis took longer than ${Math.round(timeoutMs / 1000)}s.`,
        { detail: "aborted after " + timeoutMs + "ms" });
    }
    throw new AiError("AI_UNAVAILABLE", "Could not reach the analysis service.",
      { detail: String((err && err.message) || err) });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call Anthropic with a timeout and at most one retry.
 *
 * @param prompt         the full prompt
 * @param opts.apiKey    Anthropic key (required)
 * @param opts.budget    from createBudget(), shared across a report's calls
 * @param opts.onUsage   called with { inputTokens, outputTokens, attempts, ms }
 * @returns { text, usage, attempts, ms }
 * @throws AiError
 */
export async function generate(prompt, opts = {}) {
  const {
    apiKey,
    budget,
    timeoutMs = PER_CALL_TIMEOUT_MS,
    maxRetries = 1,
    fetchImpl = globalThis.fetch,
    model, maxTokens, onUsage, label = "ai",
    now = Date.now,
    sleepImpl = sleep,
  } = opts;

  if (!apiKey) throw new AiError("NOT_CONFIGURED", "The analysis service is not configured.");
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new AiError("VALIDATION_FAILED", "Prompt is empty.");
  }

  const startedAt = now();
  let attempts = 0;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Refuse to start a call that cannot finish inside the remaining budget.
    // Being killed mid-flight returns no body at all, which the frontend sees
    // as a non-JSON response — the least useful failure available.
    if (budget) {
      const left = budget.remaining();
      if (left < MIN_REMAINING_MS) {
        throw new AiError("AI_TIMEOUT",
          "Ran out of time before this step could start. Nothing was saved; try again.",
          { attempts, detail: `${left}ms of budget left` });
      }
    }

    // Never let one call's timeout exceed what the budget can actually give it.
    const effectiveTimeout = budget
      ? Math.max(1000, Math.min(timeoutMs, budget.remaining() - 500))
      : timeoutMs;

    attempts++;
    try {
      const result = await callOnce(prompt, {
        apiKey, timeoutMs: effectiveTimeout, fetchImpl, model, maxTokens,
      });
      const ms = now() - startedAt;
      if (onUsage) {
        try { onUsage({ ...result.usage, attempts, ms, label }); } catch { /* logging must never break a report */ }
      }
      return { ...result, attempts, ms };

    } catch (err) {
      lastError = err;
      const retryable = err.code === "AI_TIMEOUT" || err.code === "AI_UNAVAILABLE";
      const haveRetriesLeft = attempt < maxRetries;
      if (!retryable || !haveRetriesLeft) break;

      // A short pause, but only if the budget can spare it. Retrying instantly
      // against a service returning 429 just burns the retry.
      const pause = 400;
      if (budget && budget.remaining() < pause + MIN_REMAINING_MS) break;
      await sleepImpl(pause);
    }
  }

  if (lastError) {
    lastError.attempts = attempts;
    throw lastError;
  }
  throw new AiError("INTERNAL_ERROR", "Analysis failed for an unknown reason.", { attempts });
}
