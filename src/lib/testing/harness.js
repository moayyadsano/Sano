/**
 * harness.js — the test API, with no dependencies
 * ---------------------------------------------------------------------------
 * Sano's test suite is written in the familiar describe / test / expect style,
 * but it runs on Node's own built-in test runner. This file is the adapter
 * between the two: `describe` and `test` come straight from node:test, and
 * `expect` is a small chainable wrapper over node:assert.
 *
 * WHY NOT VITEST OR JEST
 * Sano deploys on Vercel, which runs `npm install` and then `npm run build`.
 * Every dependency in package.json is therefore a dependency of the *deploy*,
 * not just of the tests. This project has already lost a production deploy to
 * a bad file in the repo, and a test framework that fails to install — a yanked
 * version, a peer-dependency conflict, a registry hiccup — would take the live
 * site down with it. A clinician cannot see a patient's report because the test
 * runner would not install is an absurd way to fail.
 *
 * So the deal here is: tests cost the deployment nothing. `node --test` is in
 * the runtime already. package.json keeps zero devDependencies, and this file
 * is the entire test framework.
 *
 * The trade is real but small — no watch mode, no coverage, no mocking library.
 * None of those are needed to test pure functions, which is what Sano's
 * algorithms, parser and context builder deliberately are.
 *
 * USAGE
 *   import { describe, test, expect } from "../testing/harness.js";
 * Run everything with `npm test`.
 *
 * The matchers below are only the ones the suite actually uses. Adding one is
 * a few lines; do that rather than reaching for a framework.
 */

import { describe, test } from "node:test";
import assert from "node:assert";

export { describe, test };
export const it = test;

const show = (v) => {
  if (typeof v === "string") return JSON.stringify(v.length > 200 ? v.slice(0, 200) + "…" : v);
  if (v instanceof Error)    return v.message;
  try { return JSON.stringify(v); } catch { return String(v); }
};

function matchers(received) {
  const fail = (msg) => { throw new assert.AssertionError({ message: msg, stackStartFn: fail }); };

  const api = {
    // ── identity and equality ──────────────────────────────────────────────
    toBe(expected) {
      if (!Object.is(received, expected))
        fail(`expected ${show(expected)} but got ${show(received)}`);
    },
    toEqual(expected) {
      try { assert.deepStrictEqual(received, expected); }
      catch { fail(`deep equality failed\n    expected: ${show(expected)}\n    received: ${show(received)}`); }
    },

    // ── emptiness ──────────────────────────────────────────────────────────
    toBeNull()      { if (received !== null)      fail(`expected null but got ${show(received)}`); },
    toBeUndefined() { if (received !== undefined) fail(`expected undefined but got ${show(received)}`); },
    toBeDefined()   { if (received === undefined) fail(`expected a value but got undefined`); },
    toBeTruthy()    { if (!received)              fail(`expected a truthy value but got ${show(received)}`); },
    toBeFalsy()     { if (received)               fail(`expected a falsy value but got ${show(received)}`); },

    // ── numbers ────────────────────────────────────────────────────────────
    // Clinical values are compared as numbers, so these coerce rather than
    // silently failing on a numeric string straight out of a form field.
    toBeGreaterThan(n)        { if (!(Number(received) >  n)) fail(`expected ${show(received)} to be greater than ${n}`); },
    toBeGreaterThanOrEqual(n) { if (!(Number(received) >= n)) fail(`expected ${show(received)} to be at least ${n}`); },
    toBeLessThan(n)           { if (!(Number(received) <  n)) fail(`expected ${show(received)} to be less than ${n}`); },
    toBeLessThanOrEqual(n)    { if (!(Number(received) <= n)) fail(`expected ${show(received)} to be at most ${n}`); },
    toBeCloseTo(n, digits = 2) {
      const tol = Math.pow(10, -digits) / 2;
      if (!(Math.abs(Number(received) - n) < tol))
        fail(`expected ${show(received)} to be within ${tol} of ${n}`);
    },

    // ── strings and collections ────────────────────────────────────────────
    toMatch(pattern) {
      const hit = typeof pattern === "string"
        ? String(received).includes(pattern)
        : pattern.test(String(received));
      if (!hit) fail(`expected ${show(received)} to match ${pattern}`);
    },
    toContain(item) {
      const hit = Array.isArray(received) ? received.includes(item) : String(received).includes(item);
      if (!hit) fail(`expected ${show(received)} to contain ${show(item)}`);
    },
    toHaveLength(n) {
      if (received == null || received.length !== n)
        fail(`expected length ${n} but got ${received == null ? "none" : received.length}`);
    },
    toHaveProperty(key) {
      if (received == null || !(key in received))
        fail(`expected an object with property ${show(key)}`);
    },

    // ── throwing ───────────────────────────────────────────────────────────
    toThrow(expected) {
      let thrown = null;
      try { received(); } catch (e) { thrown = e; }
      if (!thrown) fail(`expected the call to throw, but it returned normally`);
      if (expected !== undefined) {
        const msg = thrown.message || String(thrown);
        const hit = typeof expected === "string" ? msg.includes(expected) : expected.test(msg);
        if (!hit) fail(`expected the thrown message to match ${expected} but got ${show(msg)}`);
      }
    },
  };

  // `.not` inverts any matcher: it passes exactly when the matcher would fail.
  api.not = new Proxy({}, {
    get: (_, name) => (...args) => {
      if (typeof api[name] !== "function")
        fail(`no such matcher: not.${String(name)}`);
      let passed = true;
      try { api[name](...args); } catch { passed = false; }
      if (passed) fail(`expected not.${String(name)}(${args.map(show).join(", ")}) to fail, but it passed`);
    },
  });

  return api;
}

export function expect(received) {
  return matchers(received);
}
