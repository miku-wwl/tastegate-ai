# Phase 1B.3.2 — First P03 NYC place probe readiness

2026-10-18, Pacific/Auckland. **Historical preparation snapshot: READY FOR P03-ONLY OWNER REVIEW; NOT AUTHORIZED; NOT EXECUTED at that checkpoint.** The owner subsequently approved the exact proposed attempt; its single dispatch returned HTTP 200 but crossed the response cap. See the [execution report](PHASE1B32_P03_EXECUTION_REPORT.md) for the current UNKNOWN / RESPONSE_TOO_LARGE result and consumed approval. The original preparation account below is retained; overall Phase 1B remains CONDITIONAL PASS.

## Independent venue and exact fixed request

The venue's [official contact page](https://www.bluenotejazz.com/nyc/contact/) was rechecked through the web reader and direct HTTP 200. It identifies **Blue Note New York, 131 West 3rd Street, New York, NY 10012**. This is independent public branch evidence, not evidence of Qloo coverage, provider geography, live availability or affinity.

```text
GET https://hackathon.api.qloo.com/search?query=Blue+Note+New+York&types=urn%3Aentity%3Aplace&take=3&page=1
query=Blue Note New York
types=urn:entity:place
take=3
page=1
```

The [official Search reference](https://docs.qloo.com/reference/get-search) and [official mirror](https://raw.githubusercontent.com/qloo/docs-public/main/reference/get-search.md) document the query, place type, take and page parameters. The live reference's embedded request schema specifies a string query, a form/non-exploded array of types including the place enum, integer page 1–100, and integer take below 200. The mirror describes take 1–100. This bounds discrepancy is retained; **3 is valid under both** and no widening is allowed. A singleton type serializes as the exact URL above. Direct public-document retrieval metadata and compact extracted facts are packaged; full bodies are excluded.

Choose **take=3 instead of 5** for the first coverage/field-inspection request: it asks for two fewer records. It does not guarantee a proportional byte reduction or even a response below the cap, because per-record data varies. Three candidates are sufficient only for a bounded first observation. They do not prove branch uniqueness, absence, search completeness or NYC coverage. No result is auto-selected; no empty/ambiguous result triggers a larger query or second page. The fixed byte cap can still stop capture.

No location/address/radius/tag/existence filter, sorting parameter, Tokyo query or bare Blue Note query is sent. Query text containing New York does not validate geography. The [earlier three-control plan](PHASE1B3_P03_NYC_CONTROLS.md) remains historical; only this first NYC attempt is prepared. Other controls need separate review and consent.

## Evidence design — requirements, not guessed response schemas

No actual place response has been observed. The following are semantic evidence requirements; **JSON paths and provider field names remain TBD after an approved capture**. No place response mapper, fabricated entity ID, geocoding, coordinates, provider URL or schema is implemented. The existing artist/movie search projection is not extended to guessed place fields.

| Evidence needed | Review requirement / missing or conflicting outcome |
| --- | --- |
| Place ID and type | Observe actual nonempty provider ID and documented place type on the same record. Duplicate/conflicting identity, malformed type or missing ID => UNKNOWN/no admission. Keep IDs private. |
| Exact branch | Match independently documented New York branch using observed address and independent branch-specific external identity; name/rank/popularity alone is insufficient. No silent abbreviation/alias matching. Unresolved same-name branches => UNKNOWN. |
| Address/city/country | Preserve raw values privately and record actual paths/types. Compare the street, city, state/postcode and country evidence with the independent reference; document any normalization and source of country evidence. Never fill missing provider geography from the proposed query or public address. Missing or conflicting required geography => UNKNOWN. |
| Coordinates, if present | Check finite/ranged values, actual ordering, units/CRS and agreement with the branch before any use. No invented coordinates, assumed order, hidden geocoder or distance-to-center membership rule. Missing coordinates alone need not fail a complete address-based review; missing required location evidence or contradictory coordinates remains UNKNOWN. |
| External place identity | Inspect actual external-reference fields, then compare with an independently sourced branch-specific record. A shared brand domain, fabricated URL or unverified link is insufficient. Preserve provider/public source separation and uncertainty. |
| Wrong-city evidence | A separately corroborated, internally consistent non-NYC branch can be rejected for the NYC constraint. Conflicting purported NYC/Tokyo facts remain UNKNOWN pending resolution; do not choose a convenient field. No automatic Tokyo control request follows. |
| Empty, partial, ambiguous data | Preserve every returned candidate and missingness. Empty results mean no usable evidence in this bounded response, not proof of global absence. Incomplete location => UNKNOWN; never fall back to synthetic/live-looking evidence. |

Any later location-only acceptance establishes neither jazz affinity, current opening hours nor recommendation quality. Exact NYC boundary analysis is deferred unless actual coordinate-based review needs it and independent boundary evidence is obtained.

## Implemented gate and preserved security

The fixed profile `tastegate.p03.bluenote-nyc.v1` has a separate strict `APPROVE_P03_NYC_ONLY` checkpoint: fresh UUIDv4, explicit venue/location review, prior P01/P02/P04 accounting, existing exposure/UNKNOWN-entitlement/private-capture assertions and a validity window <=15 minutes. Prior approvals do not parse as P03 consent. No checkpoint is registered before the actual owner reply.

The P03 wrapper reuses the existing native HTTPS engine, credential loader, durable exclusive store, global/per-probe locks, immutable reservation/raw/summary writes and public-source hashes. Under the root lock, P01/P02/P04 must each be one reservation/one dispatch/zero unresolved; reusing any prior attempt ID is rejected. P03 has its own count/previous-ID chain. No force/reset/replay, automatic stale-lock cleanup or unrestricted HTTP transport is introduced.

Bounds: **one HTTP dispatch / one in flight / 4000 ms request-and-body deadline / 65536 bytes / zero retries / zero redirects**. Timeout, cancellation, HTTP/capture errors or uncertain transport stop. An unresolved transport keeps a blocking lock and cannot be replayed. CLI startup and durable I/O are outside the request timer. The server-only key remains local; diagnostics/TLS bypass and reflected credentials remain blocked. Raw syntax success cannot assert semantic PASS. P01/P02/P04 profiles, wrappers, original evidence and native transport remain unchanged.

`npm run probe:p03` is a zero-dispatch preview without credential loading. Actual `node scripts/qloo-probe-p03.mjs --preflight-p03` exited 0, READY_FOR_HUMAN_APPROVAL; it loaded ignored local credential configuration and checked ledgers without granting approval or reserving an attempt. The execute CLI has **not** been invoked on the real project. Synthetic tests use authored keys/bodies and isolated temporary histories; they are not live probe evidence.

## Actual regression and scope

Artifacts: `.artifacts/phase1b32-20261018T021455Z`. Validation children removed inherited Qloo/unsafe diagnostic settings, used blank provider-key overrides for build/tests, and disabled telemetry. No install, dependency upgrade, browser download or npm audit occurred. Package lock and AIG pin are unchanged.

| Actual command | Observed result |
| --- | --- |
| npm run typecheck | Exit 0; 6.600 s outer duration |
| npm test | Exit 0; **365 passed**, 12 files; Vitest 13.76 s / outer 15.638 s |
| npm run build | Exit 0; 14.020 s; existing routes only |
| npm run test:e2e | Exit 0; **4 passed**, local Chromium; Playwright 8.4 s / outer 10.703 s |
| git diff --check | Exit 0 after final reports; actual log/result packaged |

The initial validation wrapper hit a Windows console encoding error while printing the already saved successful build log. E2E had not started. It was run separately with UTF-8 output and passed; the build was not rerun or misreported. The existing NO_COLOR/FORCE_COLOR warning is retained. Local browser results do not prove provider execution or public deployment.

Added 38 authored P03 tests for exact request/consent scope, no prior-approval reuse, take=5/Tokyo/generic query rejection, single dispatch, timeout/cancellation/concurrency, byte/reflection/media/JSON protection, missing/unsettled/undispatched prior history, cross-probe locking, immutable summary/budget and safe preview/preflight. All preceding 327 tests still pass. No guessed venue-response fixtures were added.

Changed files: README/package script; shared registry/store/CLI; new P03 profile/store/CLI and regression file; existing P01 local-env/P02/P04 tests updated for the closed P03 registry/module list; these two reports. Protected AGENTS/frozen strategy/lockfile/native engine/P01-P02-P04 profiles and wrappers/search projection/disabled adapter/fixture route remain byte-identical. The read-only probe does not implement AIG SIDE_EFFECT execution; no installed Runtime acceptance is claimed or bypassed. No new AGENTS conflict was introduced.

## Pending fresh authorization

Proposed attempt **0db5496e-4055-43da-9043-0c6591d7e5d9**, proposal only, no reservation. Exact private destination:

```text
private/qloo-probes/p03/attempts/0db5496e-4055-43da-9043-0c6591d7e5d9/
```

The owner must approve this exact Blue Note New York request once, the fixed limits and bounded private capture. Risks: the original organizer event credential may have been exposed; rotation/revocation is unconfirmed; precise remaining quota, rate, provider concurrency and expiry remain UNKNOWN. Prior HTTP success establishes no new entitlement or unlimited allowance. Keep the key out of chat.

Sanitized review ZIP: `private/qloo-probes/review/phase1b32-20261018T021455Z/TasteGate_Phase1B32_Review.zip`. It contains current public source/tests, reports, actual logs, revision/hash manifest, safe semantic/identity/ledger/integrity facts and independent public-source retrieval metadata. Credentials, every environment file including the example, raw Qloo bodies/provider IDs/raw hashes, private checkpoints/receipts/review extracts, full public-source bodies, caches/dependencies/virtual environments and Git internals are excluded. Internal hashes, CRC, current-source comparison and secret scan are verified, with external checksum/verification alongside.

**STOP before P03 network execution.** No P01/P02/P04 repeat, P05-P10, LiveQlooAdapter enablement, commit, push, deployment, Devpost change or automatic next phase. Approval for this first NYC attempt does not authorize the other place controls.
