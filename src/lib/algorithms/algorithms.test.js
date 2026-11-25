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

import { describe, test, expect } from "../testing/harness.js";
import {
  toDisplay, toSI, unitLabel, TO_CONV,
  PLAUSIBILITY, checkPlausibility, getImplausibleLabs,
  computeCompleteness, computeDomainCoverage, confidenceLabel, domainKeysForSex,
  PHENOAGE_KEYS, phenoAgeEligible, missingPhenoAgeInputs,
  calcPhenoAge, PHENOAGE_DISCLAIMER, PHENOAGE_MIN_AGE, PHENOAGE_MAX_AGE,
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
// `enabled: true` is required from PH1-ALG-02 on: PREVENT is opt-in, so every
// case that expects a score has to say the clinician asked for one.
const basePrevent = {
  enabled: true,
  pAge: "50", pSex: "Male", pTC: "5.0", pHDL: "1.3", pSBP: "120",
  pBPtx: "No", pDM: "No", pSmoke: "No", pEGFR: "90", pBMI: "26",
};

describe("calcPREVENT opt-in gate (PH1-ALG-02)", () => {
  // The score is a calibrated approximation, so it must never appear unless a
  // clinician deliberately asked for it. These cases pin "silence by default":
  // a caller that forgets the flag gets null, never a cardiovascular risk score.
  test("complete inputs with no enabled flag produce nothing", () => {
    const { enabled, ...noFlag } = basePrevent;
    expect(calcPREVENT(noFlag, "SI")).toBeNull();
  });

  test("enabled:false produces nothing even with complete inputs", () => {
    expect(calcPREVENT({ ...basePrevent, enabled: false }, "SI")).toBeNull();
  });

  test("the gate is strict — only the boolean true opens it", () => {
    // A truthy string from a form field or a stray 1 must not count as consent.
    for (const v of ["true", "yes", 1, {}, [], "1"]) {
      expect(calcPREVENT({ ...basePrevent, enabled: v }, "SI")).toBeNull();
    }
    expect(calcPREVENT({ ...basePrevent, enabled: true }, "SI")).not.toBeNull();
  });

  test("a missing or null patient object produces nothing", () => {
    expect(calcPREVENT(null, "SI")).toBeNull();
    expect(calcPREVENT(undefined, "SI")).toBeNull();
  });

  test("enabling alone is not enough — inputs are still required", () => {
    // Opting in must not weaken the completeness checks.
    expect(calcPREVENT({ enabled: true }, "SI")).toBeNull();
  });

  test("the calibration caveat is published alongside the score", () => {
    // The report and the PDF both render this, so an empty or silently
    // shortened disclaimer would ship a bare number with no caveat.
    expect(typeof PREVENT_DISCLAIMER).toBe("string");
    expect(PREVENT_DISCLAIMER.length).toBeGreaterThan(80);
    expect(PREVENT_DISCLAIMER).toMatch(/approximation/i);
    expect(PREVENT_DISCLAIMER).toMatch(/Khan/);
  });
});

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

// ═══════════════════════════════════════════════════════════════════════════
// PHENOTYPIC AGE  (PH1-ALG-03)
// A biological age is the number a patient remembers and repeats. These cases
// pin the arithmetic against the published worked example and pin the refusals,
// because a wrong age here is quieter and more persuasive than a wrong lab.
// ═══════════════════════════════════════════════════════════════════════════

/** Healthy adult, in Sano's SI storage. */
const basePheno = {
  albumin: "45", creatinine: "82", glucose: "5.1", hsCRP: "1.2",
  lymphPct: "32", mcv: "89", rdw: "12.8", alp: "70", wbc: "5.8",
};

describe("calcPhenoAge — calibration", () => {
  test("reproduces the published worked example exactly", () => {
    // age 45, albumin 4.7 g/dL, creatinine 0.9 mg/dL, glucose 90 mg/dL,
    // CRP 1 mg/L, lymph 32%, MCV 90, RDW 13%, ALP 65, WBC 6
    // converted into SI, the units the Levine coefficients require.
    const r = calcPhenoAge({
      albumin: "47", creatinine: "79.56", glucose: "5.0", hsCRP: "1",
      lymphPct: "32", mcv: "90", rdw: "13", alp: "65", wbc: "6",
    }, 45);
    expect(r.phenoAge).toBe("36.3");
    expect(parseFloat(r.mortality10y)).toBeCloseTo(1.4, 1);
    expect(r.delta).toBe("-8.7");
  });

  test("CRP is converted from mg/L to mg/dL before the logarithm", () => {
    // Sano stores hs-CRP in mg/L; the coefficient wants mg/dL inside ln().
    // Dropping the /10 shifts the result by about +2.4 years — small enough to
    // look entirely believable, which is exactly why it needs a test.
    const r = calcPhenoAge(basePheno, 50);
    expect(r.phenoAge).toBe("41.1");

    // A tenfold CRP difference must move the age by ln(10) * 0.0954 in xb.
    const tenFold = calcPhenoAge({ ...basePheno, hsCRP: "12" }, 50);
    const shift = parseFloat(tenFold.phenoAge) - parseFloat(r.phenoAge);
    expect(shift).toBeGreaterThan(2);
    expect(shift).toBeLessThan(3);
  });

  test("the delta is the phenotypic age minus the chronological age", () => {
    const r = calcPhenoAge(basePheno, 50);
    expect(parseFloat(r.delta)).toBeCloseTo(parseFloat(r.phenoAge) - 50, 1);
    expect(r.deltaLabel).toMatch(/years$/);
    expect(r.chronoAge).toBe("50");
  });
});

describe("calcPhenoAge — each marker moves the age the right way", () => {
  // Every one of the nine should push the age OLDER when it moves in the
  // direction associated with worse health. A sign error in any coefficient
  // would otherwise be invisible.
  const base = parseFloat(calcPhenoAge(basePheno, 50).phenoAge);
  const worse = {
    albumin:    "40",   // lower albumin
    creatinine: "120",  // higher creatinine
    glucose:    "9.0",  // higher glucose
    hsCRP:      "8",    // higher CRP
    lymphPct:   "18",   // lower lymphocytes
    mcv:        "98",   // higher MCV
    rdw:        "16",   // higher RDW
    alp:        "140",  // higher ALP
    wbc:        "11",   // higher WBC
  };
  for (const [key, value] of Object.entries(worse)) {
    test(`a worse ${key} makes the patient older`, () => {
      const r = calcPhenoAge({ ...basePheno, [key]: value }, 50);
      expect(parseFloat(r.phenoAge)).toBeGreaterThan(base);
    });
  }
});

describe("calcPhenoAge — refusals", () => {
  test("eight of nine inputs produces nothing", () => {
    // The whole point of the eligibility gate: an age from eight inputs is a
    // number with no meaning, and it would be believed.
    for (const k of PHENOAGE_KEYS) {
      const incomplete = { ...basePheno };
      delete incomplete[k];
      expect(calcPhenoAge(incomplete, 50)).toBeNull();
    }
  });

  test("a missing or unusable chronological age produces nothing", () => {
    expect(calcPhenoAge(basePheno, "")).toBeNull();
    expect(calcPhenoAge(basePheno, undefined)).toBeNull();
    expect(calcPhenoAge(basePheno, "abc")).toBeNull();
  });

  test("ages outside the development range produce nothing", () => {
    expect(calcPhenoAge(basePheno, PHENOAGE_MIN_AGE - 1)).toBeNull();
    expect(calcPhenoAge(basePheno, PHENOAGE_MAX_AGE + 1)).toBeNull();
    expect(calcPhenoAge(basePheno, PHENOAGE_MIN_AGE)).not.toBeNull();
    expect(calcPhenoAge(basePheno, PHENOAGE_MAX_AGE)).not.toBeNull();
  });

  test("a non-positive CRP produces nothing rather than NaN", () => {
    // ln(0) is -Infinity and ln(negative) is NaN; either would propagate
    // silently into a displayed age.
    expect(calcPhenoAge({ ...basePheno, hsCRP: "0" }, 50)).toBeNull();
    expect(calcPhenoAge({ ...basePheno, hsCRP: "-1" }, 50)).toBeNull();
  });

  test("an unparseable value produces nothing", () => {
    expect(calcPhenoAge({ ...basePheno, mcv: "abc" }, 50)).toBeNull();
    expect(calcPhenoAge({ ...basePheno, rdw: "" }, 50)).toBeNull();
  });

  test("no labs at all produces nothing", () => {
    expect(calcPhenoAge(null, 50)).toBeNull();
    expect(calcPhenoAge({}, 50)).toBeNull();
  });

  test("never returns a number outside a reportable range", () => {
    // Extremes must be withheld, not clamped to a plausible-looking age.
    const extremes = [
      { ...basePheno, glucose: "39", rdw: "39", wbc: "190", hsCRP: "190" },
      { ...basePheno, albumin: "69", lymphPct: "94", rdw: "9.1" },
    ];
    for (const labs of extremes) {
      const r = calcPhenoAge(labs, 50);
      if (r !== null) {
        expect(parseFloat(r.phenoAge)).toBeGreaterThan(10);
        expect(parseFloat(r.phenoAge)).toBeLessThan(130);
      }
    }
  });
});

describe("calcPhenoAge — interpretation", () => {
  test("severity bands follow the size and sign of the gap", () => {
    const younger = calcPhenoAge(basePheno, 60);          // healthy 60yo
    expect(younger.severity).toBe("much-younger");
    expect(younger.category).toMatch(/younger/i);

    const older = calcPhenoAge({ ...basePheno, glucose: "11", rdw: "16.5", hsCRP: "9" }, 45);
    expect(["older", "much-older"]).toContain(older.severity);
  });

  test("every result carries an interpretation and a source", () => {
    const r = calcPhenoAge(basePheno, 50);
    expect(r.interpretation.length).toBeGreaterThan(20);
    expect(r.source).toMatch(/Levine/);
  });

  test("the disclaimer states what the number is not", () => {
    expect(PHENOAGE_DISCLAIMER).toMatch(/not a measurement of biological age/i);
    expect(PHENOAGE_DISCLAIMER).toMatch(/NHANES/);
    expect(PHENOAGE_DISCLAIMER.length).toBeGreaterThan(150);
  });
});

describe("missingPhenoAgeInputs", () => {
  test("names exactly what is still needed, in clinician language", () => {
    const labs = { ...basePheno };
    delete labs.rdw;
    delete labs.alp;
    const missing = missingPhenoAgeInputs(labs);
    expect(missing).toHaveLength(2);
    expect(missing).toContain("RDW");
    expect(missing).toContain("Alkaline Phosphatase");
  });

  test("returns nothing when the panel is complete", () => {
    expect(missingPhenoAgeInputs(basePheno)).toEqual([]);
  });

  test("names all nine for an empty record", () => {
    expect(missingPhenoAgeInputs({})).toHaveLength(9);
    expect(missingPhenoAgeInputs(null)).toHaveLength(9);
  });
});
