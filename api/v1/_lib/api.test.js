/**
 * api.test.js — the API contract
 * ---------------------------------------------------------------------------
 * These helpers sit in front of every endpoint, so a bug here is a bug in all
 * 26 of them at once. The authorisation cases matter most: the failure that
 * exposes one physician's patients to another is a single wrong boolean, and
 * it produces a perfectly normal-looking 200.
 */

import { describe, test, expect } from "../../../src/lib/testing/harness.js";
import {
  ERRORS, API_VERSION, newRequestId, successBody, errorBody, ok, created, fail, withEnvelope,
} from "./response.js";
import { RULES, validate } from "./validate.js";
import {
  ROLES, extractToken, authenticate, setVerifier, canAccessPatient, requireRole,
} from "./auth.js";
import {
  LIMITS, check, identify, clientIp, enforce, __resetAll, setStore, getStore,
} from "./rateLimit.js";

// ─── a response double ───────────────────────────────────────────────────────
function mockRes() {
  return {
    statusCode: null, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}
const mockReq = (over = {}) => ({ headers: {}, body: {}, ...over });

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE ENVELOPE
// ═══════════════════════════════════════════════════════════════════════════
describe("response envelope", () => {
  test("success and failure are distinguishable without inspecting fields", () => {
    // The old /api/claude returned {text} or {error} and the client had to
    // guess which it had. `success` removes the guess.
    expect(successBody({ a: 1 }).success).toBe(true);
    expect(errorBody("NOT_FOUND").success).toBe(false);
  });

  test("every reply carries a timestamp, request id and version", () => {
    for (const body of [successBody({}), errorBody("NOT_FOUND")]) {
      expect(body.meta.version).toBe(API_VERSION);
      expect(body.meta.requestId.length).toBeGreaterThan(8);
      expect(body.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  test("request ids are unique", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newRequestId()));
    expect(ids.size).toBe(500);
  });

  test("ok sends 200 and created sends 201", () => {
    const r1 = mockRes(); ok(r1, { x: 1 });
    expect(r1.statusCode).toBe(200);
    expect(r1.body.data).toEqual({ x: 1 });

    const r2 = mockRes(); created(r2, { id: "abc" });
    expect(r2.statusCode).toBe(201);
  });

  test("undefined data becomes null rather than vanishing", () => {
    // An absent `data` key would make the client's optional chaining hide a
    // bug; an explicit null is a statement.
    expect(successBody(undefined).data).toBeNull();
  });
});

describe("error catalogue", () => {
  test("every code carries a status and a message", () => {
    for (const [code, spec] of Object.entries(ERRORS)) {
      expect(spec.status).toBeGreaterThanOrEqual(400);
      expect(spec.status).toBeLessThan(600);
      expect(`${code}:${spec.message.length > 10}`).toMatch("true");
    }
  });

  test("statuses follow the agreed conventions", () => {
    expect(ERRORS.VALIDATION_FAILED.status).toBe(400);
    expect(ERRORS.UNAUTHENTICATED.status).toBe(401);
    expect(ERRORS.FORBIDDEN.status).toBe(403);
    expect(ERRORS.NOT_FOUND.status).toBe(404);
    expect(ERRORS.ALREADY_EXISTS.status).toBe(409);
    expect(ERRORS.RATE_LIMITED.status).toBe(429);
    expect(ERRORS.INTERNAL_ERROR.status).toBe(500);
  });

  test("a refusal to calculate is 422, not an error status", () => {
    // Sano refuses to compute constantly and by design. Those are valid
    // answers about the data, not faults.
    expect(ERRORS.INSUFFICIENT_DATA.status).toBe(422);
    expect(ERRORS.IMPLAUSIBLE_VALUES.status).toBe(422);
    expect(ERRORS.OUT_OF_MODEL_RANGE.status).toBe(422);
  });

  test("an unknown code becomes INTERNAL_ERROR instead of being echoed", () => {
    const res = mockRes();
    fail(res, "NOT_A_REAL_CODE");
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    // The bogus name must not reach the caller as prose either.
    expect(res.body.error.message).not.toMatch(/NOT_A_REAL_CODE/);
  });

  test("logDetail is never sent to the caller", () => {
    // Stack traces and upstream payloads go to the server log only.
    const res = mockRes();
    fail(res, "INTERNAL_ERROR", { logDetail: "Error: connect ECONNREFUSED 10.0.0.5:5432" });
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toMatch(/ECONNREFUSED/);
    expect(serialised).not.toMatch(/10\.0\.0\.5/);
  });

  test("rate limiting sets Retry-After", () => {
    const res = mockRes();
    fail(res, "RATE_LIMITED", { retryAfterSeconds: 42 });
    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBe("42");
  });
});

describe("withEnvelope", () => {
  test("an unexpected throw becomes a clean 500, not a stack trace", async () => {
    const res = mockRes();
    const handler = withEnvelope(async () => { throw new Error("boom at /secret/path.js:42"); });
    await handler(mockReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/secret\/path/);
  });

  test("the request id is attached and echoed in a header", async () => {
    const res = mockRes(); const req = mockReq();
    await withEnvelope(async (q, r) => ok(r, { fine: true }))(req, res);
    expect(req.requestId.length).toBeGreaterThan(8);
    expect(res.headers["X-Request-Id"]).toBe(req.requestId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════
describe("validate", () => {
  const schema = {
    email:    { rule: RULES.email(), required: true },
    age:      { rule: RULES.number({ min: 0, max: 120, integer: true }), required: true },
    nickname: { rule: RULES.string({ max: 40 }) },
    consent:  { rule: RULES.boolean(), default: false },
  };

  test("accepts a valid body and returns coerced values", () => {
    const r = validate({ email: " A@B.CO ", age: "54", nickname: " x " }, schema);
    expect(r.ok).toBe(true);
    expect(r.value.email).toBe("a@b.co");   // trimmed and lowercased
    expect(r.value.age).toBe(54);           // coerced from the form's string
    expect(r.value.nickname).toBe("x");
    expect(r.value.consent).toBe(false);    // default applied
  });

  test("returns only declared fields, so nothing unvalidated reaches a query", () => {
    const r = validate({ email: "a@b.co", age: 1 }, schema);
    expect(Object.keys(r.value).sort()).toEqual(["age", "consent", "email"]);
  });

  test("rejects an unknown field rather than silently dropping it", () => {
    // Dropping it would let the caller believe it was saved.
    const r = validate({ email: "a@b.co", age: 1, isAdmin: true }, schema);
    expect(r.ok).toBe(false);
    expect(r.field).toBe("isAdmin");
  });

  test("reports a missing required field distinctly", () => {
    const r = validate({ age: 1 }, schema);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("MISSING_FIELD");
    expect(r.field).toBe("email");
  });

  test("rejects a non-object body", () => {
    for (const bad of [null, "string", 42, [1, 2]]) {
      expect(validate(bad, schema).code).toBe("MALFORMED_JSON");
    }
  });

  test("an empty string is not coerced to zero", () => {
    // The bug this prevents: "not measured" silently becoming a measurement
    // of 0, which is a real value for most analytes.
    const r = RULES.number()("", "glucose");
    expect(r.ok).toBe(false);
  });

  test("booleans are not inferred from loose values", () => {
    const rule = RULES.boolean();
    expect(rule(true, "f").ok).toBe(true);
    expect(rule("true", "f").ok).toBe(true);
    for (const v of [1, 0, "yes", "on", "", null]) expect(rule(v, "f").ok).toBe(false);
  });

  test("number bounds and integer-ness are enforced", () => {
    const rule = RULES.number({ min: 0, max: 120, integer: true });
    expect(rule(54, "age").ok).toBe(true);
    expect(rule(-1, "age").ok).toBe(false);
    expect(rule(121, "age").ok).toBe(false);
    expect(rule(54.5, "age").ok).toBe(false);
    expect(rule(NaN, "age").ok).toBe(false);
    expect(rule(Infinity, "age").ok).toBe(false);
    expect(rule(true, "age").ok).toBe(false);
  });

  test("a future date of birth is rejected", () => {
    const rule = RULES.isoDate({ notFuture: true });
    expect(rule("1972-03-14", "dob").ok).toBe(true);
    expect(rule("2062-03-14", "dob").ok).toBe(false);  // transposed year
    expect(rule("14/03/1972", "dob").ok).toBe(false);
  });

  test("impossible days are rejected, not silently rolled over", () => {
    // Date("1972-02-30") parses happily as 1 March, so isNaN never fires.
    // Without the round-trip check the record stores a different day than
    // the one typed and nothing flags it.
    const rule = RULES.isoDate();
    expect(rule("1972-02-30", "dob").ok).toBe(false);
    expect(rule("1972-04-31", "dob").ok).toBe(false);
    expect(rule("1972-13-01", "dob").ok).toBe(false);
  });

  test("leap years are handled correctly", () => {
    const rule = RULES.isoDate();
    expect(rule("2024-02-29", "dob").ok).toBe(true);   // 2024 is a leap year
    expect(rule("2023-02-29", "dob").ok).toBe(false);  // 2023 is not
    expect(rule("1900-02-29", "dob").ok).toBe(false);  // century, not a leap year
    expect(rule("2000-02-29", "dob").ok).toBe(true);   // divisible by 400
  });

  test("passwords are judged on length alone", () => {
    const rule = RULES.password({ min: 12 });
    expect(rule("correct horse battery staple", "p").ok).toBe(true);
    expect(rule("Sh0rt!", "p").ok).toBe(false);
  });

  test("enum membership is exact", () => {
    const rule = RULES.enum(["Male", "Female"]);
    expect(rule("Male", "sex").ok).toBe(true);
    expect(rule("male", "sex").ok).toBe(false);
  });

  test("uuid format is enforced", () => {
    const rule = RULES.uuid();
    expect(rule("3f2504e0-4f89-41d3-9a0c-0305e82c3301", "id").ok).toBe(true);
    expect(rule("not-an-id", "id").ok).toBe(false);
    expect(rule("' OR 1=1 --", "id").ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════
describe("extractToken", () => {
  test("reads a bearer token", () => {
    expect(extractToken(mockReq({ headers: { authorization: "Bearer abc.def.ghi" } }))).toBe("abc.def.ghi");
    expect(extractToken(mockReq({ headers: { authorization: "bearer abc" } }))).toBe("abc");
  });

  test("ignores anything that is not a bearer token", () => {
    for (const h of ["Basic abc", "Bearer", "Bearer   ", "", undefined]) {
      expect(extractToken(mockReq({ headers: { authorization: h } }))).toBeNull();
    }
  });

  test("does not read a token from the query string", () => {
    // Query strings leak into logs, history and Referer headers.
    const req = mockReq({ headers: {}, query: { token: "abc" }, url: "/api/v1/x?token=abc" });
    expect(extractToken(req)).toBeNull();
  });
});

describe("authenticate", () => {
  test("refuses everything until a verifier is configured", async () => {
    // The dangerous alternative is decoding the JWT payload unverified, which
    // is just base64 and amounts to no authentication at all.
    const r = await authenticate(mockReq({ headers: { authorization: "Bearer anything" } }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe("NOT_CONFIGURED");
  });

  test("no token is unauthenticated", async () => {
    expect((await authenticate(mockReq())).code).toBe("UNAUTHENTICATED");
  });

  test("a verified token yields the user", async () => {
    setVerifier(async (t) => (t === "good" ? { id: "u1", role: ROLES.PHYSICIAN } : null));
    const r = await authenticate(mockReq({ headers: { authorization: "Bearer good" } }));
    expect(r.ok).toBe(true);
    expect(r.user.role).toBe("physician");
  });

  test("an expired token is distinguishable from an invalid one", async () => {
    // So the client can refresh silently instead of dumping the physician at
    // a login screen mid-consultation.
    setVerifier(async () => { throw new Error("jwt expired"); });
    expect((await authenticate(mockReq({ headers: { authorization: "Bearer x" } }))).code).toBe("TOKEN_EXPIRED");
  });

  test("a token for an unknown role is rejected", async () => {
    setVerifier(async () => ({ id: "u1", role: "superuser" }));
    expect((await authenticate(mockReq({ headers: { authorization: "Bearer x" } }))).code).toBe("TOKEN_INVALID");
  });

  test("a token with no user id is rejected", async () => {
    setVerifier(async () => ({ role: ROLES.PHYSICIAN }));
    expect((await authenticate(mockReq({ headers: { authorization: "Bearer x" } }))).code).toBe("TOKEN_INVALID");
  });
});

describe("requireRole", () => {
  test("admits the right role and refuses the wrong one", () => {
    const res1 = mockRes();
    expect(requireRole(mockReq({ user: { role: ROLES.PHYSICIAN } }), res1, ROLES.PHYSICIAN, fail)).toBe(true);

    const res2 = mockRes();
    expect(requireRole(mockReq({ user: { role: ROLES.PATIENT } }), res2, ROLES.PHYSICIAN, fail)).toBe(false);
    expect(res2.statusCode).toBe(403);
  });

  test("refuses when there is no user at all", () => {
    expect(requireRole(mockReq(), mockRes(), ROLES.PHYSICIAN, fail)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATIENT ACCESS — the boundary that matters most
// ═══════════════════════════════════════════════════════════════════════════
describe("canAccessPatient", () => {
  const assignedTo = (pairs) => async (physId, patId) => pairs.some(([a, b]) => a === physId && b === patId);

  test("a patient may read only themselves", async () => {
    const patient = { id: "p1", role: ROLES.PATIENT };
    expect(await canAccessPatient(patient, "p1", assignedTo([]))).toBe(true);
    expect(await canAccessPatient(patient, "p2", assignedTo([]))).toBe(false);
  });

  test("a physician may read an assigned patient", async () => {
    const doc = { id: "d1", role: ROLES.PHYSICIAN };
    expect(await canAccessPatient(doc, "p1", assignedTo([["d1", "p1"]]))).toBe(true);
  });

  test("a physician may NOT read another physician's patient", async () => {
    // The failure this guards against: treating "is a physician" as enough,
    // which hands every physician the whole patient list.
    const doc = { id: "d1", role: ROLES.PHYSICIAN };
    expect(await canAccessPatient(doc, "p9", assignedTo([["d2", "p9"]]))).toBe(false);
  });

  test("a physician with no assignment lookup is refused", async () => {
    // Access is never inferred from the role alone.
    const doc = { id: "d1", role: ROLES.PHYSICIAN };
    expect(await canAccessPatient(doc, "p1", undefined)).toBe(false);
  });

  test("a failing assignment lookup refuses access", async () => {
    // A database error must not read as permission.
    const doc = { id: "d1", role: ROLES.PHYSICIAN };
    const broken = async () => { throw new Error("connection lost"); };
    expect(await canAccessPatient(doc, "p1", broken)).toBe(false);
  });

  test("a lookup returning something merely truthy is refused", async () => {
    // Strict === true: a stray row object or "false" string must not pass.
    const doc = { id: "d1", role: ROLES.PHYSICIAN };
    for (const v of [1, "yes", {}, [], "false"]) {
      expect(await canAccessPatient(doc, "p1", async () => v)).toBe(false);
    }
  });

  test("no user and no patient id are refused", async () => {
    expect(await canAccessPatient(null, "p1", async () => true)).toBe(false);
    expect(await canAccessPatient({ id: "d1", role: ROLES.PHYSICIAN }, null, async () => true)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════
describe("rate limiting", () => {
  test("the configured limits match the plan", () => {
    expect(LIMITS.auth).toEqual({ max: 10, windowMs: 60000, by: "ip", label: "authentication" });
    expect(LIMITS.report.max).toBe(5);
    expect(LIMITS.report.windowMs).toBe(3600000);
    expect(LIMITS.algorithm.max).toBe(60);
    expect(LIMITS.general.max).toBe(100);
  });

  test("allows up to the limit then refuses", () => {
    __resetAll();
    const req = mockReq({ user: { id: "u-a" } });
    for (let i = 1; i <= 5; i++) expect(check(req, "report").allowed).toBe(true);
    expect(check(req, "report").allowed).toBe(false);
  });

  test("counts are per identity, not global", () => {
    __resetAll();
    const a = mockReq({ user: { id: "u-a" } });
    const b = mockReq({ user: { id: "u-b" } });
    for (let i = 0; i < 5; i++) check(a, "report");
    expect(check(a, "report").allowed).toBe(false);
    expect(check(b, "report").allowed).toBe(true);   // b is unaffected
  });

  test("counts are per kind, so a cheap call cannot exhaust the costly budget", () => {
    __resetAll();
    const req = mockReq({ user: { id: "u-c" } });
    for (let i = 0; i < 60; i++) check(req, "algorithm");
    expect(check(req, "report").allowed).toBe(true);
  });

  test("an unauthenticated caller is counted by IP, not given a free pass", () => {
    __resetAll();
    const req = mockReq({ headers: { "x-forwarded-for": "203.0.113.9" } });
    expect(identify(req, "user")).toBe("ip:203.0.113.9");
    for (let i = 0; i < 10; i++) check(req, "auth");
    expect(check(req, "auth").allowed).toBe(false);
  });

  test("the window expires and the allowance returns", () => {
    __resetAll();
    const store = getStore();
    const req = mockReq({ user: { id: "u-d" } });
    for (let i = 0; i < 5; i++) check(req, "report");
    expect(check(req, "report").allowed).toBe(false);
    // Fast-forward by expiring the bucket rather than waiting an hour.
    store.reset();
    expect(check(req, "report").allowed).toBe(true);
  });

  test("enforce sets headers and sends 429 with Retry-After", () => {
    __resetAll();
    const req = mockReq({ user: { id: "u-e" } });
    const res = mockRes();
    for (let i = 0; i < 5; i++) enforce(req, mockRes(), "report", fail);
    expect(enforce(req, res, "report", fail)).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers["Retry-After"])).toBeGreaterThan(0);
    expect(res.headers["X-RateLimit-Limit"]).toBe("5");
    expect(res.headers["X-RateLimit-Remaining"]).toBe("0");
  });

  test("the store is swappable, so Phase 3 can make limits real", () => {
    // The in-memory store cannot enforce anything across serverless
    // instances; this is the seam a Supabase store drops into.
    const calls = [];
    setStore({
      hit(key, windowMs) { calls.push([key, windowMs]); return { count: 1, resetAt: Date.now() + windowMs }; },
      reset() {},
    });
    check(mockReq({ user: { id: "u-f" } }), "report");
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatch("user:u-f");
    setStore(undefined);
  });
});

describe("clientIp", () => {
  test("prefers the leftmost forwarded address", () => {
    expect(clientIp(mockReq({ headers: { "x-forwarded-for": "203.0.113.9, 70.41.3.18" } }))).toBe("203.0.113.9");
  });

  test("falls back to x-real-ip then the socket", () => {
    expect(clientIp(mockReq({ headers: { "x-real-ip": "198.51.100.2" } }))).toBe("198.51.100.2");
    expect(clientIp(mockReq({ socket: { remoteAddress: "10.1.1.1" } }))).toBe("10.1.1.1");
  });

  test("never throws when nothing is available", () => {
    expect(clientIp(mockReq())).toBe("unknown");
  });
});
