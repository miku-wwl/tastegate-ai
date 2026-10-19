# Phase 2A — P05 Insights semantic review

2026-10-19, Pacific/Auckland. **Local review of the one saved P05 response. No Qloo request was made.** The immutable P05 transport record stays `UNKNOWN / SCHEMA_REVIEW_REQUIRED` (it describes the capture, not this review). This review admits one narrow, isolated Insights projection for **read-only replay**; it does not promote any Qloo ID, accept a cultural score as a preference, or authorize another request.

## Sources

| Source | What was used |
| --- | --- |
| Private capture `private/qloo-probes/p05/attempts/154bd4c0-ea64-49c5-ad95-cb57efd7647a/response.raw.json` | Read locally; SHA-256 re-verified against the private post-execution manifest before every use. Never copied into tracked files. |
| Official docs, `qloo/docs-public` tree `d4a0eb978518f7fb404993d1509d11b21239ada6` (unchanged since Phase 0) | `reference/insights-api-deep-dive.md`, `reference/available-parameters-by-entity-type.md` (privately saved copies), `docs/interpreting-affinity-scores.md`, `docs/affinity-score.md`, `docs/affinity-score-methodology.md`, `docs/faqs.md`, `reference/basic-insights-use-case.md`, `reference/get-entities.md` |
| Official harness `@qloo/qloo-harness@0.1.26` (npm tarball SHA-256 `95529b2ac520450e5a2c9701a9baa1d2eccf52f15ccd6ef408aec86397d13ed6`; kit `main` `0db91b8d…`) | Source read only, never executed: how Qloo's own tool reads Insights results (`compactEntity`) and ranks shortlists (`qloo_rank`). |

## Verified structural facts (single sample, take=1, no geography)

| Path | Observed | Documentation | Product use |
| --- | --- | --- | --- |
| `$.success` | `true` | Documented example | Must be literal `true` |
| `$.results.entities[]` | 1 object | Documented example | Projected; count must be ≤ `take` |
| `[].entity_id` | Opaque string | Documented | Replaced by a per-process keyed reference (`qloo-ref:…`); never exported |
| `[].type` | `urn:entity` | Same pattern as the documented movie example (`type: urn:entity`, `subtype: urn:entity:movie`) | Must be literal `urn:entity` |
| `[].subtype` | `urn:entity:place` | Same pattern | Must equal the requested `filter.type`; **never copied into `type`**; the normalized `kind=place` derivation is explicit and the raw pair is preserved in `provider_class` |
| `[].properties.geocode.{city,country_code,name}` | Strings | Place docs list `filter.geocode.*` as exact metadata matches | `city`/`country_code` feed hard-constraint checks; `name` is shown as neighborhood |
| `[].tags[]` | `{id, name, type, weight}` | — | **Different from search tags** (`{name, tag_id, type, value?}`); only category/genre place tag names are shown |
| `[].query.affinity` | Finite number between 0 and 1 | See below | Kept as transparency data only; no decision uses it |
| `[].query.measurements.audience_growth` | Number | Appears in the documented example (with a negative value); undefined | **Not consumed** |
| `[].popularity` | Number between 0 and 1 | Only indirectly documented (`filter.popularity.*` = percentile) | Not consumed |
| `[].properties.hours`, address, phone, images, descriptions, `location`, `external`, `references`, `disambiguation` | Present | — | Quarantined, except `disambiguation` shown as provider detail. Hours are **not** used: operational facts are out of scope. |

## Documented semantics accepted (narrowly)

- **`query.affinity`**: Qloo's per-result affinity for **this one query**. The docs describe affinity as normalized per query, shown as 0–100 in the documentation (the wire value observed is 0–1). They warn that scores drop as inputs/filters change, that small differences are not meaningful, that it is not a survey percentage, and that the index (order) determines relative ranking. Qloo's own harness reads `query.affinity` as the result's affinity and states that "scores from separate calls are not comparable".
- **Accepted meaning:** ordinal, within one identical query context only. **Not** comparable across queries, **not** a probability that a person will like a place, **not** proof of personal suitability.

## Still unknown

- The exact mapping between the 0–1 wire value and the documented 0–100 display scale.
- The meaning of `measurements.audience_growth`.
- Whether a multi-result Insights response is strictly ordered by affinity (one sample with one result cannot show this).
- Coverage, freshness and borough-level normalization of `geocode.city`.

## Entity identity limitations

The returned place was never independently looked up. Its provider ID is not promoted. In the product, its provider-reported facts can **reject** a proposal (a proven contradiction) but can never **pass** one: agreeing facts on an unconfirmed identity become `FACT_UNCONFIRMED / unknown`.

## Provider evidence boundary and the product finding

The request carried one artist signal, no geography and `take=1`. The single returned Place is therefore an **unfiltered global top result** for that signal. Its provider geocode places it **outside New York and outside the United States**. Names, coordinates, IDs and scores stay private and appear only in the owner's local UI and private screenshots.

This is exactly the failure TasteGate exists to catch: a taste-relevant suggestion that violates a hard constraint. In the recorded NYC scenario, this capture is replayed as repair discovery, and revalidation **rejects** it with `CITY_MISMATCH` and `COUNTRY_MISMATCH` taken from the provider's own data. No counterfactual or comparison request was run, so P05 still proves nothing about recommendation improvement.

## Decision

`ADMITTED_FOR_RECORDED_REPLAY_ONLY`: `projectInsightsPlaces` (`src/qloo/projections.ts`) is a strict, observed-only projection. It is separate from the search and tags projections, picks only consumed fields, rejects mismatched envelopes, types, subtypes and non-finite affinity, and never defaults missing fields. It is tested on authored payloads (`tests/projections.test.ts`) and on the real capture locally (`tests/recorded-live.private.test.ts`, owner machine only). Live use of Insights by the product remains locked.
