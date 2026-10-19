# Phase 2B — Award delivery plan

Drafted 2026-10-19 NZDT for owner review. **Nothing here is authorized yet.** Deadline: **2026-10-30 23:45 EDT = 2026-10-31 16:45 NZDT** (re-check the Devpost countdown). Feature freeze: **2026-10-29 16:45 NZDT** (24 hours before).

## Where we stand

A working local product: a recorded-real-data Audit → Repair → Revalidate slice, explicit identity confirmation, provenance, a validated report, a judge-friendly UI, 541 unit tests, 5 Chromium E2E tests and a stratified evaluation. Gaps that matter for judging:

1. No **live** Qloo call from the product.
2. No **accepted** real-data repair (needs shortlist ranking and geography-constrained discovery).
3. No public deployment.
4. No demo video or Devpost text.

## Judging criteria → what must exist (25% each, per the strategy; re-verify the rules)

| Criterion | Must show | Plan item |
| --- | --- | --- |
| Technological implementation | Qloo calls that change decisions in a bounded, verifiable pipeline | B1–B3 |
| Design | One-click demo, clear before/after, honest unknowns | B4, B6 |
| Potential impact | A drop-in quality gate other agents can call (JSON contract) | B5 |
| Quality of idea | A quality gate rather than another recommender, with real caught failures | Demo story built on the recorded wrong-city catch plus a live repair |

## Owner decisions needed (in order)

1. **Approve P06 exactly as written** in `docs/PHASE2A_P06_FEASIBILITY.md` (one request).
2. **Choose the execution path:** (a) a minimal P06 probe profile in the existing framework, or (b) the bounded live adapter (B2), first run under a policy that allows only P06. **Recommendation: (b)**, because it is needed anyway for the live demo and avoids more per-probe code.
3. **Approve a bounded live policy** for one live NYC audit: for example ≤ 10 GET requests in one run, allowlisted endpoints only, 4 s per call, 256 KiB cap, no retries. Includes geography-constrained discovery (`filter.location.query=New York City`, `filter.location.radius=0`, take ≤ 3) plus shortlist ranking.
4. **Hosting and data:** where the private recordings live in production (never in the repo), and whether judges get live calls (with a daily cap) or recorded replay plus one owner-run live demo. Confirm with the organizer which provider fields may be displayed publicly.
5. **Credential:** rotate the event key before deployment (recommended since Phase 1B), and set the production secret store.
6. **Optional:** an LLM-only baseline for the evaluation (needs a model provider and budget). Without it, the evaluation states that limitation.

## Work plan

| ID | Dates (NZDT) | Work | Acceptance |
| --- | --- | --- | --- |
| B1 | Oct 20–21 | Run P06 once after approval; classify A/B/C; if A, capture it as a recording and make the recorded NYC original ranking replayable | Immutable private capture; review doc; product shows real taste rank or an honest B/C status |
| B2 | Oct 20–22 | **Bounded live adapter** (offline first): reuse `offline-transport` (budget, single in-flight, timeouts, byte cap, no redirects or retries) and add Insights discovery/shortlist operations; reuse `projections.ts`; `source_mode: "live"` in contracts and validator; a reference map so only IDs Qloo returned in-process can be sent back; circuit breaker after 401/403/429/5xx/timeout; durable private call ledger; owner policy loaded server-side only | Offline tests with a local test double cover every error path; live mode unreachable without a policy; no automatic live-to-recorded or live-to-fixture fallback (the mode is always explicit) |
| B3 | Oct 22–23 | One approved live NYC audit: confirmed signals → shortlist rank → NYC-constrained discovery → independent lookup and common-set rank → **first accepted real replacement** (or an honest failure) | LIVE_EXECUTED stratum ≥ 1 case; capture kept privately; screenshots |
| B4 | Oct 24–26 | Deploy: single Node host; recordings and secret outside the repo; trace exclusions re-verified on the deploy artifact; rate limit; cached recording verification; anonymous judge path (synthetic plus recorded; live only if approved and capped) | External smoke and Playwright against the public URL; no secret or private file in bundles |
| B5 | Oct 24–26 | Agent integration surface: documented `POST /api/audit` contract and the validated JSON report as the integration format; short "plug into your agent" README section | Example request/response in docs (authored data) |
| B6 | Oct 26–27 | UI polish: guided first-run tour, keyboard path, empty/error states, print-friendly report | Mobile and desktop screenshots, axe-style manual checks |
| B7 | Oct 27–28 | Evaluation: expand SYNTHETIC toward the 30-case plan; add a LIVE_EXECUTED stratum within budget; publish only aggregates and safe metadata | Separate denominators; NOT RUN where applicable; no pooled percentage |
| B8 | Oct 28–29 | Demo video (2–3 min), Devpost text rewritten to actual facts, judge guide, license and attribution check, security review | Video shows real runs, labeled modes and a real failure catch |
| B9 | Oct 29–31 | Freeze, final checks, submission (owner action) | Submission confirmation screenshot |

## Demo script (target 2:45)

| Time | Content |
| --- | --- |
| 0:00–0:20 | Problem: agents produce plausible but unsupported plans. |
| 0:20–0:50 | Recorded run: identity confirmation (tribute acts, four kinds of "Jazz"); TasteGate never guesses. |
| 0:50–1:30 | The catch: Qloo's own top place for Radiohead fans is outside New York, and revalidation rejects it using the provider's own geography. |
| 1:30–2:10 | Live run (if B3 succeeds): NYC-constrained discovery → revalidated replacement with evidence. |
| 2:10–2:35 | Evidence drawer, ledger, JSON export, honest limits. |
| 2:35–2:45 | Positioning and the link. |

## Risks

| Risk | Mitigation |
| --- | --- |
| P06 shows B/C semantics | Use discovery with geography plus a revalidation lookup; present the original ranking as UNKNOWN |
| Quota/rate limits unknown | Hard per-run and per-day caps, circuit breaker, recorded mode always available, no retry storms |
| Recordings or secrets leak into deployment | Trace exclusions, deploy-artifact scan, secrets only in the host store |
| Borough normalization causes false mismatches | Prefer `filter.location.query` plus locality metadata; downgrade same-country city differences to REVIEW only after an owner decision |
| Memory pressure on the dev machine | `--maxWorkers=4`; free memory before final runs |
| Rules or eligibility drift | Re-read the Devpost rules on Oct 28 |
