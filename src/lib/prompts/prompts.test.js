/**
 * prompts.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for all prompt builder functions.
 *
 * What we test:
 * 1. Given a context object, each prompt function returns a string
 * 2. The string contains the required structural markers the parser depends on
 * 3. Edge cases: empty context, missing fields, smoking flag, no medications
 *
 * Run with: node --experimental-vm-modules node_modules/.bin/jest
 * Or:       npm test
 */

import {
  SYS,
  PROMPT_BUNDLE_VERSION,
  buildOverviewPrompt,
  buildFindingsPrompt,
  buildActionPrompt,
  buildExerciseSupplementsPrompt,
} from "./index.js";

// ── Sample context objects ────────────────────────────────────────────────────

const FULL_CTX = {
  "Patient name": "Test Patient",
  "Age": "45 years",
  "Sex": "Male",
  "Primary goal": "Longevity & Prevention",
  "Target philosophy": "Guideline-based (ACC/AHA)",
  "LDL-C": "4.2 mmol/L",
  "HDL-C": "1.1 mmol/L",
  "ApoB": "95 mg/dL",
  "HbA1c": "5.8 %",
  "Current medications": "Metformin 500mg BD",
  "Smoking status": "Never",
  "Data completeness": "18/45 (40%)",
};

const EMPTY_CTX = {
  "Sex": "Female",
  "Data completeness": "0/45 (0%)",
};

const SMOKER_CTX = {
  ...FULL_CTX,
  "Smoking status": "Current",
};

const NO_MEDS_CTX = {
  ...FULL_CTX,
  "Current medications": undefined,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("System prompt", () => {
  test("SYS is a non-empty string", () => {
    expect(typeof SYS).toBe("string");
    expect(SYS.length).toBeGreaterThan(100);
  });

  test("SYS contains the drug policy rule", () => {
    expect(SYS).toContain("DRUG POLICY");
  });

  test("SYS contains the causation rule", () => {
    expect(SYS).toContain("CAUSATION");
  });

  test("SYS contains the supplement rule", () => {
    expect(SYS).toContain("SUPPLEMENT RULE");
  });

  test("PROMPT_BUNDLE_VERSION is a non-empty string", () => {
    expect(typeof PROMPT_BUNDLE_VERSION).toBe("string");
    expect(PROMPT_BUNDLE_VERSION.length).toBeGreaterThan(5);
  });
});

describe("buildOverviewPrompt", () => {
  test("returns a string for full context", () => {
    const result = buildOverviewPrompt(FULL_CTX);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(10);
  });

  test("contains SUMMARY marker", () => {
    const result = buildOverviewPrompt(FULL_CTX);
    expect(result).toContain("SUMMARY:");
  });

  test("contains LONGEVITY marker", () => {
    const result = buildOverviewPrompt(FULL_CTX);
    expect(result).toContain("LONGEVITY:");
  });

  test("includes patient data in prompt", () => {
    const result = buildOverviewPrompt(FULL_CTX);
    expect(result).toContain("LDL-C");
  });

  test("works with empty context", () => {
    const result = buildOverviewPrompt(EMPTY_CTX);
    expect(typeof result).toBe("string");
    expect(result).toContain("SUMMARY:");
  });
});

describe("buildFindingsPrompt", () => {
  test("returns a string", () => {
    const result = buildFindingsPrompt(FULL_CTX);
    expect(typeof result).toBe("string");
  });

  test("contains finding format instructions", () => {
    const result = buildFindingsPrompt(FULL_CTX);
    expect(result).toContain("Critical, High, Medium, Low");
  });

  test("contains target format instructions", () => {
    const result = buildFindingsPrompt(FULL_CTX);
    expect(result).toContain("Guideline-based (ACC/AHA) or Aggressive prevention");
  });

  test("includes target philosophy from context", () => {
    const result = buildFindingsPrompt(FULL_CTX);
    expect(result).toContain("Guideline-based (ACC/AHA)");
  });

  test("works with empty context", () => {
    const result = buildFindingsPrompt(EMPTY_CTX);
    expect(typeof result).toBe("string");
  });
});

describe("buildActionPrompt", () => {
  test("returns a string", () => {
    const result = buildActionPrompt(FULL_CTX);
    expect(typeof result).toBe("string");
  });

  test("contains NOW: marker", () => {
    const result = buildActionPrompt(FULL_CTX);
    expect(result).toContain("NOW:");
  });

  test("contains 3MON: marker", () => {
    const result = buildActionPrompt(FULL_CTX);
    expect(result).toContain("3MON:");
  });

  test("contains 6MON: marker", () => {
    const result = buildActionPrompt(FULL_CTX);
    expect(result).toContain("6MON:");
  });

  test("contains nutrition markers", () => {
    const result = buildActionPrompt(FULL_CTX);
    expect(result).toContain("APPROACH:");
    expect(result).toContain("EAT:");
    expect(result).toContain("AVOID:");
  });

  test("adds smoking cessation instruction for current smoker", () => {
    const result = buildActionPrompt(SMOKER_CTX);
    expect(result).toContain("Smoking cessation");
    expect(result).toContain("cessation programme");
  });

  test("does NOT add smoking instruction for non-smoker", () => {
    const result = buildActionPrompt(FULL_CTX);
    // The word 'cessation' should not appear in a non-smoker prompt
    // (it may appear in AVOID section from AI, but not as an injected instruction)
    expect(result).not.toContain("cessation programme");
  });
});

describe("buildExerciseSupplementsPrompt", () => {
  test("returns a string", () => {
    const result = buildExerciseSupplementsPrompt(FULL_CTX);
    expect(typeof result).toBe("string");
  });

  test("contains BLUEPRINT: marker", () => {
    const result = buildExerciseSupplementsPrompt(FULL_CTX);
    expect(result).toContain("BLUEPRINT:");
  });

  test("contains ZONE: marker", () => {
    const result = buildExerciseSupplementsPrompt(FULL_CTX);
    expect(result).toContain("ZONE:");
  });

  test("contains SUPP: marker", () => {
    const result = buildExerciseSupplementsPrompt(FULL_CTX);
    expect(result).toContain("SUPP:");
  });

  test("contains FOLLOWUP: markers", () => {
    const result = buildExerciseSupplementsPrompt(FULL_CTX);
    expect(result).toContain("FOLLOWUP: 2 weeks");
    expect(result).toContain("FOLLOWUP: 1 month");
    expect(result).toContain("FOLLOWUP: 3 months");
    expect(result).toContain("FOLLOWUP: 6 months");
  });

  test("adds medication reconciliation warning when no meds recorded", () => {
    const result = buildExerciseSupplementsPrompt(NO_MEDS_CTX);
    expect(result).toContain("Medication reconciliation not completed");
  });

  test("includes medications note when meds are present", () => {
    const result = buildExerciseSupplementsPrompt(FULL_CTX);
    expect(result).toContain("Metformin 500mg BD");
  });
});
