# Phase 1B offline integration readiness

**PASS within offline readiness scope. Live integration: BLOCKED.** 2026-10-16. Base HEAD `ee210f2398ef6e53afc1e919d695341d4d835cdc` plus the uncommitted snapshot in the private review package. No live Qloo/LLM call, key request, deployment, Runtime archive, Devpost edit, commit or push was performed. Passing offline tests does not establish a working live adapter.

## Actually implemented

| File(s) | Executable boundary |
| --- | --- |
| `src/qloo/server-config.ts`, `.env.example` | Server runtime guard; strict fixture/live mode and <=4000ms timeout validation; exact `https://hackathon.api.qloo.com` origin; private credential field; no secret in JSON/config errors; absent live key fails closed. Fixture configuration does not load a key. |
| `src/qloo/boundary-error.ts` | Fixed consumer error codes, 401/403/429/5xx classification; 404 stays HTTP_ERROR pending observed semantics; safe error text; logging rebuilt from allowlisted outcome/counter/status fields only. Unknown error messages, provider bodies, queries, headers and credentials never enter logs. |
| `src/qloo/offline-transport.ts` | Explicitly injected `local-test-double` transport only, no default/global fetch; fixed GET `/search` and `/v2/tags` profiles; standard encoding, auth header, redirect rejection policy and no-store request metadata. Strict requests reject caller authority fields. Per-session <=14 dispatches including failures, no retries; one in-flight operation across this client's sessions; <=4s call/<=60s session deadline; cancellation and late-result discard; capped 64KiB UTF-8 JSON reading. |
| `src/qloo/live-adapter.ts`, port comment | A permanently disabled semantic adapter implementing the existing LiveQlooAdapter interface. All methods reject LIVE_NOT_VERIFIED, including with a valid-looking configured key or a `QLOO_LIVE_VERIFIED` environment variable. No environment flag enables execution. No response mapper, production fetch transport or fixture fallback. |
| `tests/qloo-boundary.test.ts` | **52** additional local-only tests/parameter cases; actual total now 127. Tests stub global fetch to reject any accidental network access and assert zero calls. |
| `playwright.config.ts`, `tests/browser/inspection.spec.ts` | Full Chromium JSON report; test server fake live-environment canary verifies the existing inspector stays fixture-only and does not expose the canary. |
| `package-lock.json`, `README.md`, required review/probe documents | Official registry URLs, no version/integrity changes; actual usage, results, limits and unexecuted probes. |

The inspection API, workflow/rules, domain/report schemas and fixtures have not been redesigned or connected to the new boundary. The offline boundary returns `source_mode=offline_test`, `status=UNVERIFIED_RESPONSE`, `raw: unknown`; it never generates entity/evidence/report contracts. Even valid-looking JSON, an empty object, a primitive or a forged success/fixture envelope cannot become a PASS. Invalid JSON, invalid UTF-8, wrong media type and oversized bodies are rejected. Missing required provider fields cannot be determined until a real operation schema is reviewed; no speculative mapper claims otherwise.

**Important limits:** only search/tag request serialization is implemented, based on documented fields; search array encoding still needs live confirmation. Insights serialization, raw response field validation, real evidence projection and live HTTP transport are deliberately absent. `redirect=error` is a transport contract observed on local doubles, not evidence from a real fetch. Header/key format validation checks HTTP safety only, never actual entitlement. The 64KiB cap is consumer policy and may need a reviewed change if valid private examples exceed it. No personal-data detector is claimed; current HTTP input cannot dispatch Qloo at all, and future live inputs require privacy review.

Concurrency is per host-owned boundary instance in one process, shared across its sessions; it is not distributed quota enforcement or authenticated multi-user throttling. An abort-ignoring transport retains the lease until it settles; timed-out/cancelled sessions stay closed. A future trusted host must reuse a reviewed boundary instance and one session per audit, and account for every tool/page/failure, rather than allocating a new budget per tool. There is no Runtime approval/authorization/claim engine here. Arbitrary trusted JavaScript is not sandboxed or preempted.

## Actual verification

See [closure report](PHASE1A_REVIEW_CLOSURE.md) and private `final/commands.json` for exact commands/timestamps/exit codes. Node v26.5.0 / npm 12.0.1:

- Fresh-cache official-registry `npm ci`: exit **0**, 62 packages; versions and integrity unchanged. This was repeated with a separate new cache after implementation.
- `npm run typecheck`: exit **0**.
- `npm test`: exit **0**, **127 passed / 0 failed**, 6 files (75 original + 52 new boundary cases).
- `npm run build`: exit **0**, real production build with telemetry disabled.
- `npm run test:e2e`: exit **0**, **4 passed / 0 failed**, actual local Chromium against the production loopback server; desktop/mobile viewport screenshots visually inspected.
- `git diff --check` plus new-text whitespace, secret-pattern, browser-static-canary, protected-baseline and package-integrity checks are recorded in `verification.json` inside the private review package. Secret checks cover known credential patterns and the explicit test sentinels; they are not a mathematical guarantee about arbitrary secret formats.

Covered cases include missing key; wrong host/scheme/path/userinfo; invalid timeout/mode; secret omission/redaction; request/overall/body timeout; 401/403/429/5xx and unknown HTTP errors; malformed/oversized/unexpected JSON; call exhaustion including failure; concurrency across sessions; cancellation/late results; disabled live adapter; unchanged fixture provenance. No real-provider performance/latency/coverage claim is made.

## Official tooling investigation: facts versus unresolved issues

Retrieved official Kit sources at `0db91b8d9c5aae2160d53596e57ea6c9da251cde` and docs mirror at `d4a0eb978518f7fb404993d1509d11b21239ada6`; no tooling was installed globally or locally. The browser-fetch tool could not initially open the developer guide, but a direct documentation-page fetch returned HTTP 200; saved HTML/plaintext and hashes provide the actual inspection. An initial guessed Kit document filename returned a documentation 404; the README's actual `docs/API_ACCESS.md` was then fetched successfully. Neither event is a Qloo API probe.

Verified documentation: Node >=22.19.0 / harness >=0.1.26; `qloo exec find_tags --input-file request.json` with `{query,limit}`; `qloo api` raw output versus workflow envelopes; `qloo mcp` local stdio with no hosted URL; shared credentials/quota; aggregate cultural signals and no personal identifiers. The Kit still advertises `explore`, conflicting with the supplied organizer event restriction on chat. Follow the narrower supplied event instruction: no chat/explore/integrate/plan/build. Sources and future procedures are linked in the [probe plan](PHASE1B_LIVE_PROBE_PLAN.md).

Unverified installed-tool behavior: actual harness event-host selection, flags/timeout and underlying dispatch count of normalized workflows; no official CLI/MCP execution evidence exists. No official SDK was added. Public docs are not proof of event entitlement or live wire behavior.

## Remaining blockers and exact proposed next gate

API key/access, numeric quota/burst/concurrency/expiry, rights to display/export/cache, actual search/tag/Insights shapes/IDs/requiredness, score/order meaning, cross-domain NYC coverage, reliable borough/geography, shortlist omissions, explainability and paging remain unverified. The owner's film/tag interpretation must be explicit. No operational hours/availability facts or personal preference probabilities may be inferred.

The [P01-P10 plan](PHASE1B_LIVE_PROBE_PLAN.md) and [ledger template](PHASE1B_PROBE_LEDGER_TEMPLATE.md) provide exact preconditions, request profiles, calls/deadlines, PASS/FAIL/UNKNOWN and stop rules. **No-Go now:** no key/access evidence and no live authorization. **Proposed Go for probes only:** explicit human approval of a bounded probe campaign, private attributable key, exact event origin/header and confirmed numeric limits/rights. **Go for live adapter/audit:** separately reviewed projections from actual private wire evidence, offline regressions and explicit enablement approval; then real P10 proof and independent official CLI comparison. A key alone is insufficient. Optional unavailable fields must narrow claims rather than be fabricated.

The current direct owner instruction authorizes this offline phase and excludes Python Runtime archival; AGENTS remains unchanged, with its original future Runtime pin/safety acceptance intact. Frozen strategy and historical reports are preserved. Review ZIP: ignored local `private/review/TasteGate_Phase1A_Closure_Phase1B_Offline_Review.zip` plus `.sha256`. Stop for independent human review. No automatic Phase 1B Live transition.
