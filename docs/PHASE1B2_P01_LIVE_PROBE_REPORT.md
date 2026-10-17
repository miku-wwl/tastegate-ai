# Phase 1B.2 — P01 live probe report

2026-10-17. **P01: BLOCKED / NOT RUN.** Actual live HTTP dispatches: **0**. No API authentication result or provider response was observed. No exposed or replacement key was retrieved or used. A safe CLI preview and local-double tests do not establish live success.

## Exact proposed P01

- GET `https://hackathon.api.qloo.com/search`.
- Query: `query=Radiohead`, `types=urn:entity:artist`, `take=5`, `page=1`.
- Authentication: `X-Api-Key` from private server environment only; no value in this report.
- Maximum **one HTTP dispatch total**, failures included; one in flight; <=4 seconds including body reading; <=65536 response bytes; no redirects, retries, alternate host, credential fallback or batch.
- Raw response remains `unknown`; a 2xx/valid JSON result alone is UNKNOWN, pending human inspection of the actual envelope/identity/type. No best-hit entity selection.

## Live checkpoint

| Required before any Qloo call | Current evidence |
| --- | --- |
| Exposed key revoked/invalidated | NOT CONFIRMED by operator; exposed value not retrieved |
| Replacement issued and privately installed | NOT CONFIRMED; no key requested/read |
| Exact host/header reviewed | Documentation reviewed; request fixed in code; no live confirmation |
| Numeric quota/rate/concurrency/expiry and usage/capture rights | UNCONFIRMED; generic public guidance is insufficient |
| Private evidence access reviewed | Local new directory NTFS owner-only allow rule verified; operator checkpoint not created |
| Fresh explicit approval to dispatch P01 only | NOT PROVIDED; no private approval file created |

Because required conditions are absent, the explicit execution command was **not run**. `npm run probe:p01` actually returned BLOCKED/CHECKPOINT_REQUIRED with `source_mode=not_executed`, 0 dispatches and null HTTP status. The semantic LiveQlooAdapter remains disabled.

## Observations

| Live observation | Value |
| --- | --- |
| HTTP status / authentication outcome | NOT OBSERVED |
| Envelope / result field paths / entity IDs / types | NOT OBSERVED |
| Upstream request ID / response headers | NOT OBSERVED; none invented |
| Live latency / raw-body hash or saved response | NOT OBSERVED / NONE |
| P01 decision evidence | NONE; engineering checks are recorded separately in [readiness](PHASE1B1_SECURE_PROBE_READINESS.md) |

After prerequisite confirmation, present this exact profile and request explicit P01-only approval. A future authorized run saves a persistent attempt record and private capped response/safe summary; inspect the observed structure without sending credentials/raw private bodies to an LLM or review ZIP. 401, 429, redirects, unexpected structure, privacy/rights/quota uncertainty or budget exhaustion stop immediately. Do not reset/delete an attempt marker to retry.

P02-P04 are not authorized by P01 consent. After P01, stop for independent human review. P02-P10 and any public integration/deployment remain blocked. See [raw schema observations](PHASE1B2_RAW_SCHEMA_OBSERVATIONS.md).
