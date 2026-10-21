# Phase 3D + 4A — evidence-backed delivery

2026-10-22, Pacific/Auckland. **Base `0d55ca5425de711b6d28dddf7034a52a62cc14bb`**, verified against local HEAD, origin/main and remote main; working tree clean initially. Existing architecture retained. No commit, push, public deployment, hosting resource, DNS/tunnel, Devpost edit/submission, organizer message, recording or upload. **New Qloo API dispatches: 0.**

| Final field | Current result |
| --- | --- |
| OVERALL_STATUS | PARTIAL — independent offline implementation complete; P07 evidence and owner release gates remain |
| P07 | PREPARED / AWAITING_APPROVAL; no registration, execution, response or P07 replay |
| P07_RESPONSE | NOT AVAILABLE — no classification asserted for a nonexistent response |
| REAL_REPAIR | NOT ESTABLISHED: no observed P07 candidate, independently admitted identity or real passing repair |
| QLOO_CULTURAL_VALUE | Coverage and query-relative priority distinguished from rules; real eligible-pair/quality gap remains |
| EVALUATION | Frozen synthetic strata preserved; new completeness counts and two-original-slot independent location check |
| PRODUCT | In-product candidate comparison, second synthetic example, source-linked decision trace, strict offline P07 intake |
| JUDGE_DEMO | Local combined real rejection + synthetic repair path prepared; public-safe synthetic storyboard; no human usability study |
| SECURITY | No fresh API effect; quoted credentials and private approval digests scanned; prior private data/outputs protected |
| TESTS | PASS: 1380 unit/integration tests, 16 Chromium tests, evaluation, builds, deployment safety and 16 production smoke checks; details below |
| DEPLOYMENT | Preparation only; `PUBLIC_DEPLOYMENT=NOT_DEPLOYED_OWNER_PENDING`; Docker engine unavailable |
| DEVPOST | Draft updated, `PENDING_OWNER_HOSTING`; organizer display/integration questions and final owner submission remain |
| FILES | Source/tests/docs/official-source fact labels changed; historical reports and protected files preserved |
| REVIEW_ZIP | `.artifacts/TasteGate_AI_Phase3D4A_Review.zip`; adjacent verification JSON records SHA256, CRC, manifest and scan |
| NEXT_ACTION | Independent review, then the owner's exact current P07-only approval if desired |

## Implementation

1. **Product evidence comparison.** Repair and Compare now expose candidate identity, geography, hard constraints, cultural query order and actual revalidation result. Source links open the matching ledger row. Only eligible, distinct entities in one complete query can be ordered. Missing geography stays unknown; duplicates cannot create a fictitious eligible pair. Existing acceptance logic is unchanged.
2. **Judge demonstration.** The existing guided repair is retained. **Compare two valid choices** directly opens a second, explicitly synthetic sample with two hard-valid candidates and different cultural priority, with the same retained set. It is excluded from the frozen benchmark. Trace rows now link to the exact report evidence, including successful checks. See [storyboard](FINAL_JUDGE_DEMO.md).
3. **P07 intake and consent integrity.** `node scripts/inspect-p07.mjs` currently returns `NOT_EXECUTED`. It verifies known local profile/checkpoint, approval window at durable reservation, receipt, private artist binding, ledger, status, caps and body length before structural inspection. Test captures are `TEST_DOUBLE_ONLY`. The classifier and integrity seal grant no observed-schema admission, provider replay or verified repair. Consent additionally checks the literal receipt URL/destination and registration/expiry/consumption times. No historical approval record is rewritten.
4. **Evaluation.** Versioned output directories preserve previous results and published data. Four separate outcomes are recorded: `EVIDENCE_COVERAGE_GAIN`, `CANDIDATE_ORDER_DIFFERENCE`, `VALID_REPAIR_GAIN`, `INDEPENDENT_QUALITY_GAIN`. Completeness uses explicit candidate, target and mandatory-item denominators; correctness still uses the independent oracle. Synthetic holdout remains **6/50 priority changes, 0/50 retained-set changes**.
5. **Independent factual reference check.** Both original slots of the pre-existing recorded plan are included before scoring, using official non-Qloo venue pages. **3** city/country fields labelled, **1** comparable and consistent, **2** without established provider evidence, **1** unlabelled. This is **one selected plan**, conditional on existing human provider-identity decisions. It admits no provider-ID mapping, repair, taste label or quality uplift. [Method](QLOO_CULTURAL_VALUE_COMPARISON.md).
6. **Shipping privacy.** The active canonical approval sentence was removed from the public readiness document; the owner sees a fresh current-code sentence only at the authorization gate. The scanner now finds proposal digest tokens/private bindings and quoted env credentials. Review artifacts include no token/receipt, private response, provider ID or private hash. New screenshots use versioned paths.

**Evidence-dependent work left open:** actual P07 response review, a versioned projection based on that observed body, exact-context recorded-adapter replay admission, independent candidate/branch corroboration, and a real passing repair. No guessed P07 fields, fake data, automatic promotion or live-to-fixture fallback fills these gaps. The existing recorded adapter, strict repair gate and official-reference loader remain the intended path.

## Actual validation

| Command | Exit / status | Result / duration |
| --- | --- | --- |
| `npm run typecheck` | PASS / exit 0 | No TypeScript errors; 9.028 s |
| `npm test -- --maxWorkers=2` | PASS / exit 0 | 50 test files; 1380 passed; 0 failed / 0 skipped; two workers; 187.418 s |
| `npm run build` | PASS / exit 0 | Full production build including TypeScript; four application routes; 17.407 s |
| `npm run test:e2e` | PASS / exit 0 | 16 Chromium tests passed; 0 failed / 0 skipped; informational color-environment warnings; 42.498 s |
| `npm run eval` | PASS / exit 0 | 1 evaluation test passed; frozen strata and recorded rejection checked; AUTHORIZED_LIVE NOT RUN; 4.45 s |
| `npm run safety:deploy` | PASS / exit 0 | 91 passed / 0 failed / 0 not run; 122.742 s |
| `npm run safety:deploy:selftest` | PASS / exit 0 | 84 passed + 8 expected planted-leak detections; SELF-TEST PASSED; 0 not run; 120.156 s |
| `npm run build:standalone` | PASS / exit 0 | Standalone production package built; 16.64 s |
| `npm run smoke:prod` | PASS / exit 0 | 16 passed / 0 failed; loopback production-safe smoke; 6.496 s |
| `git diff --check` | PASS / exit 0 | No whitespace errors; informational LF/CRLF notices only |
| Container execution | NOT RUN | Docker Desktop engine unavailable; static Docker/context checks remain in the gate |
| Protected-file integrity | PASS | 152/152 baseline files unchanged, including private evidence/screenshots, instructions, frozen strategy, license, env, published data and historical evaluation outputs |
| ZIP | See adjacent machine-readable verification | Exact source snapshot, safe screenshots, aggregate evaluation, actual logs and manifests; no dependencies/cache/private artifacts |

**Recorded development failures:** one focused expectation incorrectly assumed the existing mixed synthetic scenario had no common ranking; corrected the test to construct genuinely missing common evidence. The first normal production build failed with native `Zone Allocation failed` during TypeScript, under observed system commit-memory pressure (under 1 GiB headroom). A subsequent full build passed with child-only `NODE_OPTIONS=--max-old-space-size=512` and `RAYON_NUM_THREADS=2`. Final regression uses those process-scoped limits and two unit workers; no type check, failing test or safety gate is disabled. This does not establish the unique cause of the initial allocation failure.

Initial full regression additionally found **3 stale six-scenario assertions** and **3 Chromium failures from one real mobile overflow** (the new synthetic badge inherited nowrap). Expected scenario membership/unique runs now explicitly include the seventh example; the label wraps on phone widths. The offline execution artifact now uses a new temporary directory, preserving the earlier Phase 1A output. Tests and viewport assertions remain enabled. Initial logs are retained alongside the final successful rerun.

A focused follow-up under concurrent safety-build load exposed an existing concurrency test's turn-limited polling loop: it finished before asynchronous file I/O reached the double. Its exact dispatch-count assertion now uses bounded `vi.waitFor` (2 s), while the concurrent-429 and untouched-ledger assertions are retained. No production timeout or execution policy changed. Initial regression used one unit worker; final regression uses two with the same child heap limit.

Output-path audit also found the legacy generated `.artifacts/phase2b-browser-run.json` had been refreshed by the unchanged synthetic browser test before its fixed path was corrected. It is a generated single-run synthetic report, outside the protected historical evaluation set; its prior bytes were not backed up and are not claimed preserved. The test now writes to a fresh `.artifacts/browser-runs/<uuid>/results.json`. No private capture or prior screenshot was overwritten. Typecheck and all Chromium tests were repeated after this final test-harness-only path change.

The raw/private evaluation stays owner-local in new immutable run directories; the safe summary withholds recorded comparisons. CLI tests use isolated authored roots, browser tests use the kill switch/canary and only loopback, and production-safe checks load no provider transport. The two full regressions and evaluation workers recorded 102 outbound-guard loads and 0 unexpected network events (isolated guard self-tests are separate). Historical ledger/file comparisons are recorded with the validation logs. Public documentation/site GETs are distinct from Qloo event API requests.


Final sequential regression: **2026-10-21T12:31:34.653Z to 2026-10-21T12:40:21.498Z UTC**. Every command exited 0. `DEPLOYMENT_ARTIFACTS=PARTIAL`; `LOCAL_PRODUCTION_BUILD=PASS`; `CONTAINER_TESTS=NOT_RUN`; `PUBLIC_DEPLOYMENT=NOT_DEPLOYED_OWNER_PENDING`. The container is not validated by local smoke or static context checks.

Final test-output-path follow-up: **2026-10-21T12:41:14.818Z to 2026-10-21T12:42:11.368Z UTC**, typecheck and all 16 Chromium tests exit 0; logs in `validation/*-output-path-followup.log`. Product code is unchanged since the full regression.

## Acceptance gates

| Gate | Status | Basis / remaining work |
| --- | --- | --- |
| 1 P07 integrity | PARTIAL | Strict single-request fence tested offline; no owner approval or real dispatch |
| 2 Real provider evidence | PARTIAL | Existing sealed evidence supports existing claims; actual P07 schema/admission is blocked |
| 3 Repair integrity | PASS (offline/recorded rejection) | No unsupported real verified repair; independent source/mandatory gates retained |
| 4 Incremental cultural value | PARTIAL | Same-pool comparison implemented; real two-eligible-candidate comparison and independent taste labels absent |
| 5 Agent reliability | PASS (offline/recorded) | Bounded state machine and trace cite actual findings/records; no new agent framework or Runtime mechanism |
| 6 Judge experience | PARTIAL | Guided local/browser flow verified; independent human walkthrough NOT RUN |
| 7 Deployment readiness | PARTIAL | Local production/safety artifacts verified; container execution and owner resources remain |
| 8 Submission readiness | PARTIAL | Draft/storyboard/checklist prepared; hosted URL, organizer questions and owner submission remain |

Stop for independent review. Any later exact P07 approval permits one fixed request and the offline Track B continuation specified in this brief, never P08, a changed query or a retry. Commit, push, public deployment/data display and submission each require separate owner instructions.
