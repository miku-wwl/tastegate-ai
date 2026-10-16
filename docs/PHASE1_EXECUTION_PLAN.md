# Phase 1 execution plan — requires separate instruction

**2026-10-16. Planned, NOT STARTED.** Phase 0 does not authorize Phase 1 automatically. No commit, push, deployment, final submission or irreversible external effect is included. See [review](PHASE0_REVIEW.md), [API checklist](QLOO_API_CONTRACT.md) and [risks](RISK_REGISTER.md).

## Entry criteria

- Human reviews Phase 0 and explicitly starts Phase 1, resolving the archive-only Runtime seam and UNKNOWN/BLOCKED semantics.
- An event key is available through private server configuration, never pasted into chat/source. Confirm actual quota, concurrency, expiry and use rights; do not search unrelated workspaces for keys.
- The owner confirms a usable film/person interpretation for Wong Kar-wai and a tag interpretation or explicit partial-preference policy. Synthetic choices are not live user selections.
- Inspect current Git/local instructions again and preserve the frozen baseline. Check current official docs/rules for drift.

If the key is still missing, Phase 1 live gates stay BLOCKED. After explicit Phase 1 authorization, independently useful offline contracts/tests may proceed, but no fixture may be claimed as a real Qloo demo.

## Ordered work packages

| Step | Concrete work | Acceptance / stop condition |
| --- | --- | --- |
| 1. Installed dependency gate | Python 3.13 consumer metadata; exact full-SHA Runtime dependency; generate lock; isolated install; inspect public signatures and example | Tag peel, lock, installed 0.2.0/direct URL commit and site-packages import agree. Stop before integration code on any mismatch. |
| 2. Minimal offline scaffold | Small TypeScript project, Zod domain contracts, adapter interface, separate authored fixture adapter, Vitest; blank `.env.example`; secret/private-state ignores | Clean install + typecheck + deterministic tests. No full product UI; no guessed wire schema. Add Next.js route/UI only when it validates the slice. |
| 3. Key-first bounded probes | P01–P04; privately capture validated minimum search/tag shapes and identity/geography coverage | Correct event host/header, artist+selected film and places actually resolve; ambiguity is visible. Stop if entitlement/schema/rights insufficient. |
| 4. Taste and shortlist probes | P05–P09 as needed, with a predeclared small request ledger | Two real cross-domain examples; shortlist behavior and geography verified; explainability optional with explicit missing path. No quota-stress experiments. |
| 5. One NYC slice | Implement fixed read-only flow: audit → one discovery → revalidation → report | One real hard violation, one independent replacement, original evidence retained, partial/unknown path; <=14 Qloo dispatches, <=2 LLM calls and bounded timeout. |
| 6. Runtime consumer | One archive tool and private staged immutable reports; consumer provider/executor/store/policy; separate human approval and authorization | Actual installed public API; no core edits. Success/readback and negative/restart/Unknown tests. Do not fabricate human consent. |
| 7. Review and evidence | Update actual schemas/known fields, source date, trace metadata, test results, sample report and remaining gaps | Explicit PASS/PARTIAL/BLOCKED; no product/benchmark claim beyond evidence. Stop for human Phase 1 review. |

Installing dependencies is not proof of integration. Runtime acceptance and live Qloo feasibility are separate gates, and both must be demonstrated before an end-to-end integrated claim. If live feasibility is a No-Go, do not build an archive feature merely to create a passing framework demo.

## Secret and data setup design

Future `.env.example` names only, no credentials: `QLOO_API_KEY=`, `LLM_PROVIDER=`, `LLM_API_KEY=`. Use a fixed trusted event origin rather than a user-editable URL parameter. Keep fixture/live mode selected by the host. Capability tokens, report staging, raw response captures, Runtime gate/effect stores and private lock ownership stay outside public source and browser bundles. Never log request headers or use a CLI `--api-key` flag.

A future install/typecheck recipe must match the actual chosen package manager/lockfile; do not publish fictional runnable commands now. Proposed check families are npm locked install/typecheck/Vitest when the manifest exists, uv locked sync/package provenance checks when Python metadata exists, and real browser tests only after a UI exists. Phase 0 did not run any of these.

## Targeted test plan

| Layer | Minimum tests | Evidence |
| --- | --- | --- |
| Domain | Proven wrong city/country/type/count; unknown metadata; ambiguous identity; unsupported cultural claim; low rank without factual rejection | Deterministic expected/observed checks with authored fixtures |
| Provenance | Invented ID/reference, wrong-run evidence, mixed-mode downgrade, missing explanation, source-specific field support | No verified claim without a matching trusted record |
| REST adapter | Exact host/path/method/header/encoding; reject arbitrary authority; empty, malformed, 400/401/403/404/429/5xx and timeout | Controlled local transport; no secrets; at least one real contract check per consumed live operation |
| Loop | One repair max, 14-dispatch cap including failures/pages, reserved revalidation calls, deadline/cancellation, no retries | Counts from instrumented transport, no calls after terminal state |
| Repair | Excluded/duplicate/wrong-city/unresolved replacement, same constraints as original, common-set rank context, no slot deletion to manufacture PASS | Original findings unchanged; accepted repair has independent validation |
| Runtime | Success/persistent bytes+receipt, wrong tool/target/binding/scope, missing auth, stale approval, duplicate/concurrent/conflict, ambiguous outcome | Actual SQLite records and process restart; zero second effect after Unknown |
| Future UI | Before/after, honest pending/error/unknown, evidence links, fixture banner, no key exposure | Real Playwright browser tests after UI implementation, not simulated screenshots |

Keep extended Runtime budgets out of Phase 1. If a later reviewed use case needs >5 seconds, create the separately reviewed profile and additional acceptance specified by root AGENTS.md; never extend existing Actions/grants.

## Phase 1 Go / Pivot / No-Go

**GO:** authenticated event access, observed schemas/coverage, shortlist semantics, one real NYC repair/revalidation and second cross-domain example, all targeted safety tests, exact installed Runtime and durable archive path if that seam is approved. Explainability may be absent if the product accurately narrows its explanations.

**PIVOT PROPOSAL:** city/place coverage or cross-domain quality is insufficient but film coverage is usable. Document the failure and propose the strategy's movie-only QA scope to the human reviewer. Preserve the same evidence semantics and disclose evaluation scope changes. Do not pivot automatically.

**NO-GO:** no key/entitlement, no useful cultural signal, no reliably verifiable hard constraints/replacement, unsafe data rights, unsupported runtime integration or necessary safety failures. Return BLOCKED with actual evidence. A polished fixture UI cannot clear these gates.

Public hosting, owner license choice, full 30-case evaluation, judge access through the judging period and final Devpost submission belong to later separately authorized phases. No public deployment/commit/push is part of this plan. Stop after the Phase 1 review; Phase 2 is not automatic either.
