# Phase 1B.4 — First cross-domain Insights probe readiness

Preparation snapshot: the owner subsequently approved the single P05 attempt. See the [actual execution report](PHASE1B4_P05_EXECUTION_REPORT.md) for HTTP 200, private capture, UNKNOWN/exit 3 and consumed consent. Unapproved/zero-call statements below describe preparation, not that later request.

2026-10-19, Pacific/Auckland. **READY FOR P05-ONLY OWNER REVIEW; NOT APPROVED; ZERO P05 REQUESTS. Phase 1B remains CONDITIONAL PASS.** This phase reviewed saved evidence and prepared a fixed experiment. It did not establish live Insights support or recommendation quality.

Baseline: clean `main`, `32ed02575b3883ca004ff9fcc80cdb1c8f8d0e14`. Read AGENTS, frozen strategy, all four Phase 1B.3.3 reports, original P01/P03-R evidence and existing modules/tests. No unrelated changes existed. AGENTS, frozen strategy, dependency/lockfile pins, old profile/schema files, original reports, fixture route and disabled adapter remain unchanged. No Runtime integration/acceptance is claimed; this consumer-owned bounded read-only probe is within this task's authorization and introduces no new AGENTS conflict.

## Verified documentation and exact scope

The official [Insights Deep Dive](https://raw.githubusercontent.com/qloo/docs-public/main/reference/insights-api-deep-dive.md) documents GET `/v2/insights`, required `filter.type`, a comma-separated GET list of entity IDs for `signal.interests.entities`, and `take` from 1–50. The [Place parameter guide](https://raw.githubusercontent.com/qloo/docs-public/main/reference/available-parameters-by-entity-type.md#place) lists the signal and take for Place results. Both were retrieved directly with HTTP 200. ReadMe-hosted docs and a proposed hackathon-guide mirror path were unavailable; they were not substituted with assumptions. The official kit README was retrieved but does not itself document the event host. The strict event host is retained from the previously approved and observed P01–P04/P03-R configuration.

```text
GET https://hackathon.api.qloo.com/v2/insights
filter.type=urn:entity:place
signal.interests.entities=<EXACT_PRIVATE_ACCEPTED_RADIOHEAD_ENTITY_ID>
take=1
```

The displayed marker protects the private provider ID; it is never sent to Qloo. This is an exact three-parameter profile bound to the [accepted private Radiohead review](PHASE1B4_RADIOHEAD_IDENTITY_REVIEW.md), not a free-form template accepting any artist ID. The owner can inspect the **actual encoded URL and ID locally** in `private/qloo-probes/p05-request.private.json`. That proposal contains no credential and grants no authority. The request adds no page, tags, demographics, personal information, location/candidate filter, weights or explainability flag. Extra/changed keys, host, path, result type, signal or budget fail validation.

This single observation asks whether the accepted artist signal produces a capturable Place-domain Insights response. HTTP 200 or valid JSON cannot prove that the signal was used, that returned items are valid places, NYC suitability, a counterfactual improvement, causality, explainability or an individual's preference probability. Any result stays UNKNOWN / SCHEMA_REVIEW_REQUIRED / NOT_REVIEWED until a separate actual response review. No guessed Insights response projection was implemented.

## Independent profile, privacy and execution gates

Profile `tastegate.p05.radiohead-to-place.capture-256k.v1`; proposed attempt **154bd4c0-ea64-49c5-ad95-cb57efd7647a**. Destination:

```text
private/qloo-probes/p05/attempts/154bd4c0-ea64-49c5-ad95-cb57efd7647a/
```

Budget: **one HTTP dispatch, one in flight, 4000-ms request/body deadline, 262144-byte (256 KiB) capture threshold, zero automatic retries and redirect follows**. This is an explicit P05 budget decision, not inherited P03-R permission. The first result's shape/size are unknown; the cap bounds accepted metadata while allowing a single detailed place sample. Overflow aborts without persisting a partial body and records capped sentinel 262145, not full transfer size. A crossing chunk/additional processing can consume more memory/network bytes; capture and whole-CLI completion are not guaranteed. Startup, durable reservation and private persistence are outside the request/body timer.

P05 requires a separate strict checkpoint with `APPROVE_P05_RADIOHEAD_TO_PLACE_ONLY`, a new UUIDv4, short fresh validity window, exact private signal/review/raw hash binding, reviewed cap/timeout and explicit acknowledgement of unreviewed semantics/no extra parameters. Only the first P05 reservation is allowed by this profile. Old approvals and altered/copied signal bindings cannot authorize it. No checkpoint, approval receipt or reserved attempt exists now.

The existing native HTTPS path, credential loader, immutable private writes and global concurrency lock are reused; no unrestricted HTTP/Insights client or browser route was added. Before reservation and again under the global lock the accepted review is revalidated; all five historical ledgers must each remain 1 reservation / 1 dispatch / 0 unresolved, and their IDs cannot be reused. P05 records/summaries use new v4 contracts; v2/v3 history is read without migration. Ambiguous/unsettled transport retains the blocking lock. Errors, timeout and cancellation stop without automatic replay or next page. Public JSON hides the private signal/hash/URL; request/checkpoint details stay private. Existing execution exit codes remain FAIL 1, BLOCKED 2, UNKNOWN 3; unreviewed semantic PASS is forbidden.

Credential exposure may have occurred previously; rotation/revocation is unconfirmed. Exact remaining quota, rate, provider concurrency limit, expiry and live Insights entitlement remain UNKNOWN. Fresh approval must accept these disclosed uncertainties and private capture using the locally held original event key. No credential is requested in chat. Readiness/preflight is neither permission nor proof of provider acceptance.

## Actual validation and retained failures

Actual logs/results use UTC timestamps in ignored `.artifacts/phase1b4-*` and are included in the review ZIP. No install, upgrade, browser download, npm audit, commit, push, deployment or Devpost operation occurred. Validation children cleared inherited provider/unsafe diagnostics and blanked keys, with telemetry disabled. Next reports `.env.local` presence but no values. The inspector remains fixture-only even under the browser test's authored live canary.

| Command actually executed | Final observed result |
| --- | --- |
| `npm run typecheck` | Exit 0; 4.235 s |
| `npm test` | Exit 0; **455 passed / 14 files**, Vitest 11.93 s, outer 13.363 s |
| `npm run build` | Exit 0; 10.776 s; existing page/not-found/audit routes only |
| `npm run test:e2e` | Exit 0; **4 passed**, real local Chromium, Playwright 6.7 s, outer 8.775 s |
| `git diff --check` | Exit 0; actual final log/result packaged |
| `node scripts/qloo-probe-p05.mjs` | Informational exit 0; BLOCKED / CHECKPOINT_REQUIRED, zero dispatches; no credential load |
| `node scripts/qloo-probe-p05.mjs --preflight-p05` | Exit 0; 1.444 s; READY_FOR_HUMAN_APPROVAL, zero reservations/dispatches; no consent granted |

There are **41 new authored synthetic tests**, alongside the previous 414. They cover missing/rejected identity, ID/type/hash mismatch, no automatic selection, arbitrary binding rejection, unsupported parameters/host/profile, fresh exact consent, private historical-ledger preservation and reused-ID denial, v4 isolation, one dispatch, cap boundaries, timeout/cancellation/concurrency, HTTP/network failures, no retries, credential reflection and safe CLI output. Child CLI execution refusal tests use isolated synthetic roots without checkpoints; the real project's P05 execute command was never invoked.

Retained unsuccessful checks: an npm argument-forwarding attempt was rejected before Vitest; the direct targeted Node command then passed 39 tests. Initial typecheck found one test-only string/number narrowing error, corrected before successful checks. The first full suite had 453 pass / 2 fail because old tests still excluded newly authorized P05 from the registry; those assertions were narrowed to P06–P10 and all 455 then passed. Default fixture-mode preflight correctly returned exit 2 / LIVE_MODE_REQUIRED. The successful local preflight used **process-only** QLOO_MODE=live and timeout=4000, reading the private key without printing it or changing environment files. NO_COLOR/FORCE_COLOR warnings remain in the logs; no update was performed.

Browser evidence records 10 fixture calls, zero Qloo dispatches, zero external browser requests and zero page errors for the instrumented scenario. This is offline local E2E, not live Insights or public deployment validation. All 30 historical private files remain byte-identical and the five original ledgers remain readable. Original P03 v1 remains UNKNOWN / RESPONSE_TOO_LARGE; P03-R's original captured UNKNOWN result is preserved. The [place review](PHASE1B4_P03R_IDENTITY_REVIEW.md) is a separate corroboration judgment and does not promote its ID into the application.

## Files and review package

Added `src/qloo/p05-profile.ts`, `src/qloo/p05-signal.ts`, `scripts/qloo-probe-p05.mjs`, `tests/p05-preparation.test.ts` and these three Phase 1B4 reports. Updated the closed registry/shared runner/store/CLI, package script, README, and synthetic CLI-copy/registry expectations in five existing test files. No Next UI/route, live adapter, historical schema/report, lockfile, strategy or AGENTS edits.

`TasteGate_Phase1B4_Review.zip` contains current public source/tests/configuration/reports, actual successful and unsuccessful safe logs, local browser evidence, source revision/public file hashes, public retrieval metadata, sanitized comparison/ledger/integrity facts and a manifest. Private identity review/actual request URL, raw Qloo data/provider IDs/private hashes, checkpoints/receipts/keys, all environment files including the example, full downloaded public pages, caches/dependencies/virtual environments and Git internals are excluded. ZIP checksum, CRC, member hashes, current-source equality, privacy scan and private ACL checks are verified separately. Independent inspection of exact private bindings requires local owner access.

**STOP before P05 HTTP.** Owner approval must be P05-only, for this exact private signal and three-parameter request, attempt, budget and destination. It does not authorize P06–P10, earlier probe repeats, another P05 attempt, alternate filters, ID promotion, live-adapter enablement, submission, commit/push, deployment or Devpost changes. Unknown/error outcomes must be retained. Phase 1B remains CONDITIONAL PASS pending exact owner approval and subsequent independent live-response review.
