/**
 * exerciseSupplements.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Prompt for Call 4 of 4:  Exercise Prescription + Supplements + Follow-Up
 *
 * What the AI returns:
 *   Exercise — each on its own line:
 *     BLUEPRINT:  one sentence weekly structure
 *     ZONE:       modality | frequency | duration | reason
 *
 *   Supplements — each on its own line:
 *     SUPP:       name | timing | rationale citing measured value | interaction
 *
 *   Follow-up — each on its own line:
 *     FOLLOWUP:   2 weeks - what to check
 *     FOLLOWUP:   1 month - what to check
 *     FOLLOWUP:   3 months - what to check
 *     FOLLOWUP:   6 months - what to check
 *
 * PROMPT_VERSION: increment when this prompt changes.
 */

export const EXERCISE_SUPPLEMENTS_PROMPT_VERSION = "1.0.0";

/**
 * buildExerciseSupplementsPrompt
 * @param {object} ctx - The patient context object built by buildContext()
 * @returns {string} - The full user message to send to the AI
 */
export function buildExerciseSupplementsPrompt(ctx) {
  const noMeds = !ctx["Current medications"];

  // If no medications recorded, the first supplement entry must carry a safety warning
  const medNote = noMeds
    ? "IMPORTANT: No medications recorded for this patient. The very first SUPP: entry must be: "
      + "Medication reconciliation not completed - review all supplements before use | Before any supplement | Safety - no meds on file | None identified"
    : "Medications on file: " + ctx["Current medications"] + ". Flag any supplement-drug interactions in the interaction field.";

  return (
    "Patient data: " + JSON.stringify(ctx)
    + "\n" + medNote
    + "\n\nGive an exercise prescription. Use these EXACT prefixes:"
    + "\nBLUEPRINT: one sentence weekly structure"
    + "\nZONE: modality | frequency | duration | reason citing patient data (repeat for each zone, max 3)"
    + "\n\nList supplements ONLY where deficiency or clinical indication is documented in the patient data above."
    + "\nNo dosages. No specific drug names. Use these EXACT prefixes:"
    + "\nSUPP: supplement class | timing | rationale citing specific measured value | None identified OR Flag: interaction note"
    + "\n\nList follow-up timepoints. Use these EXACT prefixes:"
    + "\nFOLLOWUP: 2 weeks - what to check or reassess"
    + "\nFOLLOWUP: 1 month - what to check or reassess"
    + "\nFOLLOWUP: 3 months - what to check or reassess"
    + "\nFOLLOWUP: 6 months - what to check or reassess"
  );
}
