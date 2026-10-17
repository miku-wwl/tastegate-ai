# Phase 1B.2 — P01 corrections and execution review

2026-10-17, Pacific/Auckland. **CONDITIONAL PASS after the approved P01.** Exactly **1** live dispatch returned **HTTP 200**. Authentication/request acceptance and basic artist-search shape checks passed. Provider semantics beyond this sample and independent identity review remain pending. The semantic LiveQlooAdapter stays disabled.

Baseline HEAD: `7d79c15a9b05b7f2808267fdb4497cafdf939d02`; 14 current source/documentation paths remain uncommitted. Before dispatch, all 65 source files exactly matched the reviewed pre-approval ZIP (SHA-256 `66effbd686e5127a82c5b5f9d5c50bf4fd28e17b99c1cbc255f7598c83a1daff`). No executable source was changed in the approved execution turn.

## Review findings resolved

| Finding | Correction and actual boundary |
| --- | --- |
| F1 — local env integration | New `p01-local-env.ts` uses Node's built-in `util.parseEnv` inside local Node for the fixed ignored `.env.local`, only on explicit preflight/execution. It selects server Qloo settings, gives process env precedence, performs no expansion/evaluation, installs no dotenv options into `process.env`, rejects links/oversize/untracked-ignore failures, public keys, unsafe host and diagnostics. No-argument CLI previews without reading secrets. |
| F2 — over-strict checkpoint | Strict checkpoint revision v2 requires exposure-risk acknowledgment, original-event-key basis, request/host/rights/private-access review and fresh P01-only approval. Numeric entitlement fields may be explicit `UNKNOWN`; known zero/invalid/expired values still fail. No revocation/replacement fact is asserted. Approval binds one attempt ID and expires within 15 minutes. Old v1/extra fields do not authorize dispatch. |
| F3 — durable per-approval attempts | Each unique approved UUID has an exclusive private directory and immutable reservation/summary. Checkpoint binds the exact previous ID and prior reservation count; ledger verifies the chain and reports reserved/observed/unresolved budgets. A cross-process exclusive active lock prevents overlap. Settled, durably summarized failures permit a later separately approved ID. Old IDs, stale accounting, incomplete/unsettled attempts and legacy markers block; there is no force/reset/replay path. |

The ledger is a small trusted local operator mechanism for one read-only probe, not an authenticated approval service or a substitute for AIG SIDE_EFFECT authorization. Owner assertions and host/clock/filesystem integrity remain trusted. A changed/copied private file cannot establish genuine human consent; the operator must only write it following actual approval. Crash/interruption recovery is deliberately fail-closed and needs review; automatic stale-lock removal is not implemented.

Response summaries now bind attempt ID, measured request/body outcome elapsed milliseconds and transport-settlement state. Body size is measured while reading accepted responses; error/redirect bodies are discarded, with size `null` rather than a fabricated measurement. Oversize reading records a capped 65537-byte lower-bound sentinel and never saves the body. Raw syntax success remains UNKNOWN until independent semantic review. No provider mapper was added.


## Official request and policy verification

Re-read the [event developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide), [Search reference](https://docs.qloo.com/reference/get-search), [official Search mirror](https://raw.githubusercontent.com/qloo/docs-public/main/reference/get-search.md), [Kit access policy](https://github.com/qloo/qloo-hackathon-kit/blob/main/docs/API_ACCESS.md), and [safe-use policy](https://github.com/qloo/qloo-hackathon-kit/blob/main/docs/SAFE_USE.md) on 2026-10-17. Direct public documentation retrieval returned HTTP 200 for all five; timestamps/hashes are recorded. The web reader could not open the two ReadMe-hosted pages; direct TLS-verified documentation retrieval supplied their content. These were public documentation reads, not Qloo API requests.

The event guide specifies the hackathon origin and X-Api-Key header, permits private server caching, prohibits public repository storage of provider data, and gives only general event limit/validity guidance. Exact participant quota, rate/concurrency and expiry remain UNKNOWN. The Kit asks organizers to publish precise limits; none was established here. The owner explicitly permits considering one conservative request with these unknowns, without claiming rotation or unlimited access. Honor observed entitlement/rate errors immediately; no retry.

The Search operation's embedded `get-search` request schema confirms query text, a form/non-exploded `types` array containing `urn:entity:artist`, page 1 and take 5. A single URN serializes as the approved `types=urn%3Aentity%3Aartist`. The visible mirror describes take 1–100, while the live page's embedded schema uses an exclusive maximum of 200; take 5 is within both. No larger range is inferred for this probe. No response fields are inferred from request docs.

Only the fixed public artist query is sent; no personal user data or sensitive-trait input. No harness/chat/explore/plan/build/integrate/MCP work was run. The owner's narrower organizer-mode restriction remains in force.


## Actual approval, one execution and private review

The owner explicitly confirmed the original organizer event credential, accepted the disclosed exposure/UNKNOWN-entitlement risks and approved only attempt `ed655afc-82d7-4efd-ba99-9f55bd031f27`. The latest non-network preflight again found valid local configuration and **0 reserved / 0 dispatched / 0 unresolved**. Private evidence ACL remained owner-only (0 other-identity allow rules); checkpoint and active lock were absent.

The private v2 checkpoint/approval receipt was created only after that response. Local registration: **2026-10-17T09:36:25.209Z**; exclusive reservation: **09:36:26.625Z**. These are local record times, not a claimed human click timestamp. The credential itself was loaded only inside local Node, never copied from chat or printed. A child-only `QLOO_MODE=live` override selected the probe; the private env file was not modified.

```text
GET https://hackathon.api.qloo.com/search?query=Radiohead&types=urn%3Aentity%3Aartist&take=5&page=1
Maximum/actual dispatches: 1 / 1. One in flight; zero retries or redirect follows.
Deadline <=4000 ms through response reading; capture cap 65536 bytes.
Private evidence: private/qloo-probes/p01/attempts/ed655afc-82d7-4efd-ba99-9f55bd031f27/
```

Actual **HTTP 200**, **10391 bytes**, **936.452 ms** request/body outcome elapsed; **2.614 s** whole CLI child-process duration; CLI exit **0**. The elapsed request measurement includes local parse/reflection work and is not provider-only processing time. Raw JSON and durable summary were saved privately; transport settled. No cancellation, timeout, second request, retry, redirect follow, fallback or subsequent probe occurred.

The runner's immutable summary remains **UNKNOWN / SCHEMA_REVIEW_REQUIRED / NOT_REVIEWED**. Separate local post-run checks found `$.results` with 5 distinct nonempty IDs, names and artist-type arrays, including exactly one Radiohead label/type/ID match in the returned set. This supports a **limited PASS for request acceptance/basic artist lookup**, not semantic audit evidence or independently verified catalog identity. `tags` was omitted on 4/5 entities; no pagination metadata was present. Detailed actual paths/missingness are in [raw observations](PHASE1B2_RAW_SCHEMA_OBSERVATIONS.md).

Only structural keys/types/counts and comparison booleans were emitted from local raw inspection. No provider entity payload, ID, URL or description was sent to an LLM, copied into public fixtures or included in the review ZIP. A private integrity hash and supplemental review preserve linkage without mutating the original attempt/summary.

Post-run ledger verification: **1 reserved / 1 dispatch / 0 unresolved / conservative upper bound 1**. The active lock was released after the settled durable summary; the attempt was retained. All 9 recorded execution source hashes still match the current files, and source HEAD matches the baseline. Authorization is consumed; another request requires fresh explicit approval and reviewed accounting.

## Actual commands and results

Node v26.5.0 / npm 12.0.1. Evidence directory: ignored `.artifacts/p01-enable-20261017T091215Z/`.

| Actually executed command | Exit and observed result |
| --- | --- |
| `npm run typecheck` | 0; final source, 8.353s outer duration |
| `npm test` | 0; **200 passed / 0 failed**, 8 files; Vitest 10.72s, 13.007s outer duration |
| `npm run build` | 0; final production build, 9.350s outer duration; existing three routes only |
| `npm run test:e2e` | 0; **4 passed / 0 failed**, actual local Chromium against production server; Playwright 6.6s, 8.761s outer duration |
| `git diff --check` | 0; no whitespace errors; Git's LF/CRLF notices retained |
| `node --check scripts/qloo-probe.mjs` | 0 |
| `npm ls --depth=0 --json` | 0; installed direct versions match package/lockfile, unchanged lockfile hash |
| `npm run probe:p01` | 0; BLOCKED preview, no credential loading/reservation/dispatch |
| `node scripts/qloo-probe.mjs --preflight-p01` with inherited configuration | 2; fixture mode correctly blocked, credential presence true, no dispatch |
| Same non-network preflight with explicit child-only `QLOO_MODE=live` | 0; READY_FOR_HUMAN_APPROVAL, zero reservations/dispatches |
| `python .artifacts/p01-enable-20261017T091215Z/final-checks.py` | 0; 65 public source files / 14 changed paths; protected hashes, empty index, installed versions, ignored private paths, blank example keys, relative documentation links, client-bundle and secret-pattern checks passed |

Desktop/mobile screenshots were visually inspected and retain conspicuous synthetic labels and zero Qloo calls. Actual browser evidence reports no external requests or page errors; port 3100 was closed after the test server stopped. The private evidence root has inheritance disabled and **0** other-identity allow rules. Before approval, checkpoint, active lock, legacy marker and attempt-directory counts were all absent/zero; the post-run ledger now records one preserved attempt and one dispatch. Pattern scans are bounded checks, not proof against every unknown secret format.

Validation subprocesses used empty credential/public-Qloo overrides and disabled unsafe diagnostic hooks; no private credential values were recorded. Real credentials were loaded only inside local Node for preflight and the approved execution. Historical 185/4 results were not presented as new validation. Initial development typecheck failed on the Node parseEnv dictionary type, and the first tests had 4 failures (194 passes) because the new diagnostic guard correctly rejected Vitest's trusted preload in the unit process. Tests now isolate those bootstrap arguments while preserving the production guard, with a dedicated unsafe-argument test. The first log wrapper also hit Windows GBK display encoding; UTF-8 logging/output was corrected. Original failed logs are retained.

Dependencies/lockfile were not changed; no npm install, upgrade, vulnerability audit or new browser installation was performed in this correction. Build and browser evidence remain local, with a harmless NO_COLOR/FORCE_COLOR warning preserved.


The 200/4 regression results above were actually executed during the preceding offline correction stage of this same Phase 1B.2 task. They were not rerun in the execution-only turn; reviewed executable source is unchanged.

| Additional actual command | Observed result |
| --- | --- |
| `python .artifacts/p01-enable-20261017T091215Z/run-preflight.py` | exit 0; repeat non-network check before reservation; 0 dispatches |
| `python .artifacts/p01-enable-20261017T091215Z/run-approved-p01.py` -> `node scripts/qloo-probe.mjs --execute-p01` | wrapper/CLI exit 0; exactly one approved dispatch, HTTP 200, 10391 bytes, 936.452 ms |
| `node .artifacts/p01-enable-20261017T091215Z/inspect-p01-structure.mjs` | exit 0; private raw integrity record + sanitized structure only; no HTTP request |
| `node .artifacts/p01-enable-20261017T091215Z/review-p01-fields.mjs` | exit 0; aggregate field/missingness/query-match review; no HTTP request |
| `node .artifacts/p01-enable-20261017T091215Z/post-p01-ledger.mjs` | exit 0; preserved 1/1/0 ledger and 9 source hashes verified; no HTTP request |

## Scope, remaining limits and next-probe recommendation

Changed paths remain the same 14 reviewed correction paths: `.env.example`, `README.md`; `scripts/qloo-probe.mjs`; `src/qloo/p01-profile.ts`, `p01-local-env.ts`, `p01-runner.ts`, `p01-private-store.ts`; `tests/p01-probe.test.ts`, `p01-local-env.test.ts`; `docs/PHASE1B1_SECURE_PROBE_READINESS.md`, `PHASE1B_LIVE_PROBE_PLAN.md`, `PHASE1B2_P01_LIVE_PROBE_REPORT.md`, `PHASE1B2_RAW_SCHEMA_OBSERVATIONS.md`, and this review. Only reports/README/plan status changed after execution.

AGENTS, frozen strategy, pinned AIG dependency, accepted domain/audit/repair/fixture modules, disabled LiveQlooAdapter and package lock are unchanged. The owner separately authorized this product-owned read-only request. No Runtime archive/integration or Agent/MCP authorization mechanism was implemented or bypassed.

Authentication outcome is limited to acceptance of this configured credential for this one request at the expected host. No missing-key/invalid-key negative control, key rotation/revocation, remaining quota/rate/concurrency/expiry or wider entitlement was established. Unknown values remain UNKNOWN. Error semantics, pagination, movies/places/tags/Insights, geography, affinity meaning, explanations and public-demo rights/readiness are not established by P01.

P02-P04 recommendation: **NOT READY for execution; prepare only after independent review.** P02 can use the observed Search shape as a sample, but still needs independent artist identity review, a human-selected film and fresh approval. P03 requires reviewed venue controls and actual geography. P04 requires its own approved concept/tag-search probe; tags attached to one search entity do not substitute for it. No P02-P10 executable path or consent was added.

## Sanitized delivery and stopping point

Post-execution review ZIP: `private/qloo-probes/review/phase1b2-p01-result-20261017T093627Z/TasteGate_Phase1B2_P01_Review.zip`, with external SHA-256 sidecar and internal per-file manifest. It contains current source/tests/reports/configuration, actual sanitized commands/results, offline browser evidence and safe live structure/count observations. It excludes private env, checkpoints, approval-receipt/attempt records, raw provider bodies, authorization header values, dependencies, caches and Git internals. The earlier pre-approval ZIP is preserved.

The first post-run packaging command exited 1 before creating an archive because its exclusive-directory guard encountered the existing pre-approval folder. The destination was corrected to the separate result folder above; no old package was overwritten and no Qloo request was repeated.

**STOP after the one approved P01 for independent review.** No P02-P10, semantic live adapter enablement, deployment, Runtime archive, Devpost edit, commit or push occurred.
