/**
 * pipeline.js — everything a report is made of, except the model call
 * ---------------------------------------------------------------------------
 * PURE MODULE. No React. No DOM. No network.
 *
 * `prepare()` reproduces exactly what App.jsx's generate() does before it
 * reaches the first AI call: quarantine implausible values, compute coverage
 * and completeness from the right form, run PREVENT, and assemble the context.
 *
 * It mirrors production deliberately, including the one quirk noted below. An
 * evaluation harness that quietly does the right thing where the app does the
 * wrong thing measures a tool nobody is using.
 *
 * `assemble()` turns four raw model responses into the parsed report object the
 * UI renders, using the same parsers the app uses.
 */

import { LAB_GROUPS, BODY_FIELDS, LIFESTYLE_FIELDS } from "../schema.js";
import { buildContext } from "../context.js";
import {
  getImplausibleLabs, computeCompleteness, computeDomainCoverage,
  calcPREVENT, phenoAgeEligible, calcPhenoAge,
} from "../algorithms/index.js";
import {
  parseOverview, parseFindings, parseTargets, parseActionPlan,
  parseNutrition, parseExercise, parseSupplements, parseFollowUp,
} from "../parser.js";

export const PIPELINE_VERSION = "1.0.0";

/** The field keys that apply to this patient — sex decides which hormone panel. */
export function fieldKeysForSex(sex) {
  return {
    labs: LAB_GROUPS.flatMap(g => g.analytes.filter(a => !a.sexFilter || a.sexFilter === sex).map(a => a.key)),
    body: BODY_FIELDS.map(f => f.key),
    lifestyle: LIFESTYLE_FIELDS.map(f => f.key),
  };
}

/**
 * Everything the model is about to be shown, plus the deterministic results
 * that sit beside it in the report.
 */
export function prepare(form, unitSys) {
  const sex = form.patient.sex;

  // ── quarantine ──
  const implausible = getImplausibleLabs(form.labs);
  const cleanLabs = { ...form.labs };
  implausible.forEach(f => { delete cleanLabs[f.key]; });
  const cleanForm = { ...form, labs: cleanLabs };

  // NOTE — mirrors App.jsx: completeness is computed from the ORIGINAL form,
  // so a quarantined value still counts as a filled field and nudges the
  // confidence band up. Coverage, by contrast, uses the cleaned form. The
  // inconsistency is small and is reproduced here on purpose so the eval
  // measures the shipped behaviour rather than an idealised one.
  const completeness = computeCompleteness(form, fieldKeysForSex(sex));
  const coverage     = computeDomainCoverage(cleanForm, sex);
  const prevent      = calcPREVENT(form.prevent, unitSys);
  // From cleanLabs, mirroring App.jsx: a quarantined value must not reach the
  // biological age either.
  const phenoAge     = calcPhenoAge(cleanLabs, form.patient.age);

  const ctx = buildContext(cleanForm, unitSys, completeness, prevent, coverage);
  if (phenoAge) {
    ctx["Phenotypic age (Levine 2018)"] =
      phenoAge.phenoAge + " years (" + phenoAge.deltaLabel + " vs chronological)";
  }
  if (implausible.length > 0) {
    ctx["QUARANTINED_VALUES"] = implausible
      .map(f => f.label + " (" + f.value + " - out of plausible range)")
      .join("; ");
  }

  return {
    ctx,
    prevent,
    completeness,
    coverage,
    implausible,
    phenoEligible: phenoAgeEligible(cleanLabs),
    phenoAge,
    cleanForm,
  };
}

/**
 * The four model responses, parsed into the report the UI renders.
 * Keys match the four AI calls in App.jsx.
 */
export function assemble({ overview = "", findings = "", action = "", exercise = "" }) {
  const o = parseOverview(overview);
  return {
    overview:    { summary: o.summary, longevityNote: o.longevityNote },
    findings:    parseFindings(findings),
    targets:     parseTargets(findings),
    actionPlan:  parseActionPlan(action),
    nutrition:   parseNutrition(action),
    exercise:    parseExercise(exercise),
    supplements: parseSupplements(exercise),
    followUp:    parseFollowUp(exercise),
  };
}

/**
 * What the clinician actually sees for the PREVENT block, which the
 * caveat check needs. Mirrors the markup App.jsx renders.
 */
export function renderedPreventBlock(prevent, disclaimer) {
  if (!prevent) return "";
  return [
    `AHA PREVENT — 10-Year CVD Risk`,
    `${prevent.risk}% ${prevent.category}`,
    prevent.recommendation || "",
    prevent.lipidGoal ? `Lipid goal: ${prevent.lipidGoal}` : "",
    disclaimer,
    `Source: ${prevent.source} · Horizon: ${prevent.horizon}`,
  ].join("\n");
}
