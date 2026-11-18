/**
 * parser.test.js
 * ---------------------------------------------------------------------------
 * The parser is the only thing standing between a language model's free text
 * and a clinical report. Everything it fails to catch is printed as if the
 * tool meant it, so these tests lean on the failure paths rather than the
 * happy one: malformed lines, missing fields, absent domains, and the
 * drug-naming policy.
 *
 * Promoted into the repo in PH1-EVAL-01. Before that these assertions lived in
 * a throwaway script that was rebuilt by hand each time, which is exactly how
 * coverage rots.
 */

import { describe, test, expect } from "./testing/harness.js";
import {
  PARSER_VERSION,
  parseOverview, parseFindings, parseTargets, parseActionPlan,
  parseNutrition, parseExercise, parseSupplements, parseFollowUp,
  redactDrugNames, BANNED_DRUGS, DRUG_CLASS_BY_NAME,
} from "./parser.js";

// ═══════════════════════════════════════════════════════════════════════════
// NEVER THROWS
// A parser that throws takes the whole report down. Every entry point has to
// survive the worst input the model could hand it.
// ═══════════════════════════════════════════════════════════════════════════
describe("parsers never throw", () => {
  const PARSERS = {
    parseOverview, parseFindings, parseTargets, parseActionPlan,
    parseNutrition, parseExercise, parseSupplements, parseFollowUp,
  };
  const JUNK = ["", null, undefined, "   ", "\n\n\n", "|||||", "no delimiters here",
                "SUPP:", "ABSENT |", 12345, {}, [], "\u0000"];

  for (const [name, fn] of Object.entries(PARSERS)) {
    test(`${name} survives junk input`, () => {
      for (const input of JUNK) {
        expect(() => fn(input)).not.toThrow();
        expect(fn(input)).toBeDefined();
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════
describe("parseOverview", () => {
  test("reads the documented prefixes", () => {
    const r = parseOverview("SUMMARY: Metabolically healthy, lipids suboptimal.\nLONGEVITY: Insufficient data for PhenoAge.");
    expect(r.summary).toBe("Metabolically healthy, lipids suboptimal.");
    expect(r.longevityNote).toBe("Insufficient data for PhenoAge.");
  });

  test("prefix matching ignores case", () => {
    const r = parseOverview("summary: lower case works\nLongevity: mixed case works");
    expect(r.summary).toBe("lower case works");
    expect(r.longevityNote).toBe("mixed case works");
  });

  test("falls back to the first two lines when prefixes are missing", () => {
    const r = parseOverview("A plain first line.\nA plain second line.");
    expect(r.summary).toBe("A plain first line.");
    expect(r.longevityNote).toBe("A plain second line.");
  });

  test("empty input yields a stated fallback, never an empty report", () => {
    const r = parseOverview("");
    // The clinician must be able to tell "nothing was generated" from "all clear".
    expect(r.summary).toMatch(/could not be generated/i);
    expect(r.longevityNote).toMatch(/insufficient data/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FINDINGS — including the PH1-AI-04 absence markers
// ═══════════════════════════════════════════════════════════════════════════
describe("parseFindings", () => {
  const MIXED = [
    "High | Elevated LDL-C | LDL above optimal for CV risk (ACC/AHA 2019) | LDL 4.2 mmol/L",
    "Low | Mild sleep deficit | 5.5 hrs per night below optimal | Sleep 5.5 hrs",
    "ABSENT | Hormonal | No Hormonal data available - order the relevant panel to assess",
    "ABSENT | Longevity biomarkers | No Longevity biomarkers data available - order panel",
  ].join("\n");

  test("parses real findings and absence notices together", () => {
    const f = parseFindings(MIXED);
    expect(f).toHaveLength(4);
    expect(f[0].priority).toBe("High");
    expect(f[0].isAbsent).toBeFalsy();
  });

  test("absence notices are pushed below every real finding", () => {
    // A clinician scanning the list must not hit "no data" before the findings.
    const f = parseFindings(MIXED);
    expect(f[2].isAbsent).toBe(true);
    expect(f[3].isAbsent).toBe(true);
  });

  test("an absence carries the domain name and a no-data marker", () => {
    const f = parseFindings(MIXED);
    expect(f[2].priority).toBe("No data");
    expect(f[2].title).toBe("Hormonal");
    expect(f[2].inputsUsed).toBe("No data entered");
  });

  test("the absent marker is matched case-insensitively", () => {
    const f = parseFindings("absent | Cardiovascular | no panel ordered");
    expect(f[0].isAbsent).toBe(true);
  });

  test("a report of absences only is a valid result, not a parse failure", () => {
    // An empty patient should say which panels are missing, not fall back to
    // the generic "insufficient data" placeholder.
    const f = parseFindings("ABSENT | Cardiovascular | No Cardiovascular data available - order panel");
    expect(f).toHaveLength(1);
    expect(f[0].isAbsent).toBe(true);
    expect(f[0].title).toBe("Cardiovascular");
  });

  test("findings sort by clinical severity", () => {
    const f = parseFindings([
      "Low | Low item | d | i",
      "Critical | Critical item | d | i",
      "Medium | Medium item | d | i",
      "High | High item | d | i",
    ].join("\n"));
    expect(f.map(x => x.priority)).toEqual(["Critical", "High", "Medium", "Low"]);
  });

  test("priority words are normalised whatever case the model used", () => {
    const f = parseFindings("HIGH | Shouty | d | i\nmedium | quiet | d | i");
    expect(f[0].priority).toBe("High");
    expect(f[1].priority).toBe("Medium");
  });

  test("lines with no recognisable priority are dropped, not guessed at", () => {
    const f = parseFindings("Banana | Not a priority | d | i\nHigh | Real one | d | i");
    expect(f).toHaveLength(1);
    expect(f[0].title).toBe("Real one");
  });

  test("nothing parseable yields an explicit insufficient-data notice", () => {
    const f = parseFindings("the model wrote prose instead of rows");
    expect(f).toHaveLength(1);
    expect(f[0].title).toMatch(/insufficient data/i);
  });

  test("findings are capped so the report stays readable", () => {
    const many = Array.from({ length: 12 }, (_, i) => `High | Finding ${i} | d | i`).join("\n");
    expect(parseFindings(many).length).toBeLessThanOrEqual(6);
  });

  test("absence notices are capped too", () => {
    const many = Array.from({ length: 9 }, (_, i) => `ABSENT | Domain ${i} | none`).join("\n");
    expect(parseFindings(many).length).toBeLessThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TARGETS
// ═══════════════════════════════════════════════════════════════════════════
describe("parseTargets", () => {
  const TARGET = "LDL-C | 4.2 mmol/L | <2.6 mmol/L | Guideline-based (ACC/AHA) | 3 months | ACC/AHA 2019";

  test("reads all six fields", () => {
    const t = parseTargets(TARGET);
    expect(t).toHaveLength(1);
    expect(t[0].biomarker).toBe("LDL-C");
    expect(t[0].current).toBe("4.2 mmol/L");
    expect(t[0].optimal).toBe("<2.6 mmol/L");
    expect(t[0].timeline).toBe("3 months");
    expect(t[0].source).toBe("ACC/AHA 2019");
  });

  test("finding lines are not mistaken for targets", () => {
    const t = parseTargets("High | Elevated LDL-C | detail | inputs\n" + TARGET);
    expect(t).toHaveLength(1);
    expect(t[0].biomarker).toBe("LDL-C");
  });

  test("absence markers are not mistaken for targets", () => {
    // Regression: an ABSENT row once became a target with "Hormonal" as the
    // biomarker, so the report listed a goal for a panel nobody had ordered.
    const t = parseTargets("ABSENT | Hormonal | No Hormonal data available\n" + TARGET);
    expect(t).toHaveLength(1);
    expect(t[0].biomarker).toBe("LDL-C");
  });

  test("an unmeasured biomarker is labelled, not left blank", () => {
    const t = parseTargets("ApoB |  | <0.8 g/L | Optimal | 6 months | EAS 2022");
    expect(t[0].current).toBe("Not measured");
  });

  test("targets are capped", () => {
    const many = Array.from({ length: 10 }, (_, i) => `Marker${i} | 1 | 2 | t | 3 months | src`).join("\n");
    expect(parseTargets(many).length).toBeLessThanOrEqual(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTION PLAN
// ═══════════════════════════════════════════════════════════════════════════
describe("parseActionPlan", () => {
  test("sorts items into their horizons", () => {
    const r = parseActionPlan([
      "NOW: Start resistance training twice weekly",
      "NOW: Repeat fasting lipids",
      "3MON: Reassess LDL-C",
      "6MON: Reassess body composition",
    ].join("\n"));
    expect(r.now).toHaveLength(2);
    expect(r.threeMonths).toHaveLength(1);
    expect(r.sixMonths).toHaveLength(1);
  });

  test("accepts both spellings of the three-month prefix", () => {
    const r = parseActionPlan("3MONTHS: spelled out\n3MON: abbreviated");
    expect(r.threeMonths).toHaveLength(2);
    expect(r.threeMonths[0]).toBe("spelled out");
  });

  test("strips list numbering the model added", () => {
    const r = parseActionPlan("NOW: 1. Start walking\nNOW: - Second item");
    expect(r.now[0]).toBe("Start walking");
    expect(r.now[1]).toBe("Second item");
  });

  test("empty input yields empty lists rather than placeholder advice", () => {
    const r = parseActionPlan("");
    expect(r.now).toEqual([]);
    expect(r.threeMonths).toEqual([]);
    expect(r.sixMonths).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NUTRITION
// ═══════════════════════════════════════════════════════════════════════════
describe("parseNutrition", () => {
  test("sorts each prefix into its own list", () => {
    const r = parseNutrition([
      "APPROACH: Mediterranean-pattern",
      "PRINCIPLE: Protein at every meal",
      "EAT: Oily fish twice weekly",
      "EAT: Legumes daily",
      "AVOID: Refined carbohydrate",
      "SOURCE: PREDIMED 2018",
    ].join("\n"));
    expect(r.approach).toBe("Mediterranean-pattern");
    expect(r.principles).toHaveLength(1);
    expect(r.prioritize).toHaveLength(2);
    expect(r.minimize).toHaveLength(1);
    expect(r.source).toBe("PREDIMED 2018");
  });

  test("missing sections come back empty, not invented", () => {
    const r = parseNutrition("APPROACH: Mixed");
    expect(r.principles).toEqual([]);
    expect(r.prioritize).toEqual([]);
    expect(r.source).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXERCISE
// ═══════════════════════════════════════════════════════════════════════════
describe("parseExercise", () => {
  test("reads the blueprint and the zone rows", () => {
    const r = parseExercise([
      "BLUEPRINT: 3 resistance sessions, 2 zone-2 sessions weekly",
      "ZONE: Resistance | 3x/week | 45 min | Preserves lean mass",
      "ZONE: Zone 2 | 2x/week | 40 min | Mitochondrial density",
    ].join("\n"));
    expect(r.weeklyBlueprint).toMatch(/resistance sessions/);
    expect(r.zones).toHaveLength(2);
    expect(r.zones[0].modality).toBe("Resistance");
    expect(r.zones[0].why).toBe("Preserves lean mass");
  });

  test("a malformed zone row is skipped and the rest survive", () => {
    const r = parseExercise("ZONE: broken row\nZONE: Resistance | 3x/week | 45 min | why");
    expect(r.zones).toHaveLength(1);
    expect(r.zones[0].modality).toBe("Resistance");
  });

  test("zones are capped", () => {
    const many = Array.from({ length: 8 }, (_, i) => `ZONE: M${i} | 1x | 10 min | why`).join("\n");
    expect(parseExercise(many).zones.length).toBeLessThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLEMENTS — the drug-naming policy
// Sano states therapeutic intent by class; the clinician picks agent and dose.
// ═══════════════════════════════════════════════════════════════════════════
describe("parseSupplements", () => {
  test("reads a well-formed supplement row", () => {
    const s = parseSupplements("SUPP: Vitamin D3 | With breakfast | 25-OH below target | None identified");
    expect(s).toHaveLength(1);
    expect(s[0].name).toBe("Vitamin D3");
    expect(s[0].timing).toBe("With breakfast");
  });

  test("a missing interaction field is labelled, not left blank", () => {
    const s = parseSupplements("SUPP: Magnesium glycinate | PM | sleep quality");
    expect(s[0].interaction).toBe("None identified");
  });

  test("iron bisglycinate is renamed per the product decision", () => {
    const s = parseSupplements("SUPP: Iron bisglycinate | AM | ferritin low | take with vitamin C");
    expect(s[0].name).toBe("Iron supplement");
  });

  test("a named drug in the NAME field drops the whole recommendation", () => {
    // The line is recommending the drug itself — there is nothing to salvage.
    const s = parseSupplements("SUPP: Atorvastatin 20mg | PM | lipid lowering | none");
    expect(s).toHaveLength(0);
  });

  test("every banned drug is caught in the name field", () => {
    for (const drug of BANNED_DRUGS) {
      expect(parseSupplements(`SUPP: ${drug} | AM | reason | none`)).toHaveLength(0);
    }
  });

  test("a named drug in a free-text field is replaced by its class", () => {
    // Regression (PH1-EVAL-01): only the name field was scanned, so a molecule
    // name reached the report through the rationale and read as a prescription.
    const s = parseSupplements("SUPP: Omega-3 | AM | synergistic with atorvastatin | avoid with metformin");
    expect(s).toHaveLength(1);
    expect(s[0].name).toBe("Omega-3");
    expect(s[0].rationale).not.toMatch(/atorvastatin/i);
    expect(s[0].rationale).toMatch(/a statin/);
    expect(s[0].interaction).not.toMatch(/metformin/i);
    expect(s[0].interaction).toMatch(/a biguanide/);
  });

  test("no banned drug survives in any field of a parsed supplement", () => {
    for (const drug of BANNED_DRUGS) {
      const s = parseSupplements(`SUPP: Creatine | with ${drug} | pairs with ${drug} | caution with ${drug}`);
      const blob = JSON.stringify(s).toLowerCase();
      expect(blob).not.toContain(drug.toLowerCase());
    }
  });

  test("supplements are capped", () => {
    const many = Array.from({ length: 12 }, (_, i) => `SUPP: Supp${i} | AM | reason | none`).join("\n");
    expect(parseSupplements(many).length).toBeLessThanOrEqual(8);
  });
});

describe("redactDrugNames", () => {
  test("maps each banned drug to a class, not to a blank", () => {
    // Deleting the word would leave "synergistic with  for lipids"; the class
    // keeps the sentence clinically meaningful.
    for (const drug of BANNED_DRUGS) {
      const out = redactDrugNames(`consider ${drug} here`);
      expect(out).not.toMatch(new RegExp(drug, "i"));
      expect(out).toContain(DRUG_CLASS_BY_NAME[drug]);
    }
  });

  test("is case-insensitive", () => {
    expect(redactDrugNames("ATORVASTATIN and Metformin")).toBe("a statin and a biguanide");
  });

  test("leaves ordinary text alone", () => {
    expect(redactDrugNames("vitamin D and magnesium")).toBe("vitamin D and magnesium");
  });

  test("handles empty input", () => {
    expect(redactDrugNames("")).toBe("");
    expect(redactDrugNames(null)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP
// ═══════════════════════════════════════════════════════════════════════════
describe("parseFollowUp", () => {
  test("sorts each timepoint and strips its label", () => {
    const r = parseFollowUp([
      "FOLLOWUP: 2 weeks - Check tolerance of new supplements",
      "FOLLOWUP: 1 month - Review sleep diary",
      "FOLLOWUP: 3 months - Repeat lipid panel",
      "FOLLOWUP: 6 months - Reassess body composition",
    ].join("\n"));
    expect(r.twoWeeks).toBe("Check tolerance of new supplements");
    expect(r.oneMonth).toBe("Review sleep diary");
    expect(r.threeMonths).toBe("Repeat lipid panel");
    expect(r.sixMonths).toBe("Reassess body composition");
  });

  test("accepts singular and plural labels", () => {
    const r = parseFollowUp("FOLLOWUP: 2 week - singular\nFOLLOWUP: 6 month - also singular");
    expect(r.twoWeeks).toBe("singular");
    expect(r.sixMonths).toBe("also singular");
  });

  test("unrecognised timepoints are dropped rather than misfiled", () => {
    const r = parseFollowUp("FOLLOWUP: 9 months - not a supported timepoint");
    expect(r).toEqual({ twoWeeks: "", oneMonth: "", threeMonths: "", sixMonths: "" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGRESSIONS
// Two bugs that shipped to production and were caught by this suite in
// PH1-EVAL-01. Both printed wrong clinical content with no error of any kind,
// which is the failure mode worth the most pinning.
// ═══════════════════════════════════════════════════════════════════════════
describe("regression: decimal values must survive cleaning", () => {
  // clean() stripped list numbering with /^\d+[.)]\s*/, which also ate the
  // integer part of any decimal starting a field. LDL-C of 4.2 mmol/L was
  // printed as 2 mmol/L: a value low enough to look reassuring.
  const VALUES = ["4.2 mmol/L", "0.9 g/L", "12.5 %", "1.8 mmol/L", "5.6 %", "0.5 nmol/L"];

  test("a decimal in a target's current column is printed intact", () => {
    for (const v of VALUES) {
      const t = parseTargets(`LDL-C | ${v} | <2.6 mmol/L | Guideline | 3 months | ACC/AHA`);
      expect(t[0].current).toBe(v);
    }
  });

  test("a decimal in a target's optimal column is printed intact", () => {
    for (const v of VALUES) {
      const t = parseTargets(`LDL-C | 4.2 mmol/L | ${v} | Guideline | 3 months | ACC/AHA`);
      expect(t[0].optimal).toBe(v);
    }
  });

  test("a decimal inside a finding is printed intact", () => {
    const f = parseFindings("High | Elevated LDL-C | 4.2 mmol/L against a target of 2.6 | 4.2 mmol/L");
    expect(f[0].detail).toMatch("4.2");
    expect(f[0].inputsUsed).toBe("4.2 mmol/L");
  });

  test("genuine list numbering is still stripped", () => {
    // The guard must not cost us the behaviour it was protecting.
    const r = parseActionPlan("NOW: 1. Start walking\nNOW: 2) Second item\nNOW: - Third item");
    expect(r.now).toEqual(["Start walking", "Second item", "Third item"]);
  });
});

describe("regression: Critical findings must sort first", () => {
  // The comparator read `ORDER[priority] || 3`. Critical maps to 0, which is
  // falsy, so every Critical finding was ranked last and printed at the bottom
  // of the report.
  test("Critical leads the list", () => {
    const f = parseFindings([
      "Low | Low item | d | i",
      "Medium | Medium item | d | i",
      "Critical | Critical item | d | i",
    ].join("\n"));
    expect(f[0].priority).toBe("Critical");
  });

  test("Critical leads even when it is the last line the model wrote", () => {
    const f = parseFindings([
      "High | High item | d | i",
      "High | Another high | d | i",
      "Medium | Medium item | d | i",
      "Low | Low item | d | i",
      "Critical | Critical item | d | i",
    ].join("\n"));
    expect(f[0].priority).toBe("Critical");
    expect(f[0].title).toBe("Critical item");
  });

  test("a Critical finding is never dropped by the six-item cap", () => {
    // Worst case: the cap and the sort bug together could have cut the most
    // urgent finding from the report entirely.
    const lines = Array.from({ length: 8 }, (_, i) => `Low | Filler ${i} | d | i`);
    lines.push("Critical | The urgent one | d | i");
    const f = parseFindings(lines.join("\n"));
    expect(f.some(x => x.priority === "Critical")).toBe(true);
    expect(f[0].title).toBe("The urgent one");
  });
});

describe("parser version", () => {
  test("is published so a report can be traced to the logic that made it", () => {
    expect(PARSER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
