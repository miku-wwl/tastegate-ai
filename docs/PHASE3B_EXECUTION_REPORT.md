# Phase 3B — award-ready product sprint: execution report

2026-10-21, Pacific/Auckland. Base commit `8c4937011` (the owner's commit of the Phase 2B+3A work) plus **uncommitted** Phase 3B changes. Nothing was committed, pushed, deployed or submitted. **No Qloo request was made in this phase.**

**Status: PARTIAL, ready for independent review. STOP.** The authorization defect is closed, the P07 gate is prepared and **awaits the owner's approval (not executed)**, the repair gate is strict, the Qloo-evidence control is built and reports an honest null result, deployment is prepared and locally verified, the judge UI and the submission drafts exist. Three things are **not** done, by design or by dependency: a real `REPAIR_VERIFIED` (needs P07 and an independent second source), any public deployment (no hosting resource exists), and the Devpost submission (the official rules could not be fetched).

## In one minute

| Workstream | Result |
| --- | --- |
| **A. Live authorization (P0)** | **Closed.** The free-text rule `ownerReplyAuthorizesLive` (accepted "I do not approve LIVE access.") and a second matcher for the P06 probe were removed. Consent is now one canonical sentence bound by a SHA-256 digest to the exact terms (operation, endpoint, parameter names, budgets, timeouts, size cap, expiry, environment, unique identity); equality is exact, there is **no keyword or negative-word list**; the sentence is single-use, revocable and re-verified on every load and reservation. A static test fails if a free-text matcher returns. Not authentication of the human. [Review](LIVE_AUTHORIZATION_SECURITY_REVIEW.md). |
| **B. P07 NYC discovery (P0)** | **PREPARED, AWAITING_OWNER_APPROVAL. Not executed.** One private proposal (attempt `598e608d-…`) bound to the re-verified artist identity; sanitized request, budget, destination, documented parameter support and uncertainties are in [P07 readiness](P07_NYC_REPAIR_READINESS.md). `filter.location.query` has a documentation conflict for the `place` type, so it may be silently ignored; the pre-registered classifier judges what comes back, never what was asked. |
| **C. Repair integrity (P0)** | **Done offline.** `REPAIR_VERIFIED` needs verdict PASS **and** an independently corroborated identity. A user's own click is `EVIDENCE_INSUFFICIENT`; a contradicting official reference is `FACT_CONFLICT`. A derived 10-item checklist separates `HARD_CONSTRAINT_VALIDITY` from `CULTURAL_EVIDENCE_SUPPORT`; the validator re-derives it, so a hand-edited report fails. Higher Qloo affinity never overrides a failed hard check. **No real `REPAIR_VERIFIED` exists or is claimed;** the synthetic success is labelled SYNTHETIC. |
| **D. Qloo incremental value (P0)** | **Done, null result.** A control sharing every non-cultural input (`RULES_AND_IDENTITY_ONLY`) versus `TASTEGATE_WITH_QLOO_CULTURAL_EVIDENCE`, scored by the same independent oracle, strata never pooled. Evidence coverage 80 % / 90 % of kept items; **0 plans changed**; `QUALITY_UPLIFT_NOT_ESTABLISHED`; +1 request per plan and 5 points more UNKNOWN. [Final analysis](QLOO_INCREMENTAL_VALUE_FINAL.md). |
| **E. Deployment preparation (P0)** | **Prepared and locally verified; nothing deployed.** Runtime profiles (`production-safe` by default; `production-live` refused in code), `/api/health`, validating start script, Dockerfile, compose and nginx examples, an extended privacy gate. `PUBLIC_DEPLOYMENT_STATUS = NOT_DEPLOYED_OWNER_RESOURCE_PENDING`. [Preparation](PUBLIC_DEPLOYMENT_PREPARATION.md). |
| **F. Judge UI (P1)** | **Done.** 30-second explainer, 2-minute guided demo, decision trace read from the audit's own findings, repair assessment with the 10-item checklist, "SYNTHETIC SUCCESS" labels; phone width, keyboard and contrast tested. |
| **G. Devpost materials (P1)** | **Drafted, not submitted.** Draft sections, demo script, concise README, an unsent English organizer inquiry. The official rules returned HTTP 403: every rule is marked **UNVERIFIED**. No video was recorded. |

## What was built

### A. Live authorization

- `src/qloo/owner-consent.ts`: canonical JSON, digest, the one sentence (`APPROVE <LIVE-GRANT|P07-NYC-DISCOVERY> <uuid> SHA256:<32 hex>`), exact comparison after trimming outer whitespace (length check plus constant-time compare).
- `src/qloo/live-grant.ts`: proposals (the terms are written down first), grants in the new format, consumption **before** the grant is written (a crash fails closed), revocation and withdrawal markers, environment binding, integrity re-check on every load; `startLiveRun` refuses any grant object that differs from the stored one.
- `src/qloo/live-adapter-authorized.ts`: the adapter enforces the grant's parameter-name profile before a slot is reserved.
- `scripts/live-grant.mjs`: `--propose`, `--create --proposal --owner-reply`, `--status`, `--revoke` (revoking also withdraws unused offers).
- `src/qloo/p06-approval.ts`: the P06 registration path was **retired** (its single approval is consumed and sealed; the historical checkpoint, receipt and ledger are still read, unchanged).
- Tests: `live-authorization` (37), `live-grant-cli` (29), `live-adapter` (46), `audit-service` (54).

### B. P07

- `src/qloo/p07-profile.ts` (the one request profile and its limits), `p07-signal.ts` (binds the already reviewed artist, re-derived from the immutable P01 capture and the public MusicBrainz record), `p07-consent.ts` / `p07-approval.ts` (proposal, exact sentence, single-use receipt, checkpoint, withdrawal), `p07-interpretation.ts` (classes A_HONORED_NYC … E_UNUSABLE).
- `scripts/qloo-probe-p07-admin.mjs` (`--prepare-gate`, `--status`, `--register-approval`, `--withdraw`) and `scripts/qloo-probe-p07.mjs` (preflight; `--execute-p07` is the only path that can send, and only with a registered approval).
- The same hardened sender as every earlier probe: one GET, 4 s, 256 KiB cap, zero retries, zero redirects, one in flight, immutable private record, reserve-before-send ledger.
- Tests: `p07-preparation` (100), `p07-interpretation` (30). Every earlier probe's records are byte-identical after the whole flow.
- State now: `GATE_OPEN_AWAITING_APPROVAL`; ledger reserved 0 / dispatched 0 / unresolved 0; the P07 attempts directory is empty.

### C. Repair integrity

- `src/audit/assessment.ts`: a derived checklist (`IDENTITY`, `BRANCH_CORROBORATION`, `CITY`, `COUNTRY`, `TYPE`, `OTHER_CONSTRAINTS`, `CONSISTENCY`, `PROVENANCE`, `FRESHNESS`, `CULTURAL_EVIDENCE`) that reports hard validity and cultural support separately, with the first unmet item.
- `src/domain/contracts.ts`, `src/audit/rules.ts`, `workflow.ts`, `src/domain/report-schema.ts`, `src/qloo/ports.ts`, `recorded-adapter.ts`: the registered official-reference model (publisher, https URL, supported name/city/country, review time, hash), identity-basis priority `independent_lookup > official_public_reference > user_confirmation`, and a validator that re-derives acceptance.
- Outcomes: `REPAIR_VERIFIED / REPAIR_REJECTED / REPAIR_UNAVAILABLE / EVIDENCE_INSUFFICIENT / UNKNOWN`. Tests: `repair-assessment` (13), `repair-semantics` (36).
- Deliberately **not built**: loading a sealed P07 capture, a private reference-file loader, and the post-execution **inspect** and **seal** commands for P07 (the classifier `p07-interpretation` is ready; its command-line wrapper and the seal are not). All depend on the real response shape, which is unknown; coding them now would build against an assumption. They are written offline, against the real capture, after an approved execution.

### D. Qloo incremental value

- `src/eval/ablation.ts` (the control, derived from the same run through a redacted view with no cultural field), `ablation-summary.ts` (the three questions kept apart: `EVIDENCE_COVERAGE_GAIN`, `DECISION_DIFFERENCE`, `INDEPENDENTLY_VALIDATED_QUALITY_GAIN`, plus assessment differences, evidence-supported ranking, valid repairs, UNKNOWN frequency, runtime, call cost), `paired.ts`, `baselines.ts`, `report.ts`.
- Tests: `ablation` (23): a serialized-view test, an invariance test that scrambles every cultural field, a meta-test showing a control that peeked would be caught, "TasteGate is never more permissive", and an oracle that never reads Qloo affinity.
- `/results` shows each stratum with its real denominator; `data/evaluation-results.json` was regenerated (aggregates only; recorded-derived aggregates stay withheld).

### E. Deployment preparation

`src/server/runtime-profile.ts`, `app/api/health/route.ts`, `scripts/start-production.mjs`, `build-standalone.mjs`, `smoke-production.mjs`, `container-smoke.mjs`, `scripts/lib/dockerignore.mjs`, `Dockerfile`, `.dockerignore`, `deploy/compose.example.yml`, `deploy/nginx.example.conf`, `deploy/env.production.example`, and the extended `scripts/deploy-safety.mjs`. Tests: `runtime-profile` (23), `health` (6), `deploy-artifacts` (14), `deploy-scan` (21). Details, commands, resource figures, the production-live safety **design** and the owner decisions are in [PUBLIC_DEPLOYMENT_PREPARATION](PUBLIC_DEPLOYMENT_PREPARATION.md).

### F. Judge UI

`app/screens/guide.tsx` (explainer, guided demo), `app/decision-trace.ts` and `trace-view.tsx` (a closed vocabulary read from the audit's own findings; nothing invented), changes to `report-view.tsx`, `result-screens.tsx`, `tastegate-app.tsx`, `view-model.ts`, `style.css`, `app/results/page.tsx`. Tests: `judge-ui` (18) and four new real-Chromium tests (`tests/browser/judge-flow.spec.ts`). Public-safe screenshots: `.artifacts/screens/judge-*.png` plus the synthetic set; recorded-data screenshots stay under `private/`.

### G. Devpost materials

[Draft](DEVPOST_AWARD_SUBMISSION_DRAFT.md) (title through public-demo placeholder `PENDING_OWNER_HOSTING`, disclosures, and the unsent organizer inquiry), [judge demo script](JUDGE_DEMO_SCRIPT.md) (2–3 minutes, no recording), [README](../README.md) rewritten as a short judge entry, [release checklist](FINAL_RELEASE_CHECKLIST.md).

### Added in the final pass: offline proof for the unit suite

`tests/setup/network-guard.ts` (loaded for every test file through `vitest.config.ts`) refuses every TCP connection that would leave the machine **before any DNS lookup** and, when `TASTEGATE_NETGUARD_LOG` is set, appends one line per refused attempt (a host and a port only). `tests/network-guard.test.ts` (6) proves it blocks `fetch` and raw sockets, leaves loopback alone, and classifies hosts exactly (`127.example.com` is not loopback); it uses only the `.invalid` TLD and a reserved documentation address, and logs to its own temporary files, so its attempts never reach the suite-wide count. It covers code running in the test workers; child processes started by CLI tests run in isolated roots with no credential and `NODE_OPTIONS` stripped by design.

## Verification (actual results)

Machine: Windows 11, Node 26.5.0, Docker 29.8.0 (started for the container test only, stopped again afterwards). Rows 1–9 are one sequential run (`regress2.mjs`, 2026-10-21 02:31–02:35 NZDT, started after the last code change); row 10 ran on the same code. The documents were edited after those runs to fill in these numbers and to correct stale statements; the privacy gate, the text-hygiene scan, the link check and the archive's own token scan were re-run afterwards (rows 14–16). The logs are in the review archive under `.artifacts/phase3b-verification/`.

| # | Check | Command | Exit | Result | Duration |
| --- | --- | --- | --- | --- | --- |
| 1 | Typecheck | `npm run typecheck` | 0 | clean | 3.7 s |
| 2 | Unit and integration | `npm test` | 0 | **45 files, 1314 tests passed**, 0 failed, 0 skipped | 70.6 s |
| 3 | Production build | `npm run build` | 0 | routes `/`, `/results`, `/api/audit`, `/api/health`; no warnings | 9.7 s |
| 4 | Real browser | `npm run test:e2e` | 0 | **14 passed** (Chromium), 0 skipped, 0 failed | 20.6 s |
| 5 | Evaluation | `npm run eval` | 0 | 1 passed (every stratum, paired against two baselines, with the ablation; `fetch` is a rejecting double) | 2.1 s |
| 6 | Deployment gate | `npm run safety:deploy` | 0 | **91 passed, 0 failed, 0 not run** | 59.3 s |
| 7 | Gate self-test | `npm run safety:deploy:selftest` | 0 | **SELF-TEST PASSED**: 84 passed, 8 failed = the 8 planted leaks, 0 not run | 53.7 s |
| 8 | Production smoke | `npm run build:standalone && npm run smoke:prod` | 0 | **16 / 16**; RSS 89 MB idle, 119 MB after 30 audits | 13.1 s |
| 9 | Whitespace | `git diff --check` | 0 | clean (51 informational "LF will be replaced by CRLF" notices from `core.autocrlf`; no whitespace error) | 0.1 s |
| 10 | Container smoke | `npm run smoke:container` | 0 | **19 passed, 0 failed**: the real Docker build context (115 files) holds no private path and matches the model; image 284.5 MiB, non-root, no secret-looking variable; refuses a credential, `production-live` and live mode (exit 78); hardened run is `healthy`, 46.8 MiB of 512 MiB after a burst of audits | 60.5 s (image build 40.9 s, layers cached) |
| 11 | Text hygiene | scan of every changed and new text file (99 files) | 0 | **0** control, bidi, zero-width or line-separator code points; **0** trailing-whitespace lines; every file ends with a newline; no CRLF (three probe files that had CRLF line endings were normalized to LF, content unchanged) | — |
| 12 | Historical private evidence | `sha256sum -c` of the 111 files recorded before Phase 2A | 0 | **111 / 111 identical** | — |
| 13 | Protected files | `git diff` of `AGENTS.md`, the frozen strategy, `LICENSE` against `HEAD` | 0 | unchanged | — |
| 14 | Privacy gate after the last substantive document edit (only result cells were filled in afterwards) | `npm run safety:deploy` | 0 | **91 passed, 0 failed, 0 not run** | 53 s |
| 15 | Links | README and 56 documents: every relative link and anchor | 0 | **164 links checked, 0 broken** | — |
| 16 | Review archive | CRC test, extraction, manifest hashes, fresh token and secret-shape scan | 0 | Recorded next to the archive in `verification.json` (a result cannot be stored inside the archive it describes): every manifest file identical, none extra or missing, no forbidden path, **0** private-token or secret-shape hits | — |

**External requests.** Qloo requests made in this phase: **0**.

- Measured: the outbound-connection guard was loaded in 45 test workers (one per test file) and refused **0** connection attempts outside its own self-test (the self-test's deliberate attempts use the `.invalid` TLD and a reserved documentation address and log to their own temporary files).
- By construction (not measured): the CLI tests' child processes run in isolated temporary roots with no credential; the browser tests' server runs with `TASTEGATE_DISABLE_LIVE=1` and a canary key that is not a provider key; the production-profile servers in the smoke test and the gate hold no credential and load no transport.
- Ledger evidence (measured): no P07 attempt exists (ledger 0 reserved / 0 dispatched); `private/qloo-live` does not exist, so no live grant or live ledger was ever created; the 111 historical private files are byte-identical.
- Self-audit of the local session log (a private file outside the repository): no private provider token or credential occurs in it after the Phase 3B brief began; the tokens it holds date from earlier phases (the Phase 2B+3A report discloses one such local-only exposure) and the credential value never appears.

**Tests removed.** Net −15 tests in two existing suites, each for a behaviour deleted on purpose: the four free-text reply cases and one merged duplicate (`live-adapter`: −5, 51 → 46) and the free-text and registration tests of the retired P06 approval path (`p06-preparation`: −10, 70 → 60). The exact-consent suite (`live-authorization`, 37) and the P07 approval tests cover their role. No test was skipped or disabled; the single conditional skip (`test.skip(!recordedHere, …)`) ran, because the owner's recordings exist on this machine.

### Test counts by area (45 files, 1314 tests; ● new in Phase 3B)

| Area | Files (tests) |
| --- | --- |
| Authorization and live adapter | ● `live-authorization` (37), `live-grant-cli` (29), `live-adapter` (46), `audit-service` (54), `route` (17), `live-ui` (7) |
| P07 | ● `p07-preparation` (100), ● `p07-interpretation` (30) |
| Repair and workflow | ● `repair-assessment` (13), `repair-semantics` (36), `workflow` (37), `recorded-workflow` (27), `provenance` (17), `recorded-adapter` (14), `contracts` (15), `projections` (28) |
| Evaluation | ● `ablation` (23), `eval-machinery` (27), `evaluation` (1), `results-page` (5) |
| Deployment | ● `runtime-profile` (23), ● `health` (6), ● `deploy-artifacts` (14), `deploy-scan` (21) |
| Presentation | ● `judge-ui` (18), `view-model` (13), `contrast` (28), plus 14 browser tests (4 new) |
| Offline proof | ● `network-guard` (6) |
| Custom plan | `custom-input` (93), `custom-form` (25) |
| Earlier probes (P01–P06, P03-R) and boundary | `p01-probe` (64), `p01-local-env` (9), `p02-preparation` (47), `p03-preparation` (38), `p03r-recovery` (49), `p04-preparation` (37), `p05-preparation` (41), `p06-preparation` (60), `p06-recorded` (33), `p06-seal` (10), `shortlist-ranking` (18), `search-observation` (43), `qloo-boundary` (52), `recorded-live.private` (2), `offline-e2e` (1) |

## Scorecard against the four official criteria

(Weights, wording and anything else about the criteria are as recorded in Phase 0; the rules page could not be re-read, so they are **UNVERIFIED** today.)

| Criterion | Implemented | Evidence | Weakness | Highest-impact improvement | Confidence |
| --- | --- | --- | --- | --- | --- |
| **Technological implementation** | Strict contracts and a validator that re-derives every claim; a bounded deterministic workflow; a closed registry of fixed Qloo request profiles; reserve-before-send ledger; exact single-use consent; runtime profiles; a privacy gate with canaries; a hardened container | 1314 tests, 14 Chromium tests, gate 91/0/0 plus a self-test that fails on planted leaks, 6 captured real Qloo responses, one real shortlist finding | The live adapter has never met Qloo; no real `REPAIR_VERIFIED`; the evaluation is synthetic plus one recorded plan; no hosted URL; the Agentic Intent Gate Runtime is not integrated (approved deferral) | P07 once plus a registered official reference for the first real verified repair; one owner-run live session for the video | Medium-high on engineering; medium on how "substantive Qloo use" is read |
| **Design** | 30-second explainer, guided demo, five screens, decision trace, repair assessment, labelled evidence modes | 14 Chromium tests (guided flow, keyboard and skip link, phone width with no horizontal scroll, accessible names), 28 contrast tests, public-safe screenshots | No human usability study; dense screens; the strongest real-data screens cannot be shown publicly | A 3–5 person walkthrough; the 2–3 minute video | Medium |
| **Potential impact** | A reusable audit pattern (identity, hard constraints, evidence, bounded repair, "UNKNOWN" instead of guessing) in an MIT repository | On the 50-plan seeded holdout, shipping as proposed passes 26 violating and 23 unverifiable items; trusting the first hit passes 31 violating; TasteGate passes none | Synthetic evaluation; one domain (venues); Qloo's incremental quality is not shown | A second domain and a human-judged study (not feasible before the deadline) | Medium-low |
| **Quality of idea** | Hard validity and cultural support kept as separate questions; a replacement is verified only with an independent second source; a fair control and a published null result | The real finding (Qloo's own ordering ranked an out-of-city place above the verified NYC venue; TasteGate rejected it), the strict gate's tests, the ablation | Reads as verification more than taste; no taste-quality gain is shown | A real verified repair (P07) so the story ends in a success, not only a rejection | Medium |

## Acceptance gates

| # | Gate | Status | Basis |
| --- | --- | --- | --- |
| 1 | Real Qloo value | **PARTIAL** | Real recordings drive identity, tag resolution, discovery and one real one-query ranking that exposes the failure TasteGate guards against. Not established: a real verified repair, a quality uplift, any live run. |
| 2 | Repair integrity | **PASS** (offline-verified) | Strict corroboration rule, derived checklist, validator re-derivation, 13 + 36 tests, no success fabricated. |
| 3 | Product experience | **PASS** (engineering-verified) | Explainer, guided demo, trace; 14 browser tests; no human study. |
| 4 | Honest evaluation | **PASS** (method) | Fair control, independent oracle, strata un-pooled with real denominators, null result stated, live NOT RUN. |
| 5 | Deployment security readiness | **PASS** (locally verified) | Profiles, health, start script, container smoke, gate 91/0/0 and self-test. Not deployed. |
| 6 | Submission content readiness | **PARTIAL** | Drafts and script exist; rules UNVERIFIED; no video; hosted URL pending. |
| 7 | Public deployment | **NOT_STARTED / OWNER_RESOURCE_PENDING** | No hosting resource, domain or approval. |

## Security and privacy

- No credential, provider identifier, response body, approval record or private hash was written to a tracked file, document, screenshot or log, and none was printed by any Phase 3B command. The ignored `.env.local` is loaded by the local Next.js build and read by the privacy scanners (to search for the value); the gate verifies that the credential appears in no shippable artifact, and no Phase 3B command sent it anywhere.
- The P07 proposal exists only under the ignored `private/`. The sanitized request in the documents contains the placeholder `<PRIVATE_REVIEWED_RADIOHEAD_ID>`.
- A new P07 attempt ID, a new approval sentence and a 5-minute registration window apply; no historical approval can be reused (a test replays them).
- Residual risk: the approval sentence is not authentication of the human; whoever can run the owner command can paste it ([review](LIVE_AUTHORIZATION_SECURITY_REVIEW.md#residual-risk)). Public live access is refused in code.
- The Qloo developer guide permits private server-side caching, forbids response data in a public repository and is silent on public display. Recorded-derived aggregates and recorded replay stay out of any public surface until the organizer answers.

## Known issues and decisions for the owner

1. **P07.** Approve once with the exact sentence, or decline, or ask for a different profile (for example a state-level filter); `filter.location.query` may be silently ignored for `place`. A good response still needs an independent second source before anything is `REPAIR_VERIFIED`.
2. **Display terms.** Send (or not) the drafted organizer inquiry; assume "not permitted" until answered.
3. **Hosting.** Provider, plan, domain, TLS, monitoring, takedown date. Tier 0 (synthetic and custom only) is recommended.
4. **Commit and push.** Separately, after review; re-run the privacy gate on the exact tree.
5. **Rules.** Open the Devpost rules in a browser and tick the checklist; the deadline, hosting and video requirements are UNVERIFIED.
6. Borough-level city normalization remains unverified; opening hours, availability and free-text claims are not checked; quota, rate limits and key expiry are UNKNOWN.
7. The container image pins its base by tag; pin it by digest at release.

## Files

**Changed (51 tracked files):** the live-authorization, P06/P05/probe-framework, audit, domain, evaluation, server and UI modules listed above, `package.json`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `README.md`, `scripts/deploy-safety.mjs`, `scripts/live-grant.mjs`, `scripts/probe-cli.mjs`, `scripts/qloo-probe-p06-admin.mjs`, the regenerated `data/evaluation-results.json`, the earlier reports (marked as superseded where they changed) and 12 test files.

**Created (new, not ignored):** the P07 modules and scripts, `src/audit/assessment.ts`, `src/eval/ablation*.ts`, `src/server/runtime-profile.ts`, `app/api/health/`, the guide and trace components, the deployment artifacts (`Dockerfile`, `.dockerignore`, `deploy/`, scripts), the new test files and helpers, and the documents [LIVE_AUTHORIZATION_SECURITY_REVIEW](LIVE_AUTHORIZATION_SECURITY_REVIEW.md), [P07_NYC_REPAIR_READINESS](P07_NYC_REPAIR_READINESS.md), [QLOO_INCREMENTAL_VALUE_FINAL](QLOO_INCREMENTAL_VALUE_FINAL.md), [PUBLIC_DEPLOYMENT_PREPARATION](PUBLIC_DEPLOYMENT_PREPARATION.md), [DEVPOST_AWARD_SUBMISSION_DRAFT](DEVPOST_AWARD_SUBMISSION_DRAFT.md), [JUDGE_DEMO_SCRIPT](JUDGE_DEMO_SCRIPT.md), [FINAL_RELEASE_CHECKLIST](FINAL_RELEASE_CHECKLIST.md) and this report.

**Preserved:** `AGENTS.md`, the frozen strategy file and `LICENSE` (unchanged against `HEAD`); the 111 historical private evidence files (byte-identical); every earlier probe's approvals, checkpoints, ledgers and captures (never read for writing, never rewritten); the live grant area (absent). Historical-probe code changed only where Phase 3B required it (the P07 registration, the retired P06 free-text path, a stricter signal match) and its tests were updated, not weakened.

## Deliverables

- Reports: this document and the seven listed above; the updated [backlog](FINAL_SUBMISSION_BACKLOG.md), [evaluation results](AWARD_EVALUATION_RESULTS.md), [capability matrix](REAL_QLOO_CAPABILITY_MATRIX.md) and [deployment readiness](DEPLOYMENT_SECURITY_READINESS.md).
- Local screenshots (public-safe): `.artifacts/screens/` (`judge-1…5`, `synthetic-*`, `mobile-*`, `custom-form`, `live-locked`, `results`).
- Review archive: `private/review/phase3b-20261021/TasteGate_Phase3B_Review.zip` with a `.sha256` next to it (source, new tests, validation logs, evaluation outputs, deployment templates, reports, public-safe screenshots and a SHA-256 manifest of every file). It is a review artifact, **not a backup**: it excludes `private/`, every `.env` file and all provider data, so the owner must back up `private/` and `.env.local` separately.

## Next action

Independent review of this change set. Then the owner decides, each separately: P07, the organizer inquiry, hosting, committing and pushing. No automatic transition to deployment or submission.
