# TasteGate AI

**The cultural quality gate for AI agents.** TasteGate audits an AI agent's recommendations against Qloo taste data and your hard constraints, repairs only what fails, re-checks every replacement, and reports what it could not prove instead of guessing.

**Current milestone: Phase 2B + 3A local build. STOP for independent review.** A five-screen app (Input → Identity → Audit → Repair → Compare) runs the full Audit → Repair → Revalidate workflow on authored synthetic fixtures, on **real recorded Qloo responses** (replayed read-only from the owner's private, integrity-verified captures) and on **your own plan**. An opt-in **AUTHORIZED_LIVE** adapter exists but is locked unless the server owner has configured a credential *and* created a time-boxed grant. The shortlist-ranking request (P06) was approved by the owner, executed **once**, reviewed and sealed: Qloo's own ordering ranks an out-of-city place above the verified NYC venue, and TasteGate keeps the venue and rejects the place on its hard constraints. The next request (P07, a geography-filtered discovery) is prepared and needs its own approval. Nothing has been deployed, committed or submitted.

- [Phase 2B + 3A execution report](docs/PHASE2B3A_EXECUTION_REPORT.md): what was built, actual results, gates, known issues
- [Real Qloo capability matrix](docs/REAL_QLOO_CAPABILITY_MATRIX.md) · [Evaluation results](docs/AWARD_EVALUATION_RESULTS.md) (also served at `/results`)
- [Deployment security readiness](docs/DEPLOYMENT_SECURITY_READINESS.md) · [Final submission backlog](docs/FINAL_SUBMISSION_BACKLOG.md)
- Earlier: [Phase 2A report](docs/PHASE2A_CLAUDE_HANDOVER_EXECUTION.md) · [P06 feasibility](docs/PHASE2A_P06_FEASIBILITY.md) · [Phase 2B delivery plan](docs/PHASE2B_AWARD_DELIVERY_PLAN.md)

## Evidence modes (never merged, never silently switched)

| Mode | What it is | Availability |
| --- | --- | --- |
| **FIXTURE** | Authored synthetic scenarios, including a validated repair and a rejected replacement | Always |
| **RECORDED** | Actual responses from owner-approved probes, verified against private manifests and replayed read-only. Anything not recorded is **UNKNOWN / not captured**, never negative evidence. | Only where the ignored `private/` recordings exist (the owner's machine) |
| **LIVE** (AUTHORIZED_LIVE) | Fresh Qloo requests, each reserved in a durable ledger before it is sent | Locked unless a server-side credential **and** an owner-created grant exist, and then only after an explicit confirmation for each run |

TasteGate never selects a provider identity automatically. You confirm each identity among the returned candidates. Provider IDs are replaced by per-process keyed references and never reach the browser.

**Your own plan.** Describe a plan (city, country, up to three taste signals, up to three places, optional claims), or import/export it as JSON. In RECORDED mode only lookups that were actually recorded have evidence; everything else is reported as UNKNOWN. The form shows which of your exact strings are covered. Nothing is ever sent to Qloo unless you choose LIVE.

## Run locally

Use Node 22.12+, 24 or 26+ (validated here with Node 26.5.0).

```powershell
npm ci --cache .cache/npm
npm run typecheck
npm test                      # unit, workflow, service, UI-model and evaluation-machinery tests
$env:NEXT_TELEMETRY_DISABLED='1'
npm run build
npm run start                 # http://127.0.0.1:3000   (the evaluation page is /results)
npm run eval                  # paired evaluation -> .artifacts/phase2b-evaluation.{json,md}
npm run browser:install       # once
npm run test:e2e              # real Chromium against the production build
npm run safety:deploy         # clean-copy build with synthetic canaries; scans the output; runs the standalone server
npm run safety:deploy:selftest # proves that gate can fail by planting leaks
```

`EVAL_PUBLISH=1 npm run eval` refreshes the aggregate-only [`data/evaluation-results.json`](data/evaluation-results.json) shown at `/results` (aggregates derived from private recordings stay withheld unless `EVAL_PUBLISH_RECORDED=1`).

No `.env` file or API key is needed to run the app. `.env.example` documents non-secret defaults and empty credential names; never use a `NEXT_PUBLIC_` key. The build excludes `private/`, env files and local artifacts from server output traces. `TASTEGATE_DISABLE_LIVE=1` switches live off entirely (use it on any public deployment).

### Owner-only: enabling LIVE for a demo

Live needs all of: `QLOO_MODE=live` with `QLOO_API_KEY` on the **server**, a time-boxed, request-budgeted grant, and a confirmation in the app for every run. Opening the app, setting an environment variable or pressing a generic button never starts a request.

```powershell
npm run live:grant -- --status
npm run live:grant -- --create --owner-reply="Authorize one LIVE session" --gate-id=demo-1 --minutes=15 --max-requests=14 --max-runs=2 --operations=entity_lookup,tag_lookup,rank_places,discover_places
npm run live:grant -- --revoke
```

## Safety boundaries

- Qloo probes P01–P05 and P03-R are completed and **must not be repeated**. Their immutable records, ledgers and raw captures stay private and unchanged. P06 was executed exactly once under a single-use, P06-only owner approval and is sealed (see [P06 gate and result](docs/PHASE2B3A_EXECUTION_REPORT.md#p06-gate-and-result)); it cannot be reused. P07 is prepared, **not approved** and has no execution path.
- Execution codes: PASS=0, FAIL=1, BLOCKED=2, UNKNOWN=3; never automatically retry a nonzero result.
- HTTP 200 is never treated as semantic correctness, and `query.affinity` is query-relative ordering only, never a probability that someone will like a venue.
- Qloo's developer guide allows private server-side caching and forbids storing response data in a public repository; it does not address public display. This repository therefore contains no Qloo response data, and a public deployment must run with recordings absent and live off (see the [deployment readiness](docs/DEPLOYMENT_SECURITY_READINESS.md)).
- AGENTS.md and the frozen strategy are authoritative. The optional Agentic Intent Gate Runtime archive remains deferred under the approved Phase 1A exception ([ADR](docs/adr/0004-phase1a-runtime-deferral.proposed.md)).

Earlier phases: [Phase 1A report](docs/PHASE1A_REPORT.md), [P05 execution](docs/PHASE1B4_P05_EXECUTION_REPORT.md), [P03-R identity review](docs/PHASE1B4_P03R_IDENTITY_REVIEW.md), [Radiohead identity review](docs/PHASE1B4_RADIOHEAD_IDENTITY_REVIEW.md), [Qloo API contract (Phase 0)](docs/QLOO_API_CONTRACT.md). MIT licensed; see [LICENSE](LICENSE).
