# Phase 2A — P06 fixed-shortlist ranking feasibility

2026-10-19, Pacific/Auckland. **Documentation and source review only. P06 is prepared, NOT approved and NOT executed (zero requests).** No execution code was added.

## Question

Can Qloo Insights score and order an arbitrary caller-provided shortlist of Place IDs against confirmed taste signals? This is what TasteGate needs to give original recommendations real cultural evidence.

## Evidence

| Source | Finding |
| --- | --- |
| Insights deep dive (`qloo/docs-public` `d4a0eb97…`) | `filter.results.entities`: "Filter by a comma-separated list of entity IDs. Often used to assess the affinity of an entity towards input." `take` 1–50 (default 20). `sort_by` = affinity or distance. |
| Entity-type parameter guide | `filter.results.entities` is an optional Place parameter. |
| FAQ / affinity docs | Affinity is normalized per query; the index sets the relative order; separate queries are not comparable. Nothing states whether every supplied ID is returned. |
| Official harness `@qloo/qloo-harness@0.1.26` (`qloo_rank`, "Rank a caller-supplied shortlist with Qloo") | Sends `GET /v2/insights` with `filter.type`, `filter.results.entities=<ids joined by ",">`, `take=<number of options>` and `signal.interests.entities`. Reads `query.affinity`; states "Scores from separate calls are not comparable"; slices results to the option count **without checking membership or completeness**. |

## Classification

| Class | Meaning | Status |
| --- | --- | --- |
| **A. Server-side shortlist ranking** | Qloo scores exactly the supplied IDs in one query context | **Documented, and implemented by Qloo's own harness. UNVERIFIED under the event key.** |
| B. Broader discovery plus client-side matching | Run discovery, then intersect with the shortlist locally | What TasteGate can do today. P05 holds only the unfiltered top-1, so B cannot rank our originals. **B is never reported as A.** |
| C. Unsupported | Parameter rejected or silently ignored | No documentary sign of this. A response that contains IDs outside the shortlist would indicate C ("parameter ignored"). |

Product status until verified: original candidates get `TASTE_EVIDENCE_MISSING` with an `APPROVAL_REQUIRED` unavailable record. No cultural rank is shown.

## Prepared request (public form)

```text
GET https://hackathon.api.qloo.com/v2/insights
filter.type=urn:entity:place
signal.interests.entities=<ACCEPTED_RADIOHEAD_ENTITY_ID>
filter.results.entities=<BLUE_NOTE_NYC_PLACE_ID>,<P05_TOP1_PLACE_ID>
take=2
```

- `<ACCEPTED_RADIOHEAD_ENTITY_ID>`: the reviewed P01 artist identity. Its acceptance is currently scoped to P05, so **approval must extend it to P06**.
- `<BLUE_NOTE_NYC_PLACE_ID>`: P03-R result 0. Its NYC branch was corroborated in a local review; it is not admitted as a product identity.
- `<P05_TOP1_PLACE_ID>`: P05 result 0, the unfiltered top-1 for the same signal. This is a **positive control**, with no identity claim.
- The actual encoded URL (245 characters) is in the ignored `private/qloo-probes/p06-request.private.json` for local inspection. It was derived only from manifest-verified captures and the checkpoint-bound identity review. That file grants no authority.
- No geography, tags, explainability, demographics, page or offset parameters are sent.

## Outcome interpretation (decided before execution)

| Observed | Classification |
| --- | --- |
| Both IDs returned, each with `query.affinity`, and nothing else | **A supported** for this sample. Order gives the relative rank inside this query only. |
| Only the control returned | A is **not** demonstrated: possibly top-N intersection semantics. Treat as B-like; no rank for omitted IDs. |
| IDs outside the shortlist returned | **C**: parameter ignored or semantics differ. Do not use. |
| Empty, 4xx or 5xx | UNKNOWN or unsupported. No retry; record and review. |
| Response larger than 256 KiB | UNKNOWN / RESPONSE_TOO_LARGE. No partial data is used. |

No outcome establishes personal preference, recommendation improvement or cross-query comparability.

## Budget and safety

One GET, concurrency 1, 4,000 ms request/body deadline, 262,144-byte capture cap, zero automatic retries and redirects, server-side event key only, private immutable capture. Prior P01–P05/P03-R records and ledgers are untouched. Quota, rate limit, expiry and credential-rotation status remain UNKNOWN, as in every earlier approval.

## Approval checkpoint — STOP

Suggested exact owner approval: **"批准 P06 一次：上述 filter.results.entities 两项 shortlist 请求"** (approve one P06 request for the two-ID shortlist above). It would authorize only this single request and the Radiohead identity's use as its signal. It would **not** authorize repeats of earlier probes, P07–P10, product live mode, deployment or commits.

**Execution path not yet implemented.** After approval, one of the following must be implemented and reviewed:

1. a minimal P06 profile in the existing probe framework (the P05 pattern), or
2. the Phase 2B bounded live adapter, run under an owner-approved policy that allows exactly this request.

See `docs/PHASE2B_AWARD_DELIVERY_PLAN.md`.
