/**
 * action.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Prompt for Call 3 of 4:  Action Plan + Nutrition
 *
 * What the AI returns:
 *   Action items — each on its own line:
 *     NOW:    action to take immediately
 *     3MON:   milestone for 3 months
 *     6MON:   goal for 6 months
 *
 *   Nutrition — each on its own line:
 *     APPROACH:   one sentence strategy
 *     PRINCIPLE:  a core dietary principle
 *     EAT:        food to prioritise
 *     AVOID:      food to minimise
 *     SOURCE:     guideline citation
 *
 * PROMPT_VERSION: increment when this prompt changes.
 */

export const ACTION_PROMPT_VERSION = "1.0.0";

/**
 * buildActionPrompt
 * @param {object} ctx - The patient context object built by buildContext()
 * @returns {string} - The full user message to send to the AI
 */
export function buildActionPrompt(ctx) {
  // If patient is a current smoker, smoking cessation must be the first action
  const smokingNote =
    ctx["Smoking status"] === "Current"
      ? "IMPORTANT: The first NOW: item must be: Smoking cessation - refer to cessation programme. Do NOT mention NRT."
      : "";

  return (
    "Patient data: " + JSON.stringify(ctx)
    + "\n" + smokingNote
    + "\n\nGive an action plan. Only recommend actions supported by data present in the patient data above."
    + "\nEach item on its own line. Use these EXACT prefixes:"
    + "\nNOW: immediate action (repeat for each NOW item)"
    + "\n3MON: 3-month milestone (repeat for each)"
    + "\n6MON: 6-month goal (repeat for each)"
    + "\n\nThen give a nutrition plan. Use these EXACT prefixes:"
    + "\nAPPROACH: one sentence personalised strategy"
    + "\nPRINCIPLE: one core dietary principle (repeat for each, max 3)"
    + "\nEAT: one food or food group to prioritise (repeat for each, max 4)"
    + "\nAVOID: one food to minimise (repeat for each, max 3)"
    + "\nSOURCE: guideline citation for the nutrition approach"
  );
}
