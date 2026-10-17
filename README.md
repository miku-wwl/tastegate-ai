# tastegate-ai
TasteGate AI — A Qloo-powered cultural quality gate that audits, repairs, and verifies AI-generated recommendations with evidence-backed cultural intelligence.

**Current milestone: Phase 1B.3 after one explicitly approved P02 (HTTP 200); STOP for independent schema/identity review.** P01 was not repeated. P02's attached tags omit the value field seen in P01; the local projection rejected them without automatic relaxation. No entity ID was selected. All executed audit scenarios use authored synthetic venues, IDs and rankings. No provider response became trusted audit evidence. The semantic LiveQlooAdapter remains disabled. No LLM inference, Python archive, deployment or measured recommendation-quality improvement is implemented.

See the [actual P02 execution report](docs/PHASE1B3_P02_EXECUTION_REPORT.md), [readiness and preparation snapshot](docs/PHASE1B3_P02_P04_READINESS.md), [P02 identity protocol](docs/PHASE1B3_P02_ENTITY_RESOLUTION.md), [P03 venue controls](docs/PHASE1B3_P03_NYC_CONTROLS.md) and [P04 tag plan](docs/PHASE1B3_P04_TAG_PROBE_PLAN.md). npm run probe:p02 still previews with zero dispatches; the approved attempt has been consumed. P03/P04 have no executable definition or consent. Preparation/preflight cannot authorize another request.

Use Node 22.12+, 24, or 26+ (validated here with Node 26.5.0). Install the exact locked dependencies and run locally:

```powershell
npm ci --cache .cache/npm
npm run typecheck
npm test
$env:NEXT_TELEMETRY_DISABLED='1'
npm run build
npm run dev
```

Open **http://127.0.0.1:3000** and click **Run synthetic audit**. Six scenarios demonstrate a valid recommendation, a wrong-city repair, missing evidence, unresolved identity and a rejected replacement. All outputs preserve the fixture label. No `.env` file or API key is needed; `.env.example` documents non-secret server defaults and empty credential names. The inspector never selects live mode from the environment or HTTP input.

After dependencies are cached, `npm ci --offline --cache .cache/npm` works without registry access. The application and deterministic tests need no external service; the first install and browser download require package/CDN access. Build uses local assets and fonts.

For real local Chromium tests against the production build:

```powershell
npm run browser:install
npm run test:e2e
```

The browser runner keeps downloads in this repository's ignored `.cache/playwright/` directory. Browser tests start a temporary loopback-only server on port 3100 and stop it afterward. Local generated evidence and screenshots are in ignored `.artifacts/`, with Playwright failure output in ignored `test-results/`.

The core validates strict input/output contracts and snapshot provenance, retains original findings, and permits at most 14 fixture calls and one repair round. It independently looks up replacements and reranks a common candidate set. `PASS` means the represented synthetic identity/constraint/evidence checks passed; it does not prove personal liking or current venue availability. Free-form upstream claims remain unverified; ambiguous preferences/identities require clarification. The HTTP route accepts only an allowlisted scenario ID, never caller-supplied provenance, mode or budgets.

See [Phase 1A results](docs/PHASE1A_REPORT.md) for actual execution evidence and limits, [accepted Runtime deferral ADR](docs/adr/0004-phase1a-runtime-deferral.proposed.md) for the owner-approved scoped amendment, and [Qloo probe checklist](docs/QLOO_API_CONTRACT.md) for unresolved live assumptions. The frozen strategy and historical Phase 0 reports are unchanged. MIT licensing and attribution were explicitly approved by the owner; see [LICENSE](LICENSE).

The lockfile now uses the official npm registry without dependency upgrades. Phase 1B adds server configuration and a transport boundary exercised only with explicitly injected local test doubles. That offline boundary caps calls/deadlines, permits one outstanding operation per client, and emits only unverified JSON; it has no production transport or response mapper. See [review closure](docs/PHASE1A_REVIEW_CLOSURE.md), [offline readiness](docs/PHASE1B_OFFLINE_READINESS_REPORT.md), [unexecuted live probe plan](docs/PHASE1B_LIVE_PROBE_PLAN.md) and [private ledger template](docs/PHASE1B_PROBE_LEDGER_TEMPLATE.md).

The separate raw P01 runner stays outside the inspector. `npm run probe:p01` previews the fixed Radiohead request with BLOCKED/zero dispatches and does not read credentials. `npm run probe:p01 -- --preflight-p01` checks local configuration and the ledger without reserving an attempt or contacting Qloo. Only preflight/execution parse the ignored `.env.local` inside local Node, selecting the four server Qloo settings; existing process values take precedence. Other dotenv settings are not installed into the process. Unsafe diagnostics/TLS options, tracked/unignored env files, public credentials and unsafe hosts block the probe. Keep the private key out of chat and arguments; `.env.example` stays blank.

Execution additionally needs explicit `live` configuration and a fresh P01-only private checkpoint bound to a unique attempt ID. The owner must acknowledge the originally issued credential's exposure risk and unknown entitlements. Rotation remains recommended before public deployment; no rotation/revocation is claimed. Unknown quota/rate/concurrency/expiry values remain `UNKNOWN`; each approved attempt permits at most one GET, with no retries/redirects, a 4-second deadline and a 65536-byte capture limit. Completed records remain immutable. New attempts require fresh approval and review of prior accounting; incomplete/unsettled attempts retain a blocking lock. There is no force/reset option. See [execution review](docs/PHASE1B2_EXECUTION_REVIEW.md), [P01 status](docs/PHASE1B2_P01_LIVE_PROBE_REPORT.md) and [raw schema observations](docs/PHASE1B2_RAW_SCHEMA_OBSERVATIONS.md). No live request or semantic mapper is implied by a successful preflight.
