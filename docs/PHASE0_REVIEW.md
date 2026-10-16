# Phase 0 review

Date: **2026-10-16, Pacific/Auckland**. Status: **CONDITIONAL PASS** for offline feasibility/architecture. **Live feasibility BLOCKED.** Stop here for human review; Phase 1 has not started.

## Baseline and scope

- Base commit: `276e4065a23cfd27eb961b37dc860089776b3f8d`, branch `main`, initially clean against the local `origin/main` tracking ref. No fetch/push or remote TasteGate mutation performed.
- Read root AGENTS.md, strategy v1.0, pinned Runtime consumer example/adapter guide, current v0.2.0 handoff, and relevant official Qloo/event materials.
- Protected AGENTS.md and strategy are preserved; README unchanged. All new deliverables are under `docs/`. No application code, dependencies, credentials, live response snapshots or private state added.
- API mode: offline specification only. Public documentation/Git reads occurred; **zero Qloo data calls**, zero model calls. No key/inbox/account inspection, commit, push, deployment, Devpost edit or submission.

## Deliverables

| File | Content |
| --- | --- |
| [PHASE0_FEASIBILITY_REPORT.md](PHASE0_FEASIBILITY_REPORT.md) | Supported narrow hypothesis, scope/limitations, NYC steps, Go/No-Go |
| [QLOO_API_CONTRACT.md](QLOO_API_CONTRACT.md) | Traceable request fields, schema uncertainty, error/paging policies, live probe checklist |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Typed contracts, proposed adapter, bounded audit, Runtime seam, authority/security/retention |
| [AGENT_STATE_MACHINE.md](AGENT_STATE_MACHINE.md) | Transitions, terminal states, 14-call budget, timeout/cancellation and separate archive mapping |
| [RISK_REGISTER.md](RISK_REGISTER.md) | Prioritized blockers, owners, mitigations and evidence needed |
| [EVALUATION_PLAN.md](EVALUATION_PLAN.md) | Exactly 30 proposed cases, metrics/denominators and fair paired comparison |
| [PHASE1_EXECUTION_PLAN.md](PHASE1_EXECUTION_PLAN.md) | Ordered key-first implementation and acceptance plan; separate authorization required |
| [PHASE0_REVIEW.md](PHASE0_REVIEW.md) | This review and actual check boundaries |
| [PHASE0_SOURCES.md](PHASE0_SOURCES.md) | Primary source register, revisions, observed discrepancies and local evidence |
| [examples/nyc-evening.synthetic.json](examples/nyc-evening.synthetic.json) | Authored offline scenario and expected JSON; no Qloo values or executed outcome |

## Phase 0 quality gates

| Required gate | Result | Evidence/qualification |
| --- | --- | --- |
| Core architecture/interfaces defined | PASS (design) | ADRs, input/output/adapter declarations, deterministic rules and bounds |
| API assumptions traceable | PASS (documentation) | S01–S23 and field-to-source contract; documentation support distinguished from live support |
| Critical unverified behavior identified | PASS | No key, schema artifact mismatch, per-type filters, NYC coverage, score semantics, quota and data rights |
| Offline validation tests, if implemented | NOT RUN / not applicable to product code | Task E intentionally deferred: no engineering scaffold needed for key-dependent feasibility; no application tests exist |
| No falsely claimed live execution | PASS (artifact review) | All example evidence is synthetic; no fabricated API results, latency or benchmark outcomes |
| Concrete Phase 1 plan | PASS (design) | Entry conditions, seven steps, P01–P10, targeted tests and stop criteria |
| Real Qloo feasibility | BLOCKED | Event key unavailable; no authenticated live contract/coverage/repair proof |
| Installed Runtime/lock/API/durable chain | NOT RUN | No current consumer environment/metadata; public tag/source checks are narrower evidence |

## Local checks and actual results

Final local verification: **16 static check groups passed, 0 failed** using Python 3.13 standard-library assertions and per-file Git checks. They verify document/example consistency, not an implemented quality gate or provider integration. Nine Markdown files and one JSON specification were checked.

| Check | Actual result |
| --- | --- |
| Protected-file hashes and tracked baseline preservation | PASS: both SHA-256 values match; tracked/staged diffs empty |
| Eight required docs plus source register/example exist; relative links resolve | PASS: 10 new files, local links resolve within repository |
| Synthetic JSON parses and internal IDs/evidence pointers/references are consistent | PASS: unique evidence/candidate IDs, every pointer/reference resolves, ranks correspond to authored lists |
| Synthetic expected dispositions: wrong city BLOCKED, unresolved UNKNOWN, revalidated repair, residual partial UNKNOWN | PASS: authored expectations consistent; no audit implementation was executed |
| Golden-case IDs/counts and 14-call budget arithmetic | PASS: G01–G30 unique; domain strata 8/8/6/8; allocation sums to 14 |
| Whitespace/diff and scoped secret-pattern checks | PASS: all new files have no trailing whitespace or Git check diagnostics; bounded credential patterns found no matches |
| Mode/usage, input bounds, code fences and change scope | PASS: fixture-only, zero calls/receipts, input within proposed caps, balanced fences, all 10 new files under docs/ |
| Public Runtime annotated tag/peeled SHA | PASS: tag object and full SHA match AGENTS.md |
| Qloo schema artifact inspection | PASS: identified generic OAS meta-schema; response-schema verification remains BLOCKED |
| Dependency install, lock validation, TypeScript typecheck, Vitest, Next.js build, Playwright | NOT RUN: no product scaffold/manifests |
| Live Qloo, LLM, Runtime execution, full 30-case benchmark, public browser/deployment | NOT RUN; Qloo live gate BLOCKED |

Public source retrieval had intermittent documentation errors. The developer guide's tag-reference link returned 404; a pinned official mirror was used. An initial inspection of the advertised schema expected an API `info` object and raised `KeyError`; inspecting its real content established it was a generic meta-schema. These were research failures corrected through source inspection, not failed product tests or live API results. One attempted Runtime package-directory URL returned 404; the repository tree identified its public `runtime.py` module, which was then read. No dependency/core source was changed.

Static check groups: `required_deliverables`, `local_markdown_links`, `protected_sha256`, `tracked_baseline_unchanged`, `synthetic_mode_zero_execution`, `unique_evidence_ids`, `synthetic_provenance_and_pointers`, `candidate_repair_and_evidence_references`, `authored_expected_dispositions`, `input_bounds_and_ids`, `golden_dataset_30_cases_and_strata`, `call_budget_arithmetic`, `new_file_whitespace_and_git_diff_check`, `bounded_credential_pattern_scan`, `markdown_code_fences_balanced`, `new_files_scoped_to_docs`.

Commands included repository inspection/hash checks, `python -` with standard-library document/JSON assertions, `git diff --check`, and `git -c core.autocrlf=false diff --no-index --check -- NUL <new-file>` for every untracked artifact. The no-index command returns 1 for new-file differences; no whitespace diagnostics were emitted. An initial static harness incorrectly required exit 0; this condition was corrected before the successful 16-group run. The credential scan covered common provider/GitHub/AWS key prefixes, private-key headers and credential-bearing URLs; it is a bounded scan, not proof against every possible secret format. No application test pass count is inferred from these checks.

## Review against competition dimensions

Technological Implementation: **PARTIAL — design/evidence only**; no working Qloo product exists. Design: **NOT RUN — no UI**. Potential Impact: **UNVERIFIED hypothesis** supported by a concrete QA use case. Quality of the Idea: **UNVERIFIED differentiation**; no claim of novelty or prize outcome. No scores are fabricated.

## Decisions required before implementation

1. Review the narrow promise: evidence-backed identity/rules/relative cultural relevance, with UNKNOWN for absent facts and no operational guarantees.
2. Review the proposed one-report archive Runtime seam; its human approval and execution authorization remain separate. The complete read-only loop cannot be delegated to v0.2.0.
3. Confirm the film/tag preference interpretations and actual NYC geography policy after probes.
4. Obtain the event key and actual quotas; resolve permitted public display/export and consumer licensing before any later publication.
5. Explicitly authorize Phase 1 if the proposed scope is accepted. Do not infer approval from Phase 0's CONDITIONAL PASS.

**Go decision:** ready for human review and a separately authorized, key-first Phase 1. **No-Go decision:** no finished-product, live-integration, benchmark-improvement or judge-readiness claim. If key/coverage/rights fail, report BLOCKED or propose the documented movie-only pivot; do not silently change strategy.
