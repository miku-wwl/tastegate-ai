# tastegate-ai
TasteGate AI — A Qloo-powered cultural quality gate that audits, repairs, and verifies AI-generated recommendations with evidence-backed cultural intelligence.

**Current milestone: Phase 1A executable offline core.** All executed scenarios use authored synthetic venues, IDs and rankings. No live Qloo integration, LLM inference, Python archive, deployment or measured recommendation-quality improvement is implemented. Live validation remains blocked pending the event key and a separately approved phase.

Use Node 22.12+, 24, or 26+ (validated here with Node 26.5.0). Install the exact locked dependencies and run locally:

```powershell
npm ci --cache .cache/npm
npm run typecheck
npm test
$env:NEXT_TELEMETRY_DISABLED='1'
npm run build
npm run dev
```

Open **http://127.0.0.1:3000** and click **Run synthetic audit**. Six scenarios demonstrate a valid recommendation, a wrong-city repair, missing evidence, unresolved identity and a rejected replacement. All outputs preserve the fixture label. No `.env` file or API key is needed; `.env.example` has blank reserved settings only.

After dependencies are cached, `npm ci --offline --cache .cache/npm` works without registry access. The application and deterministic tests need no external service; the first install and browser download require package/CDN access. Build uses local assets and fonts.

For real local Chromium tests against the production build:

```powershell
npm run browser:install
npm run test:e2e
```

The browser runner keeps downloads in this repository's ignored `.cache/playwright/` directory. Browser tests start a temporary loopback-only server on port 3100 and stop it afterward. Local generated evidence and screenshots are in ignored `.artifacts/`, with Playwright failure output in ignored `test-results/`.

The core validates strict input/output contracts and snapshot provenance, retains original findings, and permits at most 14 fixture calls and one repair round. It independently looks up replacements and reranks a common candidate set. `PASS` means the represented synthetic identity/constraint/evidence checks passed; it does not prove personal liking or current venue availability. Free-form upstream claims remain unverified; ambiguous preferences/identities require clarification. The HTTP route accepts only an allowlisted scenario ID, never caller-supplied provenance, mode or budgets.

See [Phase 1A results](docs/PHASE1A_REPORT.md) for actual execution evidence and limits, [accepted Runtime deferral ADR](docs/adr/0004-phase1a-runtime-deferral.proposed.md) for the owner-approved scoped amendment, and [Qloo probe checklist](docs/QLOO_API_CONTRACT.md) for unresolved live assumptions. The frozen strategy and historical Phase 0 reports are unchanged. MIT licensing and attribution were explicitly approved by the owner; see [LICENSE](LICENSE).
