# TasteGate AI

**The cultural quality gate for AI agents.** TasteGate audits an AI agent's recommendations against Qloo taste data and your hard constraints, repairs only what fails, re-checks every replacement, and reports what it could not prove instead of guessing.

**Current milestone: Phase 2A local product slice. STOP for independent review.** The app runs a full Audit → Repair → Revalidate workflow on **real recorded Qloo responses** (replayed from the owner's private, integrity-verified captures) and on clearly labeled synthetic fixtures. **No new Qloo request is made by the app.** Live product requests are locked; the next request (P06 shortlist ranking) is prepared and waits for explicit owner approval. Nothing has been deployed.

- [Phase 2A execution report](docs/PHASE2A_CLAUDE_HANDOVER_EXECUTION.md): what was built, actual test and evaluation results, known issues
- [Capability matrix](docs/PHASE2A_PRODUCT_CAPABILITY_MATRIX.md): REAL_LIVE_VERIFIED / RECORDED_LIVE / FIXTURE_ONLY / PARTIAL / UNKNOWN / UNSUPPORTED
- [P05 Insights semantic review](docs/PHASE2A_P05_INSIGHTS_SEMANTIC_REVIEW.md) · [P06 feasibility and approval gate](docs/PHASE2A_P06_FEASIBILITY.md) · [Phase 2B delivery plan](docs/PHASE2B_AWARD_DELIVERY_PLAN.md)

## Data modes

| Mode | What it is | Availability |
| --- | --- | --- |
| Recorded Qloo responses | Actual responses from five owner-approved probes (artist, film, place and tag search; artist-to-place Insights), verified against private manifests and replayed read-only. Anything not recorded is shown as **UNAVAILABLE**, never as negative evidence. | Only where the ignored `private/` recordings exist (the owner's machine). Elsewhere the UI shows the mode as unavailable. |
| Synthetic fixtures | Six authored scenarios, including a validated repair and a rejected replacement | Always |
| Live Qloo | Locked | Requires explicit owner approval (see the P06 doc) |

TasteGate never selects a provider identity automatically. You confirm each identity among the returned candidates. Provider IDs are replaced by per-process keyed references and never reach the browser.

## Run locally

Use Node 22.12+, 24 or 26+ (validated here with Node 26.5.0).

```powershell
npm ci --cache .cache/npm
npm run typecheck
npm test                      # if workers crash with out-of-memory: npm test -- --maxWorkers=4
$env:NEXT_TELEMETRY_DISABLED='1'
npm run build
npm run start                 # http://127.0.0.1:3000
npm run eval                  # stratified evaluation -> .artifacts/phase2a-evaluation.{json,md}
npm run browser:install       # once
npm run test:e2e              # real Chromium against the production build
```

No `.env` file or API key is needed to run the app. `.env.example` documents non-secret defaults and empty credential names; never use a `NEXT_PUBLIC_` key. The build excludes `private/`, env files and local artifacts from server output traces.

## Safety boundaries (unchanged)

- Qloo probes (`npm run probe:p01` … `probe:p05`) are completed and **must not be repeated**. Their immutable records, ledgers and raw captures stay private and unchanged.
- Execution codes: PASS=0, FAIL=1, BLOCKED=2, UNKNOWN=3; never automatically retry a nonzero result.
- Live requests require fresh, exact owner approval. HTTP 200 is never treated as semantic correctness, and `query.affinity` is query-relative ordering only, never a probability that someone will like a venue.
- AGENTS.md and the frozen strategy are authoritative. The optional Agentic Intent Gate Runtime archive remains deferred under the approved Phase 1A exception ([ADR](docs/adr/0004-phase1a-runtime-deferral.proposed.md)).

Earlier phases: [Phase 1A report](docs/PHASE1A_REPORT.md), [P05 execution](docs/PHASE1B4_P05_EXECUTION_REPORT.md), [P03-R identity review](docs/PHASE1B4_P03R_IDENTITY_REVIEW.md), [Radiohead identity review](docs/PHASE1B4_RADIOHEAD_IDENTITY_REVIEW.md), [Qloo API contract (Phase 0)](docs/QLOO_API_CONTRACT.md). MIT licensed; see [LICENSE](LICENSE).
