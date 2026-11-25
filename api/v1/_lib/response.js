/**
 * response.js — the shape of every Sano API reply
 * ---------------------------------------------------------------------------
 * PURE except for writing to the response object. No database, no network.
 *
 * Every endpoint under /api/v1 answers in one of exactly two shapes, so a
 * client never has to guess what it received:
 *
 *   success  { success: true,  data: {...}, meta: { timestamp, requestId, version } }
 *   failure  { success: false, error: { code, message, field? },
 *                              meta: { timestamp, requestId, version } }
 *
 * `success` is a boolean the caller can branch on before touching anything
 * else. The old /api/claude endpoint returned `{text}` on success and
 * `{error}` on failure, so the frontend had to probe for the presence of
 * fields to work out which it had — the kind of ambiguity that produced the
 * "Bad shape" errors earlier in this project.
 *
 * ── why requestId matters here ─────────────────────────────────────────────
 * This is clinical software. When a physician says "the report failed at
 * 14:32", the requestId is what connects that sentence to a log line. It is
 * returned on success as well as failure, so it can be quoted from a report
 * that looked fine but contained something odd.
 *
 * ── what must never appear in an error ─────────────────────────────────────
 * Error messages are read by whoever can reach the endpoint, so they carry no
 * patient data, no values from the request body, and no internal detail
 * (stack traces, SQL, upstream payloads). `fail()` takes a message from the
 * catalogue below rather than from an exception. Diagnostics go to the server
 * log against the requestId, where only the operator can see them.
 */

export const API_VERSION = "v1";

/**
 * The full error catalogue. Every error the API can return is named here, so
 * a client can branch on a stable `code` instead of matching on prose, and so
 * the set is reviewable in one place.
 *
 * `status` is the HTTP status that accompanies the code, following the
 * conventions agreed in the plan:
 *   400 validation   401 unauthenticated   403 unauthorized   404 not found
 *   409 conflict     413 too large         422 unprocessable  429 rate limited
 *   500 server       502 upstream          503 unavailable    504 timeout
 */
export const ERRORS = {
  // ── request shape ──
  VALIDATION_FAILED:    { status: 400, message: "One or more fields are invalid." },
  MALFORMED_JSON:       { status: 400, message: "Request body is not valid JSON." },
  MISSING_FIELD:        { status: 400, message: "A required field is missing." },
  UNSUPPORTED_METHOD:   { status: 405, message: "That HTTP method is not supported on this route." },
  PAYLOAD_TOO_LARGE:    { status: 413, message: "Request body is too large." },

  // ── identity ──
  UNAUTHENTICATED:      { status: 401, message: "Sign in to continue." },
  TOKEN_EXPIRED:        { status: 401, message: "Session expired. Sign in again." },
  TOKEN_INVALID:        { status: 401, message: "Session is not valid." },
  FORBIDDEN:            { status: 403, message: "You do not have access to this resource." },
  WRONG_ROLE:           { status: 403, message: "This action is not available to your account type." },

  // ── resources ──
  NOT_FOUND:            { status: 404, message: "That resource does not exist." },
  ALREADY_EXISTS:       { status: 409, message: "That resource already exists." },
  NOT_ASSIGNED:         { status: 403, message: "That patient is not assigned to you." },

  // ── clinical preconditions ──
  // A refusal to calculate is a normal, expected answer in this tool, not a
  // fault. These carry 422: the request was well formed, but the data cannot
  // support what was asked.
  INSUFFICIENT_DATA:    { status: 422, message: "Not enough data to produce this result." },
  IMPLAUSIBLE_VALUES:   { status: 422, message: "One or more values fall outside physiological range." },
  OUT_OF_MODEL_RANGE:   { status: 422, message: "Patient falls outside the range this model was developed on." },

  // ── limits and upstream ──
  RATE_LIMITED:         { status: 429, message: "Too many requests. Try again shortly." },
  AI_TIMEOUT:           { status: 504, message: "The analysis took too long. Nothing was saved; try again." },
  AI_UNAVAILABLE:       { status: 502, message: "The analysis service is unavailable. Try again shortly." },
  UPSTREAM_ERROR:       { status: 502, message: "An upstream service failed." },

  // ── catch-all ──
  INTERNAL_ERROR:       { status: 500, message: "Something went wrong on our side." },
  NOT_CONFIGURED:       { status: 500, message: "The server is missing required configuration." },
};

/**
 * A short, unique-enough id for correlating a reply with a log line.
 * crypto.randomUUID exists in every runtime Sano targets; the fallback keeps
 * this module usable in a bare test environment.
 */
export function newRequestId() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch { /* fall through */ }
  return "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

function meta(requestId) {
  return {
    timestamp: new Date().toISOString(),
    requestId: requestId || newRequestId(),
    version: API_VERSION,
  };
}

/** Build the success envelope without sending it. Useful in tests. */
export function successBody(data, requestId) {
  return { success: true, data: data === undefined ? null : data, meta: meta(requestId) };
}

/** Build the error envelope without sending it. Useful in tests. */
export function errorBody(code, { field, message } = {}, requestId) {
  const known = ERRORS[code];
  return {
    success: false,
    error: {
      code: known ? code : "INTERNAL_ERROR",
      // An unknown code must not leak its own name as prose to the caller.
      message: message || (known ? known.message : ERRORS.INTERNAL_ERROR.message),
      ...(field ? { field } : {}),
    },
    meta: meta(requestId),
  };
}

/** Send a success reply. `status` is 200 unless the caller created something. */
export function ok(res, data, { status = 200, requestId } = {}) {
  return res.status(status).json(successBody(data, requestId));
}

/** Send a 201 for a resource that was created. */
export function created(res, data, opts = {}) {
  return ok(res, data, { ...opts, status: 201 });
}

/**
 * Send an error reply.
 *
 * @param code   a key of ERRORS. An unrecognised code becomes INTERNAL_ERROR
 *               rather than being echoed back, so a typo cannot invent a
 *               public error code or return a 200.
 * @param opts.field     the offending field, for validation errors
 * @param opts.message   overrides the catalogue message. Use only for text
 *                       that is safe to show a caller — never an exception
 *                       message, which can carry internal detail.
 * @param opts.logDetail recorded server-side against the requestId and never
 *                       sent to the caller.
 */
export function fail(res, code, opts = {}) {
  const known = ERRORS[code];
  const status = known ? known.status : ERRORS.INTERNAL_ERROR.status;
  const body = errorBody(code, opts, opts.requestId);

  if (opts.logDetail !== undefined) {
    // Server-side only. The caller sees the requestId and nothing more.
    console.error(`[${body.meta.requestId}] ${body.error.code}:`, opts.logDetail);
  }
  if (!known) {
    console.error(`[${body.meta.requestId}] unknown error code requested: ${String(code)}`);
  }

  if (code === "RATE_LIMITED" && opts.retryAfterSeconds) {
    res.setHeader("Retry-After", String(Math.ceil(opts.retryAfterSeconds)));
  }
  return res.status(status).json(body);
}

/**
 * Wrap a handler so an unexpected throw becomes a clean 500 with a requestId,
 * instead of a runtime stack trace reaching the caller.
 */
export function withEnvelope(handler) {
  return async function wrapped(req, res) {
    const requestId = newRequestId();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    try {
      return await handler(req, res);
    } catch (err) {
      return fail(res, "INTERNAL_ERROR", {
        requestId,
        logDetail: err && err.stack ? err.stack : String(err),
      });
    }
  };
}
