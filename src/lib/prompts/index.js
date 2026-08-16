/**
 * prompts/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single entry point for all AI prompts.
 *
 * Import from here everywhere in the app:
 *   import { SYS, buildOverviewPrompt, PROMPT_BUNDLE_VERSION } from '../lib/prompts';
 *
 * PROMPT_BUNDLE_VERSION is logged with every report so we can always trace
 * which prompt rules generated a specific report. Increment this any time
 * ANY of the individual prompt files change.
 */

export { SYS, SYSTEM_PROMPT_VERSION } from "./system.js";
export { buildOverviewPrompt, OVERVIEW_PROMPT_VERSION } from "./overview.js";
export { buildFindingsPrompt, FINDINGS_PROMPT_VERSION } from "./findings.js";
export { buildActionPrompt, ACTION_PROMPT_VERSION } from "./action.js";
export { buildExerciseSupplementsPrompt, EXERCISE_SUPPLEMENTS_PROMPT_VERSION } from "./exerciseSupplements.js";

/**
 * PROMPT_BUNDLE_VERSION
 * Composite version string logged with every generated report.
 * Format: sys.overview.findings.action.exercise
 * Example: "1.0.0.1.0.0.1.0.0.1.0.0.1.0.0"
 *
 * When you update findings.js from 1.0.0 to 1.1.0, update the third segment here.
 */
export const PROMPT_BUNDLE_VERSION = "sys:1.0.0|overview:1.0.0|findings:1.0.0|action:1.0.0|exercise:1.0.0";
