# Phase 1B.3 — P02–P04 controlled-probe readiness

2026-10-18, Pacific/Auckland. **CONDITIONAL PASS after the separately approved single P02; STOP for independent review.** The owner confirmed In the Mood for Love (2000, Wong Kar Wai) and approved only attempt 14d95fe4-126a-4941-a7a1-6dbdd8e26684. It returned HTTP 200, 55317 bytes, 1215.599 ms, with one dispatch and zero retries. The immutable summary remains UNKNOWN / SCHEMA_REVIEW_REQUIRED. No P01 repeat, P03/P04, adapter enablement, deployment, Devpost change, commit or push occurred.

## Execution addendum

See [actual P02 execution and observations](PHASE1B3_P02_EXECUTION_REPORT.md). All 79 public source files matched the reviewed preparation ZIP before dispatch; the 18 recorded execution-source files remain unchanged. Seven original P01 private files remain unchanged.

The five movie results have distinct IDs and movie types. One candidate matches the confirmed title and observed release_year 2000, but no independent director/external identity link is established and no ID is selected. All 437 attached tag items omit value, so the P01-derived strict projection **rejects this response for review**. No automatic schema change, retry or semantic PASS followed. P01 and P02 each have one reserved / one dispatched / zero unresolved; P02 consent is consumed.

Post-execution sanitized ZIP: private/qloo-probes/review/phase1b3-p02-result-20261017T204511Z/TasteGate_Phase1B3_P02_Review.zip. The original preparation ZIP remains preserved. The 247-unit/4-browser passing results below belong to the preceding preparation stage; they were not rerun or recounted as new tests in this execution-only turn. Executable source did not change.

## Preparation snapshot retained below

The remaining sections record the **pre-approval preparation state**, including then-pending film selection, absent checkpoint and zero P02 calls. They are historical findings, not current approval/accounting. The exact original bytes are preserved in the preparation review ZIP. At that stopping point P01's limited acceptance stood, and no new Qloo request had been issued.

## Reviewed baseline and P01 closure

Read AGENTS.md, the frozen strategy v1.0, all three PHASE1B2 reports, the existing runner/profile/config/local-env/store/checkpoint/receipt and related tests. Initial Git state was clean main at **4b6b4fe3b63a8773dd00ebcf37b5e9ab9643c41c**. The final implementation is an uncommitted working-tree patch on that revision; HEAD alone does not identify these new bytes. The review ZIP supplies per-file hashes and the changed-path list.

Seven original private P01 files (five attempt artifacts, expired checkpoint and approval receipt) were hash-snapshotted privately and verified unchanged. Raw provider hashes/contents remain excluded from the package. The original source manifest remains historical and is not rewritten to claim that P01 ran this later refactor.

| Actually observed from saved P01 | Limited conclusion / unresolved inference |
| --- | --- |
| One approved dispatch, HTTP 200, 10391 bytes, 936.452 ms request/body outcome | Request accepted/basic artist lookup; not all-endpoint authentication enforcement or quota/expiry proof |
| results array, five distinct nonempty IDs, names and artist types | Observed sample, not a universal response contract; UUID shape is not a new provider requirement |
| One exact Radiohead label/type/ID match within the five | No automatic ID selection; independent catalog identity/aliases remain pending |
| Numeric popularity on all five | No cultural-affinity, probability or scale interpretation |
| tags on one result, omitted on four | Optional in the local projection; no requirement that every result carry tags |
| Only top-level results, no pagination metadata | No total/exhaustion/next-page inference |
| Attached tags inspected on one artist | No P04 endpoint response or guaranteed tag taxonomy/meaning |

The immutable summary remains UNKNOWN / SCHEMA_REVIEW_REQUIRED / NOT_REVIEWED. Human acceptance is a **separate limited review**, not an overwrite or semantic PASS. No raw entity, provider ID, description, external URL or tag value is exported. See the unchanged [P01 observations](PHASE1B2_RAW_SCHEMA_OBSERVATIONS.md).

## Prepared probes and source verification

- [P02](PHASE1B3_P02_ENTITY_RESOLUTION.md): suggested In the Mood for Love (2000), Wong Kar Wai. **Not human-confirmed.** Fixed movie search; reuse saved Radiohead locally, no artist request. The suggested attempt 14d95fe4-126a-4941-a7a1-6dbdd8e26684 is a proposal only: no reservation/checkpoint/approval exists.
- [P03](PHASE1B3_P03_NYC_CONTROLS.md): independently sourced Blue Note New York, Blue Note Tokyo and ambiguous Blue Note controls. No invented IDs/addresses/coordinates. Actual provider geography paths and branch links remain unknown. Documentation only; no executable profile.
- [P04](PHASE1B3_P04_TAG_PROBE_PLAN.md): GET /v2/tags with filter.query=jazz, take=5, page=1. Type/name/meaning/ID remain distinct. Documentation only; artist attachments do not substitute for endpoint evidence.

Revisited [event guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide), [Search](https://docs.qloo.com/reference/get-search), [Tags](https://docs.qloo.com/reference/get-tags) and [official Tags mirror](https://raw.githubusercontent.com/qloo/docs-public/main/reference/get-tags.md). Direct public-document retrieval returned HTTP 200 for those four pages. Inspected the actual embedded get-search/get-tags request operations, not guessed SDK signatures. The guide supplies event origin/header; exact participant quota/rate/concurrency/expiry remain UNKNOWN. The documented search take range differs between the visible mirror and embedded schema; take 5 is valid in both, without extrapolation.

Independently reviewed [Criterion film identity](https://www.criterion.com/films/198-in-the-mood-for-love), [New York venue](https://www.bluenotejazz.com/nyc/contact/) and [Tokyo venue](https://www.bluenote.co.jp/jp/access/). Venue direct retrievals returned 200. Direct film retrieval raised HTTPError; the web reader successfully opened the official film page instead. Public retrieval times/statuses/hashes and compact parameter projections are packaged. No authenticated API, form submission or venue booking occurred.

## Secure infrastructure changes

The existing native HTTPS engine and private durable store were moved into shared raw-probe-runner.ts / raw-probe-store.ts, with thin P01-compatible wrappers. The CLI compiler/preflight logic is shared once. A closed registry accepts **only P01/P02**, exact origins/paths/queries; no unrestricted HTTP method, host, header, URL or transport injection is exposed for live execution.

P02 has its own strict profile/checkpoint/summary, approval literal, UUID and ledger. P01 consent cannot authorize it. A P02 checkpoint additionally requires film confirmation, saved P01 integrity binding and reviewed P01 dispatch count. The store rechecks saved P01 evidence and ledger before reserving. Existing P01 paths/schema/records stay compatible.

A new exclusive root lock serializes P01/P02 across local processes; per-probe locks also remain and legacy locks block. Every reservation records prior accounting/source bytes before dispatch. Incomplete/unsettled records retain locks; no force/reset/cleanup/replay is implemented. A reservation consumes that attempt even if dispatch never occurs. New attempts always need fresh review/approval.

All existing timeout, cancellation, bounded-body, UTF-8/JSON/media-type, credential-reflection, TLS, unsafe-diagnostics, private-env and no-retry protections remain. Live transport permits at most one request per approved attempt, <=4000 ms through response reading and <=65536 bytes; redirects are rejected. Process startup/durable I/O are outside that timer. Summary syntax acceptance never means semantic PASS.

The strict local search observation projection validates observed identity fields/types/uniqueness and optional known fields; unknown fields remain private and uninterpreted. It returns no chosen ID, year/director mapping, affinity or pagination interpretation. Movie schema/identity still require actual later capture and independent review. Public documentation facts, raw observations, human confirmation and semantic findings remain separate.

The trusted local checkpoint/ledger is not authenticated multi-user consent, malicious-host isolation, a general workflow engine or AIG SIDE_EFFECT authorization. AGENTS, frozen strategy, exact AIG pin, fixture route and disabled LiveQlooAdapter are unchanged. Current explicit instructions separately authorize this product-owned read-only preparation. No Python Runtime/archive integration is attempted, and installed Runtime acceptance is **NOT RUN / not claimed**; it remains for a separately approved SIDE_EFFECT integration.

## Actual validation and local evidence

Node v26.5.0 / npm 12.0.1. Logs/results are in ignored .artifacts/phase1b3-20261017T195251Z and copied into the review ZIP. Validation child processes used empty credential/public-key overrides, disabled unsafe diagnostics and NEXT_TELEMETRY_DISABLED=1. Build reported the presence of .env.local; its secret values were overridden, never printed. No dependency install/upgrade, npm audit or browser install was performed.

| Actually executed command | Observed result |
| --- | --- |
| npm run typecheck | Exit 0; 5.278 s outer duration |
| npm test | Exit 0; **247 passed / 0 failed**, 9 files; Vitest 8.66 s, outer 10.387 s |
| npm run build | Exit 0; outer 10.904 s; existing page/not-found/audit routes only |
| npm run test:e2e | Exit 0; **4 passed**, real local Chromium against production build; Playwright 7.6 s, outer 9.868 s |
| git diff --check | Exit 0; final documentation check also recorded; LF/CRLF notices are retained |
| npm ls --depth=0 --json | Exit 0; installed direct versions match manifest/lockfile; lockfile hash unchanged |
| node --check scripts/probe-cli.mjs | Exit 0 |
| node scripts/qloo-probe-p02.mjs --preflight-p02, child-only QLOO_MODE=live | Exit 0; READY_FOR_HUMAN_APPROVAL, **0 dispatch / 0 reservation**, saved P01 integrity checked; no approval granted |

All previous 200 tests passed after extraction. Added 47 synthetic tests cover separate approval/film confirmation, stale/wrong profiles, exact movie request, one-call/no-retry behavior, redirects/errors/body/reflection/timeout, strict identity/type/ID validation, absent tags, rank ambiguity, popularity invariance, private P01 integrity, separate durable ledgers and cross-probe/legacy locks. Entity IDs with surrounding whitespace are rejected rather than silently rewritten. Authored test records claiming a provider-shaped historical response exist only in ignored temporary test roots; they are not live evidence.

Development checks were not all initially green: adding tests produced typecheck errors for a zero-argument mock's call typing and Vitest parameter-table typing; both were corrected. The first expanded test run had **244 pass / 1 fail**, because a five-process CLI smoke test exceeded Vitest's default 5-second test timeout. Its local test timeout is now 15 seconds; the production 4-second network cap is unchanged. Per-process unique compiler directories also prevent concurrent preview processes reading partially written modules. Final captured checks above passed.

An initial packaging assertion incorrectly expected the deliberately prohibited public credential variable to be declared in .env.example. The check now permits absence or an empty value; no credential field was added. Final static checks also compare manifest/lock/installed dependencies, relative documentation links and whitespace in new untracked files. Final secret checks found no configured-secret literal/encoding or high-confidence secret pattern in public source, selected evidence or client bundles. These bounded checks are not a universal secret-detection guarantee.

The unchanged browser suite exercised partial UNKNOWN, successful wrong-city repair, rejected replacement, strict HTTP input and mobile layout. Saved synthetic E2E report records **10 fixture calls / 0 Qloo dispatches / zero external browser requests / zero page errors**. Desktop/mobile screenshots were visually inspected and remain visibly synthetic. This proves a local offline slice only, not live Qloo movie/place/tag behavior. The existing NO_COLOR/FORCE_COLOR warning is harmless and retained.

Final private check: P01 remains **1 reserved / 1 dispatch / 0 unresolved**; P02 **0 / 0 / 0**. No active lock or P02 checkpoint exists. Seven original private files and all protected public hashes are unchanged. Private evidence root has inheritance disabled; current operator is the only allow identity on root and the new inherited private directories (0 other-identity allow rules).

## Changed files and review package

- .env.example, README.md and package.json (comments/status; one P02 command, no dependency change; example keys stay blank).
- scripts/qloo-probe.mjs, probe-cli.mjs, qloo-probe-p02.mjs.
- src/qloo/p01-profile.ts, p01-runner.ts, p01-private-store.ts, p01-reuse.ts, p02-profile.ts, p02-private-store.ts, probe-definitions.ts, raw-probe-runner.ts, raw-probe-store.ts, search-observation.ts.
- tests/p01-local-env.test.ts and p02-preparation.test.ts.
- This readiness report and PHASE1B3_P02_ENTITY_RESOLUTION.md, PHASE1B3_P03_NYC_CONTROLS.md, PHASE1B3_P04_TAG_PROBE_PLAN.md.

Sanitized review ZIP: private/qloo-probes/review/phase1b3-20261017T200401Z/TasteGate_Phase1B3_Review.zip. It includes current public source/tests/docs/config, actual final logs/results, safe P01 counts, source revision plus uncommitted-file hashes, public-source request verification and a per-file evidence manifest. Secrets/private env, checkpoints, approval receipts, raw provider responses/hashes/IDs, private state, dependencies, caches, virtual environments and Git internals are excluded. The archive has an internal SHA-256 manifest and an external checksum sidecar; current-file agreement and ZIP integrity are verified. Historical review packages remain untouched.

## Remaining gates and stopping point

Film selection and fresh P02-only operation approval are pending. Credential exposure/rotation status and exact event limits/expiry remain unresolved. Movie response fields/identity, provider geography, tags endpoint shape/meaning, Insights affinity and pagination/error semantics remain unverified. No general live adapter or trusted semantic evidence can be enabled from these preparations.

Before any P02 request, verify execution source still matches the reviewed package, present exact query parameters, proposed film, one-call/4-second/64-KiB/no-retry limits and private destination, then obtain explicit human confirmation/approval. No P03/P04 batch or later probes are included. **Stop now for human review; no automatic next phase.**
