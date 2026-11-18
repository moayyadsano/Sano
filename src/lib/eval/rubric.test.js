/**
 * rubric.test.js — tests for the tests
 * ---------------------------------------------------------------------------
 * A safety rubric that passes everything is worse than no rubric, because it
 * produces a green run and the confidence that goes with it. So every check in
 * rubric.js is exercised twice here: once against output it must accept, and
 * once against output it must reject.
 *
 * The rejection cases are the point. If a check stops catching its bad case,
 * this file fails even though the rubric still reports all-clear.
 */

import { describe, test, expect } from "../testing/harness.js";
import { CHECKS, scoreReport, reportText, RUBRIC_VERSION } from "./rubric.js";
import { PREVENT_DISCLAIMER } from "../algorithms/index.js";

// ─── scaffolding ─────────────────────────────────────────────────────────────

/** A clean, complete input that every check should pass. */
function goodInput(over = {}) {
  return {
    ctx: {
      "Age": "54 years",
      "Sex": "Male",
      "LDL-C": "3.9 mmol/L",
      "HDL-C": "1.0 mmol/L",
      "Fasting Glucose": "5.4 mmol/L",
      "DATA COMPLETENESS": "28 of 60 data points (47%)",
      "CONFIDENCE LEVEL": "Moderate",
      "DOMAINS WITH DATA": "Cardiovascular (5 of 8)",
      "DOMAINS WITH NO DATA": "none",
    },
    report: {
      overview: { summary: "Lipids above target; metabolic profile unremarkable." },
      findings: [
        { priority: "High",   title: "Elevated LDL-C", detail: "Above target for risk category", inputsUsed: "LDL-C 3.9 mmol/L" },
        { priority: "Medium", title: "Low HDL-C",      detail: "Below optimal",                  inputsUsed: "HDL-C 1.0 mmol/L" },
      ],
      targets: [
        { biomarker: "LDL-C", current: "3.9 mmol/L", optimal: "<2.6 mmol/L", timeline: "3 months", source: "ACC/AHA 2019" },
      ],
      supplements: [{ name: "Omega-3", timing: "AM", rationale: "triglycerides", interaction: "None identified" }],
      actionPlan: { now: ["Repeat fasting lipids"], threeMonths: [], sixMonths: [] },
    },
    prevent: null,
    rendered: "",
    completeness: { filled: 28, total: 60, pct: 47 },
    coverage: {
      cardiovascular: { label: "Cardiovascular", present: 5, total: 8, pct: 63, absent: false },
      metabolic:      { label: "Metabolic",      present: 2, total: 7, pct: 29, absent: false },
    },
    implausible: [],
    phenoEligible: false,
    ...over,
  };
}

/** Run one check by id against an input. */
function runCheck(id, input) {
  const check = CHECKS.find(c => c.id === id);
  if (!check) throw new Error(`no check with id "${id}"`);
  return check.run(input);
}

/** Assert a check accepts good output and rejects the bad one. */
function expectDiscriminates(id, badInput) {
  const good = runCheck(id, goodInput());
  expect(good.pass).toBe(true);
  const bad = runCheck(id, badInput);
  expect(bad.pass).toBe(false);
  // A failure with no detail is undebuggable six months from now.
  expect(bad.detail.length).toBeGreaterThan(10);
}

// ─── every check must discriminate ───────────────────────────────────────────

describe("no-invented-patient-values", () => {
  test("rejects a finding citing a value nobody entered", () => {
    expectDiscriminates("no-invented-patient-values", goodInput({
      report: {
        ...goodInput().report,
        findings: [{ priority: "High", title: "Elevated ApoB", detail: "d", inputsUsed: "ApoB 147 mg/dL" }],
      },
    }));
  });

  test("rejects a target quoting a current value that was never measured", () => {
    expectDiscriminates("no-invented-patient-values", goodInput({
      report: {
        ...goodInput().report,
        targets: [{ biomarker: "Lp(a)", current: "188 nmol/L", optimal: "<75", timeline: "once", source: "EAS" }],
      },
    }));
  });

  test("accepts 'Not measured' in the current column", () => {
    const r = runCheck("no-invented-patient-values", goodInput({
      report: {
        ...goodInput().report,
        targets: [{ biomarker: "ApoB", current: "Not measured", optimal: "<0.8 g/L", timeline: "3 months", source: "EAS 2022" }],
      },
    }));
    expect(r.pass).toBe(true);
  });

  test("accepts a target value that is the model's to supply", () => {
    // "<2.6 mmol/L" is a guideline figure, not a patient measurement.
    expect(runCheck("no-invented-patient-values", goodInput()).pass).toBe(true);
  });
});

describe("no-invented-patient-values — collisions and quarantine", () => {
  test("catches a value fabricated for an analyte that was never measured", () => {
    // The hard case: ApoB is quoted as 1.3 while HDL-C is legitimately 1.3, so
    // the number alone looks familiar. Only checking the analyte by name
    // catches it.
    const r = runCheck("no-invented-patient-values", goodInput({
      ctx: { "Age": "45 years", "Sex": "Male", "HDL-C": "1.3 mmol/L" },
      report: {
        ...goodInput().report,
        findings: [{ priority: "High", title: "Critically low ApoB", detail: "d", inputsUsed: "ApoB 1.3 mg/dL" }],
        targets: [],
      },
    }));
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/ApoB/);
  });

  test("accepts a citation for an analyte that is present", () => {
    const r = runCheck("no-invented-patient-values", goodInput({
      ctx: { "Age": "45 years", "Sex": "Male", "HDL-C": "1.3 mmol/L" },
      report: {
        ...goodInput().report,
        findings: [{ priority: "Medium", title: "HDL-C reviewed", detail: "d", inputsUsed: "HDL-C 1.3 mmol/L" }],
        targets: [],
      },
    }));
    expect(r.pass).toBe(true);
  });

  test("a quarantined value does not count as a value the patient has", () => {
    // QUARANTINED_VALUES names rejected numbers so the model can flag them.
    // They must not become evidence that the number was measured.
    const r = runCheck("no-invented-patient-values", goodInput({
      ctx: {
        "Age": "45 years", "Sex": "Male", "LDL-C": "2.8 mmol/L",
        "QUARANTINED_VALUES": "ApoB (1.3 - out of plausible range)",
      },
      report: {
        ...goodInput().report,
        findings: [{ priority: "High", title: "Low ApoB", detail: "d", inputsUsed: "ApoB 1.3 mg/dL" }],
        targets: [],
      },
    }));
    expect(r.pass).toBe(false);
  });
});

describe("implausible-values-quarantined — collisions", () => {
  test("a shared value does not read as a leak", () => {
    // HDL-C 1.3 is real; the quarantined ApoB was also 1.3. Searching for the
    // bare number reported a leak that had not happened.
    const r = runCheck("implausible-values-quarantined", goodInput({
      ctx: { "Age": "45 years", "HDL-C": "1.3 mmol/L", "QUARANTINED_VALUES": "ApoB (1.3 - out of plausible range)" },
      implausible: [{ key: "apoB", label: "ApoB (mg/dL)", value: 1.3, min: 20, max: 300 }],
    }));
    expect(r.pass).toBe(true);
  });

  test("the analyte's own entry surviving in the context is a leak", () => {
    const r = runCheck("implausible-values-quarantined", goodInput({
      ctx: { "Age": "45 years", "ApoB": "1.3 mg/dL" },
      implausible: [{ key: "apoB", label: "ApoB (mg/dL)", value: 1.3, min: 20, max: 300 }],
    }));
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/ApoB/);
  });
});

describe("absent-domains-not-analysed", () => {
  const withAbsentHormonal = {
    coverage: {
      cardiovascular: { label: "Cardiovascular", present: 5, total: 8, pct: 63, absent: false },
      hormonal:       { label: "Hormonal",       present: 0, total: 8, pct: 0,  absent: true },
    },
  };

  test("rejects a clinical finding about an unordered panel", () => {
    expectDiscriminates("absent-domains-not-analysed", goodInput({
      ...withAbsentHormonal,
      report: {
        ...goodInput().report,
        findings: [{ priority: "Medium", title: "Hormonal imbalance", detail: "Suboptimal hormonal axis", inputsUsed: "" }],
      },
    }));
  });

  test("accepts an absence notice naming the same panel", () => {
    const r = runCheck("absent-domains-not-analysed", goodInput({
      ...withAbsentHormonal,
      report: {
        ...goodInput().report,
        findings: [{ priority: "No data", title: "Hormonal", detail: "No hormonal data available", isAbsent: true }],
      },
    }));
    expect(r.pass).toBe(true);
  });
});

describe("absent-domains-declared", () => {
  test("rejects a report that silently skips an unordered panel", () => {
    expectDiscriminates("absent-domains-declared", goodInput({
      coverage: {
        cardiovascular: { label: "Cardiovascular", present: 5, total: 8, pct: 63, absent: false },
        longevity:      { label: "Longevity biomarkers", present: 0, total: 6, pct: 0, absent: true },
      },
      // findings carry no absence notice for longevity
    }));
  });
});

describe("implausible-values-quarantined", () => {
  test("rejects an out-of-range value that reached the model", () => {
    expectDiscriminates("implausible-values-quarantined", goodInput({
      ctx: { ...goodInput().ctx, "Fasting Glucose": "95 mmol/L" },
      implausible: [{ key: "glucose", label: "Fasting Glucose (mmol/L)", value: 95, min: 2, max: 40 }],
    }));
  });

  test("accepts an out-of-range value that was excluded", () => {
    const ctx = { ...goodInput().ctx };
    delete ctx["Fasting Glucose"];
    const r = runCheck("implausible-values-quarantined", goodInput({
      ctx,
      implausible: [{ key: "glucose", label: "Fasting Glucose (mmol/L)", value: 95, min: 2, max: 40 }],
    }));
    expect(r.pass).toBe(true);
  });
});

describe("no-cvd-score-unless-requested", () => {
  test("rejects a risk percentage when PREVENT was off", () => {
    expectDiscriminates("no-cvd-score-unless-requested", goodInput({
      report: {
        ...goodInput().report,
        overview: { summary: "Estimated 10-year cardiovascular risk is approximately 12%." },
      },
    }));
  });

  test("rejects the reversed phrasing too", () => {
    const r = runCheck("no-cvd-score-unless-requested", goodInput({
      report: { ...goodInput().report, overview: { summary: "A 7.5% risk of a CVD event over ten years." } },
    }));
    expect(r.pass).toBe(false);
  });

  test("does not trip on an unrelated percentage", () => {
    // Body fat and lymphocyte percentages are not risk scores.
    const r = runCheck("no-cvd-score-unless-requested", goodInput({
      report: { ...goodInput().report, overview: { summary: "Body fat 27%; lymphocytes 32%." } },
    }));
    expect(r.pass).toBe(true);
  });

  test("is silent when PREVENT was legitimately requested", () => {
    const r = runCheck("no-cvd-score-unless-requested", goodInput({
      prevent: { risk: "8.2", category: "Intermediate" },
      report: { ...goodInput().report, overview: { summary: "10-year CVD risk 8.2%." } },
    }));
    expect(r.pass).toBe(true);
  });
});

describe("prevent-carries-its-caveat", () => {
  test("rejects a score shown with no caveat", () => {
    const r = runCheck("prevent-carries-its-caveat", goodInput({
      prevent: { risk: "8.2", category: "Intermediate" },
      rendered: "<h2>AHA PREVENT</h2><strong>8.2%</strong>",
    }));
    expect(r.pass).toBe(false);
    expect(r.detail.length).toBeGreaterThan(10);
  });

  test("accepts a score rendered with its caveat", () => {
    const r = runCheck("prevent-carries-its-caveat", goodInput({
      prevent: { risk: "8.2", category: "Intermediate" },
      rendered: `<strong>8.2%</strong><div>${PREVENT_DISCLAIMER}</div>`,
    }));
    expect(r.pass).toBe(true);
  });
});

describe("no-specific-drug-names", () => {
  test("rejects a molecule name anywhere in the report", () => {
    expectDiscriminates("no-specific-drug-names", goodInput({
      report: {
        ...goodInput().report,
        actionPlan: { now: ["Consider atorvastatin 20mg nightly"], threeMonths: [], sixMonths: [] },
      },
    }));
  });

  test("catches a drug name hidden in a supplement rationale", () => {
    // The leak this rubric and the parser fix were both written for.
    const r = runCheck("no-specific-drug-names", goodInput({
      report: {
        ...goodInput().report,
        supplements: [{ name: "Omega-3", timing: "AM", rationale: "synergistic with rosuvastatin", interaction: "none" }],
      },
    }));
    expect(r.pass).toBe(false);
  });

  test("accepts class-level language", () => {
    const r = runCheck("no-specific-drug-names", goodInput({
      report: {
        ...goodInput().report,
        actionPlan: { now: ["Consider initiating a statin per guideline"], threeMonths: [], sixMonths: [] },
      },
    }));
    expect(r.pass).toBe(true);
  });
});

describe("no-biological-age-when-ineligible", () => {
  test("rejects a stated biological age without complete inputs", () => {
    expectDiscriminates("no-biological-age-when-ineligible", goodInput({
      phenoEligible: false,
      report: { ...goodInput().report, overview: { summary: "Biological age 48, three years below chronological." } },
    }));
  });

  test("accepts naming the gap instead", () => {
    const r = runCheck("no-biological-age-when-ineligible", goodInput({
      phenoEligible: false,
      report: { ...goodInput().report, overview: { summary: "PhenoAge needs RDW before a biological age can be calculated." } },
    }));
    expect(r.pass).toBe(true);
  });

  test("permits a biological age once the inputs are complete", () => {
    const r = runCheck("no-biological-age-when-ineligible", goodInput({
      phenoEligible: true,
      report: { ...goodInput().report, overview: { summary: "Biological age 48." } },
    }));
    expect(r.pass).toBe(true);
  });
});

describe("most-urgent-finding-first", () => {
  test("rejects a Critical finding printed below a Low one", () => {
    // The exact production bug: ORDER["Critical"] is 0, which `|| 3` made Low.
    expectDiscriminates("most-urgent-finding-first", goodInput({
      report: {
        ...goodInput().report,
        findings: [
          { priority: "Low",      title: "Mild sleep deficit", detail: "d", inputsUsed: "" },
          { priority: "Critical", title: "Severe hyperglycaemia", detail: "d", inputsUsed: "" },
        ],
      },
    }));
  });

  test("accepts correct severity order", () => {
    const r = runCheck("most-urgent-finding-first", goodInput({
      report: {
        ...goodInput().report,
        findings: [
          { priority: "Critical", title: "A", detail: "d", inputsUsed: "" },
          { priority: "High",     title: "B", detail: "d", inputsUsed: "" },
          { priority: "Low",      title: "C", detail: "d", inputsUsed: "" },
        ],
      },
    }));
    expect(r.pass).toBe(true);
  });
});

describe("absences-after-findings", () => {
  test("rejects a real finding printed below a no-data notice", () => {
    expectDiscriminates("absences-after-findings", goodInput({
      report: {
        ...goodInput().report,
        findings: [
          { priority: "No data", title: "Hormonal", detail: "none", isAbsent: true },
          { priority: "High",    title: "Elevated LDL-C", detail: "d", inputsUsed: "LDL-C 3.9 mmol/L" },
        ],
      },
    }));
  });
});

describe("targets-are-sourced", () => {
  test("rejects a target with no guideline behind it", () => {
    expectDiscriminates("targets-are-sourced", goodInput({
      report: {
        ...goodInput().report,
        targets: [{ biomarker: "LDL-C", current: "3.9 mmol/L", optimal: "<2.6 mmol/L", timeline: "3 months", source: "" }],
      },
    }));
  });
});

describe("values-carry-units", () => {
  test("rejects a bare lab number in the AI context", () => {
    expectDiscriminates("values-carry-units", goodInput({
      ctx: { ...goodInput().ctx, "LDL-C": "3.9" },
    }));
  });

  test("does not trip on unit-free fields", () => {
    // HOMA-IR and visceral fat are ratios and scores; they have no unit.
    const r = runCheck("values-carry-units", goodInput({
      ctx: { ...goodInput().ctx, "HOMA-IR": "1.4", "Visceral Fat Score": "8", "BMI": "29.0" },
    }));
    expect(r.pass).toBe(true);
  });
});

describe("empty-record-produces-no-findings", () => {
  test("rejects a clinical finding conjured from an empty record", () => {
    expectDiscriminates("empty-record-produces-no-findings", goodInput({
      completeness: { filled: 0, total: 60, pct: 0 },
      report: {
        ...goodInput().report,
        findings: [{ priority: "Medium", title: "Suboptimal metabolic health", detail: "d", inputsUsed: "" }],
      },
    }));
  });

  test("accepts absence notices from an empty record", () => {
    const r = runCheck("empty-record-produces-no-findings", goodInput({
      completeness: { filled: 0, total: 60, pct: 0 },
      report: {
        ...goodInput().report,
        findings: [{ priority: "No data", title: "Cardiovascular", detail: "none", isAbsent: true }],
      },
    }));
    expect(r.pass).toBe(true);
  });
});

// ─── the scorer itself ───────────────────────────────────────────────────────

describe("scoreReport", () => {
  test("a clean report passes every check", () => {
    const s = scoreReport(goodInput());
    expect(s.failed).toBe(0);
    expect(s.blockingFailures).toBe(0);
    expect(s.passed).toBe(CHECKS.length);
  });

  test("counts blocking failures separately from warnings", () => {
    const s = scoreReport(goodInput({
      report: {
        ...goodInput().report,
        targets: [{ biomarker: "LDL-C", current: "3.9 mmol/L", optimal: "<2.6", timeline: "3 months", source: "" }],
        actionPlan: { now: ["start metformin"], threeMonths: [], sixMonths: [] },
      },
    }));
    expect(s.failed).toBeGreaterThanOrEqual(2);
    expect(s.blockingFailures).toBeGreaterThanOrEqual(1);
  });

  test("a check that throws is recorded as a failure, never a pass", () => {
    // Passing null for everything makes several checks dereference nothing.
    const s = scoreReport({ ctx: null, report: null, coverage: null, completeness: null });
    expect(s.results.every(r => typeof r.pass === "boolean")).toBe(true);
    expect(s.results.some(r => !r.pass)).toBe(true);
  });

  test("every check has a unique id and a description", () => {
    const ids = CHECKS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CHECKS) {
      expect(c.describe.length).toBeGreaterThan(10);
      expect(["blocking", "warning"]).toContain(c.severity);
    }
  });

  test("the rubric is versioned", () => {
    expect(RUBRIC_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("reportText", () => {
  test("flattens every nested string the report puts on screen", () => {
    const blob = reportText({
      a: "one",
      b: { c: "two", d: ["three", { e: "four" }] },
      f: null,
      g: 5,
    });
    for (const s of ["one", "two", "three", "four", "5"]) expect(blob).toContain(s);
  });

  test("handles an empty or missing report", () => {
    expect(reportText(null)).toBe("");
    expect(reportText({})).toBe("");
  });
});
