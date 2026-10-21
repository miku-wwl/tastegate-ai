# Evaluation results

> **Phase 3C (2026-10-21, base `9e7bff0`).** Fresh offline evaluation preserves the holdout and its null retained-set result. A secondary same-pool prioritization comparison now finds 6 ordering changes among 50 scored synthetic holdout plans (22 contain multiple valid candidates; 16 share one reviewed ranking query). This verifies authored comparison logic only. Real recorded evidence has no pair of hard-constraint-valid candidates to compare, and **no independently validated cultural uplift exists**. No fresh Qloo API request. [Method and exact gap](QLOO_INCREMENTAL_VALUE_FINAL.md), [actual verification](PHASE3C_EXECUTION_REPORT.md).

2026-10-20, Pacific/Auckland. Commit `6b446784d` plus uncommitted changes. Reproduce with `npm run eval` (about 1 s; no network; writes `.artifacts/phase2b-evaluation.{json,md}`). `EVAL_PUBLISH=1 npm run eval` refreshes the aggregate-only [`data/evaluation-results.json`](../data/evaluation-results.json) that the app serves at `/results`.

**What this evaluation can and cannot say.** It shows that, on the same plan and the same evidence, TasteGate keeps hard-constraint violations and unproven items out of the plan far better than two simple baselines, at a price (more calls, and people asked to decide). It does **not** show that real agents fail this way, that users prefer the output, or anything about cultural relevance. The live stratum was not run.

> **Phase 3B addition.** The results now also contain a **fair control without cultural evidence** (`RULES_AND_IDENTITY_ONLY` versus `TASTEGATE_WITH_QLOO_CULTURAL_EVIDENCE`), reported per stratum as three separate questions: evidence coverage, decision difference and independently validated quality gain. Outcome: coverage yes, no change to what is kept in any synthetic plan, `QUALITY_UPLIFT_NOT_ESTABLISHED`. See [QLOO_INCREMENTAL_VALUE_FINAL](QLOO_INCREMENTAL_VALUE_FINAL.md). Numbers in the tables below that were produced before Phase 3B are unchanged; the regenerated aggregates are in `data/evaluation-results.json`.

## Method

Every plan is put through three policies on the **same evidence source** (the same fixture world, or the same recordings). They differ only in what they do with it:

| Policy | What it does |
| --- | --- |
| **Ship as proposed** | Ships the upstream plan unchanged. No lookups, no checks. |
| **Trust the first Qloo hit, check nothing** | Takes the provider's first search hit for each recommendation, fills any unresolved slot with the provider's own top discovery result, and checks nothing: no constraints, no revalidation. This is what a quick integration does. |
| **TasteGate** | Audit, one repair round, revalidate. It asks a person instead of guessing an identity. Items that are verified, or only lack taste evidence (a soft gate), stay; blocked items and items whose identity or hard facts cannot be established do not. |

An **oracle** classifies each item that reaches the user from its true facts alone: `VALID` (every required fact present and matching), `VIOLATING` (a present fact contradicts a constraint) or `UNVERIFIABLE` (a required fact is missing, or nothing is known). The oracle imports only the type definitions; a test asserts it shares no code with the audit rules. Where the world is authored, items are judged by their **true** facts by ID, whatever an evidence source reported, so a corrupted provider cannot flatter the gate (a sabotage test proves this: a source that lies about every venue's city makes the holdout fail for at least 90% of the plans that contain a violation).

Plans on which TasteGate paused for a human decision are **not** scored against the baselines (nothing has been shipped yet). They are counted separately, together with what the baselines did on those plans.

Strata are never pooled:

| Stratum | What it is | Status |
| --- | --- | --- |
| SYNTHETIC | 14 authored development cases. They shaped the gate, so they are **not a benchmark**. 3 robustness cases (adapter failure, timeout, forged provenance) have no baseline comparison. | RUN |
| SYNTHETIC_HOLDOUT | 60 plans generated from seed `20261020` by a generator that knows what every slot really is. The generator and invariants were written before the seed was run against the gate; a failing plan would be reported, not re-seeded. | RUN |
| RECORDED_LIVE | 4 authored confirmation variants of **one** plan, replayed from owner-approved Qloo responses | RUN (aggregates withheld from the public page) |
| AUTHORIZED_LIVE | Fresh requests under an owner grant | **NOT RUN** — no real live request has been authorized |

## Results: seeded holdout (60 plans; 50 scored, 10 paused)

All 60 plans satisfied every invariant for TasteGate (no violating item shipped, no valid item falsely rejected, no fabricated or auto-resolved identity, no accepted replacement that is not provably valid, no claim marked supported, the size limit respected).

| What reaches the user (50 scored plans) | Ship as proposed | Trust first hit | TasteGate |
| --- | ---: | ---: | ---: |
| Hard-constraint violations | 26 | 31 | **0** |
| Items shipped with nothing proving them | 23 | 6 | **0** |
| Violating items kept out of the plan | 0 of 26 | 0 of 26 | **26 of 26** |
| Valid items kept | 55 of 55 | 55 of 55 | 52 of 55 |
| Wrong identities shipped | 0 | 0 | 0 |
| Plans larger than their own size limit | 2 | 2 | 0 |
| Evidence-source calls per plan | 0 | 2.6 | 5.2 |
| Local latency, median / p95 (in-process) | — | 0.06 / 0.18 ms | 1.02 / 1.88 ms |
| People asked to decide | 0 | 0 | 10 |

- Paired sign comparison on violating items shipped: TasteGate shipped fewer than "trust the first hit" in **25** of 50 plans, the same in 25, more in **0**; fewer than "ship as proposed" in 22, the same in 28, more in 0.
- The 3 valid items TasteGate did not keep belong to 2 plans that exceed their own size limit: every slot is blocked rather than guessing which to drop. That is a design choice, shown here rather than hidden.
- On the 10 plans where TasteGate paused for a person to choose among same-named candidates, "trust the first hit" picked the **wrong identity 7 times** and shipped 9 violating items; "ship as proposed" shipped 2 violating and 3 unverifiable items.
- 61 of the 68 items TasteGate kept had taste evidence; the other 7 are kept, not guessed.

## Results: authored development cases (14; 11 compared, 1 paused)

14 of 14 cases satisfied their authored expectations. These cases shaped the gate; read the table as a regression check, not a benchmark.

| What reaches the user (10 scored plans) | Ship as proposed | Trust first hit | TasteGate |
| --- | ---: | ---: | ---: |
| Hard-constraint violations | 6 | 6 | **0** |
| Items shipped with nothing proving them | 4 | 1 | **0** |
| Violating items kept out of the plan | 0 of 6 | 0 of 6 | **6 of 6** |
| Valid items kept | 4 of 4 | 4 of 4 | 3 of 4 |
| Evidence-source calls per plan | 0 | 2.0 | 6.3 |

## Results: recorded Qloo responses (one plan)

4 of 4 cases satisfied their expectations (3 variants scored, 1 paused for the four identity decisions). Counts only; no provider content appears here:

- TasteGate shipped **0** violating and **0** unverifiable items and kept the 1 verified item per plan; it asked for **4** identity decisions.
- "Trust the first hit" shipped **1 violating item per plan**: its unchecked fill of the unresolved slot is, by the provider's own geocode, outside the required city and country. "Ship as proposed" shipped **1 unverifiable item per plan** (the second recommendation was never checked).
- The three scored variants share one baseline outcome: this is **n = 1 plan**, not three independent results.
- TasteGate's taste-evidence coverage on this stratum is **1 of 3 kept items**: the real one-query ranking (P06) replays only for the variant that confirms the reviewed artist signal; the variants that skip or change that signal have no recorded ranking and stay UNKNOWN. In the ranked variant the verified venue ranks behind the out-of-city place that Qloo itself puts first, and TasteGate still keeps the venue and rejects the place on its hard constraints.

## Results: live

**NOT RUN.** No live Qloo request was authorized for evaluation, so no live number is claimed. The live adapter is exercised only against an authored provider double.

## Costs, stated plainly

- TasteGate makes roughly twice the evidence-source calls (5.2 vs 2.6 per plan in the holdout) and asks people to decide whenever an identity is ambiguous.
- Latency figures are local in-process time. They say nothing about network latency to Qloo.
- Qloo's `query.affinity` is relative within one query. It is never used as a probability, and no result here says a person will like a place.

## Limits of this evidence

- Synthetic worlds prove that the logic handles constructed failure patterns. They cannot say how often real agents produce them.
- The development cases were used while building the gate.
- The recorded stratum is one plan.
- The baselines are deliberately simple; a stronger baseline (for example one that checks the city) would shrink the gap on violations and not on identity or unverifiable items.
- No human judged any output. No cultural-relevance claim is made.

## Reproducing and extending

```powershell
npm run eval                       # all strata that can run here
EVAL_PUBLISH=1 npm run eval        # refresh data/evaluation-results.json (recorded aggregates stay withheld)
EVAL_PUBLISH=1 EVAL_PUBLISH_RECORDED=1 npm run eval   # owner decision: include recorded aggregates
npx vitest run tests/eval-machinery.test.ts           # oracle, baselines, holdout determinism, sabotage tests
```

Adding an AUTHORIZED_LIVE stratum requires owner-authorized real requests; the harness reports it as NOT RUN until cases exist.
