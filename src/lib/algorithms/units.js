/**
 * units.js — SI <-> conventional unit conversion
 * ---------------------------------------------------------------------------
 * PURE MODULE. No React. No DOM. No side effects.
 * Every function returns the same output for the same input, so it can be
 * unit-tested on its own and later reused by the backend unchanged.
 *
 * All values are STORED in SI. Conversion happens only at display/input time.
 * Analytes absent from TO_CONV (ApoB, HbA1c...) have one canonical unit and
 * are deliberately never converted.
 *
 * PRECISION NOTE
 * toDisplay rounds conventional output to 2 decimal places, which matches how
 * these analytes are reported clinically. For analytes with a very small
 * conversion factor (creatinine 0.01131, cortisol 0.0363, prolactin 0.0465)
 * that rounding is coarse relative to the SI value, so converting to
 * conventional units and back is not perfectly lossless.
 *
 * In practice this is immaterial: at clinically typical values the round-trip
 * error stays under 1% (worst case creatinine, ~0.5% at 80 umol/L), rising to
 * ~1.7% only at the extreme low end of its plausible range. It is also only
 * reachable if a clinician EDITS a field
 * while the display is set to conventional units -- merely toggling units never
 * rewrites stored data.
 *
 * calcPREVENT is unaffected: it converts its raw inputs directly and never
 * passes them through toDisplay.
 */

// ─── Unit system (SI default per physician choice) ────────────────────────────
// All internal values stored in SI. Display converts on the fly.
export const UNITS = {
  SI: {
    cholesterol: "mmol/L", glucose: "mmol/L", vitD: "nmol/L",
    apoB: "mg/dL",   // ApoB universally mg/dL
    lpa:  "nmol/L",
    hsCRP:"mg/L", hba1c:"%", ferritin:"ng/mL", b12:"pg/mL",
    creatinine:"umol/L", alt:"U/L", ast:"U/L", albumin:"g/L",
    alp:"U/L", wbc:"10^9/L", lymph:"%", mcv:"fL", rdw:"%",
    testosterone:"nmol/L", estradiol:"pmol/L", progesterone:"nmol/L",
    shbg:"nmol/L", dheas:"umol/L", cortisol:"nmol/L", tsh:"mIU/L",
    ft3:"pmol/L", ft4:"pmol/L", prolactin:"mIU/L",
    lh:"IU/L", fsh:"IU/L",
    weight:"kg", height:"cm", waist:"cm", bp:"mmHg", hr:"bpm",
    uacr:"mg/mmol", homocysteine:"umol/L", triglycerides:"mmol/L",
    grip:"kg", vo2max:"mL/kg/min",
  },
  CONV: {
    cholesterol:"mg/dL", glucose:"mg/dL", vitD:"ng/mL",
    apoB:"mg/dL", lpa:"mg/dL", hsCRP:"mg/L", hba1c:"%",
    ferritin:"ng/mL", b12:"pg/mL", creatinine:"mg/dL",
    alt:"U/L", ast:"U/L", albumin:"g/dL", alp:"U/L",
    wbc:"10^9/L", lymph:"%", mcv:"fL", rdw:"%",
    testosterone:"ng/dL", estradiol:"pg/mL", progesterone:"ng/mL",
    shbg:"nmol/L", dheas:"ug/dL", cortisol:"ug/dL", tsh:"mIU/L",
    ft3:"pg/mL", ft4:"ng/dL", prolactin:"ng/mL",
    lh:"IU/L", fsh:"IU/L",
    weight:"kg", height:"cm", waist:"cm", bp:"mmHg", hr:"bpm",
    uacr:"mg/g", homocysteine:"umol/L", triglycerides:"mg/dL",
    grip:"kg", vo2max:"mL/kg/min",
  },
};

// Conversion factors SI → CONV (multiply SI value to get CONV)
export const TO_CONV = {
  cholesterol: 38.67,   // mmol/L → mg/dL
  glucose: 18.02,
  vitD: 0.4006,         // nmol/L → ng/mL  (divide by 2.496)
  triglycerides: 88.57,
  creatinine: 0.01131,  // umol/L → mg/dL
  testosterone: 28.84,  // nmol/L → ng/dL
  estradiol: 0.2724,    // pmol/L → pg/mL
  progesterone: 0.3145, // nmol/L → ng/mL
  dheas: 0.2714,        // umol/L → ug/dL
  cortisol: 0.0363,     // nmol/L → ug/dL
  ft3: 0.6513,          // pmol/L → pg/mL
  ft4: 0.7772,          // pmol/L → ng/dL
  prolactin: 0.0465,    // mIU/L → ng/mL
  albumin: 0.1,         // g/L → g/dL
  lpa: 0.4069,          // nmol/L → mg/dL (approx, Lp(a) mass)
  uacr: 8.84,           // mg/mmol → mg/g
  homocysteine: 1,
};

export function toDisplay(val, analyte, unitSys) {
  if (val === "" || val === null || val === undefined) return "";
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (unitSys === "CONV" && TO_CONV[analyte]) return (n * TO_CONV[analyte]).toFixed(2);
  return val;
}
export function toSI(val, analyte, unitSys) {
  if (val === "" || val === null || val === undefined) return "";
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (unitSys === "CONV" && TO_CONV[analyte]) return String(n / TO_CONV[analyte]);
  return String(val);
}
export function unitLabel(analyte, unitSys) {
  return UNITS[unitSys]?.[analyte] || "";
}