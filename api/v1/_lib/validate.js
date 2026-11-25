/**
 * validate.js — check a request body before anything acts on it
 * ---------------------------------------------------------------------------
 * PURE MODULE. No React, no DOM, no network, no database.
 *
 * Validation here is about rejecting what should not be stored or acted upon.
 * It is deliberately NOT where clinical plausibility lives: a potassium of 9.1
 * is a valid number and an invalid patient, and that distinction belongs to
 * algorithms/plausibility.js, which quarantines rather than rejects. This
 * module answers a narrower question — is this field the right type, the right
 * shape, and within bounds that could never be legitimate?
 *
 * Two rules it enforces that are easy to get wrong:
 *
 *   1. Unknown fields are rejected, not ignored. A request carrying a field
 *      the schema does not know is more likely a client bug or an attempt to
 *      set something it should not than a harmless extra. Silently dropping
 *      it means the caller believes it was saved.
 *
 *   2. Only the first failure is returned. Reporting every problem at once
 *      reads as friendlier, but it lets an unauthenticated caller map the
 *      whole schema from one malformed request.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Deliberately permissive: the aim is to catch typos, not to adjudicate what
// a valid address is. Over-strict email regexes reject real addresses.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** { ok: true, value } | { ok: false, code, field, message } */
const pass = (value) => ({ ok: true, value });
const reject = (field, message, code = "VALIDATION_FAILED") => ({ ok: false, code, field, message });

export const RULES = {
  string({ min = 0, max = 1000, pattern, trim = true } = {}) {
    return (v, field) => {
      if (typeof v !== "string") return reject(field, "Must be text.");
      const s = trim ? v.trim() : v;
      if (s.length < min) return reject(field, min === 1 ? "Must not be empty." : `Must be at least ${min} characters.`);
      if (s.length > max) return reject(field, `Must be at most ${max} characters.`);
      if (pattern && !pattern.test(s)) return reject(field, "Is not in the expected format.");
      return pass(s);
    };
  },

  /**
   * A number that may arrive as a numeric string, because that is what form
   * fields produce. Empty string is NOT coerced to 0 — that silent conversion
   * would turn "not measured" into a measurement of zero.
   */
  number({ min = -Infinity, max = Infinity, integer = false } = {}) {
    return (v, field) => {
      if (v === "" || v === null || v === undefined) return reject(field, "Must be a number.");
      if (typeof v === "boolean") return reject(field, "Must be a number.");
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return reject(field, "Must be a number.");
      if (integer && !Number.isInteger(n)) return reject(field, "Must be a whole number.");
      if (n < min) return reject(field, `Must be at least ${min}.`);
      if (n > max) return reject(field, `Must be at most ${max}.`);
      return pass(n);
    };
  },

  boolean() {
    return (v, field) => {
      if (typeof v === "boolean") return pass(v);
      // Accept the two canonical strings a form sends, nothing looser:
      // "yes"/"1"/0 coercion is how a default becomes a deliberate answer.
      if (v === "true") return pass(true);
      if (v === "false") return pass(false);
      return reject(field, "Must be true or false.");
    };
  },

  enum(allowed) {
    return (v, field) => {
      if (!allowed.includes(v)) return reject(field, `Must be one of: ${allowed.join(", ")}.`);
      return pass(v);
    };
  },

  email() {
    return (v, field) => {
      if (typeof v !== "string") return reject(field, "Must be text.");
      const s = v.trim().toLowerCase();
      if (s.length > 254 || !EMAIL.test(s)) return reject(field, "Is not a valid email address.");
      return pass(s);
    };
  },

  /**
   * Password rules are a length floor and nothing else, deliberately. Forced
   * character classes push people toward predictable substitutions; length is
   * what actually helps, and the rest belongs to the auth provider.
   */
  password({ min = 12, max = 200 } = {}) {
    return (v, field) => {
      if (typeof v !== "string") return reject(field, "Must be text.");
      if (v.length < min) return reject(field, `Must be at least ${min} characters.`);
      if (v.length > max) return reject(field, `Must be at most ${max} characters.`);
      return pass(v);
    };
  },

  uuid() {
    return (v, field) => {
      if (typeof v !== "string" || !UUID.test(v)) return reject(field, "Is not a valid identifier.");
      return pass(v);
    };
  },

  isoDate({ notFuture = false } = {}) {
    return (v, field) => {
      if (typeof v !== "string" || !ISO_DATE.test(v)) return reject(field, "Must be a date as YYYY-MM-DD.");
      const d = new Date(v + "T00:00:00Z");
      if (Number.isNaN(d.getTime())) return reject(field, "Is not a real date.");
      // Date silently rolls impossible days over: "1972-02-30" parses happily
      // as 1 March. Without this round-trip the record is stored meaning a
      // different day than the one typed, and nothing ever flags it.
      if (d.toISOString().slice(0, 10) !== v) return reject(field, "Is not a real date.");
      // Guards against a transposed year such as 2062 for 2026.
      if (notFuture && d.getTime() > Date.now()) return reject(field, "Cannot be in the future.");
      return pass(v);
    };
  },

  /** A plain object, e.g. a whole intake payload validated further downstream. */
  object({ maxKeys = 200 } = {}) {
    return (v, field) => {
      if (v === null || typeof v !== "object" || Array.isArray(v)) return reject(field, "Must be an object.");
      if (Object.keys(v).length > maxKeys) return reject(field, `Must have at most ${maxKeys} keys.`);
      return pass(v);
    };
  },

  array(itemRule, { min = 0, max = 500 } = {}) {
    return (v, field) => {
      if (!Array.isArray(v)) return reject(field, "Must be a list.");
      if (v.length < min) return reject(field, `Must have at least ${min} items.`);
      if (v.length > max) return reject(field, `Must have at most ${max} items.`);
      if (itemRule) {
        for (let i = 0; i < v.length; i++) {
          const r = itemRule(v[i], `${field}[${i}]`);
          if (!r.ok) return r;
        }
      }
      return pass(v);
    };
  },
};

/**
 * Validate a body against a schema.
 *
 * @param body    the parsed request body
 * @param schema  { fieldName: { rule, required? } }
 * @returns { ok: true, value } | { ok: false, code, field, message }
 *
 * `value` contains ONLY the fields the schema declares, already coerced. The
 * caller should use it in place of the raw body, so an unvalidated value can
 * never reach a query by accident.
 */
export function validate(body, schema) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "MALFORMED_JSON", field: undefined, message: "Request body must be a JSON object." };
  }

  // Unknown fields first: a caller sending something unrecognised should hear
  // about that before being told a different field is malformed.
  const known = new Set(Object.keys(schema));
  for (const key of Object.keys(body)) {
    if (!known.has(key)) {
      return { ok: false, code: "VALIDATION_FAILED", field: key, message: "Is not a recognised field." };
    }
  }

  const out = {};
  for (const [field, spec] of Object.entries(schema)) {
    const present = Object.prototype.hasOwnProperty.call(body, field)
      && body[field] !== undefined
      && body[field] !== null;

    if (!present) {
      if (spec.required) {
        return { ok: false, code: "MISSING_FIELD", field, message: "Is required." };
      }
      if (Object.prototype.hasOwnProperty.call(spec, "default")) out[field] = spec.default;
      continue;
    }

    const result = spec.rule(body[field], field);
    if (!result.ok) return result;
    out[field] = result.value;
  }

  return { ok: true, value: out };
}

/**
 * Validate, or send the error and return null.
 * Lets a handler read: `const body = requireValid(req, res, schema); if (!body) return;`
 */
export function requireValid(req, res, schema, fail) {
  const result = validate(req.body, schema);
  if (result.ok) return result.value;
  fail(res, result.code, { field: result.field, message: result.message, requestId: req.requestId });
  return null;
}
