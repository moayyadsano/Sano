/**
 * phenoAge.js — Levine 2018 phenotypic age
 * ---------------------------------------------------------------------------
 * PURE MODULE. No React. No DOM. No side effects.
 * Every function returns the same output for the same input, so it can be
 * unit-tested on its own and later reused by the backend unchanged.
 *
 * Source: Levine ME et al., "An epigenetic biomarker of aging for lifespan and
 * healthspan", Aging 2018;10(4):573-591, Supplementary Table S1. The phenotypic
 * age model itself was fitted on 9,926 NHANES III adults with 23 years of
 * mortality follow-up.
 *
 * WHAT IT PRODUCES
 * A "phenotypic age": the chronological age at which this patient's predicted
 * 10-year mortality would be average. The useful number for a consultation is
 * the DELTA against actual age — five years younger is a different conversation
 * from five years older.
 *
 * ── UNITS: READ THIS BEFORE CHANGING ANYTHING ──────────────────────────────
 * The published coefficients are stated for SI units, which is the opposite of
 * what several public implementations assume:
 *
 *     albumin      g/L          creatinine   umol/L
 *     glucose      mmol/L       ALP          U/L
 *     lymphocyte   %            MCV          fL
 *     RDW          %            WBC          10^9/L  (= 1000 cells/uL)
 *     CRP          mg/dL, and LOGGED
 *
 * Sano stores every lab in SI, so eight of the nine need no conversion at all.
 * CRP is the single exception: Sano holds it as mg/L, and the coefficient wants
 * mg/dL, so it is divided by 10 before the logarithm.
 *
 * Getting this wrong is not a rounding error. Feeding the coefficients
 * conventional units (albumin g/dL, creatinine mg/dL, glucose mg/dL) gives a
 * healthy 50-year-old a 10-year mortality of 1.000 and an undefined age —
 * mostly because the glucose term alone moves the linear predictor by about 18.
 * Omitting just the CRP conversion is quieter and therefore worse: it shifts
 * the result by roughly +2.4 years, which looks entirely believable.
 *
 * CALIBRATION
 * Verified against a published worked example, matching the intermediate linear
 * predictor to three decimals rather than only the final figure:
 *     age 45, albumin 47 g/L, creatinine 79.6 umol/L, glucose 5.0 mmol/L,
 *     CRP 1 mg/L, lymphocytes 32%, MCV 90 fL, RDW 13%, ALP 65 U/L, WBC 6
 *     -> xb -9.575, mortality 0.0136, phenotypic age 36.3
 * That case is pinned in algorithms.test.js.
 */

// ─── The nine inputs (Levine 2018) ───────────────────────────────────────────
export const PHENOAGE_KEYS = ["albumin","creatinine","glucose","hsCRP","lymphPct","mcv","rdw","alp","wbc"];

/** Clinician-facing names, for telling them exactly what is still missing. */
export const PHENOAGE_LABELS = {
  albumin:    "Albumin",
  creatinine: "Creatinine",
  glucose:    "Fasting Glucose",
  hsCRP:      "hs-CRP",
  lymphPct:   "Lymphocyte %",
  mcv:        "MCV",
  rdw:        "RDW",
  alp:        "Alkaline Phosphatase",
  wbc:        "WBC",
};

// ─── Model constants (Supplementary Table S1) ────────────────────────────────
const INTERCEPT = -19.9067;
const COEF = {
  albumin:    -0.0336,   // g/L
  creatinine:  0.0095,   // umol/L
  glucose:     0.1953,   // mmol/L
  lnCRP:       0.0954,   // ln(mg/dL)
  lymphPct:   -0.0120,   // %
  mcv:         0.0268,   // fL
  rdw:         0.3306,   // %
  alp:         0.00188,  // U/L  (Table S1 prints 0.0019; the unrounded value
                         //       used by reference implementations is 0.00188.
                         //       The difference is ~0.02 years — immaterial,
                         //       but the finer value is the one calibrated.)
  wbc:         0.0554,   // 10^9/L
  age:         0.0804,   // years
};
const GAMMA = 0.0076927;          // Gompertz shape parameter
const MONTHS = 120;               // 10-year horizon
const PA_INTERCEPT = 141.50225;
const PA_SLOPE     = 0.090165;    // NOT 0.09165 — that misprint costs ~1.7 years
const PA_LAMBDA    = -0.00553;

// ─── Validated application range ─────────────────────────────────────────────
// The model was fitted on NHANES III ADULTS. The paper publishes no upper age
// bound, and cautions that clinical biomarkers are fairly homogeneous in
// children and young adults, so below 20 there is no development support at
// all. The ceiling here is a practical guard against nonsense, not a published
// limit; the disclaimer says so rather than implying a validation that does
// not exist.
export const PHENOAGE_MIN_AGE = 20;
export const PHENOAGE_MAX_AGE = 100;

// Reportable output bounds. A phenotypic age outside this is a data problem,
// not a finding, and is withheld rather than shown.
const PA_FLOOR = 10;
const PA_CEILING = 130;

// ─── Eligibility ─────────────────────────────────────────────────────────────

export function phenoAgeEligible(labs) {
  if (!labs) return false;
  return PHENOAGE_KEYS.every(k => labs[k] !== "" && labs[k] !== undefined && labs[k] !== null);
}

/**
 * Which of the nine are still missing, by clinician-facing name.
 * Lets the report say "needs RDW and ALP" instead of restating all nine.
 */
export function missingPhenoAgeInputs(labs) {
  const l = labs || {};
  return PHENOAGE_KEYS
    .filter(k => l[k] === "" || l[k] === undefined || l[k] === null)
    .map(k => PHENOAGE_LABELS[k]);
}

// ─── Interpretation ──────────────────────────────────────────────────────────
// Semantic only. The colour mapping is a UI concern, as with PREVENT.
const BANDS = [
  { max: -5,       severity: "much-younger", label: "Markedly younger than chronological age" },
  { max: -2,       severity: "younger",      label: "Younger than chronological age" },
  { max:  2,       severity: "aligned",      label: "In line with chronological age" },
  { max:  5,       severity: "older",        label: "Older than chronological age" },
  { max: Infinity, severity: "much-older",   label: "Markedly older than chronological age" },
];

export const PHENOAGE_SEVERITY_ORDER = {
  "much-younger": 0, younger: 1, aligned: 2, older: 3, "much-older": 4,
};

function band(delta) {
  return BANDS.find(b => delta < b.max) || BANDS[BANDS.length - 1];
}

// ─── The calculation ─────────────────────────────────────────────────────────

/**
 * @param {object} labs  Sano's SI-stored lab values, keyed as PHENOAGE_KEYS
 * @param {string|number} chronoAge  patient's age in years
 * @returns {object|null} null whenever a number would be guesswork
 */
export function calcPhenoAge(labs, chronoAge) {
  if (!labs) return null;
  if (!phenoAgeEligible(labs)) return null;

  const age = parseFloat(chronoAge);
  if (!Number.isFinite(age)) return null;
  if (age < PHENOAGE_MIN_AGE || age > PHENOAGE_MAX_AGE) return null;

  // Parse the nine. Any unparseable value means no result at all: a phenotypic
  // age computed from eight inputs is a number with no meaning, and it would be
  // believed.
  const v = {};
  for (const k of PHENOAGE_KEYS) {
    const n = parseFloat(labs[k]);
    if (!Number.isFinite(n)) return null;
    v[k] = n;
  }

  // CRP enters as ln(mg/dL). Sano stores mg/L.
  const crpMgDl = v.hsCRP / 10;
  // ln() of zero or negative is undefined; a non-positive CRP is a data error.
  if (crpMgDl <= 0) return null;

  const xb =
      INTERCEPT
    + COEF.albumin    * v.albumin
    + COEF.creatinine * v.creatinine
    + COEF.glucose    * v.glucose
    + COEF.lnCRP      * Math.log(crpMgDl)
    + COEF.lymphPct   * v.lymphPct
    + COEF.mcv        * v.mcv
    + COEF.rdw        * v.rdw
    + COEF.alp        * v.alp
    + COEF.wbc        * v.wbc
    + COEF.age        * age;

  if (!Number.isFinite(xb)) return null;

  // 10-year mortality risk under a Gompertz hazard.
  const mortality = 1 - Math.exp(-Math.exp(xb) * (Math.exp(MONTHS * GAMMA) - 1) / GAMMA);

  // At mortality 1 the logarithm below is undefined, and at 0 it diverges.
  // Both mean the inputs are outside anything the model can speak to.
  if (!(mortality > 0 && mortality < 1)) return null;

  const phenoAge = PA_INTERCEPT + Math.log(PA_LAMBDA * Math.log(1 - mortality)) / PA_SLOPE;
  if (!Number.isFinite(phenoAge)) return null;
  if (phenoAge < PA_FLOOR || phenoAge > PA_CEILING) return null;

  const delta = phenoAge - age;
  const b = band(delta);

  return {
    phenoAge:    phenoAge.toFixed(1),
    chronoAge:   age.toFixed(0),
    delta:       delta.toFixed(1),
    // Signed string for display, so the UI never has to rebuild the sign.
    deltaLabel:  (delta >= 0 ? "+" : "") + delta.toFixed(1) + " years",
    severity:    b.severity,
    category:    b.label,
    mortality10y: (mortality * 100).toFixed(1),
    interpretation: buildInterpretation(delta, b.severity),
    source: "Phenotypic age (Levine et al., Aging 2018) from 9 biomarkers",
    horizon: "Derived from a modelled 10-year mortality risk",
  };
}

function buildInterpretation(delta, severity) {
  const years = Math.abs(delta).toFixed(1);
  switch (severity) {
    case "much-younger":
    case "younger":
      return `Biomarker profile corresponds to someone ${years} years younger. Reinforce what is already working rather than adding interventions.`;
    case "aligned":
      return "Biomarker profile tracks chronological age. No acceleration signal in these nine markers.";
    case "older":
    case "much-older":
      return `Biomarker profile corresponds to someone ${years} years older. Worth identifying which of the nine inputs is driving this before acting on the number itself.`;
    default:
      return "";
  }
}

/**
 * Honest statement of what this number is and is not.
 * Shown wherever a phenotypic age is displayed.
 */
export const PHENOAGE_DISCLAIMER =
    "Phenotypic age (Levine et al., Aging 2018) is a mortality-risk model fitted to NHANES III adults, "
  + "not a measurement of biological age. It reflects only these nine blood markers at a single point in "
  + "time, so an acute illness, recent infection or dehydration can move it by years. It reads "
  + "systematically young in healthy adults under about 40, where these markers vary little, and the "
  + "published model states no upper age limit, so results in the very elderly are extrapolation. Treat "
  + "the direction and size of the gap as a prompt for discussion, not as a diagnostic result.";
