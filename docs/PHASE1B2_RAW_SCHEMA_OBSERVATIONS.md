# Phase 1B.2 — Actual P01 raw schema observations

2026-10-17. **Observed from exactly one approved live P01, HTTP 200.** Attempt `ed655afc-82d7-4efd-ba99-9f55bd031f27`; private body **10,391 bytes**. This is a sample observation, not a universal response contract or a mapper.

Local Node helpers read the saved private JSON and emitted structure/missingness/counts only. Provider entity IDs, names other than the already approved query comparison, descriptions, URLs, aliases, tags and other scalar values remain private. The raw response and its integrity record are excluded from the review ZIP.

## Envelope and entity collection

| Actual observed path | Observed shape / count |
| --- | --- |
| `$` | Object; only top-level key `results` |
| `$.results` | Array of **5** objects; not empty |
| `$.results[].entity_id` | Nonempty string on 5/5; 5 distinct IDs; all 5 happened to be UUID-shaped |
| `$.results[].name` | String on 5/5 |
| `$.results[].types` | Array on 5/5; every result contains the approved `urn:entity:artist` member |
| `$.results[].properties` | Object on 5/5 |
| `$.results[].popularity` | Number on 5/5; no affinity/probability/scale interpretation established |
| `$.results[].disambiguation` | String on 5/5; no automatic identity conclusion made |
| `$.results[].tags` | Array on 1/5, **omitted on 4/5**; not treated as guaranteed |

No nulls were observed in these present item-level fields. Requiredness and behavior for null/empty/malformed variants remain unknown beyond the sample. UUID shape is an observation, not a newly enforced provider ID constraint.

## Nested presence and missingness

All five `properties` objects contain `akas` arrays, `duration` objects, `external` objects, `image` objects and `short_description` strings. All five `akas` arrays are empty and all five `duration` objects are empty; an empty container does not establish usable facts. All five `image.url` paths are strings; no linked image or external URL was fetched. External identifiers and descriptions were not copied or independently verified.

For the first result only, `tags` has 55 objects; the inspected tag-item shape has string fields `name`, `tag_id`, `type`, `value`. This is not a P04 tag-search result and establishes no tag semantics or universal tag schema. The first entity's observed `properties.external` includes provider-named objects; their contents remain private and are not normalized into trusted identifiers.

## Matching, pagination and HTTP limits

Local fixed-query comparisons found exactly **one** result with the normalized label Radiohead, the requested artist type and a nonempty ID (position 1 of this five-item response). All five results have the artist type. No exact-label ambiguity was observed within this returned set. Catalog-wide ambiguity, aliases and independent identity confirmation are **NOT VERIFIED**; no best-hit ID was automatically admitted.

There is **no top-level page, total, cursor or other pagination metadata** in this response. Returning five results after take=5/page=1 does not prove exhaustion, total count, page-2 behavior or a universal pagination policy.

Only **HTTP 200** was observed live. Actual 400/401/403/404/429/5xx, error-body semantics, timeout and entitlement failures remain **NOT OBSERVED**; their test-double coverage is offline evidence. The authenticated request was accepted; authentication enforcement and key validity outside this request were not tested.

The immutable runner summary remains UNKNOWN/SCHEMA_REVIEW_REQUIRED. A separate scoped review passes request acceptance/basic artist lookup based on the observed shape and exact-label/type checks. It does not establish semantic audit PASS, cultural relevance, personal preference or live adapter readiness. No trusted audit evidence was created. Stop before P02. See [probe report](PHASE1B2_P01_LIVE_PROBE_REPORT.md) and [execution review](PHASE1B2_EXECUTION_REVIEW.md).
