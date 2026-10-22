# P07: geography-filtered discovery for NYC — readiness and execution gate

> **Current, 2026-10-23: EXECUTED ONCE, REVIEWED, SEALED AND ADMITTED FOR EXACT-CONTEXT REPLAY. DO NOT PREPARE OR EXECUTE AGAIN.** HTTP 200, 55,555 bytes, 3,388.801 ms, one settled dispatch. One independently corroborated replacement is verified; whole plan UNKNOWN/partial. Locality boundary enforcement remains unverified. [Actual response](P07_REAL_RESPONSE_REVIEW.md) · [current evidence](FINAL_QLOO_EVIDENCE_STATUS.md). Pre-execution sections below are historical analysis, not an active gate.

> **Phase 3D/4A, 2026-10-22.** Base `0d55ca5425de711b6d28dddf7034a52a62cc14bb`. P07 remains **NOT EXECUTED / AWAITING_EXACT_APPROVAL**. The offer is unexpired and will be freshly revalidated by current code before the owner sees its sentence; no stale sentence is copied into this document or the ZIP. Current official parameter documentation was re-fetched (HTTP 200); the place/locality conflict remains. Consent verification now also binds the receipt's literal URL, destination and registration/expiry/consumption times.

`node scripts/inspect-p07.mjs` is a read-only local intake command: currently `NOT_EXECUTED`. It verifies known transport/consent/ledger records and cap before inspecting captured bytes. A test double is explicitly `TEST_DOUBLE_ONLY`. A captured live body remains `P07_OBSERVED_SCHEMA_REVIEW_REQUIRED`; the pre-registered classifier alone grants no provider-schema admission, recorded replay or verified repair.

2026-10-21, Pacific/Auckland. **P07 status: PREPARED, AWAITING_OWNER_APPROVAL. NOT EXECUTED.** Phase 3C revalidated the existing, unexpired offer offline with the new read-only command below. It did not create a new offer, register consent, or modify any historical approval artifact. Baseline: main, origin/main and the remote main all at `9e7bff070adfd396df184205acbd56232dea14d2`; clean working tree at handover.

`node scripts/qloo-probe-p07-admin.mjs --review-gate --proposal=598e608d-ba24-4dbb-96c5-5335493e6cce`

Result: `GATE_REVALIDATED_NO_REQUEST_SENT`. Private artist review, exact request hash, limits, expiry and settled prior ledgers revalidated; P07 ledger remains **0 reserved / 0 dispatched / 0 unresolved**. The owner previously chose **"Not now — independent review first."** That remains a refusal to execute; preparing or reviewing the offer grants no authority.

## 1. The gate

**Sanitized request** (one request, nothing else is authorized):

```
GET https://hackathon.api.qloo.com/v2/insights
    filter.type                 = urn:entity:place
    signal.interests.entities   = <PRIVATE_REVIEWED_RADIOHEAD_ID>   (the already reviewed artist; substituted from the re-verified private identity review at execution, never printed)
    filter.location.query       = New York City
    filter.location.radius      = 0
    take                        = 3
```

| Item | Value |
| --- | --- |
| Attempt ID (new) | `598e608d-ba24-4dbb-96c5-5335493e6cce` |
| Offer valid until | 2026-10-22T12:25:45Z (2026-10-23 01:25 NZDT); after that a new gate is prepared, which is free and offline |
| Artist binding | `ACCEPTED_FOR_P05_ONLY_REVERIFIED`: re-derived from the immutable P01 capture and the public MusicBrainz record; the proposal binds the review hash and the request hash |
| Earlier probes | P01, P02, P03, P04, P03-R, P05, P06: each exactly one dispatch, settled, reviewed; none repeated |
| Budget | 1 dispatch, 1 in flight, 0 retries, 0 redirects, 4 s timeout, 262,144 byte response cap |
| Approval window | 5 minutes from the moment the approval is registered |
| Private evidence destination | `private/qloo-probes/p07/attempts/598e608d-ba24-4dbb-96c5-5335493e6cce/` (immutable: `attempt.json`, `response.raw.json`, `summary.json`; ledger-fenced, never overwritten) |
| Credential | ignored `.env.local`, read only by the local probe CLI; never printed or placed in a URL. After separate exact approval only, supply `QLOO_MODE=live` to the execution child process and discard it on exit. The loader gives inherited process settings precedence. Do not edit `.env.local` or persist live mode. Environment readiness is a precondition, never approval. |
| Does not authorize | a second P07, repeats of earlier probes, P08–P10, extra or altered parameters, promoting any entity, product live mode, commit/push/deploy/Devpost |

**Current approval sentence:** generated only by the local `--review-gate` command for the unexpired offer, or `--prepare-gate` after expiry. It is displayed to the owner at the current authorization gate; approval tokens are deliberately excluded from source and the Review ZIP. A bare yes or approximate phrase is refused.

It binds the request hash, the identity-review hash, the limits, the destination, the deadline and this attempt ID into one digest. Changing any of them, or approving a different attempt, makes it invalid. Register it with:

```
node scripts/qloo-probe-p07-admin.mjs --register-approval --proposal=598e608d-ba24-4dbb-96c5-5335493e6cce --owner-reply="<the sentence>"
```

Withdraw it with `--withdraw --proposal=<id>` (this also revokes a registered approval that has not run). Inspect it with `--status`. **Executing** is a separate step (`npm run probe:p07 -- --execute-p07`) and is run only after the owner's approval; this report did not run it.

## 2. What the official documentation says, parameter by parameter

Re-fetched on 2026-10-21 from the official [Insights reference](https://docs.qloo.com/reference/insights-api-deep-dive), [Parameter Reference](https://docs.qloo.com/reference/parameters), [Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type) and [developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide). Browser-search retrieval failed; direct read-only HTTPS GETs to those documentation pages returned HTTP 200. These were documentation fetches, **not event API requests**. The conflict below persists. Nothing here is inferred from a P07 response.

| Parameter | Insights reference | Parameter Reference | Entity Type Parameter Guide (`place`) | Verdict |
| --- | --- | --- | --- | --- |
| `filter.type=urn:entity:place` | required; `urn:entity:place` accepted | — | the only required parameter | consistent |
| `signal.interests.entities` | comma-separated entity IDs that influence affinity | — | optional for place | consistent |
| `take=3` | default 20, minimum 1, **maximum 50** | — | listed for place | consistent |
| `filter.location.radius=0` | meters; integer; "setting this parameter to 0 disables this padding and restricts results strictly to within the locality boundary" | meters; 0 turns the default boundary expansion off | listed for place | consistent (the schema default 15000 and the "10 % of the diameter or 2,414 m" wording disagree, but we send 0 explicitly) |
| **`filter.location.query=New York City`** | documented for GET: one locality as a string; fuzzy, case-insensitive; a no-match returns **HTTP 400**; with one locality the response includes `query.locality.signal` | "Applies to: Destination, Place" | **not listed for place** (it appears only in the heatmap table) | **DOCUMENTATION CONFLICT** |

Also from the developer guide: "invalid parameters are silently ignored rather than returning an error", including parameters that do not fit the `filter.type`.

## 3. Known uncertainties (stated, not resolved)

1. **The locality filter may be silently ignored for place**, in which case HTTP 200 returns the same unfiltered top places as P05 and proves nothing about geography. The response is therefore judged by what it contains, never by what was asked (section 4).
2. A fuzzy match may resolve another area than New York City, or return HTTP 400.
3. `radius=0` may return fewer than three places, or none.
4. The returned `geocode.city` may be a borough name rather than `New York`; the audit's own city check compares the constraint exactly, so a borough venue would be a *cautious* failure, not a silent pass (borough-level normalization is documented as unverified).
5. Quota, rate limits, concurrency limits and key expiry are UNKNOWN; possible prior credential exposure and unconfirmed rotation remain accepted risks recorded in the receipt.
6. One request may yield no verifiable replacement. That is a valid, reportable outcome.

**Alternatives considered and not chosen.** (a) `filter.geocode.country_code=US` plus `filter.geocode.admin1_region=NY`: documented for place in all three pages, but state-level (Buffalo is in NY), and `filter.geocode.name` matches `properties.geocode.name`, which for a neighbourhood venue may be the neighbourhood. (b) `filter.location=<locality entity ID>`: documented for place, but obtaining the ID would need an extra discovery request. If the owner prefers (a), the profile would be changed and re-gated; nothing about this gate prejudges that.

## 4. How the response will be judged (pre-registered, implemented, tested)

`src/qloo/p07-interpretation.ts` classifies one captured body with a pure function; it needs no network and prints no ID or name.

| Class | Meaning | What it implies |
| --- | --- | --- |
| **A_HONORED_NYC** | A marker explicitly names `New York City` or `NYC` after case/Unicode/outer-whitespace normalization; all returned places report US/NYC geography; any second marker agrees | Reported geography and explicit locality resolution are consistent. Actual venue location and independently corroborated identity remain **NOT_PERFORMED**. No repair is verified. |
| **B_PARTIAL_OR_MIXED** | Marker name missing, blank, unknown, ambiguous (`New York` could be the state), a substring match such as `New York Mills`, conflicting markers, mixed places or missing geography | Never credit unknown locality as confirmed. Judge each candidate independently. |
| **C_PARAMETER_APPARENTLY_IGNORED** | Places but no marker | Treat the filter as not applied; each place stands only on its own geography |
| **D_EMPTY** | A valid envelope with no places | Nothing to repair with; no evidence the filter was applied |
| **E_UNUSABLE** | The shape does not match the reviewed one, an item has the wrong type, or more than `take` places returned | UNKNOWN; nothing is used |

Boroughs (Manhattan, Brooklyn, Queens, the Bronx, Staten Island) count as New York City **for assessing reported geography only**. They do not establish the resolved locality or validate a venue. The output now separately states reported-geography consistency, resolved locality, actual venue-location validation and independent venue identity. Qloo's `query.affinity` is not an input to any class.

## 5. From a capture to a real `REPAIR_VERIFIED`

A real verified repair needs more than a good response. Phase 3B made the rule explicit and strict: `REPAIR_VERIFIED` requires identity, branch/city/country/type, constraints, provenance, dating, consistency **and** cultural evidence, and the identity must have a **second source**: a separate provider lookup, or a registered official public page. The owner's own confirmation of Qloo's candidate details is recorded but does **not** verify the repair ([`REPLACEMENT_NEEDS_INDEPENDENT_CORROBORATION`](../app/view-model.ts)). So, after a P07 capture (class A, B or C) the path is:

1. Review the capture locally; seal it like P06 (`scripts/seal-recorded-probe.mjs` pattern).
2. For one candidate that passes every hard check, the owner reviews an **official public venue page** (not Qloo) and registers it as a reference for that identity: publisher, https URL, the venue name/city/country it supports, the review time and a hash of what was reviewed. The registry is private (it binds to a hash of the Qloo ID); the page's URL is public.
3. The replacement then verifies (`identity_basis: official_public_reference`), or a contradicting page produces `FACT_CONFLICT` and a rejection.

**Phase 3C offline implementation:** `capture-review.ts` inspects bounded UTF-8/JSON bytes through the existing reviewed projection, refuses an incompatible shape, and exclusively writes a private byte-integrity review seal after structural review. `verifyCaptureSeal` re-hashes every artifact and re-derives geography on subsequent use. This is an evidence seal, **not** the recorded adapter's replay seal or proof of dispatch/approval; it always says `REPLAY_NOT_ENABLED` and `NOT_VERIFIED`.

`official-reference-store.ts` prepares the existing adapter's `references` option from a private registry: exact official URL, independently reviewed host allowlist, separately saved source text, capture/review times, content digest, full-line factual excerpts and a process-local identity binding. Missing source bytes, assertion-only records, unsupported facts, provider-domain sources, changed URLs and duplicate identities fail closed. A hash cannot authenticate a website: a trusted operator must inspect the original official page and capture provenance before admitting its host and entry. No real reference is registered or claimed verified.

**After a separately approved capture:** inspect bytes -> human structural review -> assess geography -> seal and verify integrity -> candidate identity review -> obtain/capture and review the candidate's official source -> load its registry through the existing recorded-adapter hook -> existing repair revalidation and graph validator -> existing assessment and before/after report. Every accepted repair still needs every hard/evidence gate; NYC alone or an owner assertion is insufficient.

**Deferred until observed:** exact P07 response-specific semantic parsing, request-context replay admission and integration into `VerifiedRecordings`, and a P07 CLI that promotes a review seal to the product's replay seal only after the actual loader accepts it. Generic inspection is not validation of unseen fields. Until then: no real `REPAIR_VERIFIED`.

## 6. Offline test coverage (no network; `fetch` and `https.request` are throwing doubles)

Focused regression includes `p07-preparation`, `p07-interpretation`, `capture-review` and `official-reference-store`; actual totals are in [the Phase 3C report](PHASE3C_EXECUTION_REPORT.md).

- **Profile exactness**: every extra, changed or omitted parameter, origin, path, method or size is refused (unsupported-parameter denial).
- **Wrong signal binding**: absent, copied, or minted-for-another-probe bindings never send.
- **Approval replay**: a sentence is single-use, also after the approval files are removed by hand; another gate's sentence, identity or kind is refused.
- **Altered request**: a checkpoint whose request hash is not the one rebuilt from the verified artist never reserves or sends.
- **Evidence drift** after the gate was printed (one byte of the identity review, a proposal edited, an earlier probe unsettled) voids the sentence.
- **Consent re-verified at execution**: missing receipt, wrong reply, wrong request, unconsumed offer, edited proposal, or a withdrawn approval each block the reservation and the CLI path.
- **Response handling**: missing location, wrong city/country, unexpected entity type, empty results, oversized body (262,144 / 262,145 bytes), timeout, cancellation, one in flight, HTTP 3xx/4xx/5xx, reflected credential, non-JSON, invalid UTF-8.
- **Ledger preservation**: every historical file is byte-identical after the whole flow; used IDs are refused; a timed-out attempt keeps the durable lock and is never replayed.
- **Credential protection**: no output, URL or log contains the key, the artist ID or an evidence hash.

## 7. Summary

| | |
| --- | --- |
| P07 | PREPARED / AWAITING_OWNER_APPROVAL |
| Next action | Independent review first. Then the owner may approve the current locally generated sentence. Only after approval: register and run one execution child with process-scoped live mode. The Phase 3D/4A brief permits subsequent offline inspection, observed-schema integration and revalidation; it permits no second request, retry, altered query or P08. |
