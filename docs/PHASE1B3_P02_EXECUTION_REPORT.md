# Phase 1B.3 — Approved P02 execution and schema findings

2026-10-18, Pacific/Auckland. **CONDITIONAL PASS for the bounded request and basic movie lookup; full identity/schema review remains unresolved.** Exactly one explicitly approved P02 returned HTTP 200. No P01 repeat, P03/P04 or later probe occurred. LiveQlooAdapter stays disabled; no provider response became trusted audit evidence.

## Exact authorization and execution

The owner answered “确认该影片并批准 P02 一次” to the complete operation-specific gate, confirming In the Mood for Love (2000, Wong Kar Wai), accepting the disclosed exposure/UNKNOWN-entitlement risks and permitting private capture. The authorized attempt was **14d95fe4-126a-4941-a7a1-6dbdd8e26684** only. Prior P01 consent was not reused.

```text
GET https://hackathon.api.qloo.com/search?query=In+the+Mood+for+Love&types=urn%3Aentity%3Amovie&take=5&page=1
query = In the Mood for Love
types = urn:entity:movie
take = 5
page = 1
Maximum dispatches = 1; concurrency = 1; automatic retries = 0; redirect follows = 0
Request/body timeout = 4000 ms; capture cap = 65536 bytes
Credential = private server configuration only, never printed or copied from chat
```

Before dispatch, all **79** public project files matched the reviewed preparation ZIP, SHA-256 caec1de16ce1a7cdc8997b67be6ae6c80857ca5aa428721a36394528e583a8bd. HEAD stayed **4b6b4fe3b63a8773dd00ebcf37b5e9ab9643c41c**, with an empty index and the same 22 prepared changed paths. No executable source was changed in this execution turn.

The saved Radiohead response/integrity and P01 ledger were checked locally without another artist request. Non-network preflight found P02 0 reserved / 0 dispatched / 0 unresolved. Private root and P02 directories had **0 other-identity allow rules**. The credential was loaded only by the reviewed local Node loader.

| Actual event/result | Observed value |
| --- | --- |
| Local approval registration | 2026-10-17T20:44:50.099Z; five-minute checkpoint window |
| Durable attempt reservation | 2026-10-17T20:45:09.883Z |
| CLI wrapper start / completion | 2026-10-17T20:45:08.600217Z / 20:45:11.343778Z |
| HTTP status | **200** |
| Dispatches / maximum / automatic retries | **1 / 1 / 0** |
| Saved response size | **55317 bytes** |
| Request/body outcome elapsed | **1215.599 ms** |
| Whole CLI child-process duration | **2.743 seconds**, including startup/compilation/private I/O |
| CLI exit / transport settled / raw saved privately | **0 / true / true** |
| Immutable runner status | **UNKNOWN / SCHEMA_REVIEW_REQUIRED / NOT_REVIEWED** |

Registration is a local system timestamp, not an asserted human click time. Measured request time includes local syntax/reflection checks and is not isolated provider processing time. Startup/durable I/O are outside that request timer. No timeout, cancellation, fallback, retry, redirect follow or second page occurred.

## Actual observations from the privately saved response

Local Node inspection emitted paths, types, counts and comparisons against the already public confirmed film only. Provider IDs, other titles, descriptions, URLs, external identifiers and tag values remain private.

| Observed path/field | Observed sample |
| --- | --- |
| Top-level object | Only results; no pagination metadata |
| $.results | Five objects |
| entity_id / name / types | Present on 5/5; nonempty distinct string IDs, names, all contain urn:entity:movie |
| properties / disambiguation | Object / string on 5/5 |
| popularity | Numeric on 4/5, omitted on 1/5; no affinity/scale interpretation |
| tags | Arrays on 5/5; **437 items total** |
| tags[].name / tag_id / type | Strings on all 437 inspected items |
| tags[].value | **Absent on all 437 items** |
| properties.release_year | Number on 5/5 |
| Exact confirmed-title + movie-type + ID match | One within the returned set, position 1; rank is not selection authority |
| That exact-title candidate's release_year | Matches independently confirmed 2000 |

Other actual properties: akas arrays (5/5), content_rating strings (2/5), description strings (5/5), external objects (5/5), filming_location strings (5/5), image objects (5/5), is_special booleans (5/5), production_company/release_country/release_date strings (5/5), short_descriptions arrays (5/5), website strings (5/5). Presence is not factual verification; linked resources were not fetched. Plural movie short_descriptions is not silently mapped to the singular artist short_description observed in P01.

No direct director/directors key was observed in these properties. No independent director or external identity linkage was established. The public [Criterion film source](https://www.criterion.com/films/198-in-the-mood-for-love) and owner confirmation establish the intended film, not the identity of a particular provider entity. One matching title/year/type is a useful bounded candidate, **not independently resolved catalog identity**. Selected entity ID remains null; no automatic rank-based choice or affinity conclusion occurred.

## Important schema difference: reject and retain

The reviewed local search projection was derived from P01's observed attached tags, which had name/tag_id/type/value strings. Tags themselves are optional there, but its tag-item projection requires value when tags are present. P02 supplies tags without value on all 437 items, so the strict local projection **rejects this sample for schema review**.

This is a real, retained schema mismatch, not a test-double failure or grounds to retry. Raw syntax capture succeeded independently and the immutable raw summary remains UNKNOWN. No parser, mapper, fixture, test expectation or schema was relaxed in this execution turn. A later reviewed change must use these actual findings, retain unknown/missing fields and preserve P01 regressions. This report does not approve such a change or enable the semantic live adapter.

These are attached **movie** tags. They still do not establish a real /v2/tags response envelope, tag meaning/type taxonomy or P04 behavior. No universal requiredness/null/empty behavior, total count, page-2 behavior, HTTP error semantics or cultural-affinity measurement follows from this one response.

## Private evidence and durable accounting

Evidence remains under private/qloo-probes/p02/attempts/14d95fe4-126a-4941-a7a1-6dbdd8e26684/: original attempt.json, summary.json and response.raw.json; separate private integrity, field-review and identity-review supplements. The checkpoint/approval receipt remain private outside the attempt directory. Original records are not overwritten or relabeled PASS.

Post-run local ledger inspection:

- P01: **1 reserved / 1 recorded dispatch / 0 unresolved**, conservative upper bound 1.
- P02: **1 reserved / 1 recorded dispatch / 0 unresolved**, conservative upper bound 1.
- Global/per-probe active locks released after the settled durable summary. The approved P02 ID/consent is consumed, even before its checkpoint's wall-clock expiry.
- All **18** execution-source file hashes recorded in this attempt still match; all **7** original P01 private files remain unchanged. AGENTS, frozen strategy, package lock, fixture route and disabled LiveQlooAdapter remain unchanged.

Only reports/README change after execution. This is a trusted local read-only probe, not installed AIG SIDE_EFFECT acceptance. No Runtime/archive integration, dependency change, UI change, deployment, Devpost edit, commit or push.

## Actual commands and validation scope

Execution evidence directory: ignored .artifacts/p02-execution-20261017T204400Z.

| Actually performed operation | Observed result |
| --- | --- |
| Local Python ZIP/source/integrity checks | PASS; 79 current files equal reviewed ZIP, same HEAD/empty index, P01 seven files unchanged |
| PowerShell Get-Acl checks | PASS; zero other-identity allow rules on private root/P02 directories |
| node scripts/qloo-probe-p02.mjs --preflight-p02 | Exit 0; child-only QLOO_MODE=live; 0 dispatches/reservations, reused P01 integrity verified |
| Local Node registration of explicit reply | Private checkpoint/receipt created exclusively; no request |
| node scripts/qloo-probe-p02.mjs --execute-p02 | **Invoked once**; exit 0, one HTTP 200, 55317 bytes, 1215.599 ms |
| Local Node structural/comparison review | Actual counts above; strict projection mismatch retained; no network |
| Local ledger/source recheck | P01 1/1/0 and P02 1/1/0; 18 execution hashes/7 original P01 files unchanged |
| git diff --check after report updates | Exit 0; actual log packaged |

The earlier preparation ran typecheck/build successfully, **247 Vitest tests** and **4 real local Chromium tests** successfully. Those archived actual logs are included for context; **tests/build were NOT RERUN in this execution-only turn**, and no new test pass is claimed. Executable source exactly matches that tested/reviewed version. Documentation/packaging static checks are separate new evidence.

## Review package and stop

New sanitized package: private/qloo-probes/review/phase1b3-p02-result-20261017T204511Z/TasteGate_Phase1B3_P02_Review.zip, with internal file manifest and external checksum. It contains current public source/tests/config/reports, prior actual regression logs explicitly labeled preparation evidence, actual P02 execution/preflight logs and safe field/count/ledger/source checks. Keys, private env/checkpoints/receipts, raw provider responses/IDs/hashes, dependencies/caches/virtual environments and Git internals are excluded. The original preparation ZIP is retained unchanged.

**STOP for independent review.** Request acceptance/basic lookup is supported; the observed tag schema difference and independent catalog identity are unresolved. Precise quota/rate/provider concurrency/key expiry and rotation/revocation remain UNKNOWN/unconfirmed. No retry, schema relaxation, repeat P01/P02, P03/P04, later probes or automatic phase transition is authorized.
