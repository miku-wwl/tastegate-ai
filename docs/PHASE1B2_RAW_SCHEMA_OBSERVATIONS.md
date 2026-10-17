# Phase 1B.2 — Raw schema observations

2026-10-17. **NOT RUN / BLOCKED. No provider response has been observed.** The following table deliberately records unknowns, not an inferred response schema. Documentation examples, the Kit's normalized workflow envelope and authored local doubles are not live REST evidence.

| Surface | Actually observed live fields/shape | Status |
| --- | --- | --- |
| P01 `/search` authentication/error/success envelope | NONE | BLOCKED |
| Artist/movie/place ID, name, type, aliases, requiredness | NONE | BLOCKED |
| Tag ID, label, type and `/v2/tags` envelope | NONE | BLOCKED |
| Place location/geocode/branch metadata | NONE | BLOCKED |
| Insights ranking/affinity and explainability paths | NONE | BLOCKED |
| Pagination, empty/null/omitted/error semantics | NONE | BLOCKED |
| Actual quota, response/request IDs, latency and size | NONE | BLOCKED |

No consumed provider field paths, identifier grammar, affinity scale, entity choice, geographic assertion or strict wire mapper was implemented. Raw JSON is `unknown`. The raw runner validates syntax/media/UTF-8/size only and always requires schema review after a 2xx body. It cannot create evidence accepted by the fixture audit contracts or enable the LiveQlooAdapter.

After the single separately approved P01, a human reviewer should privately record actual top-level/container types, returned keys, exact inspected field paths, ID/type/name observations, required/null/omitted distinctions, ambiguity, warnings, HTTP status, capped raw-byte hash and source snapshot. Report safe structural findings separately from product interpretation; do not copy raw private bodies, auth headers, credentials or setup state into this file/ZIP. Do not infer schema from one incomplete example beyond fields actually consumed and reviewed.

Empty/ambiguous/unexpected bodies stay UNKNOWN. HTTP 200 alone does not prove a resolved Radiohead identity, permitted entitlement, cultural suitability or a personal preference probability. P02-P10 require additional explicit review and their own actual observations. Until then this document remains NOT RUN/BLOCKED. See [P01 status](PHASE1B2_P01_LIVE_PROBE_REPORT.md), [secure readiness](PHASE1B1_SECURE_PROBE_READINESS.md) and the [existing contract](QLOO_API_CONTRACT.md).
