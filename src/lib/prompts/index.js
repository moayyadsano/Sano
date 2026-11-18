/**
 * prompts/index.js
 * Single entry point for all AI prompts.
 *
 * PROMPT_BUNDLE_VERSION is logged with every report so any report can be traced
 * back to the exact prompt rules that produced it. It is DERIVED from each
 * prompt file's own version constant, so bumping a prompt version in its own
 * file is the only edit needed — this file never has to change again.
 */

import { SYSTEM_PROMPT_VERSION }               from "./system.js";
import { OVERVIEW_PROMPT_VERSION }             from "./overview.js";
import { FINDINGS_PROMPT_VERSION }             from "./findings.js";
import { ACTION_PROMPT_VERSION }               from "./action.js";
import { EXERCISE_SUPPLEMENTS_PROMPT_VERSION } from "./exerciseSupplements.js";

export { SYS, SYSTEM_PROMPT_VERSION } from "./system.js";
export { buildOverviewPrompt, OVERVIEW_PROMPT_VERSION } from "./overview.js";
export { buildFindingsPrompt, FINDINGS_PROMPT_VERSION } from "./findings.js";
export { buildActionPrompt, ACTION_PROMPT_VERSION } from "./action.js";
export { buildExerciseSupplementsPrompt, EXERCISE_SUPPLEMENTS_PROMPT_VERSION } from "./exerciseSupplements.js";

export const PROMPT_BUNDLE_VERSION = [
  "sys:"      + SYSTEM_PROMPT_VERSION,
  "overview:" + OVERVIEW_PROMPT_VERSION,
  "findings:" + FINDINGS_PROMPT_VERSION,
  "action:"   + ACTION_PROMPT_VERSION,
  "exercise:" + EXERCISE_SUPPLEMENTS_PROMPT_VERSION,
].join("|");
