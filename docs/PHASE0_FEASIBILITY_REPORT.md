# TasteGate AI — Phase 0 feasibility report

As of **2026-10-16 (Pacific/Auckland)**. Decision: **CONDITIONAL PASS for feasibility and architecture; live feasibility BLOCKED**. This is an offline specification. No Qloo call, model inference, product implementation, deployment or benchmark result is claimed.

## Scope and baseline

Read the root [AGENTS.md](../AGENTS.md) and [strategy v1.0](../TasteGate_AI_Qloo_Hackathon_Prize_Strategy_2026-10-16_v1.0.md) completely. Both remain unchanged. The user reports the GitHub repository and Devpost draft now exist; this supersedes the strategy's earlier unchecked creation tasks. Devpost account state and key issuance were not inspected. Treat the key as unavailable per the current request; no inbox, credential store or unrelated project was searched.

All source IDs below resolve in the [source register](PHASE0_SOURCES.md). VERIFIED means documented support, with live execution tracked separately.

## Product verdict

**The narrow hypothesis is plausible:** resolve cultural/place entities; retrieve relative Qloo evidence for an explicit shortlist; detect proven rule failures and missing evidence; propose a bounded alternative set; recheck it; report provenance. S04–S06 document the necessary lookup, interest, candidate-filter and geographic capabilities. Their combination and coverage for the requested NYC case are **BLOCKED** pending the event key.

**The broad hypothesis is unsupported:** Qloo is not a universal truth oracle, a proof that a venue suits one person, or a guarantee of current opening hours, menus, booking availability or a particular evening's live music. A low rank is not a factual failure. Missing data is not a negative cultural verdict. The product must expose these differences.

| Question/check | Owner | Classification | Safe conclusion |
| --- | --- | --- | --- |
| Input shape, duplicate IDs, count bounds, known evidence references | Deterministic code | ASSUMED design | Reject invalid input/evidence graphs before reporting. |
| Resolve a name to candidate entity IDs | Qloo lookup + reviewed choice | VERIFIED documented; live BLOCKED | A search hit proposes identity; ambiguity requires clarification. |
| City/country/type agreement | Deterministic comparison over validated source facts | ASSUMED rule; source coverage UNVERIFIED | Only contradictory, reliably resolved metadata supports a hard failure; missing metadata is unknown. |
| Cultural affinity of an existing shortlist | Qloo Insights | VERIFIED documented in S05; live BLOCKED | Relative evidence in this query, without individual preference probability. |
| Tag meaning for Japanese jazz cafés | Qloo tag lookup + human interpretation | UNVERIFIED | No invented tag URN; do not silently use a broad jazz/music tag as proof of a café's atmosphere. |
| Interpret Wong Kar-wai films | User choice, optionally LLM proposals | ASSUMED interpretation | Ask for a film anchor or confirm a person signal; do not silently replace a filmmaker with one guessed movie. |
| Extract claims from upstream prose | LLM, then deterministic evidence checks | ASSUMED design | Proposals only; LLM cannot certify its own claim or fabricate IDs. |
| Generate replacement candidates | Qloo discovery; optional LLM selection within returned IDs | VERIFIED discovery intent; case BLOCKED | Recheck all constraints and identity; no approved result merely because discovery returned it. |
| Detailed attribution to each preference | Optional Qloo explainability | VERIFIED parameter; availability BLOCKED | Show only returned contributions; missing attribution remains missing. |
| Open tonight, safe allergens, current price, seats, travel timing | Fresh authoritative operational data | UNVERIFIED / excluded | Do not certify these with Qloo taste evidence or an LLM explanation. |
| A recommendation will be liked | Cannot be reliably verified by this workflow | UNVERIFIED | Outside the MVP promise. |

## Finding semantics and strategy clarification

Keep four independent axes: **factual/hard-rule failure**, **insufficient recommendation evidence**, **relative cultural relevance**, and **uncertainty/missing data**. Their display aggregation is specified in [architecture](ARCHITECTURE.md).

The frozen strategy contains both a broad hard-gate description that includes unresolved locations and a later example that marks unresolved entities UNKNOWN. Proposed clarification for review: unresolved identity prevents a verified PASS but is reported as UNKNOWN/REVIEW, not as a proven factual failure. BLOCKED means a proven applicable rule violation or integrity/security violation. The baseline is preserved; this is a visible clarification, not an unrecorded strategy rewrite.

## Official findings that affect feasibility

| Finding | Status | Evidence | Consequence |
| --- | --- | --- | --- |
| Event origin is `https://hackathon.api.qloo.com`, authenticated with `X-Api-Key` | VERIFIED documentation | S03 | Server-only fixed origin; no staging fallback. Actual authentication BLOCKED. |
| Search and Insights use different type vocabularies | VERIFIED documentation | S03/S04 | Do not invent `urn:entity:music` or reuse search-only director types for Insights. |
| `filter.results.entities` can assess an explicit candidate list | VERIFIED documentation | S05/S06 | Core audit route is plausible; returned-set completeness and rank semantics need probes. |
| Explainability can be missing with a warning | VERIFIED documentation | S05 | Optional evidence, never a reason to fabricate attribution. |
| Some incompatible parameters are silently ignored | VERIFIED documentation | S03 | Local allowlists and returned-result checks are essential. HTTP 200 is insufficient. |
| Raw response schema is not fully established by inspected artifacts | UNVERIFIED | S10/S12 | No generated client or speculative strict wire schema. |
| Numeric event rate, concurrency and monthly quota | UNVERIFIED | S03/S14 | Obtain actual entitlement before live testing or public sizing. No numeric provider limit is invented. |
| Private server caching is permitted; public-repository Qloo response storage is prohibited | VERIFIED documentation | S03 | Raw live results and derived exports need private handling; sanitized secrets alone do not make response data publishable. |
| Official CLI/local MCP exists | VERIFIED documentation | S13/S16/S17 | Optional discovery tooling, not a required framework or hosted MCP URL. |

Detailed parameters, response uncertainty and API validation checklist: [Qloo contract](QLOO_API_CONTRACT.md).

## Minimal vertical slice

One synthetic case uses **Radiohead, Wong Kar-wai films, Japanese jazz cafés → an evening in New York**. [The synthetic case](examples/nyc-evening.synthetic.json) contains authored placeholders, no live Qloo entities or scores. It defines expected behavior, not execution output.

1. Validate at most three preference concepts and three original recommendations. Treat evening as context, not an operational fact. Add explicit NYC/type constraints only through confirmed structured input.
2. Search Radiohead as an artist. For Wong Kar-wai, clarify a representative film (the case proposes *In the Mood for Love*, unconfirmed) or explicitly choose a documented person representation. Search film/title only after confirmation. Do not accept the top hit without type/disambiguation checks.
3. Search tags for jazz/café concepts. Confirm meaning and availability. If no faithful tag exists, retain the unresolved preference in limitations and ask before proceeding with fewer signals.
4. Resolve each upstream place separately by name and supplied location/address hints. Reject chain/branch or brand/place confusion. Resolve a destination locality if that route is selected. Missing/ambiguous items remain in the report.
5. For resolved original places, send one bounded place Insights query with the confirmed preference IDs/tags and `filter.results.entities`. Do **not** apply the NYC filter to this original-shortlist query: doing so could hide the out-of-city item that the audit must identify. Validate geography independently from lookup facts.
6. Record returned IDs, ordering, query context, source pointers, omitted IDs and warnings. Check city/country/type from source facts. Detect unsupported prose claims by comparing claims to actual evidence, never by treating low affinity as falsehood.
7. If repair is useful and budget permits, run one discovery query using the same confirmed taste signals, reviewed NYC filter and exclusions. Validate discovered identities and geography, then rerank the bounded union of eligible originals and proposed replacements in one common query. This avoids comparing normalized scores across different queries.
8. Revalidate each proposed replacement with the same rule/evidence checks. Preserve original findings; link each replacement to its reason and its own evidence. Return UNKNOWN/REVIEW if repair is incomplete; report residual failures explicitly.
9. Produce typed evidence JSON with `source_mode=fixture` for this offline case. In a future live run, every decision dependency must trace to an actual captured call. Optional archival is a separate, approval-gated Runtime action, not a Qloo operation.

Call allocation and failure exits: [state machine](AGENT_STATE_MACHINE.md). Contracts and runtime seam: [architecture](ARCHITECTURE.md).

## Competition fit

VERIFIED from S01/S02: the submission needs substantive Qloo integration, a working accessible application, public source and an open-source license; English submission material and free judge access apply. Four criteria are equally weighted. The overview requires external publication and says video is optional. The deadline is **2026-10-31 16:45 NZDT** (2026-10-30 23:45 EDT). Hosting must cover the judging period, not just submission day.

Rules wording for existing projects contains a malformed phrase in section 4. Disclose the pre-existing Runtime and all new TasteGate work; seek organizer clarification if reuse eligibility depends on that wording. Personal eligibility is UNVERIFIED; no legal qualification is inferred from registration. No license is selected for the user in this milestone. No site, draft or submission was changed.

## Architecture feasibility and explicit gap

The preferred TypeScript/Next.js product can own a small finite, read-only audit flow. The required Python Runtime cannot execute that flow as general READ_ONLY or multiple tools (S20). Do not port its execution engine into TypeScript.

Proposed seam: one local `archive_audit_report/1` side effect, after a human reviews an immutable report, using the installed pinned Runtime's existing Plan → Approval → Admission → Authorization → Claim → Executor → Verified effect → Receipt chain. This is a **proposed consumer-specific role**, not implemented functionality or approval to execute it. The report remains useful before archival; archival never converts incomplete cultural evidence into PASS. See ADR-02 in [architecture](ARCHITECTURE.md).

Tag/commit verification passed. There is no installed consumer dependency or lockfile; installed API verification and durable acceptance remain NOT RUN. These must pass before integration code. A source/example inspection is not a substitute.

## Phase 0 implementation decision

Task E is conditional. **No engineering scaffold is necessary to resolve the present feasibility questions.** No package manifest, dependency installation, Next.js UI, Qloo implementation or execution framework was added. Typed contracts live in design code blocks; the JSON example is a specification fixture. This avoids representing speculative wire schemas as tested integrations. Vitest/typecheck/install/build/Playwright and deterministic application tests are NOT RUN because no application code exists. Local documentation, JSON consistency, protected-file and diff checks are recorded in [Phase 0 review](PHASE0_REVIEW.md).

## Go / No-Go

| Gate | Current state | Evidence required |
| --- | --- | --- |
| Phase 0 documents, sources, bounded contracts and risk identification | PASS subject to final static checks | Eight requested documents plus source register/example; review results. |
| Event credentials, entitlement, schema and actual NYC coverage | BLOCKED | Key, actual quota/expiry; bounded private probes P01–P10. |
| Safe and useful audit → repair → revalidation | BLOCKED | One real NYC case and second cross-domain example; a verified rule failure, valid replacement and honest incomplete-data path. |
| Installed Runtime package and consumer execution chain | NOT RUN | Exact pin/lock, installed imports/signatures and durable consumer tests. |
| Judge-ready public product and measured improvement | NOT RUN | Later phases and separate deployment/submission instructions. |

**GO to an explicitly authorized Phase 1** only to validate the narrow live contract and Runtime seam. **NO-GO for claims of a finished Qloo product** until live evidence exists. If NYC/cross-domain coverage fails, propose the strategy's movie-only fallback for human review; do not silently pivot. If key/quota/rights remain unavailable, remain BLOCKED rather than substitute a synthetic success.

Thirty-case design and fair comparison: [evaluation plan](EVALUATION_PLAN.md). Next work, acceptance and stopping points: [Phase 1 plan](PHASE1_EXECUTION_PLAN.md). Stop after this Phase 0 review.
