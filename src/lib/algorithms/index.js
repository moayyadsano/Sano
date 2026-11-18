/**
 * algorithms/index.js
 * ---------------------------------------------------------------------------
 * Single entry point for every deterministic calculation in Sano.
 *
 * Nothing in this folder imports React, touches the DOM, or has side effects.
 * That makes each function unit-testable in isolation today, and reusable by
 * the server unchanged when report generation moves to the backend (Phase 3).
 */

export { UNITS, TO_CONV, toDisplay, toSI, unitLabel } from "./units.js";

export { PLAUSIBILITY, checkPlausibility, getImplausibleLabs } from "./plausibility.js";

export {
  DOMAIN_INPUTS, DOMAIN_LABELS, PHYSICAL_BODY_KEYS,
  domainKeysForSex, computeCompleteness, computeDomainCoverage, confidenceLabel,
} from "./completeness.js";

export { PHENOAGE_KEYS, phenoAgeEligible } from "./phenoAge.js";

export { calcPREVENT, PREVENT_DISCLAIMER, PREVENT_SEVERITY_ORDER } from "./prevent.js";

export const ALGORITHMS_VERSION = "1.0.0";
