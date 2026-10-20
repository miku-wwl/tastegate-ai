# Phase 2B + 3A — execution report

2026-10-20, Pacific/Auckland. Base commit `6b446784d01def511fe4ce1d53fe4ca4dd39b27e` plus **uncommitted** Phase 2B/3A changes. Nothing was committed, pushed, deployed or submitted.

**Status: PARTIAL, ready for independent review. STOP.** The offline product, the evaluation, the live adapter and the deployment-safety gate are built and verified, and the one prepared Qloo request (**P06**) was approved by the owner, executed **once**, reviewed and sealed (result: class A, below). A real verified repair needs a second, separately approved request (P07), and the decisions in the [final submission backlog](FINAL_SUBMISSION_BACKLOG.md) remain open. **Exactly one Qloo request was made in this phase (P06).**

## In one minute

| Workstream | Result |
| --- | --- |
| A. P06 shortlist ranking | **Approved by the owner (P06 only), executed once, reviewed, sealed.** HTTP 200, 41,953 bytes, 1.1 s. Class **A**: both reviewed places returned, both with a numeric `query.affinity`, nothing outside the shortlist. The unfiltered global top place (the positive control) ranked **above** the reviewed NYC venue. Details [below](#p06-gate-and-result). |
| B. Real repair and revalidation | Implemented. A repair target is a recommendation that is **blocked or has no identity**; missing taste evidence alone never triggers a replacement. Statuses `REPAIR_VERIFIED / REPAIR_REJECTED / REPAIR_UNAVAILABLE / EVIDENCE_INSUFFICIENT / UNKNOWN`. On real data the verified venue is now **REVIEW** (ranked in the same query as the proposal) and the proposed replacement, although ranked first by Qloo, is **rejected** by the provider's own city and country. A real *verified* repair needs a geography-filtered discovery (prepared as P07, not approved). |
| C. AUTHORIZED_LIVE adapter | Implemented and tested against an authored provider double. **Never exercised against Qloo.** Locked unless a server credential **and** an owner grant exist, and then only after a per-run confirmation. |
| D. Custom plan | Implemented: guided form, JSON import/export, strict server validation, coverage hints, honest UNKNOWN when there is no evidence. |
| E. Product experience | Five screens (Input, Identity, Audit, Repair, Compare), three labelled evidence modes, responsive, keyboard and contrast tested. |
| F. Evaluation | Paired evaluation against two baselines, four strata kept apart, a seeded synthetic holdout with an independent oracle, a public aggregate-only `/results` page. |
| G. Deployment safety | Repeatable gate: clean-copy build with synthetic canaries, output/trace/source-map scans, real-private-token scan, standalone server run with no private evidence. 47/47 PASS; a self-test proves it can fail. Organizer display terms are **not settled**. Not deployed. |
| H. Tests | Typecheck, 1043 unit/integration tests, 10 real-Chromium tests, build, evaluation all green, **including against the real sealed P06 capture**. |

## What was built

### A. P06

- `src/qloo/p06-profile.ts`: the fixed request profile (`tastegate.p06.shortlist-rank.capture-256k.v1`: `GET /v2/insights`, `filter.type`, one artist signal, `filter.results.entities` with exactly two reviewed IDs, `take=2`), the single-use checkpoint, the summary schema (`tastegate.raw-probe.v5`).
- `src/qloo/p06-shortlist.ts`: derives the shortlist **only** from manifest-verified P03-R and P05 captures and refuses anything that does not equal that derivation. No arbitrary ID can enter.
- `src/qloo/p06-approval.ts`, `scripts/qloo-probe-p06-admin.mjs`: `--prepare-review` and `--register-approval`. Registration writes the approval receipt and checkpoint exclusively, inside a 5-minute window, and refuses if a checkpoint already exists, if earlier ledgers are not exactly one dispatch each, or if any P06 attempt exists (replay of a consumed approval is impossible).
- `src/qloo/raw-probe-runner.ts`, `raw-probe-store.ts`: the same hardened sender as earlier probes (one GET, 4 s deadline, 256 KiB cap, zero retries, zero redirects, one in flight), the binding re-checked when the dispatch slot is reserved, an immutable private record.
- `src/qloo/shortlist-ranking.ts`: classifies a P06 response into `ALL_RETURNED / PARTIAL / UNEXPECTED_ENTITY / INCOMPATIBLE_SCORES / RESPONSE_UNUSABLE`. Scores are compared only inside the one query; nothing is promoted to a probability.
- `scripts/seal-recorded-probe.mjs --inspect-p06 / --seal-p06`: an executed P06 is **never replayed** until it has been inspected locally and sealed into the integrity manifest; the seal self-checks the loader and rolls back on failure.
- Tests: `p06-preparation` (70), `p06-recorded` (33), `p06-seal` (10), `shortlist-ranking` (18).
- **Current state:** one attempt, ledger `reserved 1 / dispatched 1 / unresolved 0`, response saved privately and sealed; the recorded adapter replays it (`shortlist_state: READY`, a P06 row in the public request history). The approval is consumed and cannot be reused.

### B. Repair and revalidation

- Unified retrieval: resolve identities, discover (when a repair target exists and a confirmed artist signal does), rank the originals and the proposals **together in one query** (scores from separate queries are never compared), audit, repair once, revalidate.
- Revalidation audits a replacement from scratch. Its identity is established by an independent lookup **or** by your explicit confirmation of the provider's candidate details (`identity_basis`). Facts of an unconfirmed replacement can reject it but can never pass it.
- Per-slot outcomes are re-derived by the report validator, so a tampered status is rejected. Tests: `repair-semantics` (26), `workflow`, `recorded-workflow`, `provenance`.
- **What the real data shows now (one recorded plan, after P06).**
  - The identity-confirmed venue: hard facts pass, **ranked 2 of 2 in the single P06 query**, verdict **REVIEW** (claims still unverified). Before P06 it was "cultural fit not yet established".
  - The second venue has no recorded lookup: UNKNOWN, held, not judged wrong.
  - The recorded discovery's top place, **ranked 1 of 2 in the same query**, is **BLOCKED** (wrong city and country according to the provider's own geocode) and `REPAIR_REJECTED`. A high Qloo rank never rescues a failed hard constraint, and the UI says the original is **not** repaired.
  - Counts: 8 bounded calls, 6 recorded replays, 2 unavailable operations (the second venue and the replacement's independent lookup), 0 new requests.
- **P07 (prepared, not approved).** The next evidence for a real verified repair is a geography-filtered discovery: `GET /v2/insights?filter.type=urn:entity:place&signal.interests.entities=<ACCEPTED_ARTIST_ID>&filter.location.query=New York City&filter.location.radius=0&take=3`. Its pre-registered interpretation rule is in the private proposal. Documentation conflict: `filter.location.query` appears on the general Insights page but not in the Place parameter table, so a silent ignore is possible. P07 has no execution path and needs its own fresh approval.

### C. AUTHORIZED_LIVE adapter

- Authority = server credential **and** an owner-created grant (`private/qloo-live/grant.json`: at most 60 minutes, 14 requests, 5 runs, an operation allowlist, 4 s per request, 256 KiB per body) **and** an explicit acknowledgement for each run. An environment variable, opening the app or a generic click is never authority. `TASTEGATE_DISABLE_LIVE=1` switches live off before anything else is evaluated.
- `src/qloo/live-grant.ts`: grant schema, window, exclusive-create administration, a durable ledger that **reserves a request before it is sent** (budgets survive restarts; an unsettled request still counts).
- `src/qloo/live-transport.ts`: one origin-locked native GET (no redirects, no retry, no proxy, no caller-chosen host or path).
- `src/qloo/live-adapter-authorized.ts`: four fixed request builders (not a proxy); a provider reference becomes a provider ID **only** if this process received that ID in a validated response; one request in flight (claimed before the first await); the 4 s deadline is enforced by the adapter itself, not only the transport; a circuit breaker after the first failure; credential-reflection check; any failure becomes explicit UNKNOWN evidence, never a guess and never a fallback to recordings.
- `src/server/audit-service.ts` + `app/api/audit/route.ts`: the policy layer. Gates, in order: kill switch, exact acknowledgement string, same-origin caller, per-process rate limit, credential, grant, free single-flight slot. Recorded and fixture requests can never reach the provider transport.
- `scripts/live-grant.mjs` (`npm run live:grant -- --status | --create | --revoke`): owner administration, public-safe output.
- Tests: `live-adapter` (51), `audit-service` (54), `live-grant-cli` (23), `live-ui` (7).
- **Not verified:** behaviour against the real event API (quota, rate limit, key expiry, response shapes under the event key). The P06 request used the reviewed probe sender, not this adapter, so the adapter itself remains UNKNOWN against Qloo.

### D. Custom plan

- `src/domain/custom-input.ts`: NFC, trimmed, collapsed spaces (case never altered); control, invisible, bidi and line-separator characters rejected by a numeric range table; reserved ID prefixes rejected; unknown and authority-looking fields rejected; depth and size bounded; failures report a **path and a fixed reason code, never the value**.
- `app/custom-form.ts` and `app/screens/custom-form-view.tsx`: form, JSON import/export (16 KiB, strict shape), exact-string coverage hints with "did you mean" for capitalization, server issues mapped back to fields.
- Without evidence a plan is audited for what needs none (its size limit, its claims) and everything else is UNKNOWN. With no recordings on the server the report says "no Qloo evidence was available". Nothing is sent to Qloo unless LIVE is chosen.
- Tests: `custom-input` (93), `custom-form` (25), `audit-service`.

### E. Product experience

Five screens with a progress stepper, focus moved to each screen's heading, a skip link, labelled controls and a persistent mode banner (FIXTURE / RECORDED / LIVE). Contrast of every colour pair in the stylesheet is tested (WCAG AA). A sticky run bar keeps the primary action reachable. The Repair screen shows per-slot statuses with plain reasons and never calls a rejected replacement a repair. Screenshots: synthetic ones are in `.artifacts/screens/` (public-safe); real-data ones are in `private/phase2b-screens/` and must stay private.

### F. Evaluation

See [AWARD_EVALUATION_RESULTS.md](AWARD_EVALUATION_RESULTS.md). Summary: on the 60-plan seeded holdout, scored plans (50) let **0** violating and **0** unverifiable items through with TasteGate, against 26 and 23 for "ship as proposed" and 31 and 6 for "trust the first Qloo hit"; TasteGate asked a person to decide on the 10 plans with ambiguous identities where the first-hit baseline picked the wrong identity 7 times. The recorded stratum is **one plan** and the live stratum is **NOT RUN**.

### G. Deployment safety

See [DEPLOYMENT_SECURITY_READINESS.md](DEPLOYMENT_SECURITY_READINESS.md). `npm run safety:deploy`: 47 PASS, 0 FAIL, 0 NOT RUN. `npm run safety:deploy:selftest`: planted leaks are caught (6 expected FAILs).

## P06 gate and result

**Purpose.** Obtain Qloo's own ordering of two reviewed places for one confirmed taste signal, inside a single query, so that a recommendation can have real, comparable cultural evidence. It does not establish personal preference or cross-query comparability.

**The gate (as presented to the owner).** One GET, concurrency 1, 4,000 ms request/body deadline, 262,144-byte cap, zero retries, zero redirects, server-side event key only, immutable private capture; the three IDs never printed and re-derived from manifest-verified captures; quota, rate limit, key expiry and rotation unconfirmed; semantics of IDs outside the shortlist unverified.

```text
GET https://hackathon.api.qloo.com/v2/insights
filter.type=urn:entity:place
signal.interests.entities=<ACCEPTED_RADIOHEAD_ENTITY_ID>
filter.results.entities=<REVIEWED_BLUE_NOTE_NYC_PLACE_ID>,<P05_TOP1_PLACE_ID>
take=2
```

**Approval.** The owner answered the gate with the single choice "批准 P06 一次：上述 filter.results.entities 两项 shortlist 请求", recorded verbatim in the single-use consent receipt. It authorizes this one request and the artist identity's use as its signal. It does **not** authorize P07, repeats of any earlier probe, product live mode, deployment, commits or any second request. Registration (2026-10-20 08:45:16 UTC, 5-minute window) and execution (08:45:21–08:45:24 UTC) were separate steps; the offline preflight had shown the credential configured, every prior ledger at exactly one dispatch and the identities re-verified.

**Execution (attempt `f08095dd-0f0a-4202-a964-7fc434c74b07`).** One dispatch, HTTP 200, **41,953 bytes**, 1,111 ms, transport settled, raw response saved privately, status `UNKNOWN / SCHEMA_REVIEW_REQUIRED` (the standard "captured, awaiting semantic review" state). Ledger afterwards: reserved 1, dispatched 1, unresolved 0. No retry, no second attempt.

**Local review (before any use).** Classification **A, ALL_RETURNED**: requested 2, returned 2, every returned entity carries a numeric `query.affinity`, every returned ID is on the shortlist, nothing else was returned. The shortlist's first role (the reviewed NYC venue) is ordered **after** the second (the positive control, the unfiltered top place for the same signal, outside New York and the US by its own geocode). The capture was then sealed; the loader accepts the seal and replays it.

| Class (pre-registered) | Meaning | Outcome |
| --- | --- | --- |
| **A** | Both returned, scored and ordered consistently | **Observed** |
| B | Only one returned | not observed |
| C | An entity outside the shortlist | not observed |
| D | Scores missing or contradicting the order | not observed |
| E | Empty, 4xx/5xx, oversized or unusable | not observed |

**What it does and does not establish.**

- For this one sample, `filter.results.entities` is honoured under the event key: Qloo scored exactly the two supplied IDs in one query. Ordering is meaningful **only inside this query**. Nothing here says the order generalizes, that `query.affinity` is a probability, or that anyone would like either place.
- It shows something the product exists for: **Qloo's own taste ordering ranks the out-of-city place above the NYC venue** for this signal. A system that trusted that ordering would replace the venue with a place in another city and country. TasteGate keeps the venue (REVIEW) and rejects the place on hard constraints.
- No identity was auto-promoted. The two shortlist entities remain provider candidates the user confirmed (venue) or proposals audited from scratch (the place).
- Still unknown: quota, rate limit, expiry and rotation of the key; behaviour with larger shortlists; whether other signals behave the same.

## Verification (actual results)

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | exit 0 |
| Unit and integration | `npm test` (default configuration) | 35 files, **1043 tests passed**, about 43 s, run again after P06 was sealed |
| Production build | `npm run build` | exit 0; routes `/`, `/results`, `/api/audit` |
| Real browser | `npm run test:e2e` | **10 passed** (Chromium), including recorded-evidence flows on the real P06-backed data |
| Evaluation | `npm run eval` | pass: 14 development + 60 holdout + 4 recorded cases; AUTHORIZED_LIVE NOT RUN |
| Deployment gate | `npm run safety:deploy` | 47 PASS, 0 FAIL, 0 NOT RUN |
| Gate self-test | `npm run safety:deploy:selftest` | planted leaks caught |
| Whitespace | `git diff --check`; 56 untracked text files | clean |
| Invisible characters | scan of 93 changed text files | 0 hits |
| Historical private evidence | sha256 of the 111 files recorded before Phase 2A | **111/111 identical**, re-checked after P06 |
| Protected files | `AGENTS.md`, frozen strategy | unchanged against HEAD. Six protected implementation files changed by design: the P06 integration in `probe-definitions`, `raw-probe-runner`, `raw-probe-store`, `probe-cli`, and the test configuration in `vitest.config.ts`, `playwright.config.ts` |
| Qloo requests this phase | n/a | **1** (P06, owner-approved) |

The default Vitest run previously exhausted memory on this machine (one worker per CPU each load zod, the audit engine and the probe framework). `vitest.config.ts` now uses four workers and a 20 s test timeout (the CLI tests spawn Node and transpile modules); the default `npm test` is stable.

Test counts by file (35 files, 1043 tests, all passing). New or substantially extended in this phase are marked ●.

| Area | Files (tests) |
| --- | --- |
| Live adapter, grant, service | ● `live-adapter` (51), ● `audit-service` (54), ● `live-grant-cli` (23), ● `live-ui` (7), `route` (17) |
| Custom plan | ● `custom-input` (93), ● `custom-form` (25) |
| P06 and shortlist ranking | ● `p06-preparation` (70), ● `p06-recorded` (33), ● `p06-seal` (10), ● `shortlist-ranking` (18) |
| Repair, workflow, provenance | ● `repair-semantics` (26), `workflow` (37), `recorded-workflow` (27), `provenance` (17), `recorded-adapter` (14), ● `recorded-live.private` (2, now aware of the sealed P06), `offline-e2e` (1), `contracts` (15), `projections` (28) |
| Presentation | ● `view-model` (13), ● `results-page` (5), ● `contrast` (28) |
| Evaluation and deployment scan | ● `eval-machinery` (27), `evaluation` (1), ● `deploy-scan` (21) |
| Earlier probe framework (P01–P05, P03-R, boundary) | `p01-probe` (64), `p01-local-env` (9), `p02-preparation` (47), `p03-preparation` (38), `p03r-recovery` (49), `p04-preparation` (37), `p05-preparation` (41), `search-observation` (43), `qloo-boundary` (52) |

## Security and privacy

- No credential, provider ID, response body or private path was written to a tracked file, document or log. The credential was read only by the local probe process from the ignored `.env.local`; its value was never printed. The deployment gate's real-token scan and provider-fact scan find nothing in the build output or the tracked source; the scan strings live in an ignored private file, not in the tool.
- During a review step an output printed the prepared P06/P07 proposal URLs (private provider IDs) into a **local tool result**. It exists only in the local session transcript; nothing was written to a file, document, log or remote. The proposal files themselves are ignored and unchanged. Treat the session transcript as private.
- `scripts/lib/private-tokens.mjs` previously held a list of provider-derived strings; it is untracked and would have published them if committed. The list now lives in `private/scan-facts.private.json`.
- Qloo's developer guide permits private server-side caching and forbids response data in a public repository; it is silent on public display. See the readiness document. The P06 capture is private and ignored like every earlier capture; the real-data screenshots are private for the same reason.

## Acceptance gates

| Gate | Status | Basis |
| --- | --- | --- |
| 1. Real provider value | **PASS (limited)** | Real recordings drive identity, constraint verdicts and, now, a real one-query ranking (P06, class A). The gate demonstrably changes a decision on real data: Qloo ranks an out-of-city place first and TasteGate rejects it on the provider's own geography while keeping the verified venue. **Limits:** one recorded plan; no real *verified* repair (P07 not run); the live adapter has never met Qloo. |
| 2. Repair integrity | **PASS** | Unconfirmed facts reject but never pass; revalidation from scratch; validator re-derives statuses; 60/60 holdout invariants; sabotage tests show the evaluation can fail; on real data a top-ranked proposal is still rejected. |
| 3. Product experience | **PASS (engineering-verified)** | Five screens, custom plan, labelled modes, responsive, keyboard and contrast tested, 10 browser tests. No human usability study. |
| 4. Honest evaluation | **PASS (method)** | Paired baselines, separate strata, independent oracle, NOT RUN stated. It does **not** claim real-world effectiveness. |
| 5. Security | **PASS (offline-verified)** | Deployment gate 47/47 with a self-test; live gates tested; the one real request went through the reviewed, single-use probe path; nothing deployed. Real-API behaviour of the live adapter is unverified. |
| 6. Submission readiness | **PARTIAL** | Product and evidence are ready for review. Owner decisions, organizer display terms, deployment, demo video and Devpost text remain ([backlog](FINAL_SUBMISSION_BACKLOG.md)). |

## Known issues and decisions for the owner

1. **P07 or not.** Without a geography-filtered discovery the real run can only reject the replacement, never verify one. It needs its own gate and a small execution profile.
2. **Display terms.** The developer guide does not address public display of Qloo-derived data. A public deployment should run with recordings absent and live off until the organizer confirms.
3. Borough-level city normalization is exact (`geocode.city`); a venue in a borough could be falsely mismatched. Unverified against the event key.
4. Only the artist signal is sent to Insights; film and tag confirmations are audited but unused as signals.
5. A plan larger than its own size limit has every item blocked; choosing what to drop is left to a person.
6. Live results cover only the supported request shapes (artist-signal discovery without geography, shortlist ranking, entity and tag lookup).
7. The P06 sample is two places in one query. It supports "the parameter is honoured", not "rankings are reliable".

## Deliverables

Source, tests, configuration and the five documents in this change set; the sanitized review archive described in the backlog; screenshots in `.artifacts/screens/` (public-safe) and `private/phase2b-screens/` (private).

**Next action:** independent review of this change set, then the owner's decisions on P07, display terms and committing. No automatic transition to another phase.
