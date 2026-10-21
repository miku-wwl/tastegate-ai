# Final release checklist

2026-10-22, Pacific/Auckland. Phase 3D/4A base `0d55ca5425de711b6d28dddf7034a52a62cc14bb` plus uncommitted changes. **Deadline re-read from [official rules](https://qloo.devpost.com/rules): 2026-10-30 23:45 EDT = 2026-10-31 16:45 NZDT.** Internal target: **2026-10-31 05:00 NZDT**.

**Release state: NOT READY TO SUBMIT.** Phase 3C is in the reviewed baseline commit. Phase 3D/4A is uncommitted; nothing was pushed, deployed or submitted in this phase. Current verification and resource limits: [Phase 3D/4A report](PHASE3D4A_EXECUTION_REPORT.md). Earlier test counts below are historical unless refreshed there.

Current review priorities: [real repair evidence](REAL_REPAIR_EVIDENCE.md), [cultural comparison](QLOO_CULTURAL_VALUE_COMPARISON.md), [final judge demo](FINAL_JUDGE_DEMO.md). No P07 response review document exists because P07 did not run. Original private data, screenshots, strategy, instructions, license and earlier evaluation outputs must remain byte-identical. Active approval sentences belong only to the current owner gate and are excluded from source/archive.

## 1. Acceptance gates

| # | Gate | Status | Basis | What would change it |
| --- | --- | --- | --- | --- |
| 1 | **Real Qloo value** | **PARTIAL** | Six captured real Qloo responses (3 `/search`, 1 `/v2/tags`, 2 `/v2/insights`) drive identity, tag resolution, replacement discovery and one real one-query shortlist ranking. The real finding: Qloo's own ordering ranked an out-of-city place above the verified NYC venue; TasteGate kept the venue and rejected the place on hard constraints. **Not established:** a real `REPAIR_VERIFIED`, a quality uplift, any live run. | P07 executed once **and** an independently corroborated replacement (a registered official public page or a separate provider lookup) |
| 2 | **Repair integrity** | **PASS** (offline-verified) | `REPAIR_VERIFIED` requires an independently corroborated identity plus every mandatory evidence item; a user click is `EVIDENCE_INSUFFICIENT`; a contradicting reference is `FACT_CONFLICT`; the validator re-derives every acceptance; hard-constraint validity and cultural support are reported separately. No real `REPAIR_VERIFIED` is claimed. | Nothing needed |
| 3 | **Product experience** | **PARTIAL** | 30-second explainer, guided repair, valid-choice comparison, source-linked trace and repair assessment; 16 real-Chromium tests pass, including keyboard and mobile width. Independent human walkthrough NOT RUN. | A 3–5 person walkthrough |
| 4 | **Honest evaluation** | **PASS** (method) | Fair control without cultural evidence, independent oracle, strata never pooled, `QUALITY_UPLIFT_NOT_ESTABLISHED` published; live stratum NOT RUN. | A human-judged taste study (out of scope) |
| 5 | **Deployment security readiness** | **PARTIAL** | Production profiles, health check, start script, Dockerfile, compose/nginx examples, privacy gate and planted-leak self-test verified locally. Container execution NOT RUN: Docker engine unavailable. | Run container smoke with an available engine and repeat on the exact release commit |
| 6 | **Submission content readiness** | **PARTIAL** | Draft and demo script updated; rules now re-read. No functional demo URL, no independent review or organizer answer about recorded-data display. No video recorded. | Owner provides resources/decisions; functional demo; submission review |
| 7 | **Public deployment** | **NOT_STARTED / OWNER_RESOURCE_PENDING** | No hosting resource exists. `PUBLIC_DEPLOYMENT_STATUS = NOT_DEPLOYED_OWNER_RESOURCE_PENDING`. | Owner supplies a host, domain and approval |

## 2. Actions that need the owner's separate, explicit approval

Each is independent; approving one never approves another. None has been taken.

| Action | State | Notes |
| --- | --- | --- |
| **P07** (one geography-filtered Qloo request) | OFFLINE_REVALIDATED, AWAITING_APPROVAL | Existing unexpired [gate](P07_NYC_REPAIR_READINESS.md); lapses 2026-10-22T12:25:45.973Z. No checkpoint or request. After exact approval, use process-scoped live mode only. |
| Any other Qloo request (P08+, live runs, repeats of P01–P06/P03-R) | NOT REQUESTED | Each needs its own exact gate |
| **Commit** the Phase 3D/4A change set | PENDING_OWNER | Independent review and explicit approval first |
| **Push** | PENDING_OWNER | After commit approval |
| Organizer inquiry email | DRAFTED, NOT SENT | [Devpost draft](DEVPOST_AWARD_SUBMISSION_DRAFT.md) section 15 |
| Hosting purchase / cloud resources / DNS / certificate | NOT STARTED | [Deployment preparation](PUBLIC_DEPLOYMENT_PREPARATION.md) section 14 |
| Deployment | NOT STARTED | Needs a host first |
| Public display of Qloo-derived data (`EVAL_PUBLISH_RECORDED=1`, recorded replay on a public host) | NOT APPROVED | The developer guide is silent on public display; ask first |
| Public live access | NOT AUTHORIZED | Refused in code (`PRODUCTION_LIVE_AUTHORIZED = false`) |
| Devpost edits / submission | NOT STARTED | |
| Demo video | NOT RECORDED | Script ready: [judge demo script](JUDGE_DEMO_SCRIPT.md) |

## 3. Official rules and remaining owner checks

The [official rules](https://qloo.devpost.com/rules) were readable in Phase 3C and re-read in Phase 3D/4A (2026-10-22). Sections 1/4 require a functional demo link, public licensed source and English materials; section 6 gives four equal criteria. Judging ends November 16 (Eastern Time); access must remain free for judges. A video is not listed as mandatory. Eligibility remains the owner's responsibility; recorded-only sufficiency and public Qloo-data display still need organizer clarification.

- [x] Re-read deadline, demo/source/language requirements and judging criteria.
- [ ] Supply the functional demo URL and free judge access through judging.
- [ ] Confirm eligibility, account-only required fields and reuse/AI disclosures.
- [ ] Obtain organizer guidance on recorded integration and public display.
- [ ] Confirm key expiry, quotas and rate limits for any proposed live session.

## 4. Before the commit (owner-approved only)

- [ ] Independent review of the Phase 3D/4A change set is complete.
- [ ] The owner explicitly approves committing. No commit message is prepared until then.
- [ ] `git status` shows no `private/`, `.env*`, `.artifacts/`, `.cache/` or `test-results/` path (all are ignored; `.env.example` is the only tracked env file).
- [ ] Full regression on the exact tree (section 6) passes; keep the logs.
- [ ] Token scan of the tree about to be committed finds nothing: `npm run safety:deploy` covers tracked and new files; scan the **commit** afterwards by listing its files with `git ls-tree` and comparing against the private tokens (the scanner derives them at run time and never prints them).
- [ ] `docs/` contains no real provider identifier, request URL, private hash, approval record or credential (the privacy gate scans documents).

## 5. Before any deployment (owner-approved only)

- [ ] Hosting decisions made ([deployment preparation](PUBLIC_DEPLOYMENT_PREPARATION.md) section 14).
- [ ] Image built from a clean checkout of the release commit; base image pinned by digest; `npm run smoke:container` passes on it.
- [ ] `TASTEGATE_PROFILE=production-safe`; no credential or `QLOO_MODE=live` on the host; `GET /api/health` reports `production-safe`, live and recorded replay `DISABLED_BY_PROFILE`.
- [ ] TLS, headers, rate limits and takedown date in place; egress denied if the host allows it.
- [ ] Rollback tag recorded.
- [ ] Re-run the gate's checks by hand against the public URL; open the site from a clean browser on a phone and a desktop.

## 6. Freeze procedure (run on the exact release commit)

```powershell
npm ci --cache .cache/npm
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run eval                        # then: $env:EVAL_PUBLISH = "1"; npm run eval   (refreshes data/evaluation-results.json)
npm run safety:deploy
npm run safety:deploy:selftest
npm run build:standalone; npm run smoke:prod
npm run smoke:container             # needs a Docker engine
git diff --check
```

Record for each: the command, the exit code, the totals, the duration, warnings and skips. Compare with the [Phase 3B report](PHASE3B_EXECUTION_REPORT.md#verification-actual-results).

## 7. Submission content (drafted, not submitted)

| Item | State |
| --- | --- |
| Title, tagline, short description, long description | DRAFTED ([Devpost draft](DEVPOST_AWARD_SUBMISSION_DRAFT.md)) |
| How Qloo is used (exact), evaluation summary with limits, what is not claimed | DRAFTED |
| Built with, links, testing instructions for judges | DRAFTED; demo link is `PENDING_OWNER_HOSTING` |
| Demo video (2–3 minutes) | [Final storyboard](FINAL_JUDGE_DEMO.md) ready; NOT RECORDED |
| Screenshots | Current public-safe set in `.artifacts/phase3d4a/screens/`; previous screenshots preserved; recorded-data screens stay private |
| Disclosures (AI assistance, Runtime not integrated, synthetic data labelled, no Qloo data published) | DRAFTED |
| Organizer questions | DRAFTED, NOT SENT |

## 8. Hard stops (conditions that must stay true)

- No Qloo request without an exact, unexpired, request-specific approval; no historical approval is reused.
- No Qloo response data, private provider identifier, credential, approval record or private hash in any tracked file, document, screenshot, log or archive.
- No public live access; no recorded replay on a public host until the organizer answers.
- Synthetic data stays labelled synthetic; a synthetic success is never described as a real repair.
- No claim of quality uplift, taste accuracy or live Qloo operation that the evidence does not support.
