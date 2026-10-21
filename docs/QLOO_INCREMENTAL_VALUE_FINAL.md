# What Qloo adds, measured honestly

2026-10-21, Pacific/Auckland. Phase 3C base `9e7bff070adfd396df184205acbd56232dea14d2` plus uncommitted changes. Reproduce with `npm run eval` (offline); published synthetic aggregates are served at `/results` and stored in [`data/evaluation-results.json`](../data/evaluation-results.json). Phase 3B's retained-set null finding is preserved.

## 1. The answer in four lines

| Question | Answer |
| --- | --- |
| Does Qloo's cultural evidence add **evidence coverage**? | **Yes.** 80 % (4 of 5) of the items TasteGate keeps in the authored cases, and 90 % (61 of 68) in the seeded holdout, carry Qloo-style query-relative evidence; the control has none. This is coverage, not quality. |
| Does it change **what TasteGate keeps**? | **Not in any synthetic plan** (0 of 10 and 0 of 50). |
| Does it produce an **independently validated quality gain**? | **Not established.** `QUALITY_UPLIFT_NOT_ESTABLISHED`. No ground truth for cultural fit exists that is independent of Qloo's own affinity, and every hard-fact outcome is identical by construction. |
| What does it cost? | One extra request per plan (the common-set ranking, +0.9 to +1.0 calls per plan) and **more UNKNOWN items**: 22 % vs 17 % of audited items, because items without cultural evidence are kept with the gap stated rather than guessed. |

The product's safety value comes from **rules and identity** (hard constraints, an identity that a person or a second source establishes, and a bounded repair). Qloo supplies the **candidate source** for replacements and the **cultural evidence annotation**. We do not claim more than that.

## 2. Where Qloo is used, and what is real

| Use | Endpoint | Evidence in this repository |
| --- | --- | --- |
| Identity candidates for the artist, a venue and a film | `GET /search` | 3 real owner-approved responses (P01, P02, P03-R), recorded privately |
| Taste-tag resolution | `GET /v2/tags` | 1 real response (P04) |
| Candidate source for replacements, ordered by taste for one artist signal | `GET /v2/insights` | 1 real response (P05) |
| Ranking a shortlist inside one query | `GET /v2/insights` + `filter.results.entities` | 1 real response (P06), executed once and sealed |
| Geography-filtered discovery | `GET /v2/insights` + a locality filter | **Prepared (P07), never run**; needs the owner's exact approval |
| Fresh requests in the product | all four builders | The adapter exists and is tested against doubles; **never run against Qloo**; the live stratum is NOT RUN |

Qloo's `query.affinity` is query-relative. It is displayed for transparency and is an input to **no** decision and to no hard check.

## 3. A fair control

`RULES_AND_IDENTITY_ONLY` versus `TASTEGATE_WITH_QLOO_CULTURAL_EVIDENCE` (`src/eval/ablation.ts`). The control is derived from the **same run** as the treatment, so it shares the recommendations, the constraints, the identity decisions, the provider geography, **the candidate pool** (the replacements TasteGate audited) and **every non-cultural rule** (identity, corroboration, city, country, type, size, consistency). It differs in one thing: it neither collects nor uses cultural evidence (the common-set ranking, discovery order, query-relative affinity).

Why it is trustworthy:

- It reads only a **redacted view** of the report (`rulesView`) with no cultural field; a test asserts the serialized view contains none of `cultural`, `relevance`, `taste`, `affinity`, `ordinal`, `rank_places`, `score`.
- An **invariance test** strips or reverses every cultural field of every scenario and checks the control's decisions do not move; a meta-test shows a control that *did* peek would be caught (so the check is not vacuous).
- **TasteGate is never the more permissive**: across all 50+ paired plans, the treatment's kept set is a subset of the control's.
- Both are scored by the **same independent oracle** (true facts by entity ID, no import of the audit rules) on the same plan; quality is judged from facts, never from Qloo affinity.
- The control's elapsed time is **not** separately measured (it is derived from the same run); only its call count is reported.

## 4. Results, per stratum (never pooled)

| | SYNTHETIC (authored cases) | SYNTHETIC_HOLDOUT (seed 20261020) | RECORDED_LIVE | AUTHORIZED_LIVE |
| --- | --- | --- | --- | --- |
| Plans scored (paused for a human, not scored) | 10 (1) | 50 (10) | computed locally, **aggregates withheld** (display terms unanswered) | **NOT RUN** |
| Evidence coverage: kept items with cultural evidence | 4 of 5 (80 %) | 61 of 68 (90 %) | — | — |
| Plans where the kept set differs | 0 of 10 | 0 of 50 | — | — |
| Violating items shipped: treatment vs control | 0 vs 0 | 0 vs 0 | — | — |
| Wrong identities shipped | 0 vs 0 | 0 vs 0 | — | — |
| Valid items kept / dropped | 3 / 1 vs 3 / 1 | 52 / 3 vs 52 / 3 | — | — |
| Plans where treatment is strictly better / worse / tied (oracle metrics) | 0 / 0 / 10 | 0 / 0 / 50 | — | — |
| Candidate assessments labelled differently without the evidence (PASS/REVIEW vs UNKNOWN) | 2 of 18 | 18 of 129 | — | — |
| Items carrying a cultural ordering (the control has none; no hard check uses it) | 14 | 101 | — | — |
| Replacements accepted (valid by the oracle): treatment vs control | 2 (2) vs 2 (2) | 16 (16) vs 16 (16) | — | — |
| UNKNOWN items (of audited) | 22 % vs 17 % (18 audited) | 22 % vs 17 % (129 audited) | — | — |
| Local run time, treatment median (control: **not separately measured**) | 1.0 ms | 0.6 ms | — | — |
| Evidence-source calls per plan | 6.3 vs 5.4 | 5.2 vs 4.2 | — | — |
| Quality uplift | `QUALITY_UPLIFT_NOT_ESTABLISHED` | `QUALITY_UPLIFT_NOT_ESTABLISHED` | not published | not run |

In the synthetic strata the "cultural evidence" is **authored**, so these numbers say nothing about Qloo; they verify that the gate's logic and the control are consistent. The holdout shows the three baselines for context: shipping the plan as proposed passes 26 violating items and 23 unverifiable items through; trusting the first provider hit passes 31 violating items; TasteGate passes none, at the cost of dropping 3 valid items (plans larger than their own size limit, where choosing what to drop is a human decision) and asking a person on 10 plans.

## 5. The one real finding

On the recorded NYC plan, Qloo's own ordering ranked an **out-of-city place above the verified NYC venue** (P06, one query, two places). TasteGate kept the venue (`REVIEW`) and rejected the place (`REPAIR_REJECTED`) because the provider's own geography put it in another country. This shows two things and no more: the shortlist-ranking parameter is honoured, and a high Qloo rank does not make a place valid for a hard constraint. It does **not** show that Qloo rankings are unreliable in general, nor that anyone would like either place.

## 6. What would establish more (and what will not happen before the deadline)

### Phase 3C: secondary priority comparison, separate from retention

`src/eval/candidate-priority.ts` now compares input-order priority **without cultural evidence** with evidence-supported order **within one reviewed ranking query**. Both arms share the rules-only gate's valid candidate pool, identities and constraints; incomplete or cross-query coverage abstains; equal scores preserve control order. The report graph is validated first. Nothing dispatches, changes acceptance, introduces an affinity threshold or claims liking probabilities.

| Stratum | Plans scored | Multiple valid candidates | Common reviewed query | Priority changes |
| --- | ---: | ---: | ---: | ---: |
| Authored synthetic | 10 | 1 | 1 | 1 |
| Seeded synthetic holdout | 50 | 22 | 16 | 6 |
| Recorded | 3 variants of **one plan** | 0 | 0 | 0 |
| Authorized live | NOT RUN | — | — | — |

These synthetic ordering differences prove the comparison works, **not Qloo uplift**. Original retained sets still change in **0/10 and 0/50** plans. The real gap is exact: P06 ranks two places but only **one** passes the fixed NYC/country constraints. P05 supplies one candidate, which fails those constraints. There is no reviewed common-query ranking of two independently eligible real candidates under the same identity/constraint assumptions. P07 might return such candidates, but is unexecuted; discovery and locality alone would still not prove their identities or taste quality. **QUALITY_UPLIFT_NOT_ESTABLISHED** remains unchanged.

1. **P07** (prepared, awaiting approval) plus an independently corroborated replacement would give the first real `REPAIR_VERIFIED`: a coverage and usefulness result about *discovery*, not a quality-uplift proof.
2. A **human-judged taste study** would be the only independent measure of cultural fit. It is out of scope for the hackathon and is not claimed.
3. An **AUTHORIZED_LIVE** stratum needs the owner's separate approval and a quota that is UNKNOWN today.

## 7. How to describe this publicly

Safe: "TasteGate uses Qloo for identity candidates, tag resolution and replacement discovery, keeps every Qloo response private and replayable, and measures what Qloo's cultural evidence adds against a fair control: more evidence coverage, no change to what it keeps on the synthetic plans, and no independently validated quality gain." Unsafe and not claimed: "Qloo improves recommendation quality", "Qloo rankings are better than X", any statement about liking.
