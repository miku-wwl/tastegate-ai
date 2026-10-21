# Real Qloo capability matrix

2026-10-20, Pacific/Auckland. Base commit `6b446784d01def511fe4ce1d53fe4ca4dd39b27e` plus uncommitted Phase 2B/3A changes. Supersedes the [Phase 2A matrix](PHASE2A_PRODUCT_CAPABILITY_MATRIX.md). **Exactly one Qloo request was made in this phase: P06 (shortlist ranking), under a single-use, P06-only owner approval, executed once and sealed.** It moved one provider row from UNKNOWN to REAL_LIVE_VERIFIED; everything else is unchanged.

> **Phase 3B update (2026-10-21).** **No Qloo request was made in Phase 3B**, so no provider row changed class. What changed is on the product side: P07 is now a prepared gate awaiting the owner's approval (never executed); a replacement is `REPAIR_VERIFIED` only with an independent second source; live grants and probe approvals use exact, digest-bound consent ([review](LIVE_AUTHORIZATION_SECURITY_REVIEW.md)); the gate has 91 checks. Rows below are updated only where they named these items.

| Classification | Meaning |
| --- | --- |
| **REAL_LIVE_VERIFIED** | Observed against the real Qloo event API in an owner-approved request |
| **RECORDED_LIVE** | Works in the product on real, previously captured Qloo responses (replayed, no new request) |
| **FIXTURE_ONLY** | Works on authored synthetic data or a test double only |
| **PARTIAL** | Some of it real or recorded, some of it missing or synthetic |
| **UNKNOWN** | Documented or designed, never observed |
| **UNSUPPORTED** | Not implemented, or deliberately locked |

## Qloo provider capabilities

| Capability | Class | Evidence and limits |
| --- | --- | --- |
| Event host + `X-Api-Key` authentication | REAL_LIVE_VERIFIED | P01–P05 and P03-R returned HTTP 200 through the approved probe framework. Quota, rate limit, expiry and rotation remain UNKNOWN. The developer guide says keys work only on `hackathon.api.qloo.com` and are deactivated after the hackathon closes. |
| Artist search (`GET /search`, artist) | RECORDED_LIVE | P01; used in the confirmation flow |
| Movie search | RECORDED_LIVE | P02 |
| Place search, `take=1` | RECORDED_LIVE | P03-R; the NYC branch was corroborated by local review |
| Place search, `take=3` | RECORDED_LIVE (failure) | P03 v1 exceeded the 64 KiB capture budget: UNKNOWN, nothing saved. Kept as history, never replayed. |
| Tag search (`GET /v2/tags`) | RECORDED_LIVE | P04; type and parent context distinguish musical Jazz |
| Insights artist → place, no geography | RECORDED_LIVE | P05: one global top place; by the provider's own geocode it is outside New York and the US |
| Insights shortlist ranking (`filter.results.entities`) | **REAL_LIVE_VERIFIED** (one sample) | **P06**: HTTP 200, 41,953 bytes. Class **A**: 2 requested, 2 returned, each with a numeric `query.affinity`, nothing outside the shortlist. The parameter is honoured for this sample under the event key. Ordering is meaningful only inside that one query: the unfiltered top place ranked above the reviewed NYC venue. Not verified: larger shortlists, other signals, how unknown IDs are treated. |
| Geography-constrained discovery (`filter.location.query`, `filter.geocode.*`) | **UNKNOWN** | Documented only, with a documentation conflict (the locality filter is not listed for `place`, so it may be silently ignored). **P07 is PREPARED and awaiting the owner's exact approval; it has never been executed** ([readiness](P07_NYC_REPAIR_READINESS.md)). |
| Explainability (`feature.explainability`) | UNKNOWN | Documented only; recorded and live reports state "attribution missing" |
| `query.affinity` semantics | PARTIAL | Treated as query-relative ordering only. Scale mapping unknown. Never compared across queries, never a probability. |
| 401/403/429/5xx/timeout/oversize/non-JSON handling | FIXTURE_ONLY | Offline fault injection for the probe sender and for the live adapter (46 adapter tests). No live error was provoked. |
| Behaviour of the live adapter against the real API | **UNKNOWN** | Built and tested against an authored double. Never exercised against Qloo. |

## TasteGate product capabilities

| Capability | Class | Evidence and limits |
| --- | --- | --- |
| Strict input validation, authority fields rejected | FIXTURE_ONLY | Provider-independent; contract tests |
| **Custom plan** (form, JSON import/export, server normalization) | FIXTURE_ONLY | Provider-independent: 93 normalization and 25 form tests. Control, invisible and bidi characters, reserved IDs, unknown fields, depth and size are refused with a path and a fixed reason, never the value. |
| Custom plan audited against recordings | RECORDED_LIVE (covered strings only) | Exact-string coverage; the form shows which strings have a recording. Everything else is UNKNOWN, never negative. |
| Custom plan with **no** provider evidence | PARTIAL | Honest all-UNKNOWN audit plus what needs no evidence (size limit, claims); the banner says no Qloo evidence was available |
| Explicit identity confirmation (no auto-selection) | RECORDED_LIVE | Four real decisions in the NYC scenario; stale or foreign references stay pending; the browser receives only keyed references |
| Ambiguity handling | RECORDED_LIVE | Real tribute-act and same-name tag ambiguity; synthetic same-name branches |
| Hard constraints from provider geocode/type | RECORDED_LIVE | The recorded venue passes all three; the recorded discovery fails city and country |
| Plan-size constraint | FIXTURE_ONLY | Input-level; a plan over its limit has every item blocked (a person chooses what to drop) |
| Cultural-evidence audit of originals | RECORDED_LIVE (one plan) | With the sealed P06 ranking the verified venue has taste evidence (rank 2 of 2 in the query) and is REVIEW; a venue with no recorded lookup stays UNKNOWN. Other signal choices have no recorded ranking and stay UNKNOWN. |
| Missing taste evidence as a soft gate | RECORDED_LIVE | A verified venue is kept as "cultural fit not yet established", never replaced for lack of evidence |
| Unified common-set ranking (originals and proposals in one query) | RECORDED_LIVE (one plan) | The real P06 capture is exactly the common set of the verified venue and the recorded proposal; any other set is NOT_CAPTURED |
| Repair target selection (blocked or no identity only) | RECORDED_LIVE | Real run: one target; the verified venue is not a target |
| Bounded repair discovery | PARTIAL | Exact recorded P05 context replayed (artist signal only, `take=1`). Geography-aware discovery UNKNOWN (P07). |
| Replacement identity by independent lookup, a registered official public reference, **or** user confirmation | FIXTURE_ONLY (lookup) / MODEL ONLY (reference) | Phase 3B: only a lookup or a reference **verifies** a repair; the user's confirmation is recorded and yields `EVIDENCE_INSUFFICIENT`. The reference model is built and tested with authored data; no real reference exists. |
| Revalidation that **rejects** using provider facts | RECORDED_LIVE | Unconfirmed-identity facts can reject but never pass |
| Revalidation that **accepts** a replacement | FIXTURE_ONLY | With real data this needs P07 **and an independent second source** for the replacement's identity (a registered official public page or a separate provider lookup). The user's own confirmation of Qloo's candidate is recorded but yields `EVIDENCE_INSUFFICIENT`. |
| Repair statuses in the UI (`REPAIR_VERIFIED / REJECTED / UNAVAILABLE / EVIDENCE_INSUFFICIENT / UNKNOWN`) | RECORDED_LIVE (rejected) / FIXTURE_ONLY (verified) | A rejected replacement is never shown as a repair |
| Five-screen flow, three labelled modes, before/after comparison | RECORDED_LIVE | Real data in the local UI (private screenshots); synthetic screenshots are public-safe |
| Evidence ledger and provenance | RECORDED_LIVE | Every provider fact links to a manifest-verified recording; the validator rejects forged links; a live report cannot be relabelled as a recording or the reverse |
| **AUTHORIZED_LIVE** (grant, durable ledger, allowlisted builders, breaker, kill switch) | FIXTURE_ONLY | Engineering verified with a double: 46 adapter, 54 service, 29 CLI, 37 exact-consent and 7 UI tests (Phase 3B). **Provider behaviour UNKNOWN.** |
| Evaluation | PARTIAL | SYNTHETIC 14 dev cases and a 60-plan seeded holdout, RECORDED_LIVE 4 variants of one plan; **AUTHORIZED_LIVE NOT RUN** |
| Deployment-safety gate | FIXTURE_ONLY | Synthetic canaries, clean-copy build, real-token scan, Docker build-context scan; 91/91 PASS (47 before Phase 3B), self-test shows it can fail. Nothing is deployed. |
| Free-text claim verification | UNSUPPORTED | Every claim stays unverified; no LLM or claim extraction |
| LLM planning or explanation | UNSUPPORTED | 0 LLM calls |
| Public display of Qloo-derived data | UNKNOWN | The developer guide does not address it; see the readiness document |
| Opening hours, live music, availability | UNSUPPORTED | Out of scope |
| Borough-level city normalization | UNKNOWN | Exact `geocode.city` comparison; for example Brooklyn vs New York could falsely mismatch |
| Public deployment | UNSUPPORTED | Not done. The standalone build runs with no private evidence and live off (gate-verified). |
| Runtime (Agentic Intent Gate) report archive | UNSUPPORTED | Deferred per the AGENTS.md Phase 1A exception |
| Demo video, Devpost submission | UNSUPPORTED | Not started |
