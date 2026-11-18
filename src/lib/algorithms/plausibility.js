/**
 * plausibility.js — physiological range validation
 * ---------------------------------------------------------------------------
 * PURE MODULE. No React. No DOM. No side effects.
 * Every function returns the same output for the same input, so it can be
 * unit-tested on its own and later reused by the backend unchanged.
 *
 * Guards against typos and unit mix-ups (e.g. ApoB entered as 3.75 mg/dL).
 * An out-of-range value is QUARANTINED: excluded from the AI context entirely
 * rather than silently analysed. Bounds are generous physiological limits,
 * NOT treatment targets.
 */

// ─── Analyte plausibility ranges (SI units) ──────────────────────────────────
// Values outside these ranges are flagged as implausible and excluded from analysis
// Ranges are generous physiologic bounds — not treatment targets
export const PLAUSIBILITY = {
  ldl:       { min:0.5,  max:15.0,  label:"LDL-C (mmol/L)" },
  hdl:       { min:0.2,  max:5.0,   label:"HDL-C (mmol/L)" },
  tc:        { min:1.5,  max:20.0,  label:"Total Cholesterol (mmol/L)" },
  tg:        { min:0.2,  max:30.0,  label:"Triglycerides (mmol/L)" },
  apoB:      { min:20,   max:300,   label:"ApoB (mg/dL)" },
  lpa:       { min:1,    max:1000,  label:"Lp(a) (nmol/L)" },
  hsCRP:     { min:0.01, max:200,   label:"hs-CRP (mg/L)" },
  homocys:   { min:2,    max:200,   label:"Homocysteine (umol/L)" },
  glucose:   { min:2.0,  max:40.0,  label:"Fasting Glucose (mmol/L)" },
  insulin:   { min:1,    max:300,   label:"Fasting Insulin (uIU/mL)" },
  homaIR:    { min:0.1,  max:50,    label:"HOMA-IR" },
  hba1c:     { min:3.0,  max:20.0,  label:"HbA1c (%)" },
  tsh:       { min:0.01, max:150,   label:"TSH (mIU/L)" },
  ft3:       { min:0.5,  max:30,    label:"Free T3 (pmol/L)" },
  ft4:       { min:1,    max:60,    label:"Free T4 (pmol/L)" },
  dheas:     { min:0.1,  max:30,    label:"DHEA-S (umol/L)" },
  cortisol:  { min:10,   max:3000,  label:"Cortisol (nmol/L)" },
  shbg:      { min:2,    max:500,   label:"SHBG (nmol/L)" },
  testTotal: { min:0.5,  max:70,    label:"Total Testosterone (nmol/L)" },
  testFree:  { min:0.5,  max:1000,  label:"Free Testosterone (pmol/L)" },
  estradiol: { min:10,   max:5000,  label:"Estradiol (pmol/L)" },
  progesterone:{min:0.1, max:300,   label:"Progesterone (nmol/L)" },
  lh:        { min:0.1,  max:200,   label:"LH (IU/L)" },
  fsh:       { min:0.1,  max:200,   label:"FSH (IU/L)" },
  prolactin: { min:10,   max:20000, label:"Prolactin (mIU/L)" },
  vitD:      { min:5,    max:500,   label:"Vitamin D (nmol/L)" },
  b12:       { min:50,   max:5000,  label:"Vitamin B12 (pg/mL)" },
  ferritin:  { min:1,    max:10000, label:"Ferritin (ng/mL)" },
  creatinine:{ min:20,   max:2000,  label:"Creatinine (umol/L)" },
  alt:       { min:2,    max:5000,  label:"ALT (U/L)" },
  ast:       { min:2,    max:5000,  label:"AST (U/L)" },
  albumin:   { min:10,   max:70,    label:"Albumin (g/L)" },
  alp:       { min:10,   max:2000,  label:"ALP (U/L)" },
  wbc:       { min:0.5,  max:200,   label:"WBC (10^9/L)" },
  lymphPct:  { min:1,    max:95,    label:"Lymphocyte % " },
  mcv:       { min:50,   max:150,   label:"MCV (fL)" },
  rdw:       { min:9,    max:40,    label:"RDW (%)" },
};

export function checkPlausibility(labKey, siValue) {
  const range = PLAUSIBILITY[labKey];
  if (!range || siValue === "" || siValue === undefined) return null;
  const n = parseFloat(siValue);
  if (isNaN(n)) return null;
  if (n < range.min || n > range.max) {
    return { key: labKey, label: range.label, value: n, min: range.min, max: range.max };
  }
  return null;
}

export function getImplausibleLabs(labs) {
  return Object.entries(labs)
    .map(([k, v]) => checkPlausibility(k, v))
    .filter(Boolean);
}