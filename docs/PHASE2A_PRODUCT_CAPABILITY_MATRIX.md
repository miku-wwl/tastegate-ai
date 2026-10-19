# Phase 2A — Product capability matrix

2026-10-19, Pacific/Auckland. Base commit `819a81698b77e853cc996fccb7ec209d42dc0221` plus uncommitted Phase 2A changes.

| Classification | Meaning |
| --- | --- |
| **REAL_LIVE_VERIFIED** | Observed against the real Qloo event API in an owner-approved request |
| **RECORDED_LIVE** | Works in the product on real, previously captured Qloo responses (replayed, no new request) |
| **FIXTURE_ONLY** | Works on authored synthetic data only |
| **PARTIAL** | Some of it real/recorded, some of it missing or synthetic |
| **UNKNOWN** | Documented or designed, never observed |
| **UNSUPPORTED** | Not implemented, or deliberately locked |

## Qloo provider capabilities

| Capability | Class | Evidence and limits |
| --- | --- | --- |
| Event host + `X-Api-Key` authentication | REAL_LIVE_VERIFIED | P01–P05 and P03-R each returned HTTP 200 through the approved probe framework. Quota, rate limit and expiry remain UNKNOWN. |
| Artist search (`GET /search`, artist) | RECORDED_LIVE | P01: 5 candidates (the band plus tribute acts); used in the confirmation flow |
| Movie search | RECORDED_LIVE | P02: 5 candidates; title plus year shown for confirmation |
| Place search, `take=1` | RECORDED_LIVE | P03-R: 1 candidate with geocode; NYC branch corroborated by local review |
| Place search, `take=3` | RECORDED_LIVE (failure) | P03 v1 exceeded the 64 KiB capture budget: UNKNOWN, nothing saved. Kept as history, never replayed. |
| Tag search (`GET /v2/tags`) | RECORDED_LIVE | P04: 5 tags across 4 types; type and parent context shown so musical Jazz is distinguishable |
| Insights artist → place, no geography | RECORDED_LIVE | P05: 1 global top place, outside New York/US by provider geocode; projection admitted for replay only |
| Insights shortlist ranking (`filter.results.entities`) | UNKNOWN | Documented and used by Qloo's harness; P06 prepared, not executed |
| Geography-constrained discovery (`filter.location.query`, `filter.geocode.*`) | UNKNOWN | Documented only |
| Explainability (`feature.explainability`) | UNKNOWN | Documented only |
| `query.affinity` semantics | PARTIAL | Accepted only as query-relative ordering; scale mapping and `audience_growth` UNKNOWN |
| 401/403/429/5xx/timeout handling | FIXTURE_ONLY | Offline fault injection (`tests/qloo-boundary.test.ts`, probe runner tests, evaluation S11–S12). No live error was provoked. |

## TasteGate product capabilities

| Capability | Class | Evidence and limits |
| --- | --- | --- |
| Input validation (strict schema, bounds, authority fields rejected) | FIXTURE_ONLY | Provider-independent; contract tests |
| Explicit identity confirmation (no auto-selection) | RECORDED_LIVE | 4 real decisions in the NYC scenario; stale or foreign references stay pending; the browser receives only keyed references |
| Ambiguity handling | RECORDED_LIVE | Real tribute-act and same-name tag ambiguity; synthetic branch ambiguity |
| Hard constraints from provider geocode/type (city, country, place) | RECORDED_LIVE | Blue Note passes all three; P05 place fails city and country |
| Plan-size constraint | FIXTURE_ONLY | Input-level check (evaluation S10) |
| Cultural-evidence audit of original recommendations | PARTIAL | Synthetic ranking works. Recorded mode honestly reports `APPROVAL_REQUIRED` (needs P06). |
| Missing taste evidence treated as a soft gate (verified venues not replaced) | RECORDED_LIVE | Blue Note is kept as "cultural fit not yet established" |
| Bounded repair discovery | PARTIAL | Exact recorded P05 context replayed (artist signal only, `take=1`, exclusions applied by TasteGate). Geography-aware discovery UNKNOWN. |
| Revalidation that **rejects** using provider facts | RECORDED_LIVE | Unconfirmed-identity facts can reject (wrong city and country) but never pass |
| Revalidation that **accepts** a replacement | FIXTURE_ONLY | Needs an independent lookup and a common-set ranking; with recorded data this is impossible until P06/P07 exist |
| Before/after comparison UI | RECORDED_LIVE | Real data in local UI (private screenshots); synthetic screenshots public |
| Evidence ledger and provenance (probe, attempt, endpoint, time, status, bytes, integrity) | RECORDED_LIVE | Every provider fact is linked to a manifest-verified recording; validator rejects forged links |
| Report graph validation (tamper resistance) | RECORDED_LIVE | 13 provider and 12 fixture tamper classes rejected in tests |
| JSON export | RECORDED_LIVE | Validated report download |
| Free-text claim verification | UNSUPPORTED | Every claim stays unverified; no LLM or claim extraction |
| LLM planning or explanation | UNSUPPORTED | Not implemented (0 LLM calls) |
| Product live Qloo transport | UNSUPPORTED | Locked by design in Phase 2A; live requests only through approved probes |
| Opening hours, live music, availability | UNSUPPORTED | Out of scope; provider hours are never used |
| Borough-level city normalization | UNKNOWN | Exact `geocode.city` comparison; for example, Brooklyn vs New York could falsely mismatch |
| Evaluation harness | PARTIAL | SYNTHETIC 14 cases and RECORDED_LIVE 4 cases measured; LIVE_EXECUTED NOT RUN |
| Public deployment | UNSUPPORTED | Not done; private recordings must never be bundled (trace exclusions verified) |
| Runtime (Agentic Intent Gate) report archive | UNSUPPORTED | Deferred per the AGENTS.md Phase 1A exception |
| Demo video, Devpost submission | UNSUPPORTED | Not started (outside Phase 2A) |
