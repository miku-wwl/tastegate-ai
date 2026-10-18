# Phase 1B.4 — One owner-approved P05 Insights execution

2026-10-19, Pacific/Auckland. **One genuine, separately approved P05 request returned HTTP 200 and was captured privately. The immutable result remains UNKNOWN / SCHEMA_REVIEW_REQUIRED / NOT_REVIEWED; CLI exit 3. Phase 1B remains CONDITIONAL PASS pending independent response/schema review. STOP.** No second request, earlier probe repeat, returned-ID admission or live-adapter enablement occurred.

## Exact authorization and request

The owner explicitly answered “批准上述 P05 一次” at gate `call_21be41deddd345dba947d74412511c1e`, approving attempt **154bd4c0-ea64-49c5-ad95-cb57efd7647a** and the exact previously reviewed private Radiohead signal. A new P05-only receipt/checkpoint was registered at **2026-10-18T22:36:23.122Z (2026-10-19 11:36:23.122 NZDT)**, expiring five minutes later. This records local registration after receipt of the reply, not an asserted human-click timestamp. The single approved dispatch is now consumed.

```text
GET https://hackathon.api.qloo.com/v2/insights
filter.type=urn:entity:place
signal.interests.entities=<EXACT_PRIVATE_ACCEPTED_RADIOHEAD_ENTITY_ID>
take=1
profile_revision=tastegate.p05.radiohead-to-place.capture-256k.v1
```

The display marker was not transmitted. Before registration, the actual encoded private proposal URL was compared with a URL constructed from the verified private identity binding and these exact three parameters; they agreed. The checkpoint binds that exact artist ID, original P01 raw hash and private review hash. The existing reviewed CLI assembled the real request. No geography, tags, personal information, candidate filter, pagination or explanation parameters were added. No credential was put in arguments, source or logs.

Limits stayed **one HTTP dispatch, concurrency one, 4000-ms request/body deadline, 262144-byte private capture threshold, zero retries and redirect follows**. The owner accepted possible historical credential exposure, unconfirmed rotation/revocation, UNKNOWN quota/rate/provider-concurrency/expiry/Insights entitlement and this private capture. The original locally held event key was loaded only through the reviewed private loader. Process-only live mode/4000-ms configuration was used; environment files were unchanged.

## Actual commands and immutable outcome

| Item | Actual observation |
| --- | --- |
| Fresh local preflight | `node scripts/qloo-probe-p05.mjs --preflight-p05`; exit 0; 2.078 s; zero reservations/dispatches, no consent granted by preflight |
| Execute command | `node scripts/qloo-probe-p05.mjs --execute-p05`, invoked exactly once |
| CLI start/end UTC | 2026-10-18T22:36:27.379218Z / 2026-10-18T22:36:30.549558Z |
| Whole CLI duration / exit | **3.170 s / 3** |
| HTTP / captured bytes / request elapsed | **200 / 18270 / 1332.762 ms** |
| Summary / attempt record versions | tastegate.raw-probe.v4 / tastegate.probe-attempt.v4 |
| Immutable status / reason / review | UNKNOWN / SCHEMA_REVIEW_REQUIRED / NOT_REVIEWED |
| Dispatches / automatic retries / redirect follows | **1 / 0 / 0** |
| Raw capture / transport settled | Saved privately / true |
| P05 durable ledger | **1 reserved / 1 dispatched / 0 unresolved**, no active locks |

Exit 3 is the intended UNKNOWN contract and did not trigger a retry. A separate local logger also used an exclusive invocation marker, preventing a second invocation of the approved execute command. This is additional local invocation bookkeeping, not an exactly-once provider guarantee. The immutable raw body and summary were not edited. This particular body also fits within 64 KiB; its capture does not establish that the larger cap caused success or that future responses fit either cap.

## Structural observations only

The saved JSON has root fields `success` and `results`, with `success` boolean true and **one object at `$.results.entities[]`**. Observed object field names are name, entity_id, type, subtype, properties, popularity, location, tags, references, query, disambiguation and external. These are single-sample observations, not an accepted reusable response contract.

The sample uses **`type = urn:entity` and `subtype = urn:entity:place`**. In particular, its singular `type` is not literally the requested `urn:entity:place`; the observed subtype carries that label. This representation is not silently substituted for search's types array or promoted into a place mapper. The query object has affinity and measurements field names; values, definitions, calibration and applicability are not accepted here. Scores and private identities/locations remain private.

The narrow finding is request acceptance and capture: the approved artist-ID request was accepted and the returned object carries a Place subtype claim. HTTP 200, `success=true`, one object or those field names do not independently prove signal utilization, correct identity/geography, causal influence, personal liking, recommendation improvement or valid score semantics. No comparison request/control/counterfactual was run. No public provider link or returned ID was fetched or selected. `selected_entity_id = null`; **cultural affinity and recommendation quality remain NOT_ESTABLISHED**. Independent schema/semantic review is still required.

## Preservation, validation and private evidence

Immediately before dispatch, the preparation ZIP's checksum/CRC passed and all **111 packaged public files** matched current bytes; base HEAD was `32ed02575b3883ca004ff9fcc80cdb1c8f8d0e14` and the index was empty. All **30 historical private files** were unchanged, all five earlier ledgers were 1 reserved / 1 dispatched / 0 unresolved, and P05 had no reservation, active lock or approval. The fresh accepted signal was revalidated before registration and again by the durable store. No previous consent was reused.

After execution, all **31 source hashes recorded with the actual attempt** match current executable files. All 30 historical private files remain byte-identical and all earlier ledgers remain 1/1/0. Original P03 v1 remains UNKNOWN / RESPONSE_TOO_LARGE and P03-R remains its original captured UNKNOWN result. No private historical summary, checkpoint, approval or profile was rewritten.

Private directory:

```text
private/qloo-probes/p05/attempts/154bd4c0-ea64-49c5-ad95-cb57efd7647a/
```

The immutable attempt.json, response.raw.json and summary.json, plus the separate private checkpoint and owner-consent receipt, form five newly hashed evidence files. Their integrity manifest stays private. The original private identity review and proposed URL remain separate preparation artifacts; neither is itself dispatch authority. Public artifacts include safe status/count/field-path metadata and public source hashes, excluding provider IDs, raw JSON, private hashes, credentials and authorization contents.

Executable source/tests were unchanged during this continuation. The preparation's actual typecheck/build exit 0, **455 Vitest tests / 14 files and four local Chromium E2E tests passed** remain applicable; those commands were not rerun after dispatch. Original success/failure logs are retained in the updated review package as preparation evidence. A fresh `git diff --check` was run for the documentation update, with its actual log/result included. No install, dependency/lockfile upgrade or Runtime integration was performed.

The updated sanitized `TasteGate_Phase1B4_P05_Execution_Review.zip` contains current public source/reports, actual safe execution logs, immutable-summary projection, local structural observations, ledgers, source revision, safe evidence manifest and original preparation validation logs. The original preparation ZIP is preserved. All environment files, keys, raw provider data/IDs/private hashes/checkpoints/receipts, full downloaded public pages, dependencies, caches, virtual environments and Git internals are excluded; CRC/member hashes/current-source comparison/privacy scan and private ACLs are verified separately.

Only README and preparation-snapshot annotations were updated, plus this report; executable source and frozen strategy/AGENTS/old schemas remain unchanged. No new AGENTS conflict was introduced. No commit, push, deployment, Devpost change, P06–P10 work or automatic next phase occurred. **STOP for independent review; this P05 budget is exhausted.** Quota, expiry and credential rotation uncertainties remain unresolved.
