/**
 * claude.test.js
 * ---------------------------------------------------------------------------
 * The AI proxy spends real money. Before PH2-API-01 it was an open endpoint:
 * `Access-Control-Allow-Origin: *`, no authentication, no rate limiting. Anyone
 * who found the URL could run up the owner's Anthropic bill, and any other
 * site's JavaScript could call it from a visitor's browser.
 *
 * These tests pin the guard that closed it. The expensive direction is a
 * regression that re-opens the endpoint silently, so the refusals are tested
 * at least as carefully as the permitted case.
 *
 * The same-origin behaviour was also verified against a real Chromium browser
 * driving the actual frontend: a same-origin POST does send an Origin header
 * whose host equals the deployment's own Host, which is what the guard keys
 * off. That check cannot run in CI without a browser, so it is recorded here
 * rather than re-run.
 */

import { describe, test, expect } from "../src/lib/testing/harness.js";
import { __testing as T } from "./claude.js";

const { isAllowedOrigin, callerOrigin, MAX_PROMPT_CHARS } = T;

describe("isAllowedOrigin — same-origin detection", () => {
  // The structural check: the frontend and this function deploy together, so
  // a call from Sano's own page always has origin.host === this host. That
  // holds for production, previews and any custom domain, with no list to keep
  // up to date. A hardcoded hostname would break the day a domain is added.
  test("admits the deployment's own origin", () => {
    expect(isAllowedOrigin("https://sano-eight.vercel.app", "sano-eight.vercel.app")).toBe(true);
  });

  test("admits a custom domain automatically", () => {
    expect(isAllowedOrigin("https://sano.myclinic.sa", "sano.myclinic.sa")).toBe(true);
  });

  test("admits a preview deployment automatically", () => {
    expect(isAllowedOrigin("https://sano-git-feature.vercel.app", "sano-git-feature.vercel.app")).toBe(true);
  });

  test("admits an explicitly configured dev origin", () => {
    expect(isAllowedOrigin("http://localhost:5173", "localhost:3000")).toBe(true);
  });
});

describe("isAllowedOrigin — refusals", () => {
  test("refuses another website", () => {
    expect(isAllowedOrigin("https://evil.example", "sano-eight.vercel.app")).toBe(false);
  });

  test("refuses a host that merely starts with ours", () => {
    // "sano-eight.vercel.app.evil.example" contains the real host as a prefix;
    // a substring check would have let it through.
    expect(isAllowedOrigin("https://sano-eight.vercel.app.evil.example", "sano-eight.vercel.app")).toBe(false);
  });

  test("refuses a host that merely ends with ours", () => {
    expect(isAllowedOrigin("https://evilsano-eight.vercel.app", "sano-eight.vercel.app")).toBe(false);
  });

  test("refuses a missing origin", () => {
    // curl and other non-browser callers send none. Failing closed here is the
    // whole point: an absent Origin must not read as "trusted".
    expect(isAllowedOrigin(null, "sano-eight.vercel.app")).toBe(false);
    expect(isAllowedOrigin(undefined, "sano-eight.vercel.app")).toBe(false);
    expect(isAllowedOrigin("", "sano-eight.vercel.app")).toBe(false);
  });

  test("refuses an unparseable origin", () => {
    expect(isAllowedOrigin("not-a-url", "sano-eight.vercel.app")).toBe(false);
    expect(isAllowedOrigin("://///", "sano-eight.vercel.app")).toBe(false);
  });

  test("with no Host header, only the explicit allow-list applies", () => {
    // Without a Host there is nothing to compare against, so the same-origin
    // route is unavailable and a custom domain is refused...
    expect(isAllowedOrigin("https://sano.myclinic.sa", undefined)).toBe(false);
    // ...while the production origin still passes, because it is in the
    // built-in list as a fallback for exactly this case.
    expect(isAllowedOrigin("https://sano-eight.vercel.app", undefined)).toBe(true);
  });
});

describe("callerOrigin", () => {
  test("prefers the Origin header", () => {
    expect(callerOrigin({ headers: { origin: "https://a.example", referer: "https://b.example/x" } }))
      .toBe("https://a.example");
  });

  test("falls back to the Referer's origin, dropping the path", () => {
    expect(callerOrigin({ headers: { referer: "https://a.example/some/page?q=1" } }))
      .toBe("https://a.example");
  });

  test("returns null when neither is present", () => {
    expect(callerOrigin({ headers: {} })).toBeNull();
  });

  test("returns null rather than throwing on a malformed Referer", () => {
    expect(callerOrigin({ headers: { referer: "not a url" } })).toBeNull();
  });
});

describe("prompt size cap", () => {
  test("is large enough for a real report call but small enough to bound cost", () => {
    // A full Sano context plus prompt runs roughly 5-6 KB; four calls make a
    // report. The cap stops a single request being used as a cheap way to
    // send very long prompts on someone else's key.
    expect(MAX_PROMPT_CHARS).toBeGreaterThan(8000);
    expect(MAX_PROMPT_CHARS).toBeLessThanOrEqual(32000);
  });
});
