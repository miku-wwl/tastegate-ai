# Evaluation plan — no results yet

**2026-10-16.** Thirty proposed cases, zero scored runs. The synthetic example is a specification, not an evaluation result. No accuracy, improvement, API latency or call cost is claimed.

## Dataset construction and freeze

Retain the strategy's proposed domain strata: **8 film/music, 8 NYC/place, 6 mixed-preference, 8 robustness**. The task's eight failure/success categories are a second classification, not a replacement product strategy. The following exactly 30 case slots are a concrete design; actual resolved Qloo IDs, independently sourced facts, human labels and live snapshots remain to be collected privately.

| Case | Stratum | Primary category | Input/control and expected behavior |
| --- | --- | --- | --- |
| G01 | Film/music | Valid | Unambiguous music candidates with sufficient evidence; no false hard rejection |
| G02 | Film/music | Valid | Unambiguous film candidates and confirmed preferences; distinguish optional missing explanation |
| G03 | Film/music | Cross-domain | Music → film with confirmed entities; relative relevance only |
| G04 | Film/music | Cross-domain | Film → book with confirmed entities; no cross-query score subtraction |
| G05 | Film/music | Unresolved | Authored nonexistent film name; UNKNOWN, not proof it does not exist anywhere |
| G06 | Film/music | Unsupported claim | Causal personality inference from a film preference; claim unsupported |
| G07 | Film/music | Missing Qloo evidence | Resolved film omitted by bounded Insights; unknown evidence, no fabricated zero score |
| G08 | Film/music | Ambiguous | Same-title remake or alias; request explicit identity choice |
| G09 | NYC/place | Valid | Resolved NYC place with independently checked city/type and taste evidence |
| G10 | NYC/place | Valid | Valid niche NYC venue, lower relative rank; do not falsely reject it |
| G11 | NYC/place | Constraint violation | Resolved out-of-city place; factual city failure, even if it ranks well |
| G12 | NYC/place | Constraint violation | Brand/chain substituted where an individual place is required; type failure |
| G13 | NYC/place | Unsupported claim | Recommendation claims live jazz tonight without operational evidence; REVIEW |
| G14 | NYC/place | Missing Qloo evidence | Missing geography; unknown hard check, no city PASS |
| G15 | NYC/place | Cross-domain | Confirmed artist → NYC place candidate discovery and revalidation |
| G16 | NYC/place | Cross-domain | Confirmed film → NYC place; at least one fully validated replacement or honest unresolved outcome |
| G17 | Mixed preference | Unresolved | Japanese jazz café concept has no faithful reviewed tag; clarify/partial |
| G18 | Mixed preference | Unsupported claim | Affinity described as a personal liking probability; remove/flag claim |
| G19 | Mixed preference | Constraint violation | More than the explicit maximum number of recommendations; deterministic failure |
| G20 | Mixed preference | Missing Qloo evidence | One of three preferences omitted; partial coverage is visible |
| G21 | Mixed preference | Ambiguous | Multiple chain branches with same name; require branch/location choice |
| G22 | Mixed preference | Missing Qloo evidence | Valid relationship but missing explainability/warning; no invented detailed attribution |
| G23 | Robustness | Unresolved | Unresolvable original venue; preserve its slot and uncertainty |
| G24 | Robustness | Unresolved | Typo with several fuzzy matches; no forced top-hit identity |
| G25 | Robustness | Unsupported claim | Model supplies fabricated Qloo evidence ID; integrity BLOCKED, not provider support |
| G26 | Robustness | Constraint violation | Resolved same-name place in wrong country; tuple check catches it |
| G27 | Robustness | Missing Qloo evidence | Valid 200/empty response; no verified success or inferred negative affinity |
| G28 | Robustness | API failure | Safe injected 401/403; stop dispatches and expose credential/permission category |
| G29 | Robustness | API failure | Safe injected 429; no retry storm, partial/unknown report |
| G30 | Robustness | API failure | Safe injected timeout; no late-result acceptance or hidden background calls |

Counts by category: valid 4, unresolved 4, unsupported claims 4, explicit constraints 4, missing evidence 5, cross-domain 4, ambiguous 2, API failures 3 = **30**. Each case may have secondary tags. Malformed JSON, schema drift, 5xx, prompt injection, duplicate IDs, budget exhaustion and Runtime recovery are targeted engineering tests in addition to this product dataset; do not quietly add them to the denominator or claim they were run.

G03/G04 are an evaluation expansion beyond the NYC MVP adapter. The initial adapter supports place outputs; those cases remain NOT RUN until a reviewed film/book read adapter is introduced. They must not force speculative multi-domain implementation before the NYC slice passes. Movie-only fallback, if approved, needs a versioned dataset revision and disclosed scope change.

## Golden labels and provenance

For each case record: `case_id`, dataset revision, primary/secondary categories, domain stratum, synthetic/live/fault-injection mode, input and original candidates, independently adjudicated entity identities, per-constraint truth or unknown, claim-support labels, expected safe behavior, and permissible repair outcomes. Keep private source URLs/time/fact extracts where rights permit, Qloo profile/request fingerprints, actual entity IDs and evidence pointers, raw outcomes, code/lock/model/prompt versions, dispatch counts, cache state, latency and cost data.

Two reviewers should label identity, geography/type/count and claim support independently and resolve disagreements before scoring. If only one reviewer is available, disclose that limitation and conduct a second pass with randomized order. Missing ground truth is labeled unknown and excluded from factual correctness denominators, with its count reported. Do not label subjective taste as a factual truth. For relevance, use a small blinded human rubric on stated interests and constraints, independent of Qloo's ranking.

Live Qloo captures stay private under the API terms; public source contains only authored synthetic examples, dataset descriptions and permitted aggregate results. Publishing a fixed response or Qloo-derived export requires separate rights confirmation. Freeze development/calibration cases separately from these 30 scored cases; do not tune prompts, thresholds or examples on the final scored set.

## Fair paired comparison

Use the same original recommendation set and confirmed preference/constraint input for each case. Compare **LLM-only audit/repair/revalidation** with **TasteGate audit/repair/revalidation**. Keep model/provider/version, temperature, prompt intent, token budget, maximum two LLM calls, repair count, output slot budget and evaluation facts fixed. TasteGate alone gets Qloo evidence through its bounded adapter. The LLM-only system has no Qloo or other hidden retrieval. Both can abstain and both get equal opportunity to revise once.

Do not compare a raw one-shot baseline against a repeatedly hand-tuned repair system. Separately include the unchanged original as a reference so improvements from another model pass are visible. Add a no-Qloo TasteGate ablation with the same validation code where feasible; this distinguishes deterministic constraint benefits from Qloo cultural evidence benefits. Baseline Qloo evidence coverage is structurally absent and **is not an independent quality win metric**.

Judge outputs with the same blinded identity/fact/claim criteria and human relevance rubric. Qloo ranks can measure internal consistency/coverage, not serve as the sole ground truth for superiority. If independent operational facts are used only for offline scoring, withhold them equally from both arms. If later shared with the systems, provide identical snapshots to both and disclose that experiment change.

Randomize output order for reviewers; strip method/source branding while preserving equivalent factual content. Run paired trials in interleaved order to reduce temporal bias. A proposed three repetitions per case measures model variance (90 runs/arm), but this is **not authorized live traffic or an executed benchmark**: first estimate quota from the small Phase 1 slice, then approve an affordable repeat count. Report all cases, failures and abstentions; never select only successful examples.

## Metrics and denominators

| Metric | Exact planned definition | Interpretation/caveat |
| --- | --- | --- |
| Entity resolution success | Correctly resolved, unambiguous gold entities / all gold-resolvable entities | Include unresolved gold-resolvable entities as failures; report ambiguity/coverage separately |
| Resolution false-match rate | Incorrect accepted identities / all accepted identities | Abstention must not conceal forced-match errors |
| Hard-constraint detection | Proven violations correctly flagged / all gold-proven violations | Unknown facts excluded and counted explicitly |
| Final hard-constraint violation rate | Known constraint-violating final items / final items with adjudicable applicable hard facts | Also show per-constraint numerator/denominator and unrepaired/missing slots |
| Hard-constraint unknown rate | Final items with any unknown required hard fact / all final items | Prevent silent success through unknowns |
| Evidence coverage | Final items with traceable, relevant, allowed evidence for required claims / all final items | Report live versus synthetic, source type and claim-level coverage; not accuracy |
| Repair validation success | Attempted original slots replaced by a candidate that passes identity, all hard checks and required evidence / all attempted repair slots | Failed/no-candidate repairs remain denominator; aesthetic preference not proven |
| False rejection rate | Gold-valid originals falsely BLOCKED / gold-valid originals | Also report unnecessary replacement rate; REVIEW/UNKNOWN reported separately |
| Unsupported claim rate | Unsupported asserted verifiable claims / all asserted verifiable claims | State what an abstaining/removed claim counts as; no claims → N/A, not perfect score |
| Completion/abstention | Complete reports / cases; UNKNOWN and partial counts | Prevent favorable scores by returning no candidates |
| Human cultural relevance | Blinded 1–5 rating for alignment/usefulness, plus paired preference | Subjective outcome, sample/reviewer counts and uncertainty required |
| Latency | End-to-end p50/p95, separately successful/failed runs and cold/warm cache | Include model + Qloo + validation; sample size and timeout count required |
| API call cost | Actual HTTP dispatches/case including failures; observed model tokens and billed cost if known | No dollar estimate without actual pricing/entitlement; do not call event quota “free unlimited” |

Compare paired differences and report raw counts, unknowns and confidence intervals appropriate to the small sample. With 30 designed cases, no production reliability or population-wide preference claim is justified. If zero cases run, every outcome metric is **NOT RUN**, never 0% or 100%.

## Proposed acceptance criteria

Engineering safety gates are strict: no fabricated provenance, no accepted wrong identity, no known hard-violating replacement, no fixture relabeled live, no unbounded retry, no automatic archive execution. All targeted negative tests must pass before public use.

Product feasibility requires one real NYC audit and validated replacement, a second cross-domain example, and an honest failure/empty-data path. Full benchmark success requires all 30 cases accounted for, predeclared denominators, reproducible private evidence and no unreported failures. A statistically or practically meaningful relevance improvement is a hypothesis; predeclare the desired effect after pilot calibration on separate cases, then freeze it before scoring. Failure to improve is a valid outcome and triggers review, not retrospective threshold adjustment.
