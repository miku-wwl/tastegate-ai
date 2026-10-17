# Phase 1B.3.1 — P02 observed-schema closure

Preparation snapshot below precedes the separately owner-approved [single P04 execution](PHASE1B31_P04_EXECUTION_REPORT.md). Its zero-request statements describe the local schema/preparation work, not that subsequent authorized request.

2026-10-18, Pacific/Auckland. **PASS for the scoped local compatibility fix; overall Phase 1B.3 remains CONDITIONAL PASS.** The owner accepted the P02 request, not automatic catalog identity or live-adapter readiness. This phase issued **zero Qloo requests**.

Baseline: clean main at ab4ca86373ea1d0e25e33921a875ac270dd378c7. Read AGENTS, the frozen strategy, P02 execution/readiness/identity reports, original private evidence, search-observation.ts, shared probe infrastructure and tests. No frozen-strategy/AGENTS/AIG-pin change or Runtime/archive integration.

## Change and boundaries

The local projection now accepts an absent tag.value using an optional string, without inventing an empty/default value. Present null/number/boolean/array/object values still fail. Tag name, tag_id and type remain required and validated. Known malformed fields do not become unknown-field fallbacks.

Entity/tag IDs are bounded opaque strings: empty, non-string, whitespace/control-containing identifiers are rejected without rewriting. No universal UUID-only provider assumption is introduced. Duplicate entity IDs still fail; distinct same-title candidates remain ambiguous. Unknown provider fields stay quarantined in the original private body and are excluded from projected semantic evidence.

The helper returns aggregate tag/value presence counts only. It **never chooses an Entity ID**, interprets popularity/tag presence as affinity, derives pagination totals or promotes identity from claimed external/provenance fields. LiveQlooAdapter and the fixture-only route remain unchanged.

## Actual local replay of preserved evidence

No provider response was copied into public fixtures/tests or sent to an LLM. The updated compiled helper read original private bytes locally and emitted counts only:

| Saved sample | Local projection | Observed tag/value counts | Identity / selected ID |
| --- | --- | --- | --- |
| P01, five artists | PASS | Tags on 1/5, absent on 4/5; 55 tag items, all 55 with string value | Independent review required / null |
| P02, five movies | PASS | Tags on 5/5; 437 tag items, all 437 without value | Independent review required / null |

The original P02 raw summary remains UNKNOWN / SCHEMA_REVIEW_REQUIRED / NOT_REVIEWED. Its original schema-rejection report accurately describes the previous validator; this separate dated review closes that particular compatibility issue. Original attempt/summary/raw/integrity/review/checkpoint/receipt files are not rewritten. All **16** snapshotted P01/P02 private files remain byte-identical.

The [separate identity review](PHASE1B31_P02_IDENTITY_REVIEW.md) distinguishes public-reference corroboration from trusted identity admission. Schema compatibility alone does not establish identity, cultural relevance or P04 response semantics.

## Regression actually executed

Node v26.5.0 / npm 12.0.1. Actual command logs/results: ignored .artifacts/phase1b31-20261017T214129Z, included in the sanitized review ZIP.

| Command | Observed result |
| --- | --- |
| npm run typecheck | Exit 0; 3.765 s outer duration |
| npm test | Exit 0; **327 passed / 0 failed**, 11 files; Vitest 12.14 s, outer 14.005 s |
| npm run build | Exit 0; 13.363 s; existing page/not-found/audit routes only |
| npm run test:e2e | Exit 0; **4 passed**, real local Chromium; Playwright 7.7 s, outer 10.041 s |
| git diff --check | Exit 0 after final documentation; log retained |
| npm ls --depth=0 --json | Exit 0; manifest/lock/installed direct versions agree |
| node --check scripts/probe-cli.mjs | Exit 0 |
| node scripts/qloo-probe-p04.mjs | Exit 0; default BLOCKED preview, zero dispatches, no credential loading |
| node scripts/qloo-probe-p04.mjs --preflight-p04 | Exit 0 with child-only QLOO_MODE=live; zero reservations/dispatches; no approval granted |

The preceding 247 tests still pass. Added **80** authored synthetic regression cases cover optional/valid/malformed tag values, missing tags, bad tag types/IDs, conflicting entities, P01 artist compatibility, no automatic identity promotion, and P04 profile/consent/budget/capture/ledger/locking boundaries. The P01 local-env test copies the new fixed modules into its synthetic CLI fixture. The previous closed-registry test now excludes P03/P05-P10 while P04 has its own explicit tests; no unknown probe is admitted.

Validation children used empty credential/public-key overrides, unsafe diagnostic hooks removed and telemetry disabled. The production build notes the presence of .env.local; secret values were overridden and not printed. Test doubles use explicitly authored keys/responses and temporary ledgers. No live response is relabeled as a fixture. No install, dependency upgrade, npm audit or browser download was performed.

An additional local ACL check found inherited access to .env.local for other ordinary identities. Its ACL was restricted to the current operator after saving a private ACL-only rollback record; file contents were hash-compared unchanged without exporting the hash or values. Other-identity allow entries fell from four to zero. This does not establish credential rotation or undo prior exposure. The environment file/ACL backup are excluded from the ZIP.

The browser suite exercised partial UNKNOWN, successful repair, rejected replacement, strict HTTP input and mobile layout. Its saved report records 10 fixture calls, zero Qloo dispatches, zero external browser requests and zero page errors. This is local offline E2E evidence. The existing NO_COLOR/FORCE_COLOR warning is retained.

## Files and remaining limits

Changes are confined to the observed projection, closed probe registry/shared store/CLI, fixed P04 profile/store/CLI command, regression tests, README and the three Phase 1B31 reports. P01/P02 profiles and wrapper files, original evidence, disabled LiveQlooAdapter, fixture route, package lock, AGENTS and frozen strategy remain unchanged. Shared code is extended for P04 rather than duplicating the transport.

New observed-schema acceptance is bounded to these samples and strict authored tests. It is not a universal Qloo contract. Tag meaning/affinity and the actual /v2/tags envelope remain unknown. Trusted audit identity remains UNKNOWN pending separate acceptance; no ID is selected.

The read-only product-owned probe does not implement AIG SIDE_EFFECT execution. No Python Runtime acceptance is claimed; its exact pin and future installed-package requirements remain intact.

**No P01/P02 repeat, P03, P04, P05-P10, commit, push, deploy or Devpost mutation occurred. STOP at the [P04 owner gate](PHASE1B31_P04_READINESS.md).**
