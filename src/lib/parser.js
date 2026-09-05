/**
 * parser.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses all AI responses into clean structured objects.
 *
 * DESIGN PRINCIPLES:
 * 1. Never throws — every function returns a valid object even on empty input
 * 2. Degrades gracefully — malformed lines are skipped, not crashes
 * 3. Case-insensitive prefix matching — "now:" "NOW:" "Now:" all work
 * 4. Strips noise — leading numbers, dashes, asterisks cleaned automatically
 * 5. Validates output — each parser enforces min requirements
 * 6. Logs warnings — malformed lines are logged for debugging, not silently lost
 *
 * PARSER VERSION: increment when parsing logic changes
 */

export const PARSER_VERSION = "1.0.0";

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Split text into trimmed non-empty lines
 * @param {string} text
 * @returns {string[]}
 */
function toLines(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .split("\n")
    .map(function(l) { return l.trim(); })
    .filter(function(l) { return l.length > 0; });
}

/**
 * Case-insensitive prefix check
 * @param {string} line
 * @param {string} prefix - e.g. "NOW:"
 * @returns {boolean}
 */
function hasPrefix(line, prefix) {
  return line.toUpperCase().startsWith(prefix.toUpperCase());
}

/**
 * Extract value after prefix, trimmed
 * @param {string} line
 * @param {string} prefix
 * @returns {string}
 */
function afterPrefix(line, prefix) {
  return line.slice(prefix.length).trim();
}

/**
 * Clean a value string — remove leading bullets, numbers, asterisks
 * @param {string} val
 * @returns {string}
 */
function clean(val) {
  if (!val) return "";
  return val
    .replace(/^[\d]+[\.\)]\s*/, "")  // "1. " or "1) "
    .replace(/^[-•*]\s*/, "")         // "- " or "• "
    .replace(/^\*+\s*/, "")           // "** "
    .trim();
}

/**
 * Split a pipe-delimited line into trimmed parts
 * @param {string} line
 * @param {number} expectedMin - minimum parts expected
 * @returns {string[]|null} - null if not enough parts
 */
function splitPipe(line, expectedMin) {
  const parts = line.split("|").map(function(p) { return p.trim(); });
  if (parts.length < expectedMin) return null;
  return parts;
}

// ── Public parsers ────────────────────────────────────────────────────────────

/**
 * parseOverview
 * Parses the SUMMARY: and LONGEVITY: lines from Call 1
 *
 * @param {string} text - raw AI response
 * @returns {{ summary: string, longevityNote: string }}
 */
export function parseOverview(text) {
  const lines = toLines(text);
  let summary = "";
  let longevityNote = "";

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (hasPrefix(l, "SUMMARY:")) {
      summary = clean(afterPrefix(l, "SUMMARY:"));
    } else if (hasPrefix(l, "LONGEVITY:")) {
      longevityNote = clean(afterPrefix(l, "LONGEVITY:"));
    }
  }

  // Fallbacks if AI didn't use expected format
  if (!summary && lines.length > 0) {
    summary = clean(lines[0]);
    console.warn("[parser] SUMMARY: prefix not found, using first line");
  }
  if (!longevityNote && lines.length > 1) {
    longevityNote = clean(lines[1]);
    console.warn("[parser] LONGEVITY: prefix not found, using second line");
  }

  return {
    summary:       summary       || "Clinical overview could not be generated from available data.",
    longevityNote: longevityNote || "Insufficient data for longevity assessment.",
  };
}

/**
 * parseFindings
 * Parses finding lines: PRIORITY | Title | Detail | Inputs used
 *
 * @param {string} text - raw AI response
 * @returns {Array<{priority, title, detail, inputsUsed}>}
 */
export function parseFindings(text) {
  const VALID_PRIORITIES = ["Critical", "High", "Medium", "Low"];
  const lines = toLines(text);
  const findings = [];

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (!l.includes("|")) continue;

    var parts = splitPipe(l, 2);
    if (!parts) continue;

    // Priority is always first field
    var rawPriority = parts[0].trim();
    // Normalise: "HIGH" -> "High", "high" -> "High"
    var normPriority = rawPriority.charAt(0).toUpperCase() + rawPriority.slice(1).toLowerCase();

    if (!VALID_PRIORITIES.includes(normPriority)) {
      // Maybe the AI put title first — try to detect priority in field 1
      var detected = VALID_PRIORITIES.find(function(p) {
        return parts[1] && parts[1].toUpperCase().includes(p.toUpperCase());
      });
      if (!detected) {
        console.warn("[parser] Skipping finding — no valid priority: " + l.slice(0, 60));
        continue;
      }
      // Shift parts: [title, priority, detail, inputs]
      findings.push({
        priority:   detected,
        title:      clean(parts[0]) || "Finding",
        detail:     clean(parts[2]) || "",
        inputsUsed: clean(parts[3]) || "",
      });
      continue;
    }

    findings.push({
      priority:   normPriority,
      title:      clean(parts[1]) || "Finding",
      detail:     clean(parts[2]) || "",
      inputsUsed: clean(parts[3]) || "",
    });
  }

  // Always return at least one finding
  if (findings.length === 0) {
    console.warn("[parser] No findings parsed from AI response");
    return [{
      priority:   "Low",
      title:      "Insufficient data",
      detail:     "Enter lab values and lifestyle data to generate clinical findings.",
      inputsUsed: "None",
    }];
  }

  // Cap at 6 findings, sort by priority
  var ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  return findings
    .sort(function(a, b) { return (ORDER[a.priority] || 3) - (ORDER[b.priority] || 3); })
    .slice(0, 6);
}

/**
 * parseTargets
 * Parses target lines: Biomarker | Current | Optimal | Type | Timeline | Source
 *
 * @param {string} text - raw AI response
 * @returns {Array<{biomarker, current, optimal, targetType, timeline, source}>}
 */
export function parseTargets(text) {
  const VALID_PRIORITIES = ["Critical", "High", "Medium", "Low"];
  const lines = toLines(text);
  const targets = [];

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (!l.includes("|")) continue;

    var parts = splitPipe(l, 2);
    if (!parts) continue;

    // Skip finding lines (start with a priority word)
    var firstWord = parts[0].trim();
    var isPriority = VALID_PRIORITIES.some(function(p) {
      return firstWord.toUpperCase() === p.toUpperCase();
    });
    if (isPriority) continue;

    // Need at least biomarker + current or optimal
    var biomarker = clean(parts[0]);
    if (!biomarker || biomarker.length < 2) continue;

    targets.push({
      biomarker:  biomarker,
      current:    clean(parts[1]) || "Not measured",
      optimal:    clean(parts[2]) || "",
      targetType: clean(parts[3]) || "",
      timeline:   clean(parts[4]) || "",
      source:     clean(parts[5]) || "",
    });
  }

  return targets.slice(0, 6);
}

/**
 * parseActionPlan
 * Parses NOW: / 3MON: / 6MON: action items
 *
 * @param {string} text - raw AI response
 * @returns {{ now: string[], threeMonths: string[], sixMonths: string[] }}
 */
export function parseActionPlan(text) {
  const lines = toLines(text);
  const now = [], three = [], six = [];

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (hasPrefix(l, "NOW:")) {
      var val = clean(afterPrefix(l, "NOW:"));
      if (val) now.push(val);
    } else if (hasPrefix(l, "3MON:") || hasPrefix(l, "3MONTHS:")) {
      var prefix = hasPrefix(l, "3MONTHS:") ? "3MONTHS:" : "3MON:";
      var val2 = clean(afterPrefix(l, prefix));
      if (val2) three.push(val2);
    } else if (hasPrefix(l, "6MON:") || hasPrefix(l, "6MONTHS:")) {
      var prefix2 = hasPrefix(l, "6MONTHS:") ? "6MONTHS:" : "6MON:";
      var val3 = clean(afterPrefix(l, prefix2));
      if (val3) six.push(val3);
    }
  }

  if (now.length === 0 && three.length === 0 && six.length === 0) {
    console.warn("[parser] No action plan items parsed");
  }

  return {
    now:          now.slice(0, 5),
    threeMonths:  three.slice(0, 4),
    sixMonths:    six.slice(0, 4),
  };
}

/**
 * parseNutrition
 * Parses APPROACH: / PRINCIPLE: / EAT: / AVOID: / SOURCE: lines
 *
 * @param {string} text - raw AI response
 * @returns {{ approach, principles, prioritize, minimize, source }}
 */
export function parseNutrition(text) {
  const lines = toLines(text);
  const principles = [], prioritize = [], minimize = [];
  var approach = "", source = "";

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if      (hasPrefix(l, "APPROACH:"))  { approach = clean(afterPrefix(l, "APPROACH:")); }
    else if (hasPrefix(l, "PRINCIPLE:")) { var p = clean(afterPrefix(l, "PRINCIPLE:")); if (p) principles.push(p); }
    else if (hasPrefix(l, "EAT:"))       { var e = clean(afterPrefix(l, "EAT:"));       if (e) prioritize.push(e); }
    else if (hasPrefix(l, "AVOID:"))     { var a = clean(afterPrefix(l, "AVOID:"));     if (a) minimize.push(a); }
    else if (hasPrefix(l, "SOURCE:"))    { source = clean(afterPrefix(l, "SOURCE:")); }
  }

  return {
    approach:   approach   || "",
    principles: principles.slice(0, 4),
    prioritize: prioritize.slice(0, 6),
    minimize:   minimize.slice(0, 4),
    source:     source     || "",
  };
}

/**
 * parseExercise
 * Parses BLUEPRINT: and ZONE: lines
 *
 * @param {string} text - raw AI response
 * @returns {{ weeklyBlueprint: string, zones: Array<{modality, frequency, duration, why}> }}
 */
export function parseExercise(text) {
  const lines = toLines(text);
  var blueprint = "";
  const zones = [];

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (hasPrefix(l, "BLUEPRINT:")) {
      blueprint = clean(afterPrefix(l, "BLUEPRINT:"));
    } else if (hasPrefix(l, "ZONE:")) {
      var zoneLine = afterPrefix(l, "ZONE:");
      var parts = splitPipe(zoneLine, 3);
      if (!parts) {
        console.warn("[parser] Skipping malformed ZONE line: " + l.slice(0, 60));
        continue;
      }
      zones.push({
        modality:  clean(parts[0]) || "Exercise",
        frequency: clean(parts[1]) || "",
        duration:  clean(parts[2]) || "",
        why:       clean(parts[3]) || "",
      });
    }
  }

  return {
    weeklyBlueprint: blueprint || "",
    zones:           zones.slice(0, 4),
  };
}

/**
 * parseSupplements
 * Parses SUPP: lines: name | timing | rationale | interaction
 * Enforces drug-class-only rule and iron bisglycinate replacement
 *
 * @param {string} text - raw AI response
 * @returns {Array<{name, timing, rationale, interaction}>}
 */
export function parseSupplements(text) {
  const lines = toLines(text);
  const supplements = [];

  // Drug names that should never appear (enforce drug-class-only policy)
  const BANNED_DRUGS = [
    "rosuvastatin", "atorvastatin", "simvastatin", "pravastatin",
    "ezetimibe", "metformin", "levothyroxine", "lisinopril",
    "amlodipine", "metoprolol",
  ];

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (!hasPrefix(l, "SUPP:")) continue;

    var suppLine = afterPrefix(l, "SUPP:");
    var parts = splitPipe(suppLine, 1);
    if (!parts) continue;

    var name = clean(parts[0]);
    if (!name) continue;

    // Enforce iron bisglycinate -> Iron supplement
    name = name.replace(/iron bisglycinate/gi, "Iron supplement");

    // Check for banned specific drug names
    var hasBannedDrug = BANNED_DRUGS.some(function(drug) {
      return name.toLowerCase().includes(drug.toLowerCase());
    });
    if (hasBannedDrug) {
      console.warn("[parser] Removed specific drug name from supplement: " + name);
      continue;
    }

    supplements.push({
      name:        name,
      timing:      clean(parts[1]) || "",
      rationale:   clean(parts[2]) || "",
      interaction: clean(parts[3]) || "None identified",
    });
  }

  return supplements.slice(0, 8);
}

/**
 * parseFollowUp
 * Parses FOLLOWUP: lines with timepoint labels
 *
 * @param {string} text - raw AI response
 * @returns {{ twoWeeks, oneMonth, threeMonths, sixMonths }}
 */
export function parseFollowUp(text) {
  const lines = toLines(text);
  var twoWeeks = "", oneMonth = "", threeMonths = "", sixMonths = "";

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (!hasPrefix(l, "FOLLOWUP:")) continue;

    var val = clean(afterPrefix(l, "FOLLOWUP:"));
    var valLower = val.toLowerCase();

    if (valLower.startsWith("2 week")) {
      twoWeeks    = val.replace(/^2 weeks?\s*[-:]\s*/i, "");
    } else if (valLower.startsWith("1 month")) {
      oneMonth    = val.replace(/^1 month\s*[-:]\s*/i, "");
    } else if (valLower.startsWith("3 month")) {
      threeMonths = val.replace(/^3 months?\s*[-:]\s*/i, "");
    } else if (valLower.startsWith("6 month")) {
      sixMonths   = val.replace(/^6 months?\s*[-:]\s*/i, "");
    }
  }

  return { twoWeeks, oneMonth, threeMonths, sixMonths };
}
