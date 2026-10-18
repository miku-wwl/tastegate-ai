# Phase 1B.3.3 — Versioned recovery preparation report

Preparation snapshot below precedes the separately owner-approved [single P03-R execution](PHASE1B33_P03R_EXECUTION_REPORT.md). Its zero-call/no-approval statements describe preparation, not that later authorized request. Regression results and historical preservation remain valid; executable source did not change during execution.

2026-10-19, Pacific/Auckland. **Local implementation/regression PASS; overall CONDITIONAL PASS pending exact P03-R owner approval and future independent response review.** Phase 1B.3.2 was accepted; historical P03 remains UNKNOWN / RESPONSE_TOO_LARGE. This phase issued **zero Qloo API requests**. No commit/push/deploy/Devpost change, live-adapter activation or automatic next phase occurred.

Baseline: clean main `77043b1463e3a6c7f56c5b12b035314832fe9d56`. Read AGENTS, the frozen strategy, original P03 report/private records, existing contracts/store/reader/CLI and tests. The requested Sol/High setting cannot be switched or independently verified with the available tools; no model-setting claim is made. No sub-agent was used.

## Actual changes

Added a distinct P03-R take=1 fixed profile, strict fresh approval, new summary v3, separate versioned p03r store/wrapper/CLI, and typed execution-exit mapping. The shared registry/reader/store/CLI admit only this new reviewed capture profile; P05-P10 and arbitrary URLs remain excluded. Reader threshold, raw-store cap, summary bound and printed CLI budget agree on **262144 bytes**, with overflow indicator 262145. Historical profile/schema files remain byte-identical at 64 KiB; no record, approval or failed attempt is migrated, relabeled, reset or replayed.

The new approval binds exact profile revision/cap, the accepted public venue, explicit expanded-capture acknowledgement, the original P03 oversize attempt and reviewed prior accounting. Under the global lock all prior dispatch counts are checked and every prior ID is rejected for reuse. New records carry required v3 metadata; new-ledger relabeling/version mixing fails closed. All existing profiles share the same global concurrency lock with P03-R. Native HTTPS, credential loading, 4000-ms deadline, one-dispatch budget, zero retry/redirect and private-only capture are retained.

Executed UNKNOWN now returns **exit 3**, FAIL 1, BLOCKED 2, reserved PASS 0. Preview/local preflight remain informational modes and may return 0 without execution. JSON envelopes and safe interrupted-execution error JSON remain machine-readable. Historical P03's recorded exit 0 is preserved as a historical deficiency, not overwritten. The [readiness report](PHASE1B33_P03R_READINESS.md) explains the new contract and exact gate.

The [P05 Insights plan](PHASE1B33_P05_INSIGHTS_PLAN.md) records official parameter evidence and a minimal non-executable template. A private signal identity is still unaccepted, and no P05 cap/permission/runner is inherited from P03-R. No place response mapper, ID selection, cultural affinity, Runtime SIDE_EFFECT tool or Python archive is implemented.

## Historical preservation actually checked

All **25** snapshotted original private files remain byte-identical, including the original P03 approval/checkpoint/attempt/UNKNOWN summary. Existing P01–P04 profile, checkpoint and summary schema files and thin wrappers are unchanged; frozen strategy, AGENTS, AIG pin, lockfile, search projection, disabled LiveQlooAdapter and fixture route are unchanged. Source-level reader/store extensions do not widen historical schema bounds.

| Historical probe | Current reader/checkpoint/summary validation | Durable accounting | Preserved outcome |
| --- | --- | --- | --- |
| P01 | PASS; saved raw JSON readable | 1 reserved / 1 dispatched / 0 unresolved | UNKNOWN / SCHEMA_REVIEW_REQUIRED |
| P02 | PASS; saved raw JSON readable | 1 / 1 / 0 | UNKNOWN / SCHEMA_REVIEW_REQUIRED |
| P03 v1 | PASS; no raw response expected | 1 / 1 / 0 | UNKNOWN / RESPONSE_TOO_LARGE, overflow indicator 65537 |
| P04 | PASS; saved raw JSON readable | 1 / 1 / 0 | UNKNOWN / SCHEMA_REVIEW_REQUIRED |
| P03-R | Separate new ledger readable; no approval exists | 0 / 0 / 0 | NOT EXECUTED |

The historical P03 profile/result is separately revalidated as a recovery prerequisite; reading an expired historical checkpoint does not renew its authority. No raw provider data was copied into fixtures/tests/reports or passed to a model. Aggregate status/schema/count metadata is packaged; private values and hashes stay private.

## Actual commands and observed results

Logs/results: ignored `.artifacts/phase1b33-20261018T114438Z`, included in the sanitized review package. Command timestamps are recorded in UTC; the report date uses the requested Pacific/Auckland client date. Children cleared inherited Qloo/unsafe diagnostics, overrode provider/public key values blank for validation, and disabled Next telemetry. Build reported .env.local presence but did not expose its values. No install, dependency upgrade, browser download or npm audit was performed.

| Actual command | Observed result |
| --- | --- |
| npm run typecheck | Exit 0; 7.501 s outer duration |
| npm test | Exit 0; **414 passed / 13 files**; Vitest 12.04 s, outer 13.773 s |
| npm run build | Exit 0; 10.937 s; existing page/not-found/audit routes |
| npm run test:e2e | Exit 0; **4 passed**, real local Chromium; Playwright 6.4 s, outer 8.517 s |
| git diff --check | Exit 0 after final documentation; actual log/result retained |
| node scripts/qloo-probe-p03r.mjs | Exit 0 informational preview; BLOCKED, zero dispatches, no credential loading |
| node scripts/qloo-probe-p03r.mjs --preflight-p03r | Exit 0; 1.472 s; local checks only, zero reservations/dispatches |

Added **49 authored synthetic test cases**, with all preceding 365 tests still passing. Coverage includes exact 65536/65537/262144/262145 byte boundaries, streaming overflow, old-cap non-escalation, immutable/versioned ledgers, fresh approval and prior-ID rejection, exact take=1 URL, one dispatch/no retries/redirects, cancellation/timeout/concurrency, credential reflection encodings, malformed JSON/media/UTF-8, summary-write failure and nonzero UNKNOWN JSON/exception handling. Child execution-branch tests use isolated authored modules/keys with no real checkpoint or provider HTTP; the actual project execute command was never invoked.

E2E again records 10 fixture calls, zero Qloo dispatches, zero external browser requests and zero page errors. This is local offline execution, not live/provider or public-deployment validation. Existing NO_COLOR/FORCE_COLOR warnings and npm's informational update notice are retained; no update was performed.

## Files, package and limitations

Changed source: package script, closed registry, shared raw reader/store/CLI. Added p03r-profile.ts, p03r-private-store.ts, probe-cli-contract.ts, qloo-probe-p03r.mjs and p03r-recovery.test.ts. Existing P01 local-env/P03/P04 synthetic CLI tests now copy the new reviewed modules. README and these three Phase 1B33 reports describe the final state. P02 tests/contracts and all historical reports remain unchanged.

Sanitized ZIP: `private/qloo-probes/review/phase1b33-20261018T114438Z/TasteGate_Phase1B33_Review.zip`. Contents: current public source/tests/reports, real logs/results, source revision/file hashes, safe historical-readability/integrity/ledger/preflight facts, public documentation retrieval metadata and internal SHA-256 manifest. External checksum/verification accompany it. All environment files including the example, credentials, raw Qloo responses/provider IDs/private raw hashes, checkpoints/receipts/private review extracts, full public-source bodies, caches/dependencies/virtual environments and Git internals are excluded. CRC/member hashes/current-source comparison/secret scan are verified before delivery.

256 KiB may still be insufficient, and take=1 does not ensure the right branch or one actual returned record. P03-R has no observed response schema, live identity or geography. Even valid captured JSON will remain UNKNOWN until separately reviewed. Entitlements/key rotation status remain unknown; larger private capture requires fresh explicit consent. P05 requires separate accepted input, fixed-profile work and authorization. No installed Runtime acceptance is claimed; this product-owned read-only probe does not bypass or reimplement AIG SIDE_EFFECT mechanisms. No new AGENTS conflict was introduced.

**STOP at the exact P03-R owner gate.** Proposed attempt `4a3bc272-29d7-4e29-aee5-1cef45caaff2` is unreserved and unapproved; no checkpoint/receipt exists. Preserve all unsuccessful/ambiguous history. No P03-R/P05 call, P01–P04 repeat, commit/push, deployment, Devpost mutation or next-phase transition is authorized by this preparation.
