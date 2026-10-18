# Phase 1B.3.3 — Separate P03-R recovery readiness

2026-10-19, Pacific/Auckland. **Historical preparation snapshot: READY FOR EXACT OWNER REVIEW; NOT APPROVED; ZERO DISPATCHES at that checkpoint.** The owner subsequently approved this exact new attempt once. See the [execution report](PHASE1B33_P03R_EXECUTION_REPORT.md) for HTTP 200, bounded capture, UNKNOWN status/exit 3 and consumed consent. The preparation record below is retained; historical P03 remains UNKNOWN / RESPONSE_TOO_LARGE and was not replayed.

## Exact new request and capture decision

```text
GET https://hackathon.api.qloo.com/search?query=Blue+Note+New+York&types=urn%3Aentity%3Aplace&take=1&page=1
```

The public venue remains Blue Note New York, with independent address 131 West 3rd Street, New York, NY 10012 from the [official contact reference](https://www.bluenotejazz.com/nyc/contact/). That prior public reference does not establish Qloo coverage or geography. The [documented search parameters](https://raw.githubusercontent.com/qloo/docs-public/main/reference/get-search.md) remain query/types/take/page; no new parameter, branch query, page, geocoder or provider-link fetch is added.

Adopt a **256 KiB = 262144-byte** capture threshold only for `tastegate.p03r.bluenote-nyc.capture-256k.v1`. Asking for one record reduces requested count, but does not predict its size or ensure capture. This fourfold increase over 64 KiB is bounded enough for one reviewed metadata sample, while allowing a larger body than v1. It is not a quota entitlement or unlimited response allowance.

The reader, private store, new summary and CLI all use the trusted registry value. Neither arguments, model output, HTTP callers nor environment settings select/increase it. The strict new profile/checkpoint/summary bind the exact budget and revision. Old profiles still use 65536 bytes, old summary v2 still stops at 65537, and the old P03 request remains take=3. No legacy schema file changed.

Overflow is represented as **262145**, the capped indication that the stream crossed the new threshold, not a full body size. The crossing chunk can transiently exceed the threshold; accepted raw bytes and store writes remain bounded. Chunk buffers, concatenation, JSON/credential checks and private I/O require additional bounded memory/work; the cap is not a whole-process memory guarantee. No partial/error body is persisted. More private metadata may be captured than before, which requires fresh budget/privacy acknowledgement.

The timeout is unchanged: **4000 ms request/body deadline**, maximum one HTTP dispatch and one in flight, zero retries/redirect follows. Larger capture does not extend time or guarantee success. Startup, durable reservation and private persistence are not a guaranteed four-second whole-CLI envelope. Errors/timeout/cancellation stop; uncertain transport retains a blocking lock. No automatic second attempt or next page is permitted.

## Versioned history and authorization

- Historical P03 profile, old schemas/wrapper, expired approval/checkpoint, ledger and UNKNOWN summary are preserved, including the original exit-0 execution report. No raw v1 response exists and none is reconstructed.
- P03-R uses probe ID P03R, a separate p03r ledger/checkpoint, a fresh UUIDv4 and `APPROVE_P03R_NYC_ONLY`. Old P01–P04 approvals cannot parse as recovery consent. The expanded cap and new-attempt status require explicit acknowledgement.
- Under the global lock, all four prior ledgers must each remain 1 reserved / 1 dispatched / 0 unresolved. All prior attempt IDs are rejected for reuse. The exact historical P03 attempt/profile and its UNKNOWN / RESPONSE_TOO_LARGE result are separately schema-checked; missing or altered history blocks recovery reservation.
- New attempt metadata requires `tastegate.probe-attempt.v3`, exact profile_revision and max_response_bytes. New summaries require `tastegate.raw-probe.v3` with the same exact revision/cap. Relabeling old data or mixing versions is rejected. The old ledger reader continues to parse its existing v2 contracts without migration.
- Only local preview/preflight ran. P03-R checkpoint/receipt do not exist, and no attempt directory was reserved. The fixed CLI is outside Next routes and uses the existing private credential loader/native HTTPS engine. No general-purpose HTTP client or place mapper is added.

Actual preview: exit 0, BLOCKED / CHECKPOINT_REQUIRED, zero dispatches, no credential loading. Actual local preflight: exit 0, 1.472 s, READY_FOR_HUMAN_APPROVAL; private ignored credential configured, all old ledgers readable, P03-R 0/0/0. Preflight grants no consent.

## CLI execution contract

| Mode/outcome | Exit code | Meaning |
| --- | --- | --- |
| Informational preview | 0 | Printed a proposal/blocked preview; no execution |
| Successful local preflight | 0 | Local checks only, human approval still required |
| Executed PASS | 0 | Reserved for an actual PASS contract; raw probe schemas currently forbid semantic PASS |
| Executed FAIL | 1 | Explicit failure; do not automatically retry |
| Executed BLOCKED / blocked preflight/preparation | 2 | No authorization/readiness, or pre-dispatch block |
| Executed UNKNOWN / interrupted execution | 3 | Uncertain/unreviewed outcome; do not automatically retry |

`{profile, summary}` JSON is preserved on stdout; caught interruption remains a safe JSON error on stderr, with no raw exception/credential dump. HTTP 200, valid JSON and process completion do not make UNKNOWN successful. This intentional CLI behavior change applies to subsequent invocations for old profiles too; their stored summaries and original exit-code evidence are not rewritten. Use the node CLI directly for machine parsing because npm can print its own banners.

## Pending exact owner gate

Proposed attempt **4a3bc272-29d7-4e29-aee5-1cef45caaff2**. Private destination:

```text
private/qloo-probes/p03r/attempts/4a3bc272-29d7-4e29-aee5-1cef45caaff2/
```

Approval must cover this new take=1 NYC GET, **262144-byte** private capture, one dispatch/concurrency one/4000 ms/zero retries/redirects and the separate new attempt/ledger. The original organizer event key remains local. Prior exposure is possible, rotation/revocation unconfirmed, and exact remaining quota/rate/provider concurrency/expiry remain UNKNOWN. Approval must accept those disclosed risks and the larger bounded private capture; do not provide a key in chat.

The prior P03 approval is consumed. Approval for P03-R does not cover a v1 replay, Tokyo/generic Blue Note, P01/P02/P04 repeats, P05-P10, another recovery attempt, deployment, commit or push. If capture succeeds, identity/geography/schema still need independent review; one name/result/rank/popularity cannot auto-select an ID or establish cultural affinity. If it fails, preserve the failure and stop.

See [actual regression/report](PHASE1B33_REPORT.md) and the [P05 documentation-only plan](PHASE1B33_P05_INSIGHTS_PLAN.md). **STOP before the first P03-R network request.**
