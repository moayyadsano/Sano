/**
 * overview.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Prompt for Call 1 of 4:  Clinical Summary + Longevity Insight
 *
 * What the AI returns:
 *   SUMMARY:  one sentence about this patient based only on present data
 *   LONGEVITY: one sentence on key health leverage points
 *
 * PROMPT_VERSION: increment when this prompt changes.
 */

export const OVERVIEW_PROMPT_VERSION = "1.0.0";

/**
 * buildOverviewPrompt
 * @param {object} ctx - The patient context object built by buildContext()
 * @returns {string} - The full user message to send to the AI
 */
export function buildOverviewPrompt(ctx) {
  return (
    "Patient data: " + JSON.stringify(ctx)
    + "\n\nWrite exactly 2 lines:"
    + "\nSUMMARY: one sentence clinical overview based only on data present"
    + "\nLONGEVITY: one sentence on key health leverage points or say 'insufficient data' if not enough data"
  );
}
