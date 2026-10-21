# P07: geography-filtered discovery for NYC — readiness and execution gate

2026-10-21, Pacific/Auckland. **P07 status: PREPARED, AWAITING_OWNER_APPROVAL. It has not been executed. No Qloo request was made in Phase 3B.** The gate below was prepared offline: it wrote one private proposal file and sent nothing. Workstream B (P0) of Phase 3B.

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
| Credential | ignored `.env.local`, read only by the local probe CLI; never printed or placed in a URL. **Precondition:** preflight currently reports `BLOCKED / LIVE_MODE_REQUIRED` because the local config is not in live mode; the owner must set `QLOO_MODE=live` there before execution (a precondition, not an approval) |
| Does not authorize | a second P07, repeats of earlier probes, P08–P10, extra or altered parameters, promoting any entity, product live mode, commit/push/deploy/Devpost |

**The exact P07-only approval sentence** (the only text that approves this gate; anything else, including a bare "yes" or "approve P07", is refused):

```
APPROVE P07-NYC-DISCOVERY 598e608d-ba24-4dbb-96c5-5335493e6cce SHA256:77fb0c94fc03df6b21de4a4b58e917b9
```

It binds the request hash, the identity-review hash, the limits, the destination, the deadline and this attempt ID into one digest. Changing any of them, or approving a different attempt, makes it invalid. Register it with:

```
node scripts/qloo-probe-p07-admin.mjs --register-approval --proposal=598e608d-ba24-4dbb-96c5-5335493e6cce --owner-reply="<the sentence>"
```

Withdraw it with `--withdraw --proposal=<id>` (this also revokes a registered approval that has not run). Inspect it with `--status`. **Executing** is a separate step (`npm run probe:p07 -- --execute-p07`) and is run only after the owner's approval; this report did not run it.

## 2. What the official documentation says, parameter by parameter

Read on 2026-10-21 from the official Qloo pages. Nothing here is inferred from a response.

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
| **A_HONORED_NYC** | A resolved-locality marker is present at `query.locality.signal`, its name (if given) mentions New York, and **every** returned place reports a US, New York City geography | The filter appears to have been applied. Still **no place is a verified replacement** until it passes the repair audit. |
| **B_PARTIAL_OR_MIXED** | A marker is present but a place is outside the US or NYC, lacks geography, or the matched locality is not New York | Judge each place individually; do not credit the filter |
| **C_PARAMETER_APPARENTLY_IGNORED** | Places but no marker | Treat the filter as not applied; each place stands only on its own geography |
| **D_EMPTY** | A valid envelope with no places | Nothing to repair with; no evidence the filter was applied |
| **E_UNUSABLE** | The shape does not match the reviewed one, an item has the wrong type, or more than `take` places returned | UNKNOWN; nothing is used |

Boroughs (Manhattan, Brooklyn, Queens, the Bronx, Staten Island) count as New York City **for judging the filter only**. Qloo's `query.affinity` is not an input to any class.

## 5. From a capture to a real `REPAIR_VERIFIED`

A real verified repair needs more than a good response. Phase 3B made the rule explicit and strict: `REPAIR_VERIFIED` requires identity, branch/city/country/type, constraints, provenance, dating, consistency **and** cultural evidence, and the identity must have a **second source**: a separate provider lookup, or a registered official public page. The owner's own confirmation of Qloo's candidate details is recorded but does **not** verify the repair ([`REPLACEMENT_NEEDS_INDEPENDENT_CORROBORATION`](../app/view-model.ts)). So, after a P07 capture (class A, B or C) the path is:

1. Review the capture locally; seal it like P06 (`scripts/seal-recorded-probe.mjs` pattern).
2. For one candidate that passes every hard check, the owner reviews an **official public venue page** (not Qloo) and registers it as a reference for that identity: publisher, https URL, the venue name/city/country it supports, the review time and a hash of what was reviewed. The registry is private (it binds to a hash of the Qloo ID); the page's URL is public.
3. The replacement then verifies (`identity_basis: official_public_reference`), or a contradicting page produces `FACT_CONFLICT` and a rejection.

**Deliberately not built yet:** loading a sealed P07 capture into the recorded adapter and the private reference file loader. Both depend on the real response shape, which is unknown; coding them now would build against an assumption. The same applies to the two post-execution commands: a local **inspect** command that runs the classifier above on the saved body and prints counts only (the classifier is ready; its command-line wrapper is not), and a **seal** command in the `seal-recorded-probe.mjs` pattern (write the integrity manifest, prove the loader accepts it, roll back otherwise). They are written against the real capture after it exists, with no network access, and they are the "review and seal" steps that follow an approved execution. The pure pieces they will use (interpretation, strict repair gate, reference model and its validator rules, adapter hook) are built and tested. Until P07 is executed and sealed there is **no** real `REPAIR_VERIFIED`, and none is claimed.

## 6. Offline test coverage (no network; `fetch` and `https.request` are throwing doubles)

`tests/p07-preparation.test.ts` (about 100 cases) and `tests/p07-interpretation.test.ts` (30):

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
| Next action | The owner decides: approve with the exact sentence (then set `QLOO_MODE=live` locally, register, execute once, review, seal), decline, or ask for another profile. Nothing happens without that. |
