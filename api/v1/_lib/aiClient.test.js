/**
 * aiClient.test.js
 * ---------------------------------------------------------------------------
 * Every report goes through this module, and its failures are the ones a
 * physician actually meets: a slow call, a busy upstream, a request that was
 * never going to work. The cases below pin that each of those produces a
 * distinct, true answer rather than a generic failure.
 *
 * The timeout VALUE is tested as carefully as the timeout mechanism. An
 * earlier version of this module sized the timeout as though one invocation
 * handled all four calls of a report, which gave 11s — short enough to fail
 * a large share of healthy requests, and it would have looked like Anthropic
 * being flaky rather than a bug here.
 */

import { describe, test, expect } from "../../../src/lib/testing/harness.js";
import {
  generate, AiError, createBudget,
  PER_CALL_TIMEOUT_MS, FUNCTION_BUDGET_MS, MIN_REMAINING_MS,
} from "./aiClient.js";
import { createUsageTracker, estimateCostUsd, setSink, getSink, recordFailure } from "./usage.js";

const okResponse = (text = "SUMMARY: fine", usage = { input_tokens: 1200, output_tokens: 300 }) => ({
  ok: true, status: 200,
  json: async () => ({ content: [{ text }], usage, stop_reason: "end_turn" }),
});
const errResponse = (status, message = "upstream says no") => ({
  ok: false, status, json: async () => ({ error: { message } }),
});
/** A fetch that never resolves until aborted. */
const hangingFetch = async (_url, opts) => new Promise((_, reject) => {
  opts.signal.addEventListener("abort", () => {
    const e = new Error("The operation was aborted"); e.name = "AbortError"; reject(e);
  });
});
const noSleep = async () => {};

describe("the timeout budget", () => {
  test("leaves room for a call plus one retry inside the function ceiling", () => {
    expect(PER_CALL_TIMEOUT_MS * 2).toBeLessThanOrEqual(FUNCTION_BUDGET_MS - 4000);
  });

  test("is long enough for a normal completion", () => {
    // A Sonnet call producing 800 tokens commonly runs 8-16s. The earlier
    // 11s value would have failed a large share of healthy requests.
    expect(PER_CALL_TIMEOUT_MS).toBeGreaterThan(20_000);
  });
});

describe("generate — the happy path", () => {
  test("returns the text and the token counts", async () => {
    const r = await generate("hi", { apiKey: "k", fetchImpl: async () => okResponse() });
    expect(r.text).toBe("SUMMARY: fine");
    expect(r.attempts).toBe(1);
    expect(r.usage.inputTokens).toBe(1200);
    expect(r.usage.outputTokens).toBe(300);
  });

  test("reports usage through the callback", async () => {
    const seen = [];
    await generate("hi", { apiKey: "k", fetchImpl: async () => okResponse(), onUsage: u => seen.push(u) });
    expect(seen).toHaveLength(1);
    expect(seen[0].inputTokens).toBe(1200);
  });

  test("a throwing usage callback never breaks the report", async () => {
    // Logging is not worth failing a clinical report over.
    const r = await generate("hi", {
      apiKey: "k", fetchImpl: async () => okResponse(),
      onUsage: () => { throw new Error("log sink exploded"); },
    });
    expect(r.text).toBe("SUMMARY: fine");
  });
});

describe("generate — timeouts", () => {
  test("a hung call aborts instead of running for ever", async () => {
    const started = Date.now();
    let err;
    try {
      await generate("hi", { apiKey: "k", fetchImpl: hangingFetch, timeoutMs: 200, maxRetries: 0 });
    } catch (e) { err = e; }
    expect(err.code).toBe("AI_TIMEOUT");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("a timeout is retried exactly once, then gives up", async () => {
    let calls = 0;
    let err;
    try {
      await generate("hi", {
        apiKey: "k", timeoutMs: 100, maxRetries: 1, sleepImpl: noSleep,
        fetchImpl: (u, o) => { calls++; return hangingFetch(u, o); },
      });
    } catch (e) { err = e; }
    expect(calls).toBe(2);
    expect(err.attempts).toBe(2);
  });

  test("a timeout that then succeeds returns the second result", async () => {
    let calls = 0;
    const r = await generate("hi", {
      apiKey: "k", timeoutMs: 100, maxRetries: 1, sleepImpl: noSleep,
      fetchImpl: (u, o) => { calls++; return calls === 1 ? hangingFetch(u, o) : Promise.resolve(okResponse("SUMMARY: recovered")); },
    });
    expect(r.text).toBe("SUMMARY: recovered");
    expect(r.attempts).toBe(2);
  });
});

describe("generate — which failures are retried", () => {
  const countCalls = (response) => {
    let calls = 0;
    return { calls: () => calls, fetchImpl: async () => { calls++; return response; } };
  };

  for (const status of [429, 500, 502, 503, 529]) {
    test(`${status} is retried`, async () => {
      const c = countCalls(errResponse(status));
      try { await generate("hi", { apiKey: "k", maxRetries: 1, sleepImpl: noSleep, fetchImpl: c.fetchImpl }); } catch {}
      expect(c.calls()).toBe(2);
    });
  }

  for (const status of [400, 401, 403, 404, 413, 422]) {
    test(`${status} is NOT retried`, async () => {
      // The request itself is the problem; retrying burns the budget and
      // delays the error the physician needs to see.
      const c = countCalls(errResponse(status));
      try { await generate("hi", { apiKey: "k", maxRetries: 1, sleepImpl: noSleep, fetchImpl: c.fetchImpl }); } catch {}
      expect(c.calls()).toBe(1);
    });
  }

  test("a network failure is retried", async () => {
    let calls = 0;
    try {
      await generate("hi", {
        apiKey: "k", maxRetries: 1, sleepImpl: noSleep,
        fetchImpl: async () => { calls++; throw new Error("ECONNRESET"); },
      });
    } catch (e) { expect(e.code).toBe("AI_UNAVAILABLE"); }
    expect(calls).toBe(2);
  });
});

describe("generate — refusals", () => {
  test("an empty completion is a failure, not an empty report", async () => {
    // Returning it would let the parsers produce a confident "no findings".
    let err;
    try {
      await generate("hi", { apiKey: "k", maxRetries: 0,
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ content: [{ text: "   " }] }) }) });
    } catch (e) { err = e; }
    expect(err.code).toBe("UPSTREAM_ERROR");
  });

  test("an unreadable response body is a failure", async () => {
    let err;
    try {
      await generate("hi", { apiKey: "k", maxRetries: 0,
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error("not json"); } }) });
    } catch (e) { err = e; }
    expect(err.code).toBe("UPSTREAM_ERROR");
  });

  test("a missing API key fails before any call is made", async () => {
    let calls = 0;
    let err;
    try { await generate("hi", { fetchImpl: async () => { calls++; return okResponse(); } }); } catch (e) { err = e; }
    expect(err.code).toBe("NOT_CONFIGURED");
    expect(calls).toBe(0);
  });

  test("an empty prompt is refused", async () => {
    let err;
    try { await generate("   ", { apiKey: "k", fetchImpl: async () => okResponse() }); } catch (e) { err = e; }
    expect(err.code).toBe("VALIDATION_FAILED");
  });
});

describe("generate — the time budget", () => {
  test("refuses to start a call that cannot finish", async () => {
    // Being killed mid-flight returns no body at all, which the frontend
    // reports as a non-JSON response. Failing cleanly is strictly better.
    let t = 0;
    const budget = createBudget(1000, () => (t += 900));
    let calls = 0;
    let err;
    try {
      await generate("hi", { apiKey: "k", budget, fetchImpl: async () => { calls++; return okResponse(); } });
    } catch (e) { err = e; }
    expect(err.code).toBe("AI_TIMEOUT");
    expect(calls).toBe(0);
  });

  test("a healthy budget lets the call proceed", async () => {
    const budget = createBudget(55_000);
    const r = await generate("hi", { apiKey: "k", budget, fetchImpl: async () => okResponse() });
    expect(r.text).toBe("SUMMARY: fine");
  });

  test("MIN_REMAINING_MS is enough to return an error body", () => {
    expect(MIN_REMAINING_MS).toBeGreaterThanOrEqual(1000);
  });
});

describe("AiError", () => {
  test("carries a code the response layer can map to a status", () => {
    const e = new AiError("AI_TIMEOUT", "too slow", { status: 504, attempts: 2 });
    expect(e.code).toBe("AI_TIMEOUT");
    expect(e.attempts).toBe(2);
    expect(e instanceof Error).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// USAGE ACCOUNTING
// ═══════════════════════════════════════════════════════════════════════════
describe("usage tracking", () => {
  test("totals the calls of a report", () => {
    const t = createUsageTracker({ requestId: "r1" });
    t.record({ inputTokens: 1000, outputTokens: 200, attempts: 1, ms: 3000, label: "overview" });
    t.record({ inputTokens: 1500, outputTokens: 400, attempts: 2, ms: 9000, label: "findings" });
    const totals = t.totals();
    expect(totals.inputTokens).toBe(2500);
    expect(totals.outputTokens).toBe(600);
    expect(totals.calls).toBe(2);
    expect(totals.retries).toBe(1);   // 3 attempts across 2 calls
  });

  test("estimates a cost", () => {
    // Order-of-magnitude awareness, not billing.
    const cost = estimateCostUsd(1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(18.0, 1);   // $3 in + $15 out
  });

  test("an unknown model yields null rather than a wrong number", () => {
    expect(estimateCostUsd(1000, 1000, "some-future-model")).toBeNull();
  });

  test("the flushed record carries no prompt or completion", () => {
    // Prompts contain the patient's full biomarker panel. Logging them would
    // scatter identifiable clinical data through log aggregation.
    const written = [];
    const prev = getSink();
    setSink({ usage: r => written.push(r), failure: () => {} });
    const t = createUsageTracker({ requestId: "r2" });
    t.record({ inputTokens: 100, outputTokens: 50, ms: 1000, label: "overview" });
    t.flush({ outcome: "success" });
    setSink(prev);

    const blob = JSON.stringify(written[0]);
    expect(written).toHaveLength(1);
    expect(blob).not.toMatch(/prompt/i);
    expect(blob).not.toMatch(/SUMMARY:/);
    expect(written[0].outcome).toBe("success");
  });

  test("a failure record keeps the diagnosis but not the patient", () => {
    const written = [];
    const prev = getSink();
    setSink({ usage: () => {}, failure: r => written.push(r) });
    recordFailure({
      requestId: "r3", step: "findings",
      error: new AiError("AI_TIMEOUT", "too slow", { status: 504, attempts: 2, detail: "aborted after 27500ms" }),
      budgetSpentMs: 31000,
    });
    setSink(prev);

    expect(written[0].code).toBe("AI_TIMEOUT");
    expect(written[0].attempts).toBe(2);
    expect(written[0].step).toBe("findings");
    expect(written[0].budgetSpentMs).toBe(31000);
  });

  test("a broken log sink never throws into the report path", () => {
    const prev = getSink();
    setSink({ usage: () => { throw new Error("sink down"); }, failure: () => { throw new Error("sink down"); } });
    const t = createUsageTracker({ requestId: "r4" });
    expect(() => t.flush({ outcome: "success" })).not.toThrow();
    expect(() => recordFailure({ requestId: "r4", step: "x", error: new AiError("AI_TIMEOUT", "x") })).not.toThrow();
    setSink(prev);
  });
});
