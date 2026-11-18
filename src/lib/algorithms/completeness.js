/**
 * completeness.js — data coverage and confidence
 * ---------------------------------------------------------------------------
 * PURE MODULE. No React. No DOM. No side effects.
 * Every function returns the same output for the same input, so it can be
 * unit-tested on its own and later reused by the backend unchanged.
 *
 * Answers two questions the report depends on:
 *   1. How much of the intake was actually filled in?  -> confidence band
 *   2. Which clinical domains have ZERO data?          -> absent-domain rules
 * A domain is never silently dropped: an empty one is reported as absent so
 * the AI can be told to say so rather than invent an assessment.
 */

// Domain → which lab keys feed it
export const DOMAIN_INPUTS = {
  cardiovascular: ["ldl","hdl","tc","tg","apoB","lpa","hsCRP","homocys"],
  metabolic:      ["glucose","insulin","homaIR","hba1c","vitD","b12","ferritin"],
  hormonal:       ["tsh","ft3","ft4","dheas","cortisol","shbg","testTotal","testFree","estradiol","progesterone","lh","fsh","prolactin"],
  longevity:      ["albumin","alp","wbc","lymphPct","mcv","rdw"],
  physical:       ["creatinine","alt","ast"],
};

// ─── Overall completeness ────────────────────────────────────────────────────
// The caller supplies the field keys that apply to THIS patient, so this module
// never has to know about the UI schema (LAB_GROUPS / BODY_FIELDS / ...).
//
// fieldKeys = { labs: string[], body: string[], lifestyle: string[] }
// The +5 / +3 account for the five patient-profile fields, three of which
// (sex, goal, target philosophy) always carry a value.
export function computeCompleteness(form, fieldKeys) {
  const fk       = fieldKeys || {};
  const labKeys  = fk.labs      || [];
  const bodyKeys = fk.body      || [];
  const lifKeys  = fk.lifestyle || [];

  const has = function (obj, k) {
    return !!obj && obj[k] !== "" && obj[k] !== undefined && obj[k] !== null;
  };

  const total =
    labKeys.length + bodyKeys.length + lifKeys.length + 5;

  const filled =
      labKeys.filter(function (k) { return has(form.labs, k); }).length
    + bodyKeys.filter(function (k) { return has(form.body, k); }).length
    + lifKeys.filter(function (k) { return has(form.lifestyle, k); }).length
    + ["name", "age"].filter(function (k) { return has(form.patient, k); }).length
    + 3;

  return {
    filled: filled,
    total:  total,
    pct:    total ? Math.round((filled / total) * 100) : 0,
  };
}

// ─── Domain coverage (PH1-AI-04) ──────────────────────────────────────────────
// Reports how many inputs each clinical domain actually has.
// Never returns null: an empty domain is reported explicitly as absent, so the
// AI can be told "no data for this domain" rather than silently inventing one.

export const DOMAIN_LABELS = {
  cardiovascular: "Cardiovascular",
  metabolic:      "Metabolic",
  hormonal:       "Hormonal",
  longevity:      "Longevity biomarkers",
  physical:       "Physical and organ function",
};

// Body-composition fields that count toward the physical domain
export const PHYSICAL_BODY_KEYS = ["weight","height","bmi","bodyFat","muscle","waist","sbp","dbp","hr","vo2max","grip"];

// Hormone panels are sex-specific: exclude the panel that does not apply,
// otherwise a male patient looks like he is missing 5 female hormones.
export function domainKeysForSex(domain, sex) {
  const keys = DOMAIN_INPUTS[domain] || [];
  if (domain !== "hormonal") return keys;
  const MALE_ONLY   = ["testTotal","testFree"];
  const FEMALE_ONLY = ["estradiol","progesterone","lh","fsh","prolactin"];
  return keys.filter(function(k) {
    if (sex === "Male")   return FEMALE_ONLY.indexOf(k) === -1;
    if (sex === "Female") return MALE_ONLY.indexOf(k) === -1;
    return true;
  });
}

export function computeDomainCoverage(form, sex) {
  const labs = form.labs || {};
  const body = form.body || {};
  const has  = function(obj, k) { return obj[k] !== "" && obj[k] !== undefined && obj[k] !== null; };

  const out = {};
  Object.keys(DOMAIN_INPUTS).forEach(function(domain) {
    const keys  = domainKeysForSex(domain, sex);
    let present = keys.filter(function(k) { return has(labs, k); }).length;
    let total   = keys.length;

    if (domain === "physical") {
      present += PHYSICAL_BODY_KEYS.filter(function(k) { return has(body, k); }).length;
      total   += PHYSICAL_BODY_KEYS.length;
    }

    out[domain] = {
      label:   DOMAIN_LABELS[domain] || domain,
      present: present,
      total:   total,
      pct:     total ? Math.round((present / total) * 100) : 0,
      absent:  present === 0,
    };
  });
  return out;
}

// Confidence band derived from overall completeness
export function confidenceLabel(pct) {
  if (pct >= 70) return "Good";
  if (pct >= 40) return "Moderate";
  return "Low";
}