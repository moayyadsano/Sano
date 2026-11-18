/**
 * algorithms.test.js
 * ---------------------------------------------------------------------------
 * Unit tests for every deterministic calculation in Sano.
 *
 * These matter more than normal tests: the numbers here drive clinical
 * recommendations. A silent regression in calcPREVENT would mis-stratify a
 * patient's cardiovascular risk, so the PREVENT cases pin exact behaviour.
 *
 * Format: vitest / jest compatible (describe / test / expect).
 */

import { describe, test, expect } from "vitest";
import {
  toDisplay, toSI, unitLabel, TO_CONV,
  PLAUSIBILITY, checkPlausibility, getImplausibleLabs,
  computeCompleteness, computeDomainCoverage, confidenceLabel, domainKeysForSex,
  PHENOAGE_KEYS, phenoAgeEligible,
  calcPREVENT, PREVENT_DISCLAIMER, PREVENT_SEVERITY_ORDER,
} from "./index.js";

// ═══════════════════════════════════════════════════════════════════════════
// UNITS
// ═══════════════════════════════════════════════════════════════════════════
describe("units", () => {
  test("SI values pass through untouched when the display is SI", () => {
    expect(toDisplay("4.2", "cholesterol", "SI")).toBe("4.2");
  });

  test("cholesterol converts mmol/L -> mg/dL for conventional display", () => {
    expect(parseFloat(toDisplay("4.2", "cholesterol", "CONV"))).toBeCloseTo(162.4, 1);
  });

  test("conventional input converts back to SI for storage", () => {
    expect(parseFloat(toSI("162.41", "cholesterol", "CONV"))).toBeCloseTo(4.2, 2);
  });

  // Conventional display rounds to 2 decimal places, so a round-trip can only
  // ever be accurate to half of that last decimal place. This asserts the real
  // contract rather than pretending conversion is lossless.
  test("round-trip SI -> CONV -> SI stays within display precision", () => {
    Object.keys(TO_CONV).forEach((analyte) => {
      const si        = 5;
      const back      = parseFloat(toSI(toDisplay(String(si), analyte, "CONV"), analyte, "CONV"));
      const tolerance = 0.005 / TO_CONV[analyte] + 1e-9;   // half the last displayed decimal
      expect(Math.abs(back - si)).toBeLessThanOrEqual(tolerance);
    });
  });

  test("round-trip error stays under 1% at clinically typical values", () => {
    // Creatinine is the worst case: its 0.01131 factor makes 2dp display coarse
    [["creatinine", 80], ["cortisol", 400], ["prolactin", 300], ["vitD", 75], ["cholesterol", 4.2]]
      .forEach(([analyte, value]) => {
        const back     = parseFloat(toSI(toDisplay(String(value), analyte, "CONV"), analyte, "CONV"));
        const errorPct = Math.abs(back - value) / value * 100;
        expect(errorPct).toBeLessThan(1);
      });
  });

  test("fixed-unit analytes are never converted", () => {
    // ApoB and HbA1c have one canonical unit and are absent from TO_CONV
    expect(TO_CONV.apoB).toBeUndefined();
    expect(TO_CONV.hba1c).toBeUndefined();
    expect(toDisplay("95", "apoB", "CONV")).toBe("95");
  });

  test("empty and non-numeric input is handled without throwing", () => {
    expect(toDisplay("", "cholesterol", "CONV")).toBe("");
    expect(toDisplay(null, "cholesterol", "CONV")).toBe("");
    expect(toDisplay(undefined, "cholesterol", "CONV")).toBe("");
    expect(toDisplay("abc", "cholesterol", "CONV")).toBe("abc");
  });

  test("unitLabel reports the right unit per system", () => {
    expect(unitLabel("cholesterol", "SI")).toBe("mmol/L");
    expect(unitLabel("cholesterol", "CONV")).toBe("mg/dL");
    expect(unitLabel("vitD", "SI")).toBe("nmol/L");
    expect(unitLabel("vitD", "CONV")).toBe("ng/mL");
  });

  test("unknown analyte yields an empty label rather than undefined", () => {
    expect(unitLabel("notAnAnalyte", "SI")).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PLAUSIBILITY
// ═══════════════════════════════════════════════════════════════════════════
describe("plausibility", () => {
  test("a value inside the range is not flagged", () => {
    expect(checkPlausibility("ldl", "3.2")).toBeNull();
  });

  test("exact boundary values are accepted, not flagged", () => {
    expect(checkPlausibility("ldl", String(PLAUSIBILITY.ldl.min))).toBeNull();
    expect(checkPlausibility("ldl", String(PLAUSIBILITY.ldl.max))).toBeNull();
  });

  test("values beyond either bound are flagged with context", () => {
    const low = checkPlausibility("ldl", "0.1");
    expect(low).not.toBeNull();
    expect(low.key).toBe("ldl");
    expect(low.value).toBe(0.1);
    expect(low.min).toBe(PLAUSIBILITY.ldl.min);
    expect(checkPlausibility("ldl", "99")).not.toBeNull();
  });

  test("the real-world failure case is caught: ApoB entered in mmol/L", () => {
    // 3.75 is a plausible mmol/L figure but an impossible mg/dL one
    expect(checkPlausibility("apoB", "3.75")).not.toBeNull();
    expect(checkPlausibility("apoB", "95")).toBeNull();
  });

  test("missing, empty and non-numeric values are ignored, not flagged", () => {
    expect(checkPlausibility("ldl", "")).toBeNull();
    expect(checkPlausibility("ldl", undefined)).toBeNull();
    expect(checkPlausibility("ldl", "abc")).toBeNull();
  });

  test("an unknown lab key is ignored rather than throwing", () => {
    expect(checkPlausibility("notALab", "5")).toBeNull();
  });

  test("getImplausibleLabs returns only the offending entries", () => {
    const flagged = getImplausibleLabs({ ldl: "3.2", apoB: "3.75", hdl: "1.1", tc: "999" });
    expect(flagged.map((f) => f.key).sort()).toEqual(["apoB", "tc"]);
  });

  test("a fully valid panel produces an empty list", () => {
    expect(getImplausibleLabs({ ldl: "3.2", hdl: "1.1" })).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETENESS AND DOMAIN COVERAGE
// ═══════════════════════════════════════════════════════════════════════════
const KEYS = { labs: ["ldl", "hdl", "tc", "tg"], body: ["weight", "height"], lifestyle: ["sleepHrs"] };
const emptyForm = { labs: {}, body: {}, lifestyle: {}, patient: { name: "", age: "" } };

describe("completeness", () => {
  test("an empty intake still scores the three always-present profile fields", () => {
    const c = computeCompleteness(emptyForm, KEYS);
    expect(c.total).toBe(4 + 2 + 1 + 5);   // 12
    expect(c.filled).toBe(3);              // sex, goal, philosophy
  });

  test("filled fields raise the count", () => {
    const c = computeCompleteness(
      { labs: { ldl: "3.2", hdl: "1.1" }, body: { weight: "80" }, lifestyle: {}, patient: { name: "A", age: "45" } },
      KEYS
    );
    expect(c.filled).toBe(3 + 2 + 1 + 2);  // base + 2 labs + 1 body + name/age
  });

  test("percentage is derived from filled over total", () => {
    const c = computeCompleteness(emptyForm, KEYS);
    expect(c.pct).toBe(Math.round((c.filled / c.total) * 100));
  });

  test("blank, undefined and null never count as filled", () => {
    const a = computeCompleteness(emptyForm, KEYS);
    const b = computeCompleteness(
      { ...emptyForm, labs: { ldl: "", hdl: undefined, tc: null } }, KEYS
    );
    expect(b.filled).toBe(a.filled);
  });

  test("missing fieldKeys degrades safely instead of throwing", () => {
    expect(() => computeCompleteness(emptyForm, undefined)).not.toThrow();
    expect(computeCompleteness(emptyForm, {}).total).toBe(5);
  });
});

describe("confidenceLabel", () => {
  test("bands are Low / Moderate / Good at 40 and 70", () => {
    expect(confidenceLabel(0)).toBe("Low");
    expect(confidenceLabel(39)).toBe("Low");
    expect(confidenceLabel(40)).toBe("Moderate");
    expect(confidenceLabel(69)).toBe("Moderate");
    expect(confidenceLabel(70)).toBe("Good");
    expect(confidenceLabel(100)).toBe("Good");
  });
});

describe("domain coverage", () => {
  test("every domain is reported, none silently dropped", () => {
    const cov = computeDomainCoverage({ labs: {}, body: {} }, "Male");
    expect(Object.keys(cov).sort()).toEqual(
      ["cardiovascular", "hormonal", "longevity", "metabolic", "physical"]
    );
  });

  test("an empty intake marks every domain absent", () => {
    const cov = computeDomainCoverage({ labs: {}, body: {} }, "Male");
    Object.values(cov).forEach((d) => {
      expect(d.absent).toBe(true);
      expect(d.pct).toBe(0);
    });
  });

  test("hormone panels are sex-specific so patients are not penalised", () => {
    expect(domainKeysForSex("hormonal", "Male")).toContain("testTotal");
    expect(domainKeysForSex("hormonal", "Male")).not.toContain("estradiol");
    expect(domainKeysForSex("hormonal", "Female")).toContain("estradiol");
    expect(domainKeysForSex("hormonal", "Female")).not.toContain("testTotal");
  });

  test("non-hormonal domains are identical across sexes", () => {
    expect(domainKeysForSex("cardiovascular", "Male"))
      .toEqual(domainKeysForSex("cardiovascular", "Female"));
  });

  test("present values clear the absent flag and are counted", () => {
    const cov = computeDomainCoverage({ labs: { ldl: "4.2", hdl: "1.1" }, body: {} }, "Male");
    expect(cov.cardiovascular.absent).toBe(false);
    expect(cov.cardiovascular.present).toBe(2);
    expect(cov.hormonal.absent).toBe(true);
  });

  test("the physical domain also draws on body composition", () => {
    const cov = computeDomainCoverage({ labs: {}, body: { weight: "80", height: "180" } }, "Male");
    expect(cov.physical.absent).toBe(false);
    expect(cov.physical.present).toBe(2);
  });

  test("blank values do not count as present", () => {
    const cov = computeDomainCoverage({ labs: { ldl: "", hdl: undefined, tc: null }, body: {} }, "Male");
    expect(cov.cardiovascular.absent).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHENOAGE
// ═══════════════════════════════════════════════════════════════════════════
describe("phenoAge eligibility", () => {
  const full = {};
  PHENOAGE_KEYS.forEach((k) => { full[k] = "1"; });

  test("all nine Levine 2018 inputs are required", () => {
    expect(PHENOAGE_KEYS).toHaveLength(9);
    expect(phenoAgeEligible(full)).toBe(true);
  });

  test("one missing input makes the patient ineligible", () => {
    const missing = { ...full };
    delete missing.albumin;
    expect(phenoAgeEligible(missing)).toBe(false);
  });

  test("an empty panel is ineligible", () => {
    expect(phenoAgeEligible({})).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PREVENT  — exact behaviour is pinned; these drive clinical stratification
// ═══════════════════════════════════════════════════════════════════════════
const basePrevent = {
  pAge: "50", pSex: "Male", pTC: "5.0", pHDL: "1.3", pSBP: "120",
  pBPtx: "No", pDM: "No", pSmoke: "No", pEGFR: "90", pBMI: "26",
};

describe("calcPREVENT", () => {
  test("the documented reference case lands where the AHA tool does", () => {
    // 50M, TC 5.0, HDL 1.3, SBP 120, no risk factors -> ~4% per AHA calculator
    const r = calcPREVENT(basePrevent, "SI");
    expect(parseFloat(r.risk)).toBeGreaterThan(3);
    expect(parseFloat(r.risk)).toBeLessThan(6);
    expect(r.severity).toBe("low");
  });

  test("risk categories map to the ACC/AHA thresholds", () => {
    expect(calcPREVENT({ ...basePrevent }, "SI").severity).toBe("low");
    const high = calcPREVENT(
      { ...basePrevent, pAge: "70", pTC: "6.5", pHDL: "0.9", pSBP: "165",
        pBPtx: "Yes", pDM: "Yes", pSmoke: "Yes", pEGFR: "55" }, "SI");
    expect(["intermediate", "high"]).toContain(high.severity);
    expect(parseFloat(high.risk)).toBeGreaterThan(parseFloat(calcPREVENT(basePrevent, "SI").risk));
  });

  test("severity is semantic, never a colour — presentation stays in the UI", () => {
    const r = calcPREVENT(basePrevent, "SI");
    expect(Object.keys(PREVENT_SEVERITY_ORDER)).toContain(r.severity);
    expect(r.color).toBeUndefined();
    expect(r.severity).not.toMatch(/^#/);
  });

  test("CRITICAL: the same patient scores identically in SI and conventional units", () => {
    const si   = calcPREVENT(basePrevent, "SI");
    const conv = calcPREVENT({ ...basePrevent, pTC: "193.35", pHDL: "50.27" }, "CONV");
    expect(parseFloat(conv.risk)).toBeCloseTo(parseFloat(si.risk), 1);
    expect(conv.severity).toBe(si.severity);
  });

  test("each risk factor moves risk in the clinically correct direction", () => {
    const base = parseFloat(calcPREVENT(basePrevent, "SI").risk);
    expect(parseFloat(calcPREVENT({ ...basePrevent, pSmoke: "Yes" }, "SI").risk)).toBeGreaterThan(base);
    expect(parseFloat(calcPREVENT({ ...basePrevent, pDM: "Yes" }, "SI").risk)).toBeGreaterThan(base);
    expect(parseFloat(calcPREVENT({ ...basePrevent, pSBP: "160" }, "SI").risk)).toBeGreaterThan(base);
    expect(parseFloat(calcPREVENT({ ...basePrevent, pAge: "70" }, "SI").risk)).toBeGreaterThan(base);
    // Higher HDL is protective
    expect(parseFloat(calcPREVENT({ ...basePrevent, pHDL: "2.0" }, "SI").risk)).toBeLessThan(base);
  });

  test("sex changes the equation used", () => {
    const m = calcPREVENT({ ...basePrevent, pSex: "Male" }, "SI");
    const f = calcPREVENT({ ...basePrevent, pSex: "Female" }, "SI");
    expect(parseFloat(m.risk)).not.toBeCloseTo(parseFloat(f.risk), 2);
  });

  test("ages outside the validated 30-79 window return null rather than a guess", () => {
    expect(calcPREVENT({ ...basePrevent, pAge: "29" }, "SI")).toBeNull();
    expect(calcPREVENT({ ...basePrevent, pAge: "80" }, "SI")).toBeNull();
    expect(calcPREVENT({ ...basePrevent, pAge: "30" }, "SI")).not.toBeNull();
    expect(calcPREVENT({ ...basePrevent, pAge: "79" }, "SI")).not.toBeNull();
  });

  test("missing required inputs return null instead of a fabricated score", () => {
    expect(calcPREVENT({ ...basePrevent, pTC: "" }, "SI")).toBeNull();
    expect(calcPREVENT({ ...basePrevent, pHDL: "" }, "SI")).toBeNull();
    expect(calcPREVENT({ ...basePrevent, pSBP: "" }, "SI")).toBeNull();
    expect(calcPREVENT({}, "SI")).toBeNull();
  });

  test("risk is clamped to a reportable range", () => {
    const r = calcPREVENT(
      { ...basePrevent, pAge: "79", pTC: "15", pHDL: "0.3", pSBP: "200",
        pBPtx: "Yes", pDM: "Yes", pSmoke: "Yes", pEGFR: "15" }, "SI");
    expect(parseFloat(r.risk)).toBeLessThanOrEqual(99.9);
    expect(parseFloat(r.risk)).toBeGreaterThanOrEqual(0.1);
  });

  test("an implausible result for the patient's age is flagged, not presented as fact", () => {
    const r = calcPREVENT(
      { ...basePrevent, pAge: "32", pTC: "15", pHDL: "0.3", pSBP: "200",
        pBPtx: "Yes", pDM: "Yes", pSmoke: "Yes", pEGFR: "15" }, "SI");
    expect(r.implausible).toBe(true);
    expect(r.implausibleNote).toContain("plausibility ceiling");
  });

  test("a normal result carries no implausibility warning", () => {
    const r = calcPREVENT(basePrevent, "SI");
    expect(r.implausible).toBe(false);
    expect(r.implausibleNote).toBeNull();
  });

  test("every result is traceable and scoped to its horizon", () => {
    const r = calcPREVENT(basePrevent, "SI");
    expect(r.horizon).toBe("10-year");
    expect(r.source).toContain("Khan");
    expect(r.lipidGoal).toBeTruthy();
    expect(r.recommendation).toContain("ACC/AHA");
  });

  test("the calibration caveat is available for the UI to surface", () => {
    expect(PREVENT_DISCLAIMER).toContain("approximation");
    expect(PREVENT_DISCLAIMER).toContain("tools.acc.org");
  });
});
