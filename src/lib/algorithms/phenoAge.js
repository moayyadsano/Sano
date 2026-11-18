/**
 * phenoAge.js — Levine 2018 biological age
 * ---------------------------------------------------------------------------
 * PURE MODULE. No React. No DOM. No side effects.
 * Every function returns the same output for the same input, so it can be
 * unit-tested on its own and later reused by the backend unchanged.
 *
 * SCOPE: eligibility checking only. The full Gompertz calculation lands in
 * PH1-ALG-03. Until then no biological age is ever displayed -- the tool says
 * which of the nine required inputs are missing instead of guessing.
 */

// PhenoAge inputs (Levine 2018)
export const PHENOAGE_KEYS = ["albumin","creatinine","glucose","hsCRP","lymphPct","mcv","rdw","alp","wbc"];

// ─── PhenoAge eligibility ─────────────────────────────────────────────────────
export function phenoAgeEligible(labs) {
  return PHENOAGE_KEYS.every(k => labs[k] !== "" && labs[k] !== undefined);
}