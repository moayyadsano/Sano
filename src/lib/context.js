/**
 * context.js — assemble the AI context from a patient record
 * ---------------------------------------------------------------------------
 * PURE MODULE. No React. No DOM. No side effects. No network.
 *
 * buildContext() turns a filled-in form into the flat label -> value map that
 * every prompt in lib/prompts/ reads. It is the boundary between the patient
 * record and the model, which makes it the most important function in the tool
 * to be able to test on its own:
 *
 *   - Only fields the clinician actually filled in are emitted. A blank field
 *     is omitted entirely rather than sent as an empty string, so the model is
 *     never handed a value it could mistake for a measurement.
 *   - Values carry their unit label, resolved for the clinician's chosen unit
 *     system, so "4.2" never reaches the model without "mmol/L" attached.
 *   - The DOMAINS WITH NO DATA key is what the system prompt's missing-domain
 *     rule keys off. If that key is wrong, the report invents findings for
 *     panels that were never ordered.
 *
 * Extracted from App.jsx in PH1-EVAL-01, moved verbatim and proved
 * output-identical across randomised records before shipping.
 */

import { LAB_GROUPS, BODY_FIELDS, LIFESTYLE_FIELDS } from "./schema.js";
import { unitLabel, confidenceLabel } from "./algorithms/index.js";

export const CONTEXT_VERSION = "1.0.0";

// ─── Build context object for AI ─────────────────────────────────────────────
export function buildContext(form, unitSys, completeness, preventResult, domainCoverage) {
  const filled = {};
  const sex = form.patient.sex;

  // Patient basics
  if (form.patient.name)      filled["Patient name"]      = form.patient.name;
  if (form.patient.age)       filled["Age"]               = form.patient.age + " years";
  filled["Sex"]               = sex;
  filled["Primary goal"]      = form.patient.chiefGoal;
  filled["Target philosophy"] = form.patient.targetPhilosophy;

  // History
  if (form.history.conditions)       filled["Medical conditions"]           = form.history.conditions;
  if (form.history.medications)      filled["Current medications"]          = form.history.medications;
  if (form.history.supplements)      filled["Current supplements"]          = form.history.supplements;
  if (form.history.allergies)        filled["Allergies"]                    = form.history.allergies;
  if (form.history.familyHx)         filled["Family history"]               = form.history.familyHx;
  if (form.history.femaleRepro)      filled["Reproductive status"]          = form.history.femaleRepro;
  if (form.history.sleepApneaScreen) filled["Sleep apnoea screen"]          = form.history.sleepApneaScreen;

  // Labs
  LAB_GROUPS.forEach(g => g.analytes.forEach(a => {
    if (a.sexFilter && a.sexFilter !== sex) return;
    const v = form.labs[a.key];
    if (v !== "" && v !== undefined && v !== null) {
      const u = a.unit ? unitLabel(a.unit, unitSys) : "";
      filled[a.label] = v + (u ? " " + u : "");
    }
  }));

  // Body
  BODY_FIELDS.forEach(f => {
    const v = form.body[f.key];
    if (v !== "" && v !== undefined && v !== null) {
      const u = f.unit ? unitLabel(f.unit, unitSys) : (f.placeholder || "");
      filled[f.label] = v + (u ? " " + u : "");
    }
  });

  // Lifestyle
  LIFESTYLE_FIELDS.forEach(f => {
    const v = form.lifestyle[f.key];
    if (v !== "" && v !== undefined && v !== null) {
      // Lifestyle units are literal display strings ("hr/night", "units/wk"),
      // not keys into units.js, so they are appended directly.
      //
      // This block used to emit String(v) and drop the unit entirely, so the
      // model was handed "Alcohol: 2" and "Daily water: 2.5" with nothing to
      // say whether that was per day or per week, litres or glasses. Labs and
      // body composition always carried their units; lifestyle was the one
      // domain that did not.
      filled[f.label] = String(v) + (f.unit ? " " + f.unit : "");
    }
  });

  // PREVENT result
  if (preventResult) {
    filled["AHA PREVENT 10-yr CVD risk"] = preventResult.risk + "% (" + preventResult.category + ")";
  }

  // ── PH1-AI-04: completeness and domain-coverage metadata ──
  // These keys are read by the system prompt's MISSING DOMAIN and CONFIDENCE rules.
  filled["DATA COMPLETENESS"] = completeness.filled + " of " + completeness.total
                              + " data points (" + completeness.pct + "%)";
  filled["CONFIDENCE LEVEL"]  = confidenceLabel(completeness.pct);

  const cov = domainCoverage || {};
  const withData = [], noData = [];
  Object.keys(cov).forEach(function(d) {
    const c = cov[d];
    if (c.absent) noData.push(c.label);
    else          withData.push(c.label + " (" + c.present + " of " + c.total + ")");
  });
  filled["DOMAINS WITH DATA"]    = withData.length ? withData.join("; ") : "none";
  filled["DOMAINS WITH NO DATA"] = noData.length   ? noData.join("; ")   : "none";

  return filled;
}
