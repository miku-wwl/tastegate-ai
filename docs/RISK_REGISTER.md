# Phase 0 risk register

**2026-10-16.** Priorities and mitigations are design judgments. VERIFIED/UNVERIFIED/BLOCKED refer to evidence, not task completion. All owners below are future responsibilities; no message was sent to organizers.

| ID | Priority / owner | Risk and current evidence | Mitigation and acceptance evidence | Current state |
| --- | --- | --- | --- | --- |
| R01 | Critical / project owner | Event key unavailable per request; NYC live behavior cannot be tested | Receive/store key privately; verify P01 and actual entitlement before feature work | BLOCKED |
| R02 | Critical / adapter engineer | Cross-domain/shortlist capabilities are documented, but combined NYC workflow coverage unknown | P02–P07 and one independently revalidated repair; propose movie-only fallback if needed | BLOCKED live |
| R03 | High / adapter engineer | Explainability may be missing/warn; per-type feature listing incomplete | Optional field, observed schema only, P08; missing attribution never fabricated | VERIFIED limitation; live BLOCKED |
| R04 | High / domain engineer | Geography aliases, branch ambiguity, padded locality boundaries can create false passes/fails | Exact identity + reviewed geographic policy; radius/unit controls; returned metadata verification; unknown on missing facts | UNVERIFIED coverage |
| R05 | Critical / adapter engineer | Unsupported parameters may be silently ignored | Per-type server allowlist and returned-result checks; probe exact filter set; no HTTP-200-only success | VERIFIED documented behavior |
| R06 | High / adapter engineer | Advertised OpenAPI file is a meta-schema, not Qloo paths/response schemas; examples truncated | Do not code-generate; inspect private actual responses, minimum consumed-field parsers and contract tests; request correct spec if needed | VERIFIED artifact mismatch |
| R07 | Critical / security/data owner | Public repo evidence/export can redistribute restricted Qloo data even after secret redaction | Keep live captures private; synthetic fixtures only in source; confirm public display/export fields before publication | VERIFIED repo restriction; public rights UNVERIFIED |
| R08 | High / project owner | No numeric event quota/burst/concurrency values in inspected materials; judge period consumes future quota | Obtain actual values privately; conservative caps and abuse controls; account-wide budget; measure dispatches/cache and cost | UNVERIFIED |
| R09 | Critical / domain/evaluation owner | Affinity/rank presented as factual correctness, causal explanation or individual preference probability | Four-axis decisions; within-query comparisons; no global score threshold; blinded human relevance ratings separate from fact labels | VERIFIED aggregate limitation |
| R10 | Critical / security engineer | LLM/provider prose invents entities, evidence or instructions to change tool authority | Fixed operations, strict schemas, same-run returned-ID selection, provenance graph checks, safe rendering, no arbitrary URL fetches | ASSUMED controls; NOT IMPLEMENTED |
| R11 | High / architect | Shared Runtime cannot orchestrate the read-only loop; forced reuse would require bypass or framework duplication | Product-specific finite read flow; review one archive side effect; install exact Runtime and test public integration before code | VERIFIED scope gap; seam proposed |
| R12 | High / runtime integration engineer | No installed Runtime dependency, consumer lockfile or verified installed signatures | Python 3.13 environment, full-SHA dependency, locked install, version/provenance/signature/path checks | NOT RUN; required before integration |
| R13 | High / deployment owner | Next.js serverless assumptions conflict with persistent Python/SQLite single-owner archive service | Local first; later select persistent single-owner backend/volume; no multi-instance claim or ephemeral archive DB | ASSUMED hosting design |
| R14 | High / domain engineer | Tonight's opening, jazz programming, allergens, exact bill, seats and travel time are not proven by taste evidence | Exclude certification; label missing operational facts, ask for scope if later adding authoritative source | UNVERIFIED / excluded |
| R15 | High / product owner | Generic director/café concepts silently reduced to arbitrary film/tag | Ask for materially relevant choices; no unconfirmed anchor; retain omitted preference/partial result | ASSUMED control |
| R16 | High / runtime engineer | Archive uncertain writes, concurrent attempts or report mutation could cause duplicate/conflicting effects | Reuse core claim/fencing/Unknown, immutable report hash, separate consumer receipt transaction and readback; actual restart tests | NOT RUN |
| R17 | High / evaluation owner | Qloo-only ground truth guarantees treatment win; repairs compared across query contexts | Freeze paired inputs, equal model opportunity, independent facts and blinded relevance rubric; no Qloo score as sole quality label | ASSUMED methodology |
| R18 | High / project owner | Rules, existing-code wording, personal eligibility and consumer license not fully settled | Disclose Runtime reuse/new work; verify owner eligibility, review malformed existing-project clause if material; owner selects license | VERIFIED rules read; personal/legal scope UNVERIFIED |
| R19 | Medium / product owner | Cultural-quality/audit competitors may overlap; prize competitiveness remains a hypothesis | Later targeted comparison of working public demos and unique QA use case; do not claim novelty based only on names | UNVERIFIED |
| R20 | High / project owner | Multiple project deadlines and late key delivery compress delivery before Oct 31 16:45 NZDT | Key-first vertical slice, explicit phase gates; movie pivot only after review; no automatic Phase 1/deployment | OPEN planning risk |
| R21 | High / security/deployment owner | Public demo abuse, logging personal profiles or model-provider retention may leak data/exhaust quota | Minimized inputs, redacted logs, real retention enforcement, bounded concurrency/requests, host secret store; verify provider terms | ASSUMED controls; NOT IMPLEMENTED |

## Blocking release conditions

No live-product claim while R01/R02 remain blocked. No integration code before R12. No publication/export before R07 rights and a suitable R13 host are resolved. No unsafe archive dispatch without separate human approval/authorization and R16 acceptance. No claim of empirical improvement before the evaluation is actually run. These are concrete project gates, not claims that Phase 0 performed those operations.

## Open decisions for review

1. Approve or revise the archive-only Runtime seam; do not silently turn the Runtime into a general tool loop.
2. Confirm the semantic distinction between unresolved identity (UNKNOWN) and proven violation (BLOCKED) while preserving the frozen strategy.
3. Confirm the NYC geography policy after real metadata inspection; no arbitrary boundary/alias list is certified now.
4. Choose the consumer license and later display/export/retention policy once ownership and event terms are settled.
5. Authorize Phase 1 separately after reviewing its key-first, bounded acceptance plan.
