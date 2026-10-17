# Phase 1B.3 — P04 public cultural-tag query

2026-10-18, Pacific/Auckland. **PLAN ONLY; no request, observed response schema, selected tag or executable P04 profile.**

## Verified endpoint and parameters

The [official Tags reference](https://docs.qloo.com/reference/get-tags), embedded operation get-tags and [Qloo's official mirror](https://raw.githubusercontent.com/qloo/docs-public/main/reference/get-tags.md) confirm GET **/v2/tags**:

| Exact parameter | Documented meaning | Proposed use |
| --- | --- | --- |
| filter.query | String matching tag/audience names | jazz |
| filter.tag.types | Array of exact tag-type strings, comma-separated/form non-exploded | Omitted; no guessed type |
| filter.results.tags | Array of tag IDs, comma-separated | Omitted; no known ID |
| filter.parents.types | Audience parent-type filter | Omitted; no personal/sensitive-trait query |
| feature.typo_tolerance | Boolean, default false | Omitted |
| page | Positive page number; embedded bound 1–100 | 1 |
| take | Integer 1–50, default 20 | 5 |

The embedded schema also lists feature.semantic_search, default false; omitted. Use the [event guide's origin/header](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide), not the general API example host.

```text
GET https://hackathon.api.qloo.com/v2/tags?filter.query=jazz&take=5&page=1
filter.query = jazz
take = 5
page = 1
Accept = application/json
X-Api-Key = private server configuration only
```

Do not substitute query, filter.type, types or a guessed jazz URN. No Tag Types/Insights call, page 2 or alternate query is authorized. A later request needs its own closed profile, fresh P04-only approval, UUID, ledger and private evidence. Proposed future cap: one request / one in flight / <=4000 ms / <=65536 bytes / zero retries or redirects. **No executable path or permission is added here.**

## Tag meaning, type and ID are distinct

The word **jazz** is public query text and a cultural concept, not a provider ID. Returned display names can be ambiguous across taxonomies or related concepts. A **tag type** identifies a taxonomy/category; it is neither a display label nor an entity type such as urn:entity:artist. A **tag ID** identifies one actual returned tag and cannot be constructed from the query. A **value**, if present, needs observation and interpretation rather than assumed equivalence to name/type/ID.

No concrete jazz tag type/ID is asserted. Choosing an exact filter.tag.types value requires independently reviewed taxonomy evidence, without an extra API call in this phase. Existence or popularity proves no affinity or suitability as a later signal/filter.

## Review protocol after later approved capture

1. Keep raw JSON private. Inspect the actual envelope and all candidates locally; record paths/types/missingness. Do not invent a result collection path or guaranteed fields from examples.
2. Validate identity/name/type/ID only after observation. Preserve unknown fields and mismatches; establish distinct IDs and type meaning without rank-only selection.
3. Review whether each candidate means the intended musical/cultural concept, a related concept or an unrelated usage. Several plausible meanings => AMBIGUOUS; missing identity/type or no result => UNKNOWN. Keep unsuccessful outcomes without retrying for favorable data.
4. Record observed schema and independent review as separate private artifacts. Syntax success cannot produce semantic audit PASS, affinity evidence or adapter activation.

P01 had attached tags on **1/5 artist results**, absent on 4/5; inspected items had name/tag_id/type/value strings. These are contextual artist attachments, **not a real P04 tag-search response**. They establish neither this endpoint's envelope/fields nor a requirement that all search results have tags.

**Do not execute P04 in Phase 1B.3.**
