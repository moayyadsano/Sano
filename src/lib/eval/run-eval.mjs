#!/usr/bin/env node
/**
 * run-eval.mjs — the evaluation runner
 * ---------------------------------------------------------------------------
 * Two modes, because they answer different questions.
 *
 *   npm run eval          Deterministic. Free. Runs in CI on every push.
 *                         Drives all 12 fixtures through the real pipeline
 *                         with reference responses, then runs every
 *                         adversarial case and FAILS IF ANY IS NOT CAUGHT.
 *                         This tests the pipeline and the rubric, not the model.
 *
 *   npm run eval:live     Calls the real model through the deployed proxy and
 *                         scores what comes back. This is the only mode that
 *                         says anything about model behaviour. Costs money and
 *                         is non-deterministic, so it is never in CI.
 *                         Needs SANO_API_URL (e.g. https://sano-eight.vercel.app).
 *
 * Exit code is 0 only when every fixture passes with no blocking failure AND
 * every adversarial case is caught by the check it was written for.
 */

import { FIXTURES, getFixture } from "./fixtures.js";
import { ADVERSARIAL } from "./adversarial.js";
import { referenceResponses } from "./reference-model.js";
import { prepare, assemble, renderedPreventBlock } from "./pipeline.js";
import { scoreReport, formatResults, CHECKS, RUBRIC_VERSION } from "./rubric.js";
import { PREVENT_DISCLAIMER, ALGORITHMS_VERSION } from "../algorithms/index.js";
import { PARSER_VERSION } from "../parser.js";
import { PROMPT_BUNDLE_VERSION } from "../prompts/index.js";

const args    = process.argv.slice(2);
const LIVE    = args.includes("--live");
const VERBOSE = args.includes("--verbose") || args.includes("-v");
const ONLY    = (args.find(a => a.startsWith("--only=")) || "").split("=")[1];

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", OFF = "\x1b[0m";
const pad = (s, n) => String(s).padEnd(n);

// ─── getting the four responses ──────────────────────────────────────────────

async function liveResponses(ctx) {
  const base = process.env.SANO_API_URL;
  if (!base) throw new Error("SANO_API_URL is not set — point it at the deployment, e.g. https://sano-eight.vercel.app");

  const { SYS, buildOverviewPrompt, buildFindingsPrompt, buildActionPrompt, buildExerciseSupplementsPrompt }
    = await import("../prompts/index.js");

  const ask = async (userMsg) => {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/claude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: SYS + "\n\n---\n\n" + userMsg }),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`API ${res.status}: ${raw.slice(0, 200)}`);
    const data = JSON.parse(raw);
    if (!data.text) throw new Error(`unexpected response shape: ${raw.slice(0, 200)}`);
    return data.text;
  };

  // Sequential on purpose: the deployed proxy is a single small function and
  // four parallel calls per fixture would rate-limit the live run into noise.
  return {
    overview: await ask(buildOverviewPrompt(ctx)),
    findings: await ask(buildFindingsPrompt(ctx)),
    action:   await ask(buildActionPrompt(ctx)),
    exercise: await ask(buildExerciseSupplementsPrompt(ctx)),
  };
}

// ─── one case ────────────────────────────────────────────────────────────────

async function runFixture(fixture) {
  const prepared = prepare(fixture.form, fixture.unitSys);
  const responses = LIVE ? await liveResponses(prepared.ctx) : referenceResponses(prepared.ctx);
  const report = assemble(responses);

  const score = scoreReport({
    fixture,
    ...prepared,
    report,
    rendered: renderedPreventBlock(prepared.prevent, PREVENT_DISCLAIMER),
  });

  return { fixture, prepared, report, score, responses };
}

async function runAdversarial(entry) {
  const fixture = getFixture(entry.fixture);
  const prepared = prepare(fixture.form, fixture.unitSys);
  const report = assemble(entry.responses);

  const score = scoreReport({
    fixture,
    ...prepared,
    report,
    rendered: renderedPreventBlock(prepared.prevent, PREVENT_DISCLAIMER),
  });

  const failedIds = score.results.filter(r => !r.pass).map(r => r.id);
  const missed = entry.mustFail.filter(id => !failedIds.includes(id));

  // Some bad responses are repaired by an earlier layer (the parser) and never
  // reach the rubric. Those cases assert the repair instead of a rejection.
  const repairHeld = entry.mustHold ? entry.mustHold(report) : true;

  return {
    entry, score, failedIds, missed, repairHeld,
    caught: missed.length === 0 && repairHeld,
  };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const fixtures = ONLY ? FIXTURES.filter(f => f.id === ONLY) : FIXTURES;
  if (!fixtures.length) {
    console.error(`no fixture matching --only=${ONLY}`);
    process.exit(2);
  }

  console.log(`\nSano evaluation — ${LIVE ? "LIVE (real model)" : "deterministic (reference responses)"}`);
  console.log(DIM + `rubric ${RUBRIC_VERSION} · parser ${PARSER_VERSION} · algorithms ${ALGORITHMS_VERSION}` + OFF);
  console.log(DIM + `prompts ${PROMPT_BUNDLE_VERSION}` + OFF);
  console.log(DIM + `${CHECKS.length} checks · ${fixtures.length} fixtures · ${ADVERSARIAL.length} adversarial cases` + OFF);

  // ── part 1: the fixtures ──
  console.log(`\n── fixtures ${"─".repeat(52)}`);
  let fixtureFailures = 0;
  const perCheckFailures = new Map();

  for (const fixture of fixtures) {
    let r;
    try {
      r = await runFixture(fixture);
    } catch (e) {
      console.log(`${RED}ERROR${OFF}  ${pad(fixture.id, 28)} ${e.message}`);
      fixtureFailures++;
      continue;
    }

    const { score } = r;
    const blocking = score.blockingFailures;
    const warn = score.failed - blocking;
    const mark = blocking ? `${RED}FAIL${OFF}` : warn ? `${YELLOW}warn${OFF}` : `${GREEN}pass${OFF}`;
    if (blocking) fixtureFailures++;

    score.results.filter(x => !x.pass).forEach(x =>
      perCheckFailures.set(x.id, (perCheckFailures.get(x.id) || 0) + 1));

    console.log(`${mark}  ${pad(fixture.id, 28)} ${pad(`${score.passed}/${CHECKS.length}`, 7)}` +
      DIM + `completeness ${r.prepared.completeness.pct}% · ` +
      `${r.report.findings.length} findings · ${r.report.targets.length} targets` +
      (r.prepared.prevent ? ` · PREVENT ${r.prepared.prevent.risk}%` : " · no PREVENT") + OFF);

    if (blocking || warn || VERBOSE) {
      console.log(formatResults(score.results.filter(x => !x.pass || VERBOSE)));
    }
  }

  // ── part 2: the adversarial cases ──
  // These are the ones that matter: a rubric nothing fails is a rubric that
  // does nothing.
  console.log(`\n── adversarial ${"─".repeat(49)}`);
  let missedAttacks = 0;

  for (const entry of ADVERSARIAL) {
    let r;
    try {
      r = await runAdversarial(entry);
    } catch (e) {
      console.log(`${RED}ERROR${OFF}  ${pad(entry.id, 38)} ${e.message}`);
      missedAttacks++;
      continue;
    }
    if (r.caught) {
      const how = entry.correctedBy
        ? `repaired — ${entry.correctedBy}`
        : `by ${entry.mustFail.join(", ")}`;
      console.log(`${GREEN}${entry.correctedBy ? "fixed " : "caught"}${OFF} ${pad(entry.id, 38)}` + DIM + ` ${how}` + OFF);
    } else {
      missedAttacks++;
      const reason = !r.repairHeld
        ? `the repair that should have corrected this no longer holds (${entry.correctedBy})`
        : `expected ${entry.mustFail.join(", ")} to fire; actual failures: ${r.failedIds.join(", ") || "none"}`;
      console.log(`${RED}MISSED${OFF} ${pad(entry.id, 38)} ${reason}`);
      console.log(DIM + `       ${entry.why}` + OFF);
    }
  }

  // ── summary ──
  console.log(`\n── summary ${"─".repeat(53)}`);
  console.log(`fixtures with blocking failures : ${fixtureFailures ? RED : GREEN}${fixtureFailures}${OFF} of ${fixtures.length}`);
  console.log(`adversarial cases missed        : ${missedAttacks ? RED : GREEN}${missedAttacks}${OFF} of ${ADVERSARIAL.length}`);

  if (perCheckFailures.size) {
    console.log(`\nchecks that fired on fixtures:`);
    [...perCheckFailures.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([id, n]) => console.log(`  ${pad(id, 38)} ${n}`));
  }

  const failed = fixtureFailures > 0 || missedAttacks > 0;
  console.log(failed ? `\n${RED}EVALUATION FAILED${OFF}\n` : `\n${GREEN}evaluation passed${OFF}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
