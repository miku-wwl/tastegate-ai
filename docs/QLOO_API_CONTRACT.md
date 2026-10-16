# Qloo API contract — Phase 0

**2026-10-16. Documentation-verified request profile; no live validation.** Sources and classification meanings: [source register](PHASE0_SOURCES.md). Every method signature in this document is a proposed TasteGate interface unless explicitly described as a provider parameter. No SDK method, response field or numerical rate limit is inferred from a product wish.

## Authentication and environment

VERIFIED (S03): event keys use **`https://hackathon.api.qloo.com`**, with **`X-Api-Key`** in the request header. Never put the key in query parameters, Bearer auth, browser code or logs. Do not append `/v2` to the configured origin: `/search` is unversioned, while Insights and tags have versioned paths. Actual key receipt, successful authentication, entitlements, quotas and expiration are BLOCKED/UNVERIFIED.

S03 says documented endpoints are available to the event, with legacy `/recs` and `/recommendations` unsupported. This is a documented availability statement, not proof of this participant's entitlement. Fix the host in trusted server configuration. Disable redirects to prevent credential forwarding; reject user/model-supplied hosts, paths and HTTP methods.

## Minimal request surface

| Purpose | Method/path | Documented fields chosen for investigation | Evidence/status |
| --- | --- | --- | --- |
| Name lookup | GET `/search` | `query`, `types`, `take=5`, `page=1`; optional `filter.address` or location hint | S04 VERIFIED; exact event encoding and shape BLOCKED |
| Discover semantic tags | GET `/v2/tags` | `filter.query`, `take=5`, `page=1`; optional `filter.tag.types` only after types are verified | S03/S09 VERIFIED; coverage BLOCKED |
| Audit/rank original shortlist | GET `/v2/insights` | `filter.type=urn:entity:place`, `signal.interests.entities`, optional confirmed `signal.interests.tags`, `filter.results.entities`, `take` bounded by shortlist size | S05/S06 VERIFIED; combined behavior BLOCKED |
| Find repair candidates | GET `/v2/insights` | same type/signals; reviewed geography, `filter.exclude.entities`, `take=5`; optional confirmed `filter.tags` | S05/S06 VERIFIED; combined behavior BLOCKED |
| Common-set revalidation rank | GET `/v2/insights` | same signals, `filter.results.entities` for eligible originals plus proposed replacements; no unrelated ranking modifiers | S05/S06 VERIFIED; score/rank comparability BLOCKED |

Documented entity IDs are passed as comma-separated values in interest/shortlist/exclusion fields (S05). Array serialization for search `types` must be verified; begin with one type rather than guessing repeated-versus-CSV handling. Use URL encoding through a standard query serializer. Do not send placeholder IDs or synthetic IDs to Qloo.

Illustrative template, **not an executed URL**:

```text
GET {event_origin}/v2/insights
  ?filter.type=urn:entity:place
  &signal.interests.entities={confirmed_entity_ids_csv}
  &filter.results.entities={resolved_original_place_ids_csv}
  &take=3
```

At least one meaningful signal/filter is needed for recommendations (S10). TasteGate additionally requires confirmed taste signals for a cultural-relevance claim; a location-only or popularity result cannot stand in for taste grounding.

## Types, resolution and cross-domain use

VERIFIED (S03/S04): search and Insights have different accepted types. Insights includes artist, movie, person and place, among other documented categories. Search additionally documents legacy categories such as director. Do not translate Radiohead into a nonexistent `urn:entity:music` type or assume a director search ID is a valid movie signal. Use place for an individual venue, brand for a chain only when explicitly intended.

VERIFIED (S05): entity interests can be in-domain or cross-domain; the desired result category is `filter.type`. This supports investigating artist/movie → place recommendations. **UNVERIFIED:** whether Radiohead, a chosen Wong Kar-wai film and a faithful café/jazz tag combine into usable NYC evidence under this key. No static tag URN or preference UUID is known for the sample.

Resolution policy (ASSUMED): compare names/aliases, subtype and disambiguation; place matches also require branch/location consistency. Search rank is a retrieval hint, not a calibrated identity confidence. Ambiguous equal-name results require explicit choice. A nonexistent search hit means unresolved in this source, not proven nonexistence in the world.

## Entity, tag and geography filters

VERIFIED (S05/S06): `filter.results.entities` restricts the candidate set and is documented for assessing affinity toward an input. `filter.tags` restricts output tags; `signal.interests.tags` influences taste. These purposes are distinct. `operator.filter.tags` supports union/intersection; set it explicitly if multiple hard tags are ever supported, rather than assuming conjunction.

The original audit must not prefilter away a rule-violating place. Rank original IDs first and check location separately. Discovery may apply a reviewed NYC locality or exact geocode tuple, but **returned geography must still be checked**. A missing returned candidate has no automatic negative score.

VERIFIED (S05):

- `filter.geocode.name`, `.admin1_region`, `.country_code` correspond to exact metadata matches; `filter.address` is a partial string match, not proof of city membership.
- `filter.location` accepts a location value; `filter.location.radius` uses **meters**. A named locality has default padding; radius `0` disables that padding. Verify the resolved locality before relying on it.
- Search's `filter.radius` uses **miles** (S04), a different parameter. Never transfer a radius value across these endpoints without explicit conversion and a matching product constraint.
- Latitude/longitude pairs and WKT use different coordinate ordering; WKT is longitude first. Review coordinates and source provenance; do not accept an LLM-generated boundary as authoritative.
- `filter.hours` is a day-of-week filter, not verified opening at a specific evening timestamp. Operational hours certification is excluded.

**UNVERIFIED:** exact NYC borough/geocode normalization, metadata freshness and coverage. If they cannot support a clear city check, do not produce a hard pass or failure; request clarification or a separately sourced geography layer in a later scope review.

## Explainability and score handling

VERIFIED (S05): `feature.explainability=true` requests per-result and aggregate metadata under `query.explainability`; a warning may indicate unavailable explanation. The documentation describes normalized contributions and possible omission of small contributors. **BLOCKED:** actual nested fields, selected-type support, completeness and shape under the event key. S06 does not enumerate this feature for each type, so probe it separately before enabling it in the default profile.

Do not invent `reason`, `why`, contribution arrays or a causal narrative. Store an optional validated projection only after observing its actual format. Missing explanation does not erase a real returned relationship, but it prevents a detailed attribution claim. An omitted contributor does not prove zero contribution.

S11 discusses display percentages and query normalization; S05 describes different normalized explainability values. TasteGate does not assert a live wire scale or globally comparable affinity score. Preserve raw field path, value, query fingerprint and documented meaning when confirmed. Prefer ordering within one identical query context. Never calculate a before/after gain by subtracting scores from separate differently filtered queries. Never display affinity as an individual's likelihood of liking a venue.

## Response boundary and parsing plan

| Field/shape | Evidence | Status and treatment |
| --- | --- | --- |
| Insights `success`, `results.entities` | S10 example | VERIFIED as documented example; validate live before locking parser |
| Entity `entity_id`, `name`, `type`, `subtype` | S10 example | VERIFIED as example; ID format/case and requiredness need live checks |
| Optional `properties`, `tags`, `query` | S10 example | VERIFIED as example; no assumption that every place has city/hours/tags |
| Explainability path family | S05 | VERIFIED documentation; actual child schema UNVERIFIED |
| Exact affinity field/path, scale, missing-value semantics | Inspected examples insufficient | UNVERIFIED; no guessed score field in contracts |
| Search/tag envelopes and error body schemas | Rendered examples incomplete | UNVERIFIED; raw return type remains `unknown` until probed |
| Upstream request ID/trace headers | Not established | UNVERIFIED; optional nullable upstream reference; create a separate local call ID |
| Total counts, next-page tokens, exhaustion guarantee | Not established | UNVERIFIED; no fabricated `next_cursor` or total |

**Schema artifact warning:** S12 is an OpenAPI document meta-schema rather than a Qloo operation specification. Root keys include `$id` and `$defs`, not concrete `paths`/`info`. A full response schema cannot be generated from it. S10's intentionally truncated response is also not parseable contract evidence. Obtain valid private responses and/or a corrected official schema before implementing a strict wire client.

Proposed parser behavior: read a capped JSON body as `unknown`; validate the minimum consumed fields per operation; allow unconsumed provider additions inside the wire parser without trusting them; project to strict internal contracts. Missing required fields or an invalid body produce `SCHEMA_MISMATCH`, never an empty-success default. Preserve explicit missing/null metadata. No universal parser for all Qloo surfaces.

## Pagination

VERIFIED: search uses `page` (1–100 in S04) and `take`; Insights S05 recommends `page` with `take` 1–50 and also describes `offset`; tags S09 uses `page`/`take` 1–50. S06's per-type list favors `offset`, creating a compatibility question. The initial product requests only page 1, omits explicit Insights paging controls, and labels retrieval as **bounded/non-exhaustive**. Do not infer completeness or rejection from absent results. A second search/tag page is possible only within the global call budget and reviewed route. Later pagination must pass per-type live probes.

## Error taxonomy and bounded behavior

The following are **TasteGate categories**, not claims about a uniform Qloo error JSON schema.

| Observed condition | Documented provider evidence | Consumer behavior (ASSUMED) |
| --- | --- | --- |
| Missing/invalid credential, wrong host (401) | S03 | Stop live run; AUTH_REQUIRED; no credential/host fallback |
| Unsupported type/permission (403) | S03 | Stop that operation; FORBIDDEN; no automatic type substitution |
| Search 404 | S04 | EMPTY/UNRESOLVED for a verified search route; distinguish a bad path from a no-match body |
| Invalid request (400) | S05/S09 | INVALID_REQUEST; surface safe metadata, investigate profile; no retry |
| Rate limited (429) | S04/S14 | RATE_LIMITED; stop, expose retry guidance; no immediate automatic retry |
| 5xx | S05/S09 | UPSTREAM_ERROR; no automatic retry in initial profile |
| Deadline/network failure | Consumer observation | TIMEOUT/NETWORK_ERROR; affected checks unknown; no background completion |
| 200 with empty result | S03 | EMPTY; never proof of no relevant place or false recommendation |
| 200 but malformed JSON/shape | Consumer validation | SCHEMA_MISMATCH; retain no fabricated data |
| Unsupported parameter silently ignored | S03 | Prevent via allowlist and detect contradictory output; 200 alone does not satisfy a constraint |

Initial profile: **zero automatic HTTP retries**, including reads. This conservative choice is a consumer policy, not a provider requirement. A user-initiated fresh audit can retry reads subject to quota; it receives a new run ID and records any cached evidence. Any future retry must be GET-only, counted as another dispatch, honor observed Retry-After if available, and fit the same global deadline. Runtime side effects are never retried/replayed by this policy.

## Official SDK, CLI and MCP assessment

VERIFIED (S13/S16/S17): the public harness supplies `qloo explore`, `qloo exec`, `qloo api` and local stdio `qloo mcp`. Its normalized workflow envelope has `ok`, `empty`, `needs_input`, `partial`, `degraded`, `error`; this is **not** the raw REST response shape. All surfaces share credential/quota. Hosted MCP URLs and serverless MCP process hosting are not supported by the inspected kit.

A separately supported official TypeScript/Python REST SDK is **UNVERIFIED** in the inspected official materials. A search result for a community TypeScript SDK is not an official guarantee and is not a dependency recommendation. Use server-side REST for the initial design; no harness, MCP client, SDK or model package was installed. MCP exploration later needs an explicit server/tool allowlist and does not expand the shared Runtime's supported tool scope.

## Access, usage and retention

VERIFIED (S03/S14/S15): individually attributable event key; quotas/rate limits exist but no numeric entitlement was located; no bulk scraping/database recreation; no sensitive-trait inference or personal identifiers for the demo. S03 permits private server-side caching without a specified time cap and prohibits response data in a public repository. TasteGate's proposed retention is stricter: request memory by default, optional private cache for 24 hours, private reviewed probe evidence up to 30 days then deletion; operator TTL jobs must actually be implemented later. These durations are ASSUMED product policy, not Qloo limits.

Public fixture files must be newly authored synthetic data, never copied/redacted live responses. Keep live request/response snapshots outside tracked source and exports private. Permission to display entity metadata and derived evidence in a public judge UI or downloadable report is **UNVERIFIED in precise scope**; confirm allowed fields and redistribution rules with organizer/key terms before publication. A no-secrets export can still contain restricted data.

## Live API validation checklist — all BLOCKED pending key

| Probe | Minimal experiment | Evidence/pass criterion |
| --- | --- | --- |
| P01 | Verify event credential and one GET search | Correct origin/header; private status/body; verified entity fields, no secret logging |
| P02 | Resolve artist and explicitly selected film | Correct names/subtypes/disambiguation; confirm search type serialization |
| P03 | Resolve three original places, including wrong-city and ambiguous branch controls | Correct identity; no best-hit autopick; capture available geography and missingness |
| P04 | Tag lookup for café/jazz concepts | Actual tag IDs and meaning, or explicit unresolved outcome; raw tag envelope verified |
| P05 | Artist → place and confirmed film → place, separately | Two real cross-domain examples, NYC coverage, observed actual result fields; not just HTTP 200 |
| P06 | Rank known shortlist with `filter.results.entities` | Returned IDs stay in set; omissions preserved; actual ordering/measure semantics documented |
| P07 | Discovery and geography filters | Review locality match or exact tuple; boundary and unknown-location control; no hidden out-of-city pass |
| P08 | Same request with explainability disabled/enabled | Exact returned paths or warning/missing state; existing result handling stays valid |
| P09 | Fetch one next page only if needed/authorized within quota | Correct pagination semantics; no completeness inference; update schema evidence |
| P10 | One full audit/repair/revalidation and a safe failure observation | Actual report/provenance; one valid replacement; no fabricated evidence; failures honest |

Before P01, privately record actual numeric quota, burst/concurrency policy, key expiration and allowed display/export/cache uses. Do not deliberately exhaust limits to manufacture 429, use wrong credentials or induce load faults. Use offline fault injection for 401/403/429/5xx/timeout branches unless a safe live observation is available. Record source verification and actual live status separately in every probe result.
