export { SYS, SYSTEM_PROMPT_VERSION } from "./system.js";
export { buildOverviewPrompt, OVERVIEW_PROMPT_VERSION } from "./overview.js";
export { buildFindingsPrompt, FINDINGS_PROMPT_VERSION } from "./findings.js";
export { buildActionPrompt, ACTION_PROMPT_VERSION } from "./action.js";
export { buildExerciseSupplementsPrompt, EXERCISE_SUPPLEMENTS_PROMPT_VERSION } from "./exerciseSupplements.js";

/**
 * PROMPT_BUNDLE_VERSION
 * Updated sys to 1.1.0 — PH1-AI-03 strengthened guardrails
 */
export const PROMPT_BUNDLE_VERSION = "sys:1.1.0|overview:1.0.0|findings:1.0.0|action:1.0.0|exercise:1.0.0";
