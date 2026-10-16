# Phase 1A — Executable offline core

**Status: PASS within the authorized offline scope.** Date: 2026-10-16, Pacific/Auckland. Live Qloo validation remains **BLOCKED**. Validation used base HEAD `ef873c3ac7f2b5a6f8e0b6d5e25d40332f6eb4a7` with uncommitted implementation changes. The owner subsequently authorized commit/push in a separate instruction; delivery is recorded in Git history. No full Phase 1 transition, public deployment or submission occurred.

## Instruction conflict and human decisions

Read AGENTS.md, the complete frozen strategy, all nine Phase 0 Markdown reports and the synthetic specification. AGENTS.md's unconditional Runtime-first installation/inspection gate conflicted with the newly authorized read-only offline phase and the instruction not to implement the optional archive. Prepared [ADR-004](adr/0004-phase1a-runtime-deferral.proposed.md) and [the additive amendment](proposals/AGENTS.phase1a.patch), requested approval, and received the owner's explicit approval before applying it and writing application code. All original Runtime sections/pin/safety rules are preserved. Patch context blank lines were subsequently normalized; the approved inserted text is unchanged and reverse-application checks pass.

The owner separately confirmed authority to adopt MIT and attribution `miku-wwl`; [LICENSE](../LICENSE) now contains that grant. The ADR filename retains `.proposed.md` for the original review link; its status records acceptance. The fixed Python Runtime dependency, installed API checks and SIDE_EFFECT acceptance are **deferred by the approved scoped amendment**, not claimed as passing or silently bypassed. No Python environment, dependency, archive executor, approval/grant engine, action claim or receipt implementation was added. The report's archive field is fixed to `not_requested` only.

Frozen strategy SHA-256 remains `0b8d98e463b5393b46917646e1092ccd9bdc17be8340c098e477568eac3a2fcb`. Historical Phase 0 reports/specification are unchanged. No remaining instruction conflict prevents this offline slice; a later Runtime or live phase requires separate approval.

## Actual implementation and changed files

| Paths | Implemented behavior |
| --- | --- |
| `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts` | Minimal locked Next.js/React/TypeScript/Zod application, Vitest and real browser tests. No UI component system, agent framework or database dependency. |
| `src/domain/contracts.ts`, `src/domain/report-schema.ts` | Strict bounded input, candidate, finding, evidence and report schemas; no coercions; unique IDs; UTF-8/Unicode bounds; snapshot hashes, same-run/fixture identity, exact constraint support, signal/shortlist/rank linkage, replacement proof and residual-summary validation. |
| `src/qloo/ports.ts`, `src/qloo/fixture-adapter.ts` | Separate `FixtureQlooAdapter` and `LiveQlooAdapter` interfaces; executable authored fixture adapter; live methods return `unknown` at the type boundary and have no implementation. A live adapter is rejected before dispatch, with no fallback. |
| `src/audit/rules.ts`, `src/audit/workflow.ts` | Executable resolution → audit → one discovery/repair → independent lookup/common-set rank → revalidation → generated report. Preserves original findings and missing slots; bounds calls, retries, deadlines and cancellation. |
| `src/fixtures/scenarios.ts` | Six data-only authored scenarios. The workflow computes decisions rather than returning the Phase 0 `expected_report`. |
| `app/layout.tsx`, `app/page.tsx`, `app/inspector.tsx`, `app/style.css`, `app/api/audit/route.ts` | Minimal local inspection page and real POST route. Before/after findings, accepted/rejected repairs, limits and generated evidence JSON; persistent synthetic banner. Request body accepts only an allowlisted scenario ID, with a 1 KiB streamed cap. |
| `tests/contracts.test.ts`, `tests/provenance.test.ts`, `tests/workflow.test.ts`, `tests/route.test.ts`, `tests/offline-e2e.test.ts`, `tests/browser/inspection.spec.ts` | Contract and negative tests, budget/timeout/repair boundaries, six-scenario execution evidence and production-server browser E2E. |
| `scripts/playwright.mjs`, `.gitignore`, `.env.example` | Browser installer/test runner keeps downloads in workspace `.cache/`; ignores dependencies, generated output, secrets and private state; empty reserved credential names only. |
| `AGENTS.md`, `LICENSE`, `README.md`, this report, ADR and review patch | Approved scoped exception/license, actual run instructions, evidence and limits. |

Input revision remains `tastegate.input.v0`; output revision is explicitly **`tastegate.report.v1a`**. The executable output refines the Phase 0 proposal with embedded input/snapshots, lookup references, proposed replacement IDs, trace, stop reason, preference evidence and separate fixture-call counts. All Phase 1A evidence/report schemas require `source_mode=fixture`, synthetic IDs and no upstream request IDs. These are normalized **consumer fixture contracts**, never purported Qloo wire responses.

## Actual commands and observed results

Environment: Windows/PowerShell; Node **26.5.0**, npm **12.0.1**. Installed exact dependencies: Next **16.4.2**, React/React DOM **19.3.1**, Zod **4.6.7**, TypeScript **6.0.3**, Vitest **5.0.5**, Playwright **1.64.1**. `npm ls --depth=0` confirmed the installed versions. Type declarations are locked as well.

| Command | Observed result |
| --- | --- |
| `git apply --check -- docs/proposals/AGENTS.phase1a.patch` then, after explicit approval, `git apply -- docs/proposals/AGENTS.phase1a.patch` | PASS; application was approval-gated. Original Runtime text retained. |
| `npm install --cache .cache/npm --no-fund` | PASS; 62 packages installed; lockfile created. Package/CDN access is distinct from Qloo execution. |
| `npm ci --offline --cache .cache/npm --no-fund` | PASS; clean locked reinstall from the populated cache, 62 packages. No registry access required for this observed reinstall. |
| `npm run typecheck` | PASS, exit 0, on final application/test source. |
| `npm test` | **75 passed, 0 failed, 5 test files**; final observed Vitest duration 907 ms. These are offline engineering tests, not a scored 30-case recommendation benchmark. |
| `$env:NEXT_TELEMETRY_DISABLED='1'; npm run build` | PASS, exit 0. Production routes `/`, `/_not-found`, `/api/audit`; no downloaded fonts/assets. Next added its recommended `allowJs` and `.next/dev/types` config entries. |
| `npm run browser:install` | PASS; Chromium/Headless Shell **156.0.8078.4**, Playwright revision 1248, installed under repository `.cache/playwright/`. |
| `npm run test:e2e` | **4 passed, 0 failed**, 10.3 s; actual production Next server on `127.0.0.1:3100`, actual local Chromium. Desktop and mobile viewport; generated JSON and screenshots. |
| Protected-file and instruction checks | PASS: frozen strategy hash unchanged, historical Phase 0 files unchanged, current AGENTS minus the approved addition equals the original text. |
| Final whitespace/link/secret/ignore/scope checks | PASS across 34 paths (2 modified, 32 new), with CRLF-aware per-file checks and `git diff --check`; bounded credential-pattern scan found no matches, local report links resolve, generated/private paths are ignored, `.env.example` is not ignored. No staged files; HEAD unchanged; test server port 3100 confirmed closed. |

Development findings were corrected before the final passing run: TypeScript union narrowing/annotation errors; a test's unresolved Promise needed a `never` type; Vite's ESM warning was resolved with `type=module`. This host's npm rejected an attempted forwarded `--reporter=verbose` flag, so the actual successful command is simply `npm test`. The browser runner directly invokes the installed Next CLI to avoid flag-forwarding ambiguity. None of these attempts was a live API execution.

## Executed offline vertical slice

These are actual computed outcomes on authored data, not Qloo results:

| Scenario | Before | After | Completion | Fixture calls | Repair rounds |
| --- | --- | --- | --- | ---: | ---: |
| NYC mixed evidence | BLOCKED | UNKNOWN | partial | 10 | 1 |
| Valid only | PASS | PASS | complete | 5 | 0 |
| Wrong-city repair | BLOCKED | PASS | complete | 8 | 1 |
| Unresolved only | UNKNOWN | UNKNOWN | partial | 5 | 1 |
| Missing taste evidence | UNKNOWN | UNKNOWN | partial | 6 | 1 |
| Replacement also fails | BLOCKED | BLOCKED | complete | 8 | 1 |

All rows have **0 Qloo dispatches, 0 LLM dispatches** and no archive request. In the mixed case the original unsupported personal guarantee stays REVIEW, the synthetic Jersey City item stays BLOCKED in the original audit, one replacement independently passes, and the unresolved third slot prevents final PASS. A failed replacement never triggers a second repair round. `complete` means the final original slots have known dispositions; it can truthfully accompany BLOCKED, and does not mean the recommendations passed.

Generated local artifacts (ignored, not source fixtures or a business archive):

- Six actual core runs: `.artifacts/phase1a-offline-e2e.json`, SHA-256 `45500183be4a450f5723c41727e46c7ebef60146099f2db73a44bcca35f9ab21`.
- Actual browser report: `.artifacts/phase1a-browser-run.json`, run ID `0fbce221-c6cc-4a0c-ac58-4c24c0492f97`, SHA-256 `671a3f53646f70b46587960e626547d5f43bf6a8a02123a5668409287f22e72d`.
- Desktop screenshot `.artifacts/phase1a-inspector.png` and mobile viewport screenshot `.artifacts/phase1a-mobile.png`; visually inspected after capture. Mobile evidence is a viewport test, not a physical-device test.

These local artifacts are intentionally excluded from the repository. Reproduce them with `npm test` and, after building/installing the browser, `npm run test:e2e`; new runs produce new UUIDs and hashes.

The browser evidence recorded zero non-loopback page requests and zero page errors. Core tests additionally observed no `fetch` calls from the workflow. There is no executable live Qloo transport. Snapshot digests establish internal consistency, not authenticity of external provider data; the fixture adapter/configuration are trusted host code. Later test reruns generate new UUIDs, times and artifact hashes.

## Enforced boundaries and implementation limits

- Strict schemas reject additional authority fields, duplicate IDs, invalid numeric types, oversized input, unsupported operational constraints and malformed Unicode. The report validator rejects forged/dangling/cross-run evidence, incorrect source modes, invented upstream IDs, wrong query/constraint support, changed rankings, hidden original slots and fabricated completion/attribution.
- Maximum **14 fixture calls**, **one repair round**, **zero automatic retries**. Lower test/host caps are supported; clients cannot select them. Revalidation calls are reserved before discovery. Per-call deadline <=4 seconds and whole-run deadline <=60 seconds, using a monotonic clock. Cancellation aborts the supplied signal; late adapter results are discarded. Arbitrary trusted JavaScript code is not sandboxed/preempted.
- Geography checks use exact normalized synthetic city/country/type facts. No live NYC aliases, borough policy, locality boundary or current venue existence is certified. Missing facts stay unknown.
- Free-form upstream claims remain conservatively unverified. No model provider, prose claim-reasoning engine, taste-score threshold or numerical individual-preference probability is implemented. Ordinal ranks are meaningful only within the captured synthetic query context. No full Golden Dataset evaluation or cultural-quality improvement result exists.
- The interface is a local inspector for fixed scenarios, not the full product UI, an authenticated multi-user service or a public-ready deployment. Request-memory execution only; no production cache, retention scheduler or database is implemented.
- Missing/ambiguous preference interpretation stops for clarification rather than silently dropping a signal. Fictional film/tag selections in the scenario are explicitly synthetic user choices, not the real owner's preference confirmations.

## Pending live probes — BLOCKED, not simulated as passing

The [Phase 0 API checklist P01–P10](QLOO_API_CONTRACT.md) remains pending: actual event authentication/entitlement; search/tag envelopes and entity identifier rules; usable artist/film/tag/place resolution; cross-domain NYC coverage; shortlist membership/omission and ranking semantics; exact affinity field/scale; explainability shapes/warnings and per-type compatibility; geography/units/boundaries; pagination/errors/timeouts; actual quota/concurrency/expiry; permitted public display/export/cache uses. The observed generic OpenAPI meta-schema does not clear these questions. Live-interface returns remain `unknown` until separately approved probes establish them.

Technical references checked for implementation: [installed Next documentation / official installation guide](https://nextjs.org/docs/app/getting-started/installation), [Zod API](https://zod.dev/api), [Vitest guide](https://vitest.dev/guide/), [Playwright web-server setup](https://playwright.dev/docs/test-webserver), [OSI MIT text](https://opensource.org/license/mit). No new Qloo data investigation was executed in Phase 1A.

**Phase 1A offline acceptance is PASS.** The owner subsequently authorized delivery by commit/push. Real Qloo integration, optional Runtime archival, public deployment and subsequent phases remain separately gated and have not started.
