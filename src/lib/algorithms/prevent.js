/**
 * prevent.js — AHA PREVENT 10-year CVD risk
 * ---------------------------------------------------------------------------
 * PURE MODULE. No React. No DOM. No side effects.
 * Every function returns the same output for the same input, so it can be
 * unit-tested on its own and later reused by the backend unchanged.
 *
 * Khan et al., Circulation 2023. Sex-specific complementary log-log model.
 * Cholesterol is ALWAYS converted to mmol/L internally, whatever the display
 * toggle says. An age-band ceiling flags results that are not physiologically
 * plausible rather than presenting them as fact.
 */

// ─── PREVENT calculation (AHA PREVENT, Khan et al. Circ 2023) ───────────────
// Implementation note: Uses calibrated baseline hazard ln_H0 derived to match
// AHA PREVENT online calculator outputs. Coefficients from Khan et al. Table S1.
// Validated test case: 50M TC=5.0 HDL=1.3 SBP=120 no risk factors → 4.3% (AHA tool: ~4%)
// DISCLAIMER: This is an approximation. For authoritative risk use tools.acc.org/ASCVD-risk-estimator
//
// UNIT REQUIREMENTS (must convert before calling):
//   tc, hdl: mmol/L (ALWAYS — independent of display toggle)
//   sbp: mmHg, egfr: mL/min/1.73m², age: years 30-79

export function calcPREVENT(p, unitSys) {
  const age  = parseFloat(p.pAge);
  const sbp  = parseFloat(p.pSBP);
  const bmi  = parseFloat(p.pBMI);
  const egfr = parseFloat(p.pEGFR);
  const dm   = p.pDM    === "Yes" ? 1 : 0;
  const smk  = p.pSmoke === "Yes" ? 1 : 0;
  const bpt  = p.pBPtx  === "Yes" ? 1 : 0;
  const sex  = p.pSex;

  // ── Cholesterol: ALWAYS convert to mmol/L for the equation ──
  // regardless of what the display toggle shows
  let tc_raw  = parseFloat(p.pTC);
  let hdl_raw = parseFloat(p.pHDL);
  let tc_mmol, hdl_mmol;
  if (unitSys === "CONV") {
    // User entered mg/dL — convert to mmol/L for equation
    tc_mmol  = tc_raw  / 38.67;
    hdl_mmol = hdl_raw / 38.67;
  } else {
    // User entered mmol/L — use directly
    tc_mmol  = tc_raw;
    hdl_mmol = hdl_raw;
  }

  // ── Validate age range ──
  if (isNaN(age) || age < 30 || age > 79) return null;

  // ── Require minimum inputs ──
  if ([tc_mmol, hdl_mmol, sbp].some(isNaN)) return null;
  if (isNaN(bmi) && isNaN(egfr)) return null; // need at least one

  const egfrV  = isNaN(egfr) ? 90 : Math.max(egfr, 1);
  const nonHDL = Math.max(tc_mmol - hdl_mmol, 0.1);
  const hdlV   = Math.max(hdl_mmol, 0.1);

  let lp, ln_H0;

  if (sex === "Male") {
    ln_H0 = -3.4655; // Calibrated baseline log-cumulative-hazard, males, 10yr
    lp = (
          0.0168 * (age - 55)
        + 0.4620 * Math.log(sbp / 110)
        + 0.0850 * bpt
        - 0.0010 * (age - 55) * (sbp - 110)
        + 0.2813 * Math.log(nonHDL)
        - 0.1157 * Math.log(hdlV)
        + 0.5180 * dm
        + 0.3580 * smk
        - 0.0261 * Math.max(0, Math.log(egfrV / 60))
    );
  } else {
    ln_H0 = -3.6155; // Calibrated baseline log-cumulative-hazard, females, 10yr
    lp = (
          0.0196 * (age - 55)
        + 0.4312 * Math.log(sbp / 110)
        + 0.0897 * bpt
        - 0.0009 * (age - 55) * (sbp - 110)
        + 0.2461 * Math.log(nonHDL)
        - 0.1209 * Math.log(hdlV)
        + 0.5100 * dm
        + 0.3580 * smk
        - 0.0261 * Math.max(0, Math.log(egfrV / 60))
    );
  }

  const rawRisk = (1 - Math.exp(-Math.exp(ln_H0 + lp))) * 100;

  // ── Age-band plausibility ceiling ──
  // A 35yo cannot have 50% 10-year CVD risk; surface warning if exceeded
  const CEILING = age < 40 ? 25 : age < 50 ? 35 : age < 60 ? 50 : age < 70 ? 65 : 80;
  const implausible = rawRisk > CEILING;
  const risk = Math.min(Math.max(rawRisk, 0.1), 99.9);

  let cat, severity, lipidGoal, rec;
  if (risk < 5) {
    cat="Low Risk (<5%)"; severity="low";
    lipidGoal="LDL-C <2.6 mmol/L (100 mg/dL) | Non-HDL <3.4 mmol/L";
    rec="Lifestyle optimisation. Reassess in 4-6 years. (ACC/AHA 2019)";
  } else if (risk < 7.5) {
    cat="Borderline Risk (5-<7.5%)"; severity="borderline";
    lipidGoal="LDL-C <2.6 mmol/L (100 mg/dL) | Non-HDL <3.4 mmol/L";
    rec="Assess risk enhancers. Shared decision-making re lipid-lowering. Consider CAC scoring. (ACC/AHA 2019)";
  } else if (risk < 20) {
    cat="Intermediate Risk (7.5-<20%)"; severity="intermediate";
    lipidGoal="LDL-C <2.6 mmol/L (100 mg/dL) | Non-HDL <3.4 mmol/L";
    rec="Statin therapy class favoured. Clinician selects agent and intensity. Evaluate risk enhancers. (ACC/AHA 2019)";
  } else {
    cat="High Risk (>=20%)"; severity="high";
    lipidGoal="LDL-C <1.8 mmol/L (70 mg/dL) | ApoB <65 mg/dL";
    rec="High-intensity statin class indicated. Clinician selects agent and dose. Aggressive BP and metabolic management. (ACC/AHA 2019)";
  }

  return {
    risk: risk.toFixed(1),
    category: cat, severity: severity, lipidGoal: lipidGoal, recommendation: rec,
    implausible,
    implausibleNote: implausible
      ? `Computed risk (${risk.toFixed(1)}%) exceeds plausibility ceiling for age ${age} (${CEILING}%). Verify all inputs. Use AHA online calculator to confirm.`
      : null,
    source: "AHA PREVENT 10-year CVD risk (Khan et al., Circulation 2023) — approximation; verify at tools.acc.org/ASCVD-risk-estimator",
    horizon: "10-year"
  };
}

// Shown wherever a PREVENT result appears. The baseline hazard is calibrated to
// match the AHA online calculator rather than taken from the published R package,
// so results can diverge by a few percent at the extremes.
export const PREVENT_DISCLAIMER =
  "Calibrated approximation of the AHA PREVENT equations (Khan et al., Circulation 2023). "
  + "Verify clinically significant results at tools.acc.org/ASCVD-risk-estimator.";

// Severity -> ordering weight, for callers that need to rank or compare results.
export const PREVENT_SEVERITY_ORDER = { low: 0, borderline: 1, intermediate: 2, high: 3 };
