# Phase 1B.3.3 — P05 Insights documentation-only preparation

This preparation snapshot precedes the separately approved [single P03-R capture](PHASE1B33_P03R_EXECUTION_REPORT.md). P03-R has now executed, but branch identity is not independently accepted and no P05 authority is inherited. P05 remains unimplemented and unexecuted.

2026-10-19, Pacific/Auckland. **DOCUMENTATION PREPARED; DISPATCH BLOCKED.** No P05 profile/checkpoint/HTTP client/registry entry or request is implemented. P03-R consent cannot authorize Insights.

## Official evidence reviewed

Direct read-only retrievals returned HTTP 200 for the official Qloo docs mirror's [Insights Deep Dive](https://raw.githubusercontent.com/qloo/docs-public/main/reference/insights-api-deep-dive.md), [entity-type guide](https://raw.githubusercontent.com/qloo/docs-public/main/reference/available-parameters-by-entity-type.md), [parameter reference](https://raw.githubusercontent.com/qloo/docs-public/main/reference/parameters.md), [basic use case](https://raw.githubusercontent.com/qloo/docs-public/main/reference/basic-insights-use-case.md) and [parameter overview](https://raw.githubusercontent.com/qloo/docs-public/main/reference/parameter-overview.md). Timestamp/status/hash metadata is retained; full bodies are excluded from the ZIP. The web reader could not retrieve the ReadMe-hosted candidate reference URLs; unsupported guessed slugs returned errors and were not treated as sources. No Try It/API request was used and no third-party SDK is relied upon.

Verified request facts: GET `/v2/insights`; `filter.type` is required, including `urn:entity:place`. `signal.interests.entities` accepts real entity IDs as a comma-separated GET list. The Place guide lists this signal and take as optional; take accepts 1–50. General reference documents page >=1, but the Place matrix omits it; the minimal proposal omits pagination. Name/address signal resolution using `signal.interests.entities.query` is POST-only and is not substituted into GET.

## Small proposed first observation

```text
GET https://hackathon.api.qloo.com/v2/insights
filter.type=urn:entity:place
signal.interests.entities=<ONE_PRIVATELY_REVIEWED_AND_ACCEPTED_ARTIST_ENTITY_ID>
take=1
```

This is a **non-executable template**, not an exact approved URL. The placeholder is not a fabricated ID. A possible input is the saved Radiohead artist candidate, but request acceptance/title matching does not select its provider ID. The owner/reviewer must accept one exact private signal identity before any executable profile or final URL is prepared. Do not query Radiohead again automatically or supply the title in an ID parameter. P02's movie and P04's Jazz tag are not silently blended into the signal.

No geography filter is included in this first minimal cross-domain observation. It cannot claim NYC targeting. The incomplete P03 v1 result supplies no place ID; P03-R has not run, so there is no accepted venue ID for a candidate-restricted request. `filter.results.entities` is documented separately for restricting candidates, but is deferred until a real candidate is independently accepted. Its behavior/coverage cannot be assumed from docs alone.

Explainability is separately documented and may return a warning when unavailable. It is omitted from this minimal proposal to keep the first observation small; no explanation path, contribution score or affinity is assumed to exist in a future response. Any added flag or candidate/location filter must be reviewed in a new fixed request scope.

## Future execution and review prerequisites

Before dispatch: independently accept the private artist signal; review the exact encoded URL and host/header; review current entitlements/key handling; implement and test a separate P05-only fixed profile/checkpoint/versioned ledger/capture budget; obtain fresh owner consent. Suggested limits are one dispatch, concurrency one, 4000 ms and no retries/redirects. **P03-R's 256 KiB budget is not inherited**: P05's own cap and capture rights must be proposed explicitly. No P05 attempt/approval is registered here.

After any separately approved capture, inspect actual fields/types/missingness and link observations to that exact request. HTTP 200, a returned list, position, popularity or a numerical score alone cannot establish cultural affinity, personal liking, NYC membership or recommendation improvement. Missing/error/ambiguous outcomes remain UNKNOWN. Retain every result and warning; no auto-repair, fallback, extra page or second request. A single observational request supplies no counterfactual comparison or causal evidence.

Inputs, response schema, live support/entitlements, cross-domain usefulness, score semantics, explainability and place identity remain unverified. **P05 remains outside the executable registry; do not execute it in this phase.**
