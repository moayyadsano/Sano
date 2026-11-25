/**
 * auth.js — who is calling, and may they do this
 * ---------------------------------------------------------------------------
 * PH2-API-01 defines the CONTRACT. Token verification is deliberately left as
 * a single injected function, because the thing that will verify tokens —
 * Supabase — does not exist until PH2-API-03.
 *
 * What is settled here: the roles, how a token is read off a request, the
 * shape of `req.user`, and the authorisation predicates every endpoint will
 * call. What is not settled is the signature check, and this module refuses
 * every request until that is wired in. It does not fall back to decoding the
 * token unverified: a JWT's payload is base64, not encryption, so "read the
 * claims and trust them" is the same as having no authentication at all, and
 * it is an easy thing to leave in by accident.
 *
 * ── the access rule that matters ───────────────────────────────────────────
 * From the endpoint table, most patient routes are `Physician|Patient(own)`.
 * Two distinct permissions hide in that: a physician may read a patient they
 * are ASSIGNED to, and a patient may read ONLY THEMSELVES. Collapsing those
 * into "is a physician OR is this patient" is how one physician ends up able
 * to read another physician's patients. `canAccessPatient` keeps them apart
 * and requires the assignment to be proved, not assumed.
 */

export const ROLES = { PHYSICIAN: "physician", PATIENT: "patient", ADMIN: "admin" };
const ALL_ROLES = new Set(Object.values(ROLES));

/**
 * Pull a bearer token off the request.
 * Authorization header only — not a query parameter, which would end up in
 * server logs, browser history and Referer headers.
 */
export function extractToken(req) {
  const header = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length ? token : null;
}

/**
 * The verifier. Phase 3 replaces this with a call to Supabase.
 * Until then it throws, so no route can be deployed believing it is protected.
 */
let verifyToken = async function notConfigured() {
  throw new Error("auth verifier not configured — wired up in PH2-API-03 with Supabase");
};

/** @param fn async (token) => { id, role, email? } | null */
export function setVerifier(fn) { verifyToken = fn; }
export function isVerifierConfigured() {
  return verifyToken.name !== "notConfigured";
}

/**
 * Resolve the caller.
 * @returns { ok: true, user } | { ok: false, code }
 */
export async function authenticate(req) {
  const token = extractToken(req);
  if (!token) return { ok: false, code: "UNAUTHENTICATED" };

  let user;
  try {
    user = await verifyToken(token);
  } catch (err) {
    // An expired token is a normal event and deserves its own code so the
    // client can refresh silently instead of dumping the user at a login screen.
    const msg = String((err && err.message) || "");
    if (/expire/i.test(msg)) return { ok: false, code: "TOKEN_EXPIRED" };
    if (!isVerifierConfigured()) return { ok: false, code: "NOT_CONFIGURED" };
    return { ok: false, code: "TOKEN_INVALID" };
  }

  if (!user || !user.id || !ALL_ROLES.has(user.role)) {
    return { ok: false, code: "TOKEN_INVALID" };
  }
  return { ok: true, user };
}

/**
 * Authenticate, or send the error and return null.
 * Usage: `const user = await requireAuth(req, res, fail); if (!user) return;`
 */
export async function requireAuth(req, res, fail) {
  const result = await authenticate(req);
  if (!result.ok) {
    fail(res, result.code, { requestId: req.requestId });
    return null;
  }
  req.user = result.user;
  return result.user;
}

/** Require one of the given roles. Returns false and sends 403 if not. */
export function requireRole(req, res, roles, fail) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!req.user || !allowed.includes(req.user.role)) {
    fail(res, "WRONG_ROLE", { requestId: req.requestId });
    return false;
  }
  return true;
}

/**
 * May this user see this patient's data?
 *
 * @param user           the authenticated caller
 * @param patientId      the patient being addressed
 * @param isAssigned     async (physicianId, patientId) => boolean, backed by
 *                       the relationships table in Phase 3
 *
 * A physician's access is never assumed from their role alone; the assignment
 * has to come back true. If the lookup throws, access is refused — a database
 * error must not read as permission.
 */
export async function canAccessPatient(user, patientId, isAssigned) {
  if (!user || !patientId) return false;
  if (user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.PATIENT) return user.id === patientId;
  if (user.role === ROLES.PHYSICIAN) {
    if (typeof isAssigned !== "function") return false;
    try {
      return (await isAssigned(user.id, patientId)) === true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Guard a patient-scoped route, sending the right error. Returns boolean. */
export async function requirePatientAccess(req, res, patientId, isAssigned, fail) {
  const allowed = await canAccessPatient(req.user, patientId, isAssigned);
  if (allowed) return true;
  // Same code either way: telling an unassigned physician "that patient
  // exists but is not yours" confirms the patient exists.
  fail(res, "NOT_ASSIGNED", { requestId: req.requestId });
  return false;
}
