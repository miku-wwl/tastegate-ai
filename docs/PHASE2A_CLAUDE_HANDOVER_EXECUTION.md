# Phase 2A — Handover execution report

2026-10-19, Pacific/Auckland (work from 14:31 to about 23:30 NZDT). **Overall: PARTIAL.** The product now runs a full Audit → Repair → Revalidate vertical slice on **real recorded Qloo responses** as well as synthetic fixtures, through a redesigned UI. No new Qloo request was made. Live product requests stay locked, and the next request (P06) is prepared and **stopped at owner approval**. Nothing was committed, pushed or deployed.

## 1. Baseline (verified before any change)

- Branch `main`, clean tree; local HEAD = local `origin/main` = remote `main` (`git ls-remote`) = `819a81698b77e853cc996fccb7ec209d42dc0221`.
- Baseline run: typecheck exit 0; Vitest 454/455. The one failure was a 5 s timeout in a child-process probe test that passed 9/9 twice in isolation (load flake, left untouched).
- SHA-256 snapshots of all 111 private evidence files and all 113 tracked files were kept outside the repository for the final comparison (§8).

## 2. Outcome by task

| Task | Result |
| --- | --- |
| A. Understand existing work | Reused rules, bounded call machinery, evidence-graph validator, search observation and safe private-file patterns. Gaps found: fixture-only contracts, exact-label auto-resolution, no Tags/Insights projection, missing taste evidence wrongly triggered replacement, debug-console UI. |
| B. P05 semantic review | `docs/PHASE2A_P05_INSIGHTS_SEMANTIC_REVIEW.md`. Isolated `projectInsightsPlaces` (type/subtype kept, never converted). `query.affinity` accepted only as query-relative ordering; `audience_growth` UNKNOWN. |
| C. Real Qloo integration | **PARTIAL.** Recorded-evidence adapter: verifies every capture against private manifests, immutable summaries, exact request profiles and the checkpoint-bound identity review; replays only exact requests; returns explicit `unavailable` otherwise; applies strict projections; pseudonymizes provider IDs. **No product live transport** was added (see §4). |
| D. Product vertical slice | Input → identity resolution with explicit confirmation → constraint audit on provider geocode → soft-gated cultural evidence → bounded repair (recorded P05 discovery) → revalidation → evidence-backed before/after, end-to-end through Next.js. |
| E. UI | Redesigned single-page product: scenario picker, plan view, workflow stepper, identity-confirmation step, "What the gate found" highlights, before/after comparison with sub-checks, provider facts, evidence drawers, ledger, limitations, JSON export, locked-live card. Responsive and accessible (text plus icon status, labeled radios, live status region). |
| F. P06 feasibility | `docs/PHASE2A_P06_FEASIBILITY.md`. Server-side shortlist ranking is documented and used by Qloo's own harness, but unverified here. The exact request is prepared (private encoded URL). **STOP for approval.** |
| G. Evaluation | `src/eval/*`, `npm run eval`: 14 SYNTHETIC and 4 RECORDED_LIVE cases with gold labels and separate denominators; LIVE_EXECUTED NOT RUN (§6). |

## 3. What a judge can do locally now (2–3 minute flow)

1. Open the app: a hero section, two data modes (recorded Qloo, synthetic) and a locked live badge.
2. Default plan: **"NYC evening plan — audited with recorded Qloo responses"**. Taste signals: Radiohead, Wong Kar-wai films ("In the Mood for Love"), Jazz. Constraints: New York, US, place, at most 3 items. Two upstream recommendations with free-text claims (an authored sample, labeled as such).
3. **Run the gate.** It stops at *Confirm identities*: the real candidate lists (the band among tribute acts; the 2000 film among four other titles; "Jazz" as a music genre vs a media keyword, a book genre and an occupation; the one venue candidate). Nothing is preselected.
4. Confirm and continue. Highlights lead with: *Rejected the proposed replacement … for Village Vanguard: wrong city and wrong country, according to the provider's own data.*
5. Before/after view:
   - Blue Note: identity confirmed, all hard constraints pass, cultural fit "not yet established". It is kept rather than replaced, since missing evidence is a soft gate.
   - Village Vanguard: no recorded lookup, so held as UNKNOWN. The recorded Qloo discovery for the confirmed artist (no geography filter) proposed a place outside New York and outside the US, and revalidation blocks it.
6. Evidence drawers show each finding's source (recorded probe, endpoint, HTTP status, bytes, time) or "Unavailable"; then limitations, the ledger and JSON download.
7. Switch to synthetic **"Wrong city → validated repair"** to see an accepted, revalidated replacement (clearly labeled synthetic).

Screenshots: synthetic-only public screenshots are in `.artifacts/phase2a-synthetic-result.png`, `phase2a-synthetic-desktop.png`, `phase2a-synthetic-mobile.png` and `phase2a-mobile.png`. The recorded-mode screenshots show provider-derived names and addresses, so they stay private in `private/phase2a-local-screens/` and are **not** in the review ZIP.

## 4. Design decisions

1. **Recorded replay instead of a new live transport.** The approved probes are the only verified contracts. Replaying them gives real data with zero new risk. A product live transport needs owner decisions on budget, quota, caching and judge traffic, and adding a dispatch path before any approved request adds risk without benefit. Live requests remain exclusively through the approved probe framework.
2. **Explicit confirmation, one round.** All lookups run, then every pending choice is shown at once. Decisions are untrusted input that can only pick candidates returned in the same run; unknown targets, duplicate decisions and raw IDs are rejected before any call.
3. **Pseudonymous references.** A per-process HMAC key turns provider IDs into `qloo-ref:…`. Equality checks work, raw IDs never reach the browser or reports, and a restart invalidates pending confirmations (fails closed).
4. **Unavailable is explicit evidence.** Missing recordings, P06 and uncaptured lookups produce TasteGate-authored `unavailable` records with a reason. They are never treated as negative evidence.
5. **Behavior refinements (also apply to fixtures; documented and tested):**
   - (a) Repair targets only BLOCKED or unresolved slots. A resolved venue that passes all hard constraints but lacks taste evidence is no longer replaced. The `missing-evidence` scenario no longer performs a discovery call.
   - (b) For a replacement whose identity is not independently confirmed, discovery-reported facts can reject (fail) but never pass: agreeing facts become `FACT_UNCONFIRMED / unknown`.
6. **Trusted Insights policy.** Recorded mode uses the exact P05 context: confirmed artist signal only, no tags or geography, `take=1`, exclusions applied by TasteGate. The UI states that film and tag confirmations are audited but not yet sent as signals.
7. **Bundle-leak fix.** Importing filesystem-reading probe modules into the web route made Next/Turbopack trace the **whole project, including all 111 private evidence files**, into the route's server trace (found in the first build). Fixes:
   - the loader no longer imports probe modules (it verifies the P05 signal through the manifest-verified checkpoint chain instead);
   - untraced markers on its runtime reads;
   - `outputFileTracingExcludes` for `private/`, `.env*`, `.artifacts/`, `.cache/` and `test-results/`.

   The final build traces 0 sensitive files (`.artifacts/phase2a-verification/trace-check.txt`), and client bundles contain no server strings (`client-bundle-scan.txt`).

## 5. Tests — actual commands and results

Environment: Windows 11, Node v26.5.0, provider keys blanked in every child environment, telemetry disabled. Final run on the final tree (2026-10-19 10:31–10:32 UTC): logs in `.artifacts/phase2a-verification-final/`; `commands.tsv` has UTC start/end, duration and exit code.

| Command | Exit | Result |
| --- | --- | --- |
| `npm run typecheck` | 0 | 6 s |
| `npm test` (default parallelism) | **1** | 20/20 files ran: **540/541 passed**. The one failure is the pre-existing baseline flake: the unchanged `p01-local-env` CLI child-process test timed out at 5,000 ms under full parallel load. |
| `npm test -- --maxWorkers=4` | 0 | **20/20 files, 541/541 tests** (19 s) |
| `npm run build` | 0 | 0 warnings; routes `/` (static) and `/api/audit` (dynamic); 0 sensitive files traced |
| `npm run test:e2e` | 0 | **5/5 real Chromium tests** against the production build, including the recorded flow; zero external requests and zero page/console errors |
| `npm run eval` | 0 | 18 cases, all PASS (§6) |
| `git diff --check` | 0 | No whitespace errors. The LF→CRLF notices are Git autocrlf information. The 21 new untracked files have no trailing whitespace. |

An earlier full run on a nearly final tree (`.artifacts/phase2a-verification/`, 10:19–10:21 UTC) shows the second environmental failure mode. Default-parallel `npm test` lost 3 Vitest worker forks to system out-of-memory (`Zone Allocation failed`; exit codes 3221226505 and 134) before their files ran: 17/20 files and 518 tests passed, with 0 assertion failures. At the time the machine had 2.8 GB of 31.3 GB physical memory and 2.3 GB of commit free, mostly held by other applications (a WSL VM of about 15.5 GB and a local llama-server of about 4.6 GB). Those were not touched. The same run with `--maxWorkers=4` passed 541/541; build, E2E (5/5) and eval passed. After that run, only test-helper data (authored tag IDs) and docs changed.

Tests by file: 541 = 455 pre-existing + 86 new.
- New files: projections 28, recorded-workflow 27, recorded-adapter 14, view-model 5, recorded-live.private 2, evaluation 1.
- Extended files: route +7, workflow +2.

Coverage of the new tests:
- strict projections, including distinct schemas, subtype handling and fail-closed shapes;
- recording integrity and tamper resistance (changed bytes, missing manifest entry, altered profile, status, signal binding or review, take overflow, subtype mismatch, missing directory);
- exact-request replay and client-side exclusion;
- confirmation semantics (stale reference, skip, unknown target, duplicates, raw IDs);
- policy and budget bounds, cancellation, engine separation;
- 13 provider-report tamper classes;
- the view-model;
- the route catalog and recorded boundary.

During development, the two CLI child-process probe tests intermittently failed under full parallel load (a timeout; `0xC0000409`/`134` child crashes). Both passed 46/46 twice in isolation. Earlier in the session, one full run failed every file at collection while the session's working directory switched drive-letter case; it passed on rerun.

## 6. Evaluation (actual, `.artifacts/phase2a-evaluation.json`, final run)

These are authored development cases, **not a held-out benchmark**. Strata are reported separately and never pooled. Latency is local in-process time only (no network). Zero Qloo dispatches.

| Metric | SYNTHETIC (14 cases) | RECORDED_LIVE (4 cases) | LIVE_EXECUTED |
| --- | --- | --- | --- |
| Cases passing gold checks | 14/14 | 4/4 | NOT RUN |
| Hard-violation detection | 12/12 | 2/2 | NOT RUN |
| False rejection of valid originals | 0/6 | 0/4 | NOT RUN |
| Fabricated identity for unresolvable slots | 0/3 | 0/4 | NOT RUN |
| Valid replacement accepted | 2/2 | 0/0 (N/A: no recorded evidence can validate a replacement) | NOT RUN |
| Invalid replacement rejected | 2/2 | 1/1 | NOT RUN |
| Free-text claims marked supported | 0/2 | 0/12 | NOT RUN |
| Automatically selected provider identities | 0 | 0 | NOT RUN |
| Bounded calls / Qloo dispatches | 73 / 0 | 26 / 0 | — |
| Local latency p50 / p95 (final run, 10:32 UTC) | 1.5 / 19.6 ms | 3.3 / 14.2 ms | — |

What this does **not** show: cultural relevance quality, improvement over an LLM-only baseline, live latency or quota behavior, or generalization beyond these patterns. The recorded gold labels rely on the Phase 1B identity reviews (band, film, music-genre tag, NYC branch). The recorded replacement's violation is provider-reported and was not independently re-verified in this phase. Error paths (401/403/429/5xx) are fault-injected, not live.

## 7. Known issues and limitations

- **Live:** shortlist ranking (P06), geography-constrained discovery and explainability are unobserved. Recorded mode can reject but never accept a replacement.
- **City check:** exact `geocode.city`; borough normalization is unverified (for example, Brooklyn could falsely mismatch "New York").
- **Claims:** free-text claims are always unverified (no claim extraction or LLM).
- **Insights signals:** in recorded mode only the confirmed artist is sent, matching the recording; film and tag confirmations are not yet used.
- **Confirmation references** are per process: a server restart between rounds asks again (fails closed).
- **Per-request cost:** each recorded request re-verifies about 110 KB of private files (fine locally). A public deployment needs caching and rate limiting.
- **Memory:** the full default-parallel test run fails on this machine while memory is exhausted by other applications; use `--maxWorkers=4` until memory is available.
- **Deployment:** the recorded mode needs the private recordings on the server (never in the repository or public bundles). Display and redistribution rights for provider fields in a public UI are still unconfirmed.

## 8. Security, authorization and evidence integrity

- **Qloo requests:** zero. No credential was read by any new code. The app never reads `QLOO_API_KEY`, and the E2E canary key never appears in responses or pages.
- **Private evidence:** all **111 historical files are byte-identical** to the pre-work snapshot. Added privately: `private/qloo-probes/p06-request.private.json` (proposal only, approval NOT_GRANTED), 4 local screenshots in `private/phase2a-local-screens/`, and the review package in `private/review/phase2a-20261019-final/`.
- **Protected tracked files:** 82 are hash-identical, including AGENTS.md, the frozen strategy, every probe module and script, all earlier docs, the lockfile and configs.
- **Published derived fact:** tracked docs state one derived fact about P05 ("outside New York and outside the US"). The name, coordinates, IDs and scores stay private. Please confirm this disclosure level.
- **Authorization:** no commit, push, deployment, Devpost change, dependency change or Runtime integration. The old `app/inspector.tsx` was removed, replaced by the new UI.

## 9. Files

- **Modified:**
  - `.env.example` (comments), `next.config.ts`, `package.json` (`eval` script only)
  - `app/api/audit/route.ts`, `app/layout.tsx`, `app/page.tsx`, `app/style.css`
  - `src/audit/rules.ts`, `src/audit/workflow.ts`, `src/domain/contracts.ts`, `src/domain/report-schema.ts`, `src/qloo/ports.ts`
  - `tests/browser/inspection.spec.ts`, `tests/route.test.ts`, `tests/workflow.test.ts`
  - `README.md`
- **Deleted:** `app/inspector.tsx`.
- **New:**
  - `app/tastegate-app.tsx`, `app/report-view.tsx`, `app/view-model.ts`
  - `src/qloo/projections.ts`, `src/qloo/provider-ref.ts`, `src/qloo/recorded-adapter.ts`
  - `src/scenarios/recorded-nyc.ts`, `src/eval/harness.ts`, `src/eval/cases.ts`
  - `tests/helpers/recorded-root.ts`, `tests/projections.test.ts`, `tests/recorded-adapter.test.ts`, `tests/recorded-workflow.test.ts`, `tests/recorded-live.private.test.ts`, `tests/view-model.test.ts`, `tests/evaluation.test.ts`
  - this report, `docs/PHASE2A_PRODUCT_CAPABILITY_MATRIX.md`, `docs/PHASE2A_P05_INSIGHTS_SEMANTIC_REVIEW.md`, `docs/PHASE2A_P06_FEASIBILITY.md`, `docs/PHASE2B_AWARD_DELIVERY_PLAN.md`

## 10. Deliverables and next action

- **Sanitized review ZIP:** `private/review/phase2a-20261019-final/TasteGate_Phase2A_Review.zip` (ignored location, as in earlier phases), with its SHA-256 and privacy-scan summary beside it.
  - Contains: public source, tests, docs, both verification log folders, the evaluation output, a synthetic browser run and synthetic screenshots, `REVIEW_README.md`, and `REVIEW_MANIFEST.json` (per-file SHA-256).
  - Excludes: `private/`, all env files, raw provider data, IDs and hashes, recorded-mode screenshots, the P06 proposal, dependencies, build output and Git internals.
  - The packaging-time privacy scan checks every file against tokens derived from the private captures and env files. Two reviewed allowlist items are explained in `REVIEW_README.md`.
- **Single next action:** owner decision on the exact P06 request (`docs/PHASE2A_P06_FEASIBILITY.md`). After approval, implement the smallest execution path for it, run it once, and review whether Qloo supports server-side shortlist ranking.

**STOP after Phase 2A.** Independent review is required before Phase 2B, any commit, push or deployment.
