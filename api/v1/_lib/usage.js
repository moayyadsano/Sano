/**
 * usage.js — what a report cost, and what happened when one failed
 * ---------------------------------------------------------------------------
 * PURE except for writing to the log. No database yet: the plan puts a
 * usage_logs table in Phase 3, and this module is written so that arrives as
 * a store swap rather than a rewrite, the same way rateLimit.js is.
 *
 * Two things are recorded.
 *
 * COST. Four model calls happen per report and nobody currently knows what
 * that costs. Without a number, "is this affordable per patient" and "did
 * something start looping" are both unanswerable. Token counts come back on
 * every Anthropic response and were simply being discarded.
 *
 * FAILURES. When a report fails, the physician sees one line and the context
 * is gone. A dead-letter record keeps which step failed, after how many
 * attempts, how much time had been spent and the upstream status, tied to the
 * requestId the physician can quote.
 *
 * ── on patient data ───────────────────────────────────────────────────────
 * Neither record contains the prompt or the model's output. Prompts carry the
 * patient's full biomarker panel, so logging them would scatter identifiable
 * clinical data through log aggregation that was never designed to hold it.
 * Only counts, timings and codes are kept — enough to diagnose a failure,
 * never enough to reconstruct a patient.
 */

/**
 * Published prices for the model Sano uses, in USD per million tokens.
 * Prices change; this is for order-of-magnitude awareness, not billing. The
 * figure is clearly labelled as an estimate wherever it is surfaced.
 */
export const PRICING = {
  "claude-sonnet-4-6": { inputPerMTok: 3.00, outputPerMTok: 15.00 },
};

export function estimateCostUsd(inputTokens, outputTokens, model = "claude-sonnet-4-6") {
  const p = PRICING[model];
  if (!p) return null;
  return (inputTokens / 1e6) * p.inputPerMTok + (outputTokens / 1e6) * p.outputPerMTok;
}

/** Swappable sink. Phase 3 points this at the usage_logs table. */
let sink = {
  usage(record)   { console.log("[usage]",       JSON.stringify(record)); },
  failure(record) { console.error("[ai-failure]", JSON.stringify(record)); },
};
export function setSink(next) { sink = next; }
export function getSink() { return sink; }

/**
 * Accumulates the calls of one report so the total can be reported once,
 * rather than leaving someone to add up four log lines.
 */
export function createUsageTracker({ requestId, model = "claude-sonnet-4-6", userId = null } = {}) {
  const calls = [];

  return {
    /** Pass as `onUsage` to aiClient.generate(). */
    record({ inputTokens = 0, outputTokens = 0, attempts = 1, ms = 0, label = "ai" } = {}) {
      calls.push({ label, inputTokens, outputTokens, attempts, ms });
    },

    totals() {
      const t = calls.reduce((a, c) => ({
        inputTokens:  a.inputTokens  + c.inputTokens,
        outputTokens: a.outputTokens + c.outputTokens,
        attempts:     a.attempts     + c.attempts,
        ms:           a.ms           + c.ms,
      }), { inputTokens: 0, outputTokens: 0, attempts: 0, ms: 0 });
      return {
        ...t,
        calls: calls.length,
        // A report should be 4 calls. More means something retried; the
        // difference is the cheapest available signal that upstream is sick.
        retries: Math.max(0, t.attempts - calls.length),
        estimatedCostUsd: estimateCostUsd(t.inputTokens, t.outputTokens, model),
      };
    },

    /** Write the summary. Called once, whether the report succeeded or not. */
    flush({ outcome = "success", errorCode = null } = {}) {
      const totals = this.totals();
      const record = {
        kind: "report_generation",
        requestId, userId, model, outcome, errorCode,
        ...totals,
        // Rounded to the cent-thousandth: a single report costs well under a
        // cent, so two decimal places would read as zero every time.
        estimatedCostUsd: totals.estimatedCostUsd === null
          ? null : Number(totals.estimatedCostUsd.toFixed(5)),
        perCall: calls.map(c => ({ label: c.label, inputTokens: c.inputTokens, outputTokens: c.outputTokens, ms: c.ms, attempts: c.attempts })),
        at: new Date().toISOString(),
      };
      try { sink.usage(record); } catch { /* logging must never break a report */ }
      return record;
    },
  };
}

/**
 * Record a failed generation with enough context to diagnose it later.
 * `detail` may carry upstream error text; it must never carry the prompt.
 */
export function recordFailure({ requestId, userId = null, step, error, budgetSpentMs = null }) {
  const record = {
    kind: "ai_failure",
    requestId, userId, step,
    code: (error && error.code) || "INTERNAL_ERROR",
    upstreamStatus: (error && error.status) || null,
    attempts: (error && error.attempts) || null,
    budgetSpentMs,
    detail: error && error.detail ? String(error.detail).slice(0, 500) : null,
    at: new Date().toISOString(),
  };
  try { sink.failure(record); } catch { /* never throw from the error path */ }
  return record;
}
