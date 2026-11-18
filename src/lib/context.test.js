/**
 * context.test.js
 * ---------------------------------------------------------------------------
 * buildContext decides what the model is allowed to know. Its failure modes
 * are quiet: a blank field sent as an empty string, a number sent without its
 * unit, a domain-coverage key that says a panel has data when it has none.
 * None of those throw. All of them change what the report says.
 */

import { describe, test, expect } from "./testing/harness.js";
import { buildContext, CONTEXT_VERSION } from "./context.js";
import { blank, LIFESTYLE_FIELDS, SCHEMA_VERSION } from "./schema.js";
import { computeCompleteness, computeDomainCoverage, calcPREVENT } from "./algorithms/index.js";
import { fieldKeysForSex } from "./eval/pipeline.js";

/** Build a context the way the app does. */
function ctxFor(form, unitSys = "SI") {
  const sex = form.patient.sex;
  const completeness = computeCompleteness(form, fieldKeysForSex(sex));
  const coverage = computeDomainCoverage(form, sex);
  const prevent = calcPREVENT(form.prevent, unitSys);
  return buildContext(form, unitSys, completeness, prevent, coverage);
}

describe("buildContext — omission", () => {
  test("a blank field is left out entirely, not sent as an empty value", () => {
    // An empty string in the context reads to the model as a measurement.
    const ctx = ctxFor(blank());
    for (const [k, v] of Object.entries(ctx)) {
      expect(`${k}=${JSON.stringify(v)}`).not.toMatch(/=""$/);
    }
  });

  test("an empty record carries no lab keys at all", () => {
    const ctx = ctxFor(blank());
    expect(ctx["LDL-C"]).toBeUndefined();
    expect(ctx["Fasting Glucose"]).toBeUndefined();
    expect(ctx["TSH"]).toBeUndefined();
  });

  test("sex-specific analytes are filtered to the patient's sex", () => {
    const male = blank();
    male.patient.sex = "Male";
    male.labs = { testTotal: "14", estradiol: "180" };
    const ctx = ctxFor(male);
    expect(ctx["Total Testosterone"]).toBeDefined();
    // A female analyte on a male patient is dropped rather than reported.
    expect(ctx["Estradiol (E2)"]).toBeUndefined();
  });
});

describe("buildContext — units", () => {
  test("lab values carry their unit", () => {
    const f = blank();
    f.labs = { ldl: "3.9", glucose: "5.4" };
    const ctx = ctxFor(f);
    expect(ctx["LDL-C"]).toBe("3.9 mmol/L");
    expect(ctx["Fasting Glucose"]).toBe("5.4 mmol/L");
  });

  test("lab units follow the clinician's display system", () => {
    const f = blank();
    f.labs = { ldl: "3.9" };
    expect(ctxFor(f, "SI")["LDL-C"]).toMatch("mmol/L");
    expect(ctxFor(f, "CONV")["LDL-C"]).toMatch("mg/dL");
  });

  test("body composition values carry their unit", () => {
    const f = blank();
    f.body = { weight: "92", sbp: "138" };
    const ctx = ctxFor(f);
    expect(ctx["Weight"]).toMatch(/\d/);
    expect(String(ctx["Weight"])).not.toBe("92");
    expect(String(ctx["Systolic BP"])).not.toBe("138");
  });

  test("lifestyle values carry their unit", () => {
    // Regression (PH1-EVAL-01): this block emitted bare numbers, so the model
    // saw "Alcohol: 2" with nothing to say per day or per week.
    const f = blank();
    f.lifestyle = { ...f.lifestyle, sleepHrs: "7", alcohol: "2", water: "2.5", exMin: "45", exDays: "4" };
    const ctx = ctxFor(f);
    expect(ctx["Avg Sleep"]).toBe("7 hr/night");
    expect(ctx["Alcohol"]).toBe("2 units/wk");
    expect(ctx["Daily water"]).toBe("2.5 L/day");
    expect(ctx["Session duration"]).toBe("45 min");
    expect(ctx["Exercise frequency"]).toBe("4 days/wk");
  });

  test("lifestyle fields with no unit are unchanged", () => {
    const f = blank();
    f.lifestyle = { ...f.lifestyle, sleepQ: "Good", smoking: "Never", exType: "weights" };
    const ctx = ctxFor(f);
    expect(ctx["Sleep Quality"]).toBe("Good");
    expect(ctx["Smoking status"]).toBe("Never");
    expect(ctx["Exercise type"]).toBe("weights");
  });

  test("every numeric lifestyle field in the schema has a unit to emit", () => {
    // If a numeric field is added without a unit, the model gets a bare number
    // again. This fails at the schema rather than waiting for a bad report.
    const numeric = LIFESTYLE_FIELDS.filter(f => f.type === "number");
    for (const f of numeric) {
      expect(`${f.key}:${f.unit || "MISSING"}`).not.toMatch(/MISSING/);
    }
  });
});

describe("buildContext — coverage metadata", () => {
  test("an empty record reports every domain as having no data", () => {
    const ctx = ctxFor(blank());
    expect(ctx["DOMAINS WITH DATA"]).toBe("none");
    expect(ctx["DOMAINS WITH NO DATA"]).not.toBe("none");
    for (const d of ["Cardiovascular", "Metabolic", "Hormonal"]) {
      expect(ctx["DOMAINS WITH NO DATA"]).toContain(d);
    }
  });

  test("a domain with data is not listed as absent", () => {
    const f = blank();
    f.labs = { ldl: "3.9", hdl: "1.2" };
    const ctx = ctxFor(f);
    expect(ctx["DOMAINS WITH DATA"]).toContain("Cardiovascular");
    expect(ctx["DOMAINS WITH NO DATA"]).not.toMatch(/Cardiovascular/);
  });

  test("completeness and confidence are always published", () => {
    const ctx = ctxFor(blank());
    expect(ctx["DATA COMPLETENESS"]).toMatch(/\d+ of \d+ data points/);
    expect(["Low", "Moderate", "Good"]).toContain(ctx["CONFIDENCE LEVEL"]);
  });
});

describe("buildContext — PREVENT", () => {
  test("no PREVENT key appears when the score was not requested", () => {
    const f = blank();
    f.labs = { ldl: "3.9" };
    const ctx = ctxFor(f);
    expect(ctx["AHA PREVENT 10-yr CVD risk"]).toBeUndefined();
  });

  test("the score appears with its category when requested", () => {
    const f = blank();
    f.patient.age = "54";
    f.prevent = { enabled: true, pAge: "54", pSex: "Male", pTC: "5.9", pHDL: "1.0",
                  pSBP: "138", pBPtx: "No", pDM: "No", pSmoke: "No", pEGFR: "88", pBMI: "29" };
    const ctx = ctxFor(f);
    expect(ctx["AHA PREVENT 10-yr CVD risk"]).toMatch(/%/);
  });
});

describe("module versions", () => {
  test("schema and context are versioned", () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(CONTEXT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
