# Sano evaluation framework

Built in **PH1-EVAL-01**.

This directory answers one question: *would we notice if Sano started producing
unsafe reports?*

Before it existed, the answer was no. Two bugs were live in production and
neither threw an error, logged a warning, or looked wrong in a screenshot:

- `clean()` stripped the integer part of any decimal starting a field, so an
  LDL-C of **4.2 mmol/L printed as 2 mmol/L** — a value low enough to read as
  reassuring.
- The severity comparator used `ORDER[priority] || 3`. `Critical` maps to `0`,
  which is falsy in JavaScript, so **every Critical finding sorted last** and
  could be dropped by the six-item cap.

Both were found within minutes of the first fixtures running.

---

## Running it

```bash
npm run eval        # deterministic, free, runs in CI on every push
npm run eval:live   # calls the real model; costs money; run deliberately
npm run check       # build + unit tests + eval, the whole gate
```

`eval:live` needs a deployment to talk to:

```bash
SANO_API_URL=https://sano-eight.vercel.app npm run eval:live
```

Useful flags: `--only=<fixture-id>` to run one case, `--verbose` to print every
check rather than only the failures.

---

## What is here

| File | What it is |
|---|---|
| `fixtures.js` | The 12 reference patients. Each one exists to catch a specific way the tool can hurt someone. |
| `rubric.js` | The 14 safety checks. Properties a report must hold regardless of the model's wording. |
| `rubric.test.js` | Tests for the tests. Every check is proved to reject its bad case, not just accept its good one. |
| `adversarial.js` | 11 bad reports that must be caught. These are the point of the whole directory. |
| `reference-model.js` | A rule-obeying stand-in for the model, so CI is deterministic and free. |
| `pipeline.js` | Reproduces exactly what `App.jsx` does before and after the model call. |
| `run-eval.mjs` | The runner. |

---

## The two halves, and why both are needed

**The fixtures** run all 12 patients through the real pipeline — the real
quarantine, the real PREVENT, the real `buildContext`, the real parsers — and
score the result. They catch regressions in everything except the model.

**The adversarial cases** are what make the rubric worth anything. The reference
model obeys every rule, so it passes the rubric *by construction*; a green run
against it alone would prove nothing. Each adversarial case is a plausible bad
response paired with the check that must reject it, and the eval **fails if any
one slips through**.

These are not strawmen. Every one is a failure mode language models actually
produce:

- assessing a patient with no data at all
- copying a value out of the prompt's own worked example
- analysing a panel that was never ordered
- naming the specific drug rather than the class
- estimating a PREVENT score the clinician did not ask for
- stating a biological age from eight of the nine required inputs
- quoting a value that was quarantined before the model saw it
- restating a legitimately computed biological age as a different number

One case, `buries-the-critical-finding`, is different: the parser *repairs* it
before the rubric sees it. That case asserts the repair instead of a rejection,
so if `parseFindings` ever stops sorting by severity, it starts failing.

---

## Adding to it

**A new check** goes in the `CHECKS` array in `rubric.js`, and does not count as
done until `rubric.test.js` proves it rejects something. A check nothing fails
is a check that does nothing.

**A new fixture** goes in `fixtures.js` with a `why` saying what it catches. If
you cannot write the `why`, the case is probably already covered.

**A new adversarial case** needs the `mustFail` check named. If no existing
check catches it, that is the finding — write the check first.

To prove the rubric still discriminates, break one check so it always passes and
confirm the suite goes red. All 14 were verified this way.

---

## What this does *not* measure

The deterministic run says nothing about the real model's behaviour — it cannot,
because the reference responses are written to obey the rules. Only
`npm run eval:live` measures the model.

What the deterministic run does measure is everything around the model: the
quarantine, the units, the coverage metadata, the parsers, the sorting, the
drug-naming policy, the PREVENT gate. That is where both production bugs lived.
