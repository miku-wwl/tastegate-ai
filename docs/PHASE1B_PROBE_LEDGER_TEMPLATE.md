# Phase 1B private probe ledger template

**Template only. No probes executed. P01-P10 all BLOCKED.** Copy this template into an ignored private directory AFTER separate live approval; never populate tracked docs with keys, raw Qloo data or personal information. Follow the [probe plan](PHASE1B_LIVE_PROBE_PLAN.md).

## Campaign approval record

| Item | Private operator entry |
| --- | --- |
| Campaign ID / reviewer / approval reference | NOT PROVIDED |
| Source HEAD + dirty status + source manifest hash | NOT RECORDED |
| Approved probes and exact request profiles | NOT APPROVED |
| Numeric quota / remaining quota / expiry / support | UNVERIFIED |
| Permitted private retention/display/export, source of permission | UNVERIFIED |
| Event origin/header names reviewed, credential present privately | NOT VERIFIED; never record credential value |
| Deadline / concurrency / retries / allocated raw calls | Proposed: 4s/call, 1 in flight, 0 automatic retries; requires review |
| Confirmed public artist/movie/tag and NYC interpretation | NOT CONFIRMED |
| CLI version/pin, event-host proof, dispatch bound | NOT VERIFIED |

## Probe inventory

| Probe | Proposed raw-call cap | Actual dispatches | Status | Private evidence manifest |
| --- | ---: | --- | --- | --- |
| P01 | 1 | NOT RUN | BLOCKED | NONE |
| P02 | 2 | NOT RUN | BLOCKED | NONE |
| P03 | 3 | NOT RUN | BLOCKED | NONE |
| P04 | 2 | NOT RUN | BLOCKED | NONE |
| P05 | 2 | NOT RUN | BLOCKED | NONE |
| P06 | 1 | NOT RUN | BLOCKED | NONE |
| P07 | 2 | NOT RUN | BLOCKED | NONE |
| P08 | 2 | NOT RUN | BLOCKED | NONE |
| P09 | 2 | NOT RUN | BLOCKED | NONE |
| P10 | 14 total audit | NOT RUN | BLOCKED | NONE |
| Independent CLI raw search | 1 additional | NOT RUN | BLOCKED | NONE |
| CLI find_tags workflow | UNVERIFIED: no allocation | NOT RUN | BLOCKED | NONE |

Maximum proposed raw campaign = 31 + 1 independent search. CLI workflow dispatches are not counted as a fictitious single call. Any profile change or additional call needs a reviewed revised allocation. Failed dispatches count; validation failures before dispatch do not.

## Repeat for each actual HTTP dispatch

```text
campaign_id / probe_id / run_id / local_call_id:
source_revision / source_manifest_sha256:
approval_reference / allocated_calls / consumed_before / consumed_after:
started_at_utc / duration_ms / request_deadline_ms / overall_deadline_ms:
source_mode: live ONLY for an actual provider dispatch
method / exact allowlisted origin / path:
allowlisted non-personal query fields (never authentication):
HTTP status / safe header names and values / upstream request ID IF OBSERVED:
private raw body path / bytes / SHA-256 / truncation status:
raw field paths actually inspected / requiredness / missing-null-empty distinctions:
identity and tag choice / who confirmed / ambiguity:
geography observations / missingness / constraint support:
rank, query context and measure meaning (no personal probabilities):
explanation availability / warnings / omitted contributors:
expected / observed / PASS-FAIL-UNKNOWN criterion / outcome:
consumer error category / no-retry confirmation / stop reason:
links to private original and revalidation evidence:
sanitization reviewer / retention rule and deletion due date / actual cleanup proof:
```

Keep raw response capture separate from sanitized engineering logs. Raw captures may contain unconsumed provider fields and remain private; public snapshots and fixtures must not be derived from them. A hash proves byte consistency, not provider authenticity. Do not invent call IDs as upstream IDs or use a normalized CLI envelope as REST schema evidence.

PASS requires the probe-specific observed evidence. FAIL means an observed contradiction/rejection against its criterion. UNKNOWN means insufficient evidence. BLOCKED means the experiment could not start. The current template has no observations and no measured zeros; `NOT RUN` must not be converted to success.
