# Final submission backlog

2026-10-21 update (Phase 3B), originally written 2026-10-20, Pacific/Auckland. **Deadline: 2026-10-30 23:45 EDT = 2026-10-31 16:45 NZDT** (EDT is UTC−4, NZDT is UTC+13). Ten days remain. Aim to submit by **2026-10-30 12:00 EDT (2026-10-31 05:00 NZDT)** so a portal problem cannot cost the entry.

Status today: the product, evaluation, live adapter and deployment gate are built and verified offline, and the one approved Qloo request (P06) was executed once and sealed ([execution report](PHASE2B3A_EXECUTION_REPORT.md)). The owner committed and pushed the Phase 2B+3A work as `8c49370`; the **Phase 3B changes are uncommitted** (see the [Phase 3B report](PHASE3B_EXECUTION_REPORT.md)). Nothing is deployed or submitted. Items marked **OWNER** need a decision or an action only the owner can take; the rest is engineering that follows from those decisions.

## 1. Decisions only the owner can make

| # | Decision | Why it matters | Recommended default |
| --- | --- | --- | --- |
| D1 | ~~P06~~ **Done**: approved, executed once (class A) and sealed. See [P06 gate and result](PHASE2B3A_EXECUTION_REPORT.md#p06-gate-and-result). | The real venue is now ranked and REVIEW; the real replacement is rejected despite ranking first | None; do not reuse the approval |
| D2 | **P07**: approve one geography-filtered discovery, or skip. **Phase 3B prepared the gate** (attempt `598e608d-…`, valid until 2026-10-23 01:25 NZDT): see [P07 readiness](P07_NYC_REPAIR_READINESS.md) for the exact sentence and the documentation conflict on the locality parameter. | The only route to a real **verified** repair; the P06 result (Qloo ranks the out-of-city place first) makes a location-aware discovery the natural next evidence. Needs its own gate and a small execution profile. | Decide now that P06 is sealed; its parameter has a documentation conflict, so a silent ignore is possible |
| D3 | **Display terms.** Ask the organizer whether a hosted demo may show or replay Qloo-derived data (question in the [readiness document](DEPLOYMENT_SECURITY_READINESS.md#organizer-terms-what-is-known)) | The developer guide is silent on public display | Ask now; assume "not permitted" until answered |
| D4 | **Commit and push** the Phase 3B change set | Uncommitted. A private backup exists as the Phase 3B review archive. Re-run the privacy gate on the exact commit first. | Approve after review; re-run the privacy scan on the exact commit first |
| D5 | **Hosting tier**: 0 (synthetic and custom only, nothing private), 1 (recorded replay behind access control), 2 (owner-run live). A hosted app is probably required (see section 3). | Determines what judges can try | Tier 0 public; Tier 2 for the video if terms allow |
| D6 | **Demo video** (not mandatory per the Phase 0 reading of the rules; recheck) and what it may show | Private-derived screenshots stay private until D3 is answered | Short video, synthetic plus the repair-rejection story |
| D7 | Publish the recorded-derived evaluation aggregates? (`EVAL_PUBLISH_RECORDED=1`) | They are withheld from `/results` by default | Keep withheld until D3 |
| D8 | Credential: confirm exposure/rotation status and any quota you can learn from the key portal | UNKNOWN in every approval so far | Rotate if any doubt |
| D9 | Runtime (Agentic Intent Gate) archive stays deferred | AGENTS.md Phase 1A exception | Keep deferred; disclose as not used |

## 2. P06 (done)

Registered, executed once, inspected locally (class A: both places returned with numeric affinity, nothing outside the shortlist) and sealed on 2026-10-20. The private tests, evaluation, browser tests and capability documents were updated for the real result. The approval is consumed; a second P06 would need a new, separate approval and is not wanted.

**P07, if approved:** Phase 3B already built the profile, the gate and the tests ([P07 readiness](P07_NYC_REPAIR_READINESS.md)). After approval: register the approval, execute once, review the capture locally, seal it. A real `REPAIR_VERIFIED` then additionally needs an **independent second source** for one replacement that passes every hard check (a registered official public venue page or a separate provider lookup); the owner's own confirmation of Qloo's candidate yields `EVIDENCE_INSUFFICIENT`. Loading a sealed P07 capture into the recorded adapter, and the private reference-file loader, are deliberately not built until the real response shape is known.

## 3. Submission materials (drafted in Phase 3B; nothing submitted)

Drafts now exist: [Devpost draft](DEVPOST_AWARD_SUBMISSION_DRAFT.md) (with an unsent organizer inquiry and the **UNVERIFIED** status of the official rules), the [judge demo script](JUDGE_DEMO_SCRIPT.md) and the [release checklist](FINAL_RELEASE_CHECKLIST.md). The table below is the original list.

| Item | Notes |
| --- | --- |
| Devpost write-up | Problem; what TasteGate does; **exactly how Qloo is used** (search, tags, Insights including the P06 shortlist ranking; recorded vs live; what is real); evaluation summary with its limits; what is not claimed; built with; how to run. Reuse the README and the evaluation document. Be explicit that the AUTHORIZED_LIVE adapter has not been run against Qloo and that the evaluation's live stratum is NOT RUN. |
| Repository | Public, MIT (`LICENSE` exists), no Qloo response data, no secrets. Re-run `npm run safety:deploy` and the token scan on the exact commit before pushing. |
| Hosted URL | **Probably required, not optional.** The Phase 0 reading of the overview and rules (2026-10-16, [S01/S02](PHASE0_SOURCES.md)) lists a *working accessible application*, *free judge access* and *external hosting*. Re-read the rules page to confirm. If it is required, a Tier 0 deployment is on the critical path (about 0.5–1 day) and the display-terms question (D3) matters more. Never claim live capability the host does not have. |
| Demo video (optional) | Script below. 2–3 minutes. Public-safe screens only until D3. |
| Screenshots | Public-safe: `.artifacts/screens/` (synthetic input, audit, repair, compare, custom form, live-locked, results, mobile). Private-derived: `private/phase2b-screens/` — do not publish. |
| Testing instructions for judges | Tier 0: open the URL, choose a sample plan, run, walk the five screens; open `/results`; try "Your own plan" with the worked example (expect UNKNOWN where no evidence exists). |
| Reuse and AI-assistance disclosure | The code was written with an AI coding assistant under the owner's direction; the Agentic Intent Gate Runtime is **not** integrated in this milestone. Re-read the rules for the exact disclosure wording. |
| English materials | All current documents are English. |

## 4. Suggested timeline (EDT deadline)

| Date (NZ) | Work |
| --- | --- |
| Oct 20–21 | Independent review of this change set; decide D1, D3, D4; send the organizer question |
| Oct 22 | (P06 done early.) Decide D2; if P07 is wanted, build its profile and present its gate |
| Oct 23 | P07 (if approved): execute once, inspect, seal; update documents |
| Oct 24–26 | Commit and push (D4); hosting decision (D5) and Tier 0 deployment; rerun the gate on the deployed URL |
| Oct 27–28 | Devpost write-up; video; screenshots; final accessibility pass on the deployed site |
| Oct 29 | Freeze. Re-run typecheck, tests, build, e2e, eval and the deployment gate on the final commit; refresh `data/evaluation-results.json`; re-scan for secrets |
| Oct 30 (before 12:00 EDT = Oct 31 05:00 NZDT) | Submit; verify the Devpost page, the repository link and the hosted URL from a clean browser |

## 5. Demo script (2–3 minutes)

1. **0:00 Problem.** AI agents recommend venues that are in the wrong city, never checked, or described with claims nobody verified.
2. **0:20 Input.** Pick the "Wrong city → validated repair" sample. Point at the evidence-mode chips: FIXTURE is synthetic, RECORDED replays owner-approved Qloo responses, LIVE is locked. Press Run.
3. **0:40 Audit.** Four checks per item: identity, hard constraints, taste evidence, claims. UNKNOWN means "no evidence", never "wrong".
4. **1:10 Repair.** One replacement is proposed and audited from scratch. Status: *Repair verified*. Then run "Replacement also violates the city constraint": *Replacement rejected*, and the original is **not** shown as repaired.
5. **1:50 Compare.** Before/after, the evidence ledger, "what this does not prove". Open `/results`: the paired evaluation against two baselines, the holdout, and the honest "live: NOT RUN".
6. **2:30 Your own plan.** Load the worked example; the form shows which strings have evidence; the result is UNKNOWN where none exists.
7. **2:50 Close.** What is real (recorded Qloo responses, including the one-query ranking), what is prepared (P07), and the live gate that stays locked without an owner grant.

If D3 allows it, replace step 2's synthetic sample with the recorded NYC plan: it shows the strongest real moment, **Qloo's own ordering ranks an out-of-city place above the verified NYC venue, and TasteGate keeps the venue and rejects the place on the provider's own city and country**. Until D3 is answered, tell that story with the synthetic sample and describe the real result in words, without showing Qloo-derived names.

## 6. The review archive

A single sanitized ZIP is written to the ignored `private/review/` directory with a SHA-256 manifest: changed and new source, tests, configuration, the five documents, the test/build/evaluation/gate logs and reports, and the public-safe screenshots. It excludes credentials, `.env*`, raw provider responses, private IDs, attempt records, evidence hashes, `node_modules`, `.next`, caches and private-derived screenshots. It was token-scanned against the owner's real private tokens before being written, and re-extracted and re-verified. Superseded: the 2B+3A work is committed; Phase 3B has its own archive.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Display terms forbid public Qloo-derived content | Tier 0; recorded evidence only in a private or recorded setting |
| Overclaiming the P06 result | It is a two-place, one-query sample: it shows the parameter is honoured and that Qloo ranked the out-of-city place first. It does not show that rankings are reliable or that anyone would like a place |
| Unknown quota or rate limits; keys deactivate after the hackathon | Live stays owner-run and budgeted; no judge-facing dependency on live |
| Uncommitted Phase 3B work | Review archive now; commit after review (D4) |
| Time-zone slip | Aim for Oct 30 12:00 EDT |
| Confusing "recorded" with "live" | Mode banner on every result, three distinct labels, locked live card |
