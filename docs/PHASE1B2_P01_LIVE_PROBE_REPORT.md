# Phase 1B.2 — P01 live probe report

2026-10-17, Pacific/Auckland. **CONDITIONAL PASS after one explicitly approved P01.** Authentication/request acceptance and basic bounded artist-search checks passed. Independent catalog identity, semantic audit evidence, other endpoints and live integration remain unverified. **Actual live dispatches: 1; automatic retries: 0.**

Base HEAD: `7d79c15a9b05b7f2808267fdb4497cafdf939d02`; executable corrections remain uncommitted. All 65 source files matched the previously reviewed ZIP before execution. The 9 executor/config/package files in the durable attempt source manifest still match current bytes. No executable source was changed during this execution turn.

## Approved request and execution

```text
GET https://hackathon.api.qloo.com/search?query=Radiohead&types=urn%3Aentity%3Aartist&take=5&page=1
X-Api-Key: private local server environment only (value never shown)
Accept: application/json
```

Attempt: `ed655afc-82d7-4efd-ba99-9f55bd031f27`. The owner explicitly confirmed the originally issued organizer credential, accepted exposure/UNKNOWN-entitlement risks and approved only this attempt. Local approval registration: **2026-10-17T09:36:25.209Z**; durable reservation: **09:36:26.625Z**; CLI completion: **09:36:27.828161Z**. These are recorded local system timestamps, not a claimed timestamp of the human's UI click.

| Actual result | Observed value |
| --- | --- |
| Method / origin / endpoint | Approved GET / hackathon.api.qloo.com / search |
| HTTP status | **200** |
| Dispatch count / maximum / automatic retries | **1 / 1 / 0** |
| Redirects followed / extra pages | **0 / 0** |
| Received and privately saved JSON size | **10,391 bytes** |
| Measured request/body outcome elapsed | **936.452 ms**; includes local JSON/reflection processing, not isolated provider processing time |
| Whole CLI child-process duration | **2.614 seconds**, including startup/compilation/private I/O |
| CLI exit code | **0**; does not itself imply semantic PASS |
| Transport settled / private summary saved | **true / true** |
| Immutable runner verdict | **UNKNOWN / SCHEMA_REVIEW_REQUIRED / NOT_REVIEWED**, preserved |
| Separate post-run scoped decision | **PASS for authenticated request acceptance and basic artist lookup checks** |

The result stayed inside the <=4-second request deadline and <=65536-byte capture cap. No retry, redirect follow, alternative key/host, second request or automatic next probe occurred.

## Private evidence and safe local observations

Private evidence remains at `private/qloo-probes/p01/attempts/ed655afc-82d7-4efd-ba99-9f55bd031f27/`: immutable attempt/summary, raw response, private integrity hash and post-run field review. Private checkpoint and approval receipt are outside the review ZIP. The raw payload was inspected by local Node helpers; only key/type/count/missingness metadata and boolean comparison outcomes were emitted. No provider entity ID, description, URL, alias or other scalar payload was copied into reports or ZIP.

Observed collection: **`$.results`**, containing **5** objects. All five have nonempty distinct UUID-shaped `entity_id` strings, `name` strings and `types` arrays containing the requested artist type. There is **one** exact Radiohead label + artist type + nonempty ID match in this bounded result set. This is more evidence than HTTP 200 alone; it is not independent proof of catalog identity/aliases and does not automatically select an entity for trusted use.

All five contain `properties`, numeric `popularity` and string `disambiguation`. `tags` appears on only **1/5** results, omitted on **4/5**. The top-level object contains only `results`; no pagination metadata was observed. No non-200 HTTP semantics were tested live. See [complete structural observations](PHASE1B2_RAW_SCHEMA_OBSERVATIONS.md).

Post-run ledger: **1 reserved / 1 recorded dispatch / 0 unresolved / conservative upper bound 1**. Active lock is absent after the settled durable summary; the attempt remains preserved. Reusing its ID is disallowed. A later request would require another explicit approval and reviewed accounting; none is authorized now.

## Authentication outcome, limits and stop

The configured event credential was accepted for this exact request at the approved host, yielding nonempty artist results. Key provenance remains the owner's attestation; no no-key/invalid-key negative control, revocation test or credential comparison was performed. Rotation/revocation remains unconfirmed. Exact quota/rate/provider concurrency/expiry remain **UNKNOWN**. Exposure risk remains accepted for this private attempt; rotation is still recommended before public deployment.

The application inspector remains fixture-only, semantic LiveQlooAdapter disabled, and no raw provider result became trusted audit evidence. P01 does not establish movie/place/tag/Insights coverage, location correctness, affinity/score semantics, pagination, error behavior, export rights or public-demo readiness.

F1/F2/F3 offline fixes and their actual **200 Vitest / 4 Chromium** validation are recorded in [execution review](PHASE1B2_EXECUTION_REVIEW.md); those checks preceded approval and were not rerun or re-counted as new tests in this execution-only turn. Stop for independent review. P02-P10, deployment, Runtime archive, Devpost changes, commit and push were not performed.
