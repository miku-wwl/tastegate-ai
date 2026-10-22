# TasteGate AI

**The cultural quality gate for AI agents.** An AI agent proposes a plan; TasteGate audits it against Qloo taste data **and** your hard constraints, repairs only what fails (once), re-checks every replacement from scratch, and reports what it could not prove instead of guessing.

> **Release candidate, 2026-10-23.** One real P07 replacement is independently corroborated and verified; its whole plan remains UNKNOWN/partial. Public production is synthetic/custom only pending display permission. **Not deployed.** [Current report](docs/FINAL_PREDEPLOYMENT_REPORT.md) · [Qloo evidence](docs/FINAL_QLOO_EVIDENCE_STATUS.md) · [deployment runbook](docs/PUBLIC_DEPLOYMENT_RUNBOOK.md) · [English submission](docs/FINAL_DEVPOST_SUBMISSION.md). The application contains no LLM and does not integrate Agentic Intent Gate Runtime (approved deferral).

## Try it in two minutes (no setup, no key)

```powershell
npm ci --cache .cache/npm
npm run build
npm start                      # http://127.0.0.1:3000
```

1. Open the page and press **“Start the 2-minute guided demo”**. It runs an authored synthetic plan and walks Audit → Repair → Compare with a short caption at each step.
2. Look for the **red card** (a hard constraint failed, with the exact check), the **two separate questions** on the repair (hard constraints vs cultural evidence), the **SYNTHETIC SUCCESS** label, and the **decision trace** on the last screen.
3. Open **Evaluation results** (`/results`): the paired evaluation, a control *without* Qloo's cultural evidence, and an honest `QUALITY_UPLIFT_NOT_ESTABLISHED`.

Use **Audit your own recommendations** for the bounded custom form. Enter a city/country, interests, constraints and up to three places, or import an input JSON. Without matching provider evidence, identities and cultural claims remain UNKNOWN; nothing silently contacts Qloo or switches to a sample.

Owner-local only: when admitted private evidence is installed under a permitted recorded-local/development profile, **Try the recorded Qloo case** opens P07 identity confirmation and a real verified replacement. The original rejection sample remains separate. This button is unavailable on a clean production-safe host. [Demo and reviewer walkthrough](docs/FINAL_JUDGE_DEMO.md).

No network request to Qloo is made by any of this. A container build is prepared too (`npm run smoke:container`, needs Docker).

## What it does

| Stage | What TasteGate checks | Never does |
| --- | --- | --- |
| **Resolve** | Which provider entity each item and taste signal means. You confirm among returned candidates. | Pick an identity by rank, count or label |
| **Audit** | Identity, hard constraints (city, country, type, plan size) and Qloo evidence, **as separate checks**. `UNKNOWN` means “no evidence”, never “wrong”. | Treat an affinity score as a probability, or let it override a failed hard check |
| **Repair** | Only blocked or unidentified items get **one** replacement from Qloo discovery, audited from scratch. | Swap a verified venue just because evidence is missing |
| **Verify** | A replacement is `REPAIR_VERIFIED` only if identity, every hard constraint and cultural evidence pass **and** its identity has a second source (a separate provider lookup or a registered official public page). Your own click is recorded but is not a second source. | Call a Qloo ID “verified” on Qloo's say-so alone |

Bounded and deterministic: at most 14 evidence calls, one repair round, no retries. The decision trace on the last screen lists each decision in a closed vocabulary (for example `HARD_CONSTRAINT_FAILED → REPAIR_CONSIDERED`, `REPLACEMENT_WRONG_CITY → REPAIR_REJECTED`); it is read from the audit's own findings, with no free-form agent reasoning.

## Where Qloo comes in, and what is real

| Qloo request | Used for | Status |
| --- | --- | --- |
| `GET /search` | Identity candidates for the artist, venue and film | 3 real owner-approved responses, recorded |
| `GET /v2/tags` | Taste-tag resolution | 1 real response, recorded |
| `GET /v2/insights` (artist signal) | Discovery of replacement places | 1 real response, recorded |
| `GET /v2/insights` + `filter.results.entities` | Ranking a shortlist inside one query | 1 real response (P06), executed once, sealed |
| `GET /v2/insights` + a locality filter (P07) | Three recorded candidates; exact-context replay and one independently corroborated repair | Executed once, observed-schema reviewed and sealed. Locality name ambiguous; boundary NOT VERIFIED. |

The original recorded finding: **Qloo's own ordering ranked an out-of-city place above the verified NYC venue; TasteGate kept the venue and rejected the place on its hard constraints.** That is a statement about one query, not about Qloo in general. Qloo's `query.affinity` is query-relative. Its numeric value is not an acceptance threshold; the query's ordering can prioritize candidates.

P07 adds a separate real case: one unidentified original slot receives a replacement that passes all ten mandatory checks, including official identity/branch and separate country corroboration. Another original still lacks cultural evidence, so the whole report stays UNKNOWN. Neither case establishes personal preference uplift.

## What we measured, and what we did not

The same plan goes through ship-as-proposed, trust-the-first-hit and TasteGate on the same evidence, scored by an oracle that does not use TasteGate's rules; strata are never pooled (see [evaluation results](docs/AWARD_EVALUATION_RESULTS.md)). A **control without cultural evidence** shares every non-cultural input. Result: cultural evidence adds **evidence coverage** (kept items carrying Qloo evidence), changed **no kept plan** in any synthetic plan, and independently validated quality gain is **not established** (no ground truth for cultural fit exists that is independent of Qloo's own affinity). See [Qloo's incremental value](docs/QLOO_INCREMENTAL_VALUE_FINAL.md). The live stratum is NOT RUN.

## Evidence modes (never merged, never silently switched)

| Mode | What it is | Availability |
| --- | --- | --- |
| **FIXTURE** | Authored synthetic scenarios, including a validated repair and a rejected replacement | Always |
| **RECORDED** | Actual responses from owner-approved probes, verified against private manifests and replayed read-only. Anything not recorded is **UNKNOWN**, never negative evidence. | Only where the ignored `private/` recordings exist (the owner's machine, profile `development` or `recorded-local`) |
| **LIVE** | Fresh Qloo requests, each reserved in a durable ledger before it is sent | Locked unless a server-side credential **and** an owner-created grant exist, only in the owner's `development` profile, and then only after a confirmation for each run |

## Safety model (short)

- **Consent is exact, not interpreted.** A live grant or a probe approval is accepted only if the reply equals one canonical sentence derived from the exact terms (operation, endpoint, parameters, budgets, timeouts, size cap, expiry, environment, unique identity). Negative, hedged or free-text replies are refused; sentences are single-use. [Review](docs/LIVE_AUTHORIZATION_SECURITY_REVIEW.md).
- **Runtime profiles.** `production-safe` (the default for a production build): synthetic and custom plans only, private recordings never loaded, live off, a credential must not even be present. `production-live` is reserved and refused. See [deployment preparation](docs/PUBLIC_DEPLOYMENT_PREPARATION.md).
- **Privacy gate.** `npm run safety:deploy` builds a clean copy with synthetic canaries, scans every shippable artifact (bundles, static files, source maps, traces, the Docker build context, developer paths) and the owner's real private tokens, starts the server and exercises the guarantees. `npm run safety:deploy:selftest` proves the gate can fail.
- No Qloo response data is in this repository (the developer guide forbids it); a public deployment runs with recordings absent.

## Run, test, evaluate

Node 22.12+, 24 or 26+ (validated with Node 26.5.0).

```powershell
npm run typecheck
npm test                         # unit, workflow, service, UI-model, evaluation and deployment-artifact tests
npm run eval                     # immutable run directory -> .artifacts/evaluation/; latest pointer in evaluation-latest.json
npm run browser:install          # once
npm run test:e2e                 # real Chromium against the production build
npm run build:standalone         # self-contained production server
npm run start:prod               # validates the environment, then starts it (production-safe by default)
npm run smoke:prod               # local production smoke test of the built server
npm run smoke:container          # Docker build + hardened run + checks (needs a Docker engine)
npm run safety:deploy            # clean-copy privacy gate;   npm run safety:deploy:selftest proves it can fail
npm run release:verify           # one versioned run: existing checks + clean install/build/smoke + artifact scan; no Qloo call
```

`EVAL_PUBLISH=1 npm run eval` refreshes the aggregate-only [`data/evaluation-results.json`](data/evaluation-results.json) shown at `/results` (aggregates derived from private recordings stay withheld unless `EVAL_PUBLISH_RECORDED=1`). No `.env` file or API key is needed to run the app; never use a `NEXT_PUBLIC_` key.

### Owner-only: enabling LIVE for a demo

Needs all of: `TASTEGATE_PROFILE=development`, `QLOO_MODE=live` with `QLOO_API_KEY` on the **server**, a time-boxed grant, and a confirmation in the app for every run. Opening the app, setting a variable or pressing a button never starts a request.

```powershell
npm run live:grant -- --propose --minutes=15 --max-requests=14 --max-runs=2 --operations=entity_lookup,tag_lookup,rank_places,discover_places
npm run live:grant -- --create --proposal=<id> --owner-reply="<the exact sentence --propose printed>"
npm run live:grant -- --status
npm run live:grant -- --revoke
```

## Honest limits

- Independent cultural quality uplift is **not established**. Evaluation separates authored synthetic cases, four variants of the original recorded input and one additional P07 input. Synthetic successes are labelled as such.
- City checks compare the provider's `geocode.city` exactly; borough-level normalization is unverified. Opening hours, availability and claims are not verified.
- Quota, rate limits and key expiry are **UNKNOWN**; keys deactivate after the hackathon. Qloo's developer guide is silent on public display, so recorded data is not shown publicly.
- A single-process limiter does not protect a distributed deployment; public live access is not authorized.
- P01–P07 and P03-R are complete and must not be repeated. No further probe is authorized.

Documents: [Phase 3B execution report](docs/PHASE3B_EXECUTION_REPORT.md) · [P07 readiness](docs/P07_NYC_REPAIR_READINESS.md) · [Judge demo script](docs/JUDGE_DEMO_SCRIPT.md) · [Devpost draft](docs/DEVPOST_AWARD_SUBMISSION_DRAFT.md) · [Release checklist](docs/FINAL_RELEASE_CHECKLIST.md) · [Real Qloo capability matrix](docs/REAL_QLOO_CAPABILITY_MATRIX.md) · [Final submission backlog](docs/FINAL_SUBMISSION_BACKLOG.md). Earlier: [Phase 2B+3A report](docs/PHASE2B3A_EXECUTION_REPORT.md), [Phase 1A report](docs/PHASE1A_REPORT.md), [Qloo API contract](docs/QLOO_API_CONTRACT.md). AGENTS.md and the frozen strategy are authoritative. MIT licensed; see [LICENSE](LICENSE).
