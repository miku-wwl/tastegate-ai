# Phase 0 source register

Verified on **2026-10-16, Pacific/Auckland**. This register records public documentation inspection, not authenticated API execution. No Qloo data endpoint was called. Documentation can change; recheck event rules and account entitlements before implementation and submission.

## Evidence vocabulary

| Label | Meaning |
| --- | --- |
| VERIFIED | The cited primary source explicitly documents the claim, or a stated local inspection observed it. Does not imply the event key returned it. |
| ASSUMED | A TasteGate design choice or hypothesis, deliberately awaiting validation. |
| UNVERIFIED | Evidence is absent, incomplete, inconsistent, or insufficient. |
| BLOCKED | A named dependency prevents the required experiment, principally the unavailable event key. |

Execution checks use PASS / NOT RUN / BLOCKED separately. A documentation VERIFIED finding can have live validation BLOCKED.

## Primary sources

| ID | Source and stable reference | Evidence inspected |
| --- | --- | --- |
| S01 | [Hackathon overview](https://qloo.devpost.com/) | Requirements, external hosting, public source/license, no mandatory video, four judging dimensions, deadline. |
| S02 | [Official rules](https://qloo.devpost.com/rules) | Sections 1, 3, 4 and 6: submission/judging periods, eligibility, software and access requirements, English materials, reuse disclosure, equally weighted criteria. |
| S03 | [Hackathon developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide) | Event base URL/header; supported entity categories; GET Insights; ignored unsupported parameters; authentication failures; quotas; private caching and public-repository restriction. |
| S04 | [Search Entities](https://docs.qloo.com/reference/get-search) | GET `/search`; `query`, `types`, location/address filters, `page`, `take`, sorting; 200/404/429. Search-only legacy categories differ from Insights types. |
| S05 | [Insights API Deep Dive](https://docs.qloo.com/reference/insights-api-deep-dive) | GET `/v2/insights`; interests, shortlist filtering, explainability, geography, `page`/`offset`/`take`, documented response codes. |
| S06 | [Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type) | Place supports entity/tag interests, shortlist IDs, tags, exclusions and geographic filters. Per-type compatibility must be checked. |
| S07 | [Parameter Reference](https://docs.qloo.com/reference/parameters) | Filter/signal distinction; some names differ from S05/S06. This is evidence of documentation drift, not permission to send aliases. |
| S08 | [Official public documentation repository](https://github.com/qloo/docs-public) | Public mirror and the claim that it includes an OpenAPI specification. Inspected commit `d4a0eb978518f7fb404993d1509d11b21239ada6`. |
| S09 | [Pinned tag search reference](https://github.com/qloo/docs-public/blob/d4a0eb978518f7fb404993d1509d11b21239ada6/reference/get-tags.md) | GET `/v2/tags`, `filter.query`, tag filters, `page`, `take` 1–50; 200/400/500. |
| S10 | [Pinned recommendation example](https://github.com/qloo/docs-public/blob/d4a0eb978518f7fb404993d1509d11b21239ada6/reference/basic-insights-use-case.md) | Documented example paths `success`, `results.entities`, `entity_id`, `name`, `type`, `subtype`, `properties`, `tags`, `query`; example is truncated, not a complete wire schema. |
| S11 | [Interpreting affinity scores](https://github.com/qloo/docs-public/blob/d4a0eb978518f7fb404993d1509d11b21239ada6/docs/interpreting-affinity-scores.md) | Context-dependent scores and query normalization; small differences require care. Does not establish individual preference probability. |
| S12 | [Published schema artifact](https://github.com/qloo/docs-public/blob/d4a0eb978518f7fb404993d1509d11b21239ada6/openapi-schema.json) | Actually a generic OpenAPI 3.1 document meta-schema: `$id=https://spec.openapis.org/oas/3.1/schema/2022-10-07`, `$defs`, no root Qloo operations. Cannot generate a Qloo client from this file. SHA-256 `da01ba28852cac0de53893797cb8d1942bc3b05084f526dcc216717dec314ed0`. |
| S13 | [Official Hackathon Kit](https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/README.md) | Node >=22.19.0, `@qloo/qloo-harness` >=0.1.26; chat, CLI, local MCP; aggregate affinity limits. |
| S14 | [Kit API access](https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/API_ACCESS.md) | Attributable credentials, shared quota across surfaces, bounded use, no bulk database recreation; no numeric event quota is supplied here. |
| S15 | [Kit safe use](https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/SAFE_USE.md) | No sensitive inference; avoid personal data; distinguish source from interpretation; clarify ambiguous entities/tags; model/tool output untrusted. |
| S16 | [Kit MCP starter](https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/starter/mcp-client/README.md) | `qloo mcp` is local stdio, no hosted URL; tools include `qloo_rank`, `qloo_recommend`; normalized envelope has six statuses. Browser/serverless process hosting is unsupported for this route. |
| S17 | [Kit CLI starter](https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/starter/cli-workflow/README.md) | `qloo exec` normalized workflow versus `qloo api` raw endpoint output; uncertain tags must not be used as confirmed signals. |
| S18 | [Kit submission guide](https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/SUBMISSION.md) | Problem statement, workflow rationale, redacted provenance, reproducibility and limitations. Event rules take precedence for required submission fields. |
| S19 | [Pinned Runtime consumer example](https://github.com/miku-wwl/agentic-intent-gate/blob/7261fdd2f47d2b15fabe8faac527eeee37338eb1/examples/consumer/app.py) | Read in full. Public composition, separate approval/admission/authorization, durable local effect/receipt example; scripted consent is only example consent. |
| S20 | [Pinned Runtime adapter guide](https://github.com/miku-wwl/agentic-intent-gate/blob/7261fdd2f47d2b15fabe8faac527eeee37338eb1/docs/ADAPTER_GUIDE.md) | Read in full. One SIDE_EFFECT tool, flat bounded schema, five-second default, no general READ_ONLY dispatch, durable Unknown and no recovery replay. |
| S21 | [v0.2.0 consumer handoff](https://github.com/miku-wwl/agentic-intent-gate/blob/main/docs/V0.2.0-CONSUMER-HANDOFF.md) | Read in full. Release SHA/tag and installation checks. This later handoff is on moving main; it is a reference, never the dependency target. Its payment-specific downstream instructions do not apply to TasteGate. |
| S22 | [Pinned public Runtime module](https://github.com/miku-wwl/agentic-intent-gate/blob/7261fdd2f47d2b15fabe8faac527eeee37338eb1/src/agentic_intent_gate/runtime.py) | Source-inspected `ToolCapability`, exports and keyword-only `open_runtime`; not installed-package verification. |
| S23 | [Pinned Runtime package metadata](https://github.com/miku-wwl/agentic-intent-gate/blob/7261fdd2f47d2b15fabe8faac527eeee37338eb1/pyproject.toml) | Source metadata reports 0.2.0, Python >=3.13,<3.14, MIT. |

## Retrieval observations and conflicts

- The documentation root and some subsequent fetches were intermittently inaccessible. Individual reference pages were readable. The guide's tag link `/reference/get-tags-1` returned 404 through the browsing tool; S09 supplies a pinned official fallback. This is a documentation-link failure, not a tested Qloo API error.
- S03 describes event Insights as GET. S05 includes POST-only advanced parameter descriptions. TasteGate's initial profile uses GET only and excludes POST body resolution; POST entitlement/behavior remains UNVERIFIED.
- S06 lists `offset` but not every feature/paging control shown by S05. S07 contains older names such as `filter.entities`. Use S05 + S06 for the proposed profile and verify the exact combination with the event key; never send several guessed aliases.
- S04 leaves the search `take` bound unspecified in rendered text; the pinned mirror documents 1–100. TasteGate chooses 5, requiring a live encoding/shape check rather than assuming the mirror is current.
- S12 is not the advertised Qloo operation specification. A failed inspection initially expected a root `info` key and raised `KeyError`; inspecting its actual root established the meta-schema mismatch. No client was generated.
- S11's display percentages do not establish the scale or field path of a live wire affinity value. Explainability contributions in S05 are separately normalized. Preserve raw measures and context; do not apply a universal threshold.

## Local evidence

Initial repository: clean `main...origin/main`, HEAD `276e4065a23cfd27eb961b37dc860089776b3f8d`; three tracked files only. This observed tracking state is not a fresh remote synchronization check.

Protected file SHA-256 before work:

| File | SHA-256 |
| --- | --- |
| `AGENTS.md` | `22568a278ec4682f2f2d8e4608af580c1102f985244da89bb8355bc9fd562e1b` |
| Strategy v1.0 | `0b8d98e463b5393b46917646e1092ccd9bdc17be8340c098e477568eac3a2fcb` |

`git ls-remote` against the public Runtime repository returned tag object `b193d38a4804725d44ca536a3bd9778679cc7b4c` and peeled commit `7261fdd2f47d2b15fabe8faac527eeee37338eb1`. The Kit main ref returned `0db91b8d9c5aae2160d53596e57ea6c9da251cde`; the Qloo docs tree API returned `d4a0eb978518f7fb404993d1509d11b21239ada6`.

`python` is 3.13.9, Node 26.5.0, npm 12.0.1, uv 0.11.16. No repository `pyproject.toml`, Python lockfile, `.venv` or application package manifest exists. The current Python interpreter's distribution metadata search returned no `agentic-intent-gate`. Installed version/provenance/signatures: NOT RUN, deferred before integration code. No dependency was installed for this documentation-only milestone.
