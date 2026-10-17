# Phase 1B.3 — P02 entity-resolution preparation

2026-10-18, Pacific/Auckland. **EXECUTED ONCE after explicit film confirmation/P02-only approval; consent consumed.** See [actual execution report](PHASE1B3_P02_EXECUTION_REPORT.md). HTTP 200 was captured privately; schema and independent identity review remain pending. No repeat request is authorized.

## Suggested film and exact request

Operator-confirmed public film: **In the Mood for Love (2000), directed by Wong Kar Wai**. The [Criterion film page](https://www.criterion.com/films/198-in-the-mood-for-love) independently establishes title, release year and director. The story's 1962 setting is not its release year. The owner explicitly confirmed this selection and approved attempt 14d95fe4-126a-4941-a7a1-6dbdd8e26684 once. A different film requires a newly reviewed fixed profile and separate approval; the CLI accepts no arbitrary query.

```text
GET https://hackathon.api.qloo.com/search?query=In+the+Mood+for+Love&types=urn%3Aentity%3Amovie&take=5&page=1
query = In the Mood for Love
types = urn:entity:movie
take = 5
page = 1
Accept = application/json
X-Api-Key = private server configuration; value never displayed
```

The [official Search reference](https://docs.qloo.com/reference/get-search) embedded OpenAPI operation get-search confirms GET /search, string query, a form/non-exploded types array including urn:entity:movie, and integer take/page. One type serializes to the URN above. Take 5 is valid under both the visible mirror's 1–100 range and the embedded schema's exclusive upper bound of 200. No year/director, ID, alternative query, page 2 or geographic filter is sent. Request documentation does not establish a movie response schema. The [event guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide) supplies the hackathon origin and header.

## Reuse the private P01 sample

Reuse preserved attempt ed655afc-82d7-4efd-ba99-9f55bd031f27. The local reader checks fixed paths, file types/links and caps; validates its Radiohead profile/checkpoint/summary, saved-byte size and private integrity hash; and emits structural counts only. The saved private hash binds a future P02 checkpoint and is never exported. Reservation additionally requires the P01 ledger to remain 1 reserved / 1 dispatch / 0 unresolved. No new Radiohead request is necessary or authorized.

P01 established one exact label/type/ID match within five returned artists. It did not independently establish catalog identity, aliases or affinity. The retained ID stays private and unadmitted to semantic audit evidence. A reviewer can compare that existing private candidate with independent public artist identity evidence. Missing/conflicting identity evidence remains unresolved; it does not justify another lookup.

## Post-capture schema and identity review

1. Preserve bounded raw JSON privately before interpretation. HTTP 200/JSON syntax alone stays UNKNOWN / SCHEMA_REVIEW_REQUIRED, never semantic PASS.
2. search-observation.ts strictly validates a **local projection derived from P01**, not a verified movie contract: results array of at most five objects; nonempty entity_id/name strings; nonempty types containing the requested movie type; unique IDs. UUID shape is not required. Optional known fields are checked if present: finite numeric popularity, string disambiguation, object properties and previously observed string tag-item fields. Tags may be absent. Changed/null known fields, duplicate IDs, wrong types or changed envelope require schema review, without fabricated values.
3. Unknown fields remain quarantined in the private raw record. No year/director/country/external-ID path is presumed. Consumer bounds are not universal provider guarantees. The helper returns no selected ID or pagination/affinity interpretation.
4. Independently review **all returned candidates**, including higher-ranked wrong matches. Establish title/aliases, release year 2000 and director from actual observed fields or independently reviewed external identity linkage. Record observed paths/missingness, source URLs, reviewer, conflicts and decision separately and privately. A descriptive string alone is not a verified identity link; do not guess provider field names.
5. No supported match, missing disambiguation evidence, conflicting year/director or several plausible candidates => UNRESOLVED/AMBIGUOUS, selected ID null. An exact title alone is insufficient. Retain every candidate; never choose solely by rank/popularity or issue another request to remove ambiguity.
6. A separately reviewed unique identity is only an identity finding: it proves no affinity, quality improvement or catalog-wide uniqueness and cannot enable LiveQlooAdapter. Later semantic mapping requires separate review.

## Approval, limits and private handling

One fresh P02-only approval must confirm this exact proposed film and request, original-event-key basis, exposure risk, UNKNOWN quota/rate/provider concurrency/expiry, request/host/rights/private-access review and private capture permission. No credential rotation, unlimited quota or authenticated approval service is claimed.

Maximum **1 HTTP request / 1 in flight**, **0 retries / 0 redirect follows**, timeout **4000 ms maximum** through response reading, body cap **65536 bytes**. Timeout/cancellation/ambiguity stops without automatic recovery/replay. Startup and durable private I/O are outside the request/body timer; it is not a whole-CLI completion guarantee.

A checkpoint needs a fresh UUIDv4, profile tastegate.p02.film.v1, APPROVE_P02_ONLY, explicit film confirmation, private P01 binding, reviewed prior P02 count/previous ID and a validity window <=15 minutes. It is a trusted operator assertion, not cryptographic human identity proof. Preparation created none; after the actual operator reply, a private five-minute checkpoint was registered and its one approved attempt was consumed.

Future private destination: private/qloo-probes/p02/attempts/<fresh-approved-attempt-id>/, with exclusive attempt.json, response.raw.json and summary.json. Raw hash, observed schema and independent review stay private. Keys, headers, raw bodies, provider IDs and private checkpoints are excluded from Git/review ZIP.

npm run probe:p02 prints BLOCKED/zero dispatches without loading credentials. --preflight-p02 checks local configuration, reuse and ledgers without approval, reservation or HTTP. The separately approved --execute-p02 path was invoked exactly once after the owner's reply. Do not invoke it again.

The captured movie response has name/tag_id/type strings on 437 attached tag items and **no value fields**; the retained P01-derived projection rejects it. One candidate matches title/movie type/observed release_year 2000, but independent director/external identity remains unestablished and selected ID stays null. These observations do not change the validation code, establish P04 semantics or enable the live adapter.

**STOP after this single P02 for independent schema/identity review.** The consumed approval never covers a repeat P01/P02, P03 or P04.
