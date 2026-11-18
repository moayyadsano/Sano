/**
 * reference-model.js — a well-behaved stand-in for the model
 * ---------------------------------------------------------------------------
 * PURE MODULE. No React. No DOM. No network.
 *
 * Produces the four responses a model that followed every rule would produce
 * for a given context. It exists so CI has a deterministic, free baseline:
 *
 *   - It proves the parsers still read correctly-formatted output after a
 *     prompt or parser change. That is the regression the recorded cases buy.
 *   - It documents, executably, what "obeying the contract" looks like.
 *
 * What it is NOT: a measure of the real model's behaviour. It cannot be — it
 * is written to obey the rules, so it passes the rubric by construction. Only
 * `npm run eval:live` tells you anything about the actual model. The adversarial
 * cases in recorded/adversarial/ are the other half of this: real responses
 * that break the rules, proving the rubric catches them through the full
 * pipeline rather than only in isolation.
 *
 * Everything it says is derived from the context it is handed, so it can never
 * cite a value the fixture does not contain.
 */

export const REFERENCE_MODEL_VERSION = "1.0.0";

/** Domains the context says have no data at all. */
function absentDomains(ctx) {
  const raw = ctx["DOMAINS WITH NO DATA"] || "none";
  return raw === "none" ? [] : raw.split(";").map(s => s.trim()).filter(Boolean);
}

/** Labs present in the context, as [label, "value unit"] pairs. */
function presentLabs(ctx) {
  const SKIP = /^(Patient name|Age|Sex|Primary goal|Target philosophy|Medical conditions|Current medications|Current supplements|Allergies|Family history|Reproductive status|Sleep apnoea screen|DATA COMPLETENESS|CONFIDENCE LEVEL|DOMAINS WITH|QUARANTINED_VALUES|AHA PREVENT)/i;
  return Object.entries(ctx).filter(([k]) => !SKIP.test(k));
}

export function referenceOverview(ctx) {
  const n = presentLabs(ctx).length;
  const conf = ctx["CONFIDENCE LEVEL"] || "Low";
  const summary = n === 0
    ? "No measurements were entered, so no clinical assessment can be made from this record."
    : `Assessment based on ${n} entered measurement${n === 1 ? "" : "s"}; confidence ${conf.toLowerCase()}.`;
  return [
    `SUMMARY: ${summary}`,
    `LONGEVITY: PhenoAge requires albumin, creatinine, glucose, CRP, lymphocyte %, MCV, RDW, ALP and WBC; it is reported only when all nine are present.`,
  ].join("\n");
}

export function referenceFindings(ctx) {
  const lines = [];
  const labs = presentLabs(ctx);

  // One finding per present cardiovascular/metabolic marker, citing only it.
  const INTERESTING = ["LDL-C", "HDL-C", "Triglycerides", "ApoB", "Fasting Glucose", "HbA1c", "hs-CRP"];
  labs.filter(([k]) => INTERESTING.includes(k)).slice(0, 4).forEach(([k, v]) => {
    lines.push(`Medium | ${k} reviewed | Value assessed against guideline reference ranges | ${k} ${v}`);
  });

  // Declare every unordered panel rather than skipping it.
  absentDomains(ctx).slice(0, 5).forEach(d => {
    lines.push(`ABSENT | ${d} | No ${d} data available - order the relevant panel to assess`);
  });

  // Targets, each citing a guideline and only measured current values.
  labs.filter(([k]) => ["LDL-C", "ApoB", "HbA1c"].includes(k)).slice(0, 4).forEach(([k, v]) => {
    const optimal = k === "LDL-C" ? "less than 2.6 mmol/L" : k === "ApoB" ? "less than 80 mg/dL" : "less than 5.7 %";
    lines.push(`${k} | ${v} | ${optimal} | Guideline-based (ACC/AHA) | 3 months | ACC/AHA 2019`);
  });

  return lines.join("\n");
}

export function referenceAction(ctx) {
  const smoking = ctx["Smoking status"];
  const lines = [];
  if (smoking === "Current") lines.push("NOW: Smoking cessation - refer to cessation programme");
  lines.push("NOW: Confirm fasting status for repeat biochemistry");
  lines.push("3MON: Repeat the panels entered at this visit");
  lines.push("6MON: Reassess against the targets agreed today");
  lines.push("APPROACH: Whole-food dietary pattern with protein at each meal");
  lines.push("PRINCIPLE: Prioritise fibre and unsaturated fat");
  lines.push("EAT: Oily fish twice weekly");
  lines.push("AVOID: Refined carbohydrate and ultra-processed food");
  lines.push("SOURCE: PREDIMED 2018");
  return lines.join("\n");
}

export function referenceExercise(ctx) {
  const meds = ctx["Current medications"];
  const lines = [
    "BLUEPRINT: Two resistance sessions and two aerobic sessions weekly, progressed gradually",
    "ZONE: Resistance | 2x/week | 40 min | Preserves lean mass and insulin sensitivity",
    "ZONE: Zone 2 aerobic | 2x/week | 40 min | Improves cardiorespiratory fitness",
  ];
  if (!meds) {
    lines.push("SUPP: Medication reconciliation not completed - review all supplements before use | Before any supplement | Safety - no meds on file | None identified");
  }
  const vitD = ctx["Vitamin D (25-OH)"];
  if (vitD) lines.push(`SUPP: Vitamin D | With a fat-containing meal | 25-OH measured at ${vitD} | None identified`);
  lines.push("FOLLOWUP: 2 weeks - Confirm tolerance of any new intervention");
  lines.push("FOLLOWUP: 1 month - Review adherence to the agreed plan");
  lines.push("FOLLOWUP: 3 months - Repeat the panels entered at this visit");
  lines.push("FOLLOWUP: 6 months - Reassess body composition and targets");
  return lines.join("\n");
}

/** All four responses for one context. */
export function referenceResponses(ctx) {
  return {
    overview: referenceOverview(ctx),
    findings: referenceFindings(ctx),
    action:   referenceAction(ctx),
    exercise: referenceExercise(ctx),
  };
}
