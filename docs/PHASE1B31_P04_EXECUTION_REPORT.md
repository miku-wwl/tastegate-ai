# Phase 1B.3.1 — P04 single approved execution

2026-10-18, Pacific/Auckland. **P04 authenticated request returned HTTP 200; overall CONDITIONAL PASS. STOP for independent review.** This closes the approved dispatch only. It does not establish tag meaning, cultural affinity, trusted tag selection or live-adapter readiness.

## Authorization and exact request

The owner explicitly approved the pending gate for attempt `67409a5c-ec05-4b36-8f29-ffaa7996812f`. A separate P04-only receipt and strict checkpoint were registered privately at 2026-10-17T22:13:20.652Z (11:13:20.652 NZDT), after that reply. This is a local registration timestamp, not an asserted timestamp of the human click. The checkpoint expires after five minutes; its single-use budget is already consumed.

```text
GET https://hackathon.api.qloo.com/v2/tags?filter.query=jazz&take=5&page=1
filter.query=jazz
take=5
page=1
```

The fixed reviewed profile supplies Accept: application/json and the event-key header from ignored private local configuration. No credential is copied into arguments, public logs or this report. Scope: one HTTP dispatch, concurrency one, 4000-ms request/body deadline, 65536-byte response cap, zero retries and zero redirects. The owner accepted possible prior credential exposure, unconfirmed rotation/revocation and UNKNOWN quota/rate/provider concurrency/expiry, plus bounded private evidence storage. No new entitlement fact is inferred from the reply or HTTP success.

The documented parameters were verified during preparation against the [official Tags reference](https://docs.qloo.com/reference/get-tags) and [official documentation mirror](https://raw.githubusercontent.com/qloo/docs-public/main/reference/get-tags.md). This execution did not add query/type filters, follow another page or issue any other provider request.

## Actual result

| Evidence | Observed result |
| --- | --- |
| Execute command | `node scripts/qloo-probe-p04.mjs --execute-p04`, invoked exactly once |
| CLI start/end UTC | 2026-10-17T22:13:21.014542Z / 22:13:23.670554Z |
| Exit / whole CLI duration | 0 / 2.656 seconds |
| HTTP status / bytes / request elapsed | 200 / 2591 / 1008.332 ms |
| Dispatches / retries / redirects followed | 1 / 0 / 0 |
| Transport / raw capture | Settled / saved privately |
| Immutable runner summary | UNKNOWN / SCHEMA_REVIEW_REQUIRED / NOT_REVIEWED |
| P04 ledger after completion | 1 reserved / 1 dispatched / 0 unresolved; no active locks |
| P01 and P02 ledgers | Each remains 1 reserved / 1 dispatched / 0 unresolved |

Private evidence is at `private/qloo-probes/p04/attempts/67409a5c-ec05-4b36-8f29-ffaa7996812f/`: immutable reservation with source revision/hashes, response.raw.json and summary.json. The checkpoint/approval receipt and a subsequent private integrity manifest are outside the public package. The original summary was not rewritten to claim semantic PASS.

## Local observed fields; no additional request

The saved response root is an object with duration (number), success (boolean, observed true), and results (object). The actual collection is **`$.results.tags`**, containing five objects. This differs from search results; the search projection was not applied to this envelope.

All five records have nonblank string id, name and type; IDs are distinct and types have **four distinct values**. Names in three records equal the public query jazz after case folding; all five contain that word. These aggregate comparisons expose no provider identifiers and cannot determine the intended tag or its meaning. **selected_tag_id remains null.** Search rank, name matching, tag presence and popularity do not authorize selection or establish affinity.

All five also have numeric popularity, array parents, object properties and array tags. Top-level tag records have neither tag_id nor value in this sample. Their ten parent objects expose a type field. One nested attached-tag object has name, tag_id, type and value; the other four attached-tag arrays are empty. Observed properties field names include description, history, melody, performance, rhythm, tempo and vocals. These fields and their raw values remain quarantined; no taxonomy semantics, score scale or trusted narrative is inferred. P01/P02 attached tags are not interchangeable with this endpoint's top-level tag records.

The results object has no other observed field. No total count, pagination availability, next-page behavior, universal optional-field contract or provider-wide response schema is inferred from five records. No P04 mapper, strict general tag contract, tag promotion, affinity computation or LiveQlooAdapter enablement was implemented. A separate independent schema/taxonomy review remains necessary.

## Integrity and validation

Before dispatch, the preparation ZIP's SHA-256 and CRC passed; all **87** packaged source/report files exactly matched the current bytes. Source HEAD remained `ab4ca86373ea1d0e25e33921a875ac270dd378c7`, index empty, with the same 16 intended uncommitted preparation paths. All ten protected files and all **16 original P01/P02 private evidence files** were unchanged. P04 had zero attempts, no checkpoint and no active locks. The ignored key file and private evidence directories had zero other-identity allow rules.

Actual local preflight exited 0 in 1.695 seconds with zero dispatches/reservations and the prior ledgers reviewed. After execution, the saved body length matched the summary; all **21 execution-source hashes** matched the reservation; the 16 prior private files remained unchanged. Five P04 evidence/checkpoint/receipt hashes were retained privately. No raw provider-body hashes or identifiers are exported.

The executable code was unchanged from the reviewed and tested preparation package. The existing actual regression results are **327 Vitest tests passed, four real local Chromium E2E tests passed, typecheck and build exit 0**. Those commands were executed during preparation, **not rerun after this dispatch**. Their original logs/results are included as preparation evidence. No install/dependency change occurred. A fresh `git diff --check` was executed for this documentation addendum; its actual log/result is included separately.

This continuation changes README, adds this report and annotates the schema-closure/readiness documents to distinguish preparation snapshots from subsequent execution. No executable source, tests, dependency/lockfile, AGENTS, frozen strategy, disabled adapter or fixture route changed during execution.

## Review package and remaining limits

Sanitized ZIP: `private/qloo-probes/review/p04-execution-20261017T221247Z/TasteGate_Phase1B31_P04_Execution_Review.zip`. It contains the current public source/tests/reports, source revision and file hashes, actual safe execution/preflight/ledger/field-count/integrity logs, original preparation test logs, and a per-file SHA-256 manifest. An external checksum and verification record accompany it. Credentials, all environment files, raw responses, private checkpoints/receipts/raw hashes/IDs, ACL backups, caches, dependencies, virtual environments and Git internals are excluded. The original preparation ZIP is preserved separately.

P04 request acceptance is narrowly evidenced by this response. Identity/taxonomy meaning, independent tag acceptance, semantic usefulness, wider response compatibility, pagination and entitlements remain unresolved. P02 identity remains pending independent acceptance. LiveQlooAdapter stays disabled; the local UI remains synthetic. No P01/P02 repeat, P03/P05-P10, automatic retry/next phase, Runtime archive, commit, push, deployment or Devpost action occurred. No AGENTS conflict or frozen-strategy change was introduced. **The approved P04 budget is exhausted. Stop for human review.**
