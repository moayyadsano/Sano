/**
 * findings.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Prompt for Call 2 of 4:  Key Findings + Biomarker Targets
 *
 * What the AI returns:
 *   Findings — one per line:
 *     PRIORITY | Title | Detail (max 80 chars) | Inputs used
 *     Priority: Critical, High, Medium, or Low
 *
 *   Targets — one per line:
 *     Biomarker | Current value | Optimal target | Target type | Timeline | Source
 *
 * PROMPT_VERSION: increment when this prompt changes.
 */

export const FINDINGS_PROMPT_VERSION = "1.0.0";

/**
 * buildFindingsPrompt
 * @param {object} ctx - The patient context object built by buildContext()
 * @returns {string} - The full user message to send to the AI
 */
export function buildFindingsPrompt(ctx) {
  return (
    "Patient data: " + JSON.stringify(ctx)
    + "\n\nList up to 4 clinical findings. Only include findings supported by data present in the patient data above."
    + "\nEach finding on one line in this EXACT format:"
    + "\nPRIORITY | Title | Detail max 80 chars | Inputs used"
    + "\nPriority must be one of: Critical, High, Medium, Low"
    + "\nExample: High | Elevated LDL-C | LDL above optimal for cardiovascular risk reduction | LDL 3.8 mmol/L"
    + "\n\nThen list up to 4 biomarker targets. Only targets where we have a current value OR the biomarker is clinically critical."
    + "\nTarget philosophy for this patient: " + (ctx["Target philosophy"] || "Guideline-based (ACC/AHA)")
    + "\nEach target on one line in this EXACT format:"
    + "\nBiomarker | Current value or 'Not measured' | Optimal target | Guideline-based (ACC/AHA) or Aggressive prevention | Timeline | Source"
    + "\nExample: LDL-C | 3.8 mmol/L | less than 2.6 mmol/L | Guideline-based (ACC/AHA) | 3 months | ACC/AHA 2019"
  );
}
