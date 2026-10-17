# Phase 1B.1 — Secure raw probe readiness

2026-10-17, Pacific/Auckland. **CONDITIONAL PASS for offline preparation; live execution BLOCKED.** Base HEAD `439a51e3626dbd761ab4ff1c0e11b12275c9d6bb`; initial worktree clean. Current changes are uncommitted and identified by the review ZIP source manifest. No Qloo API request, key retrieval, deployment, Devpost action, Runtime archive, commit or push was performed in this phase.

## Credential incident and local security review

The owner reported a key exposed in chat. Treat it as compromised. Its value was not retrieved from chat, email, shell history, logs, private env files or any other source; it was not used, fingerprinted or copied into code/tests. Revocation and replacement installation are **not confirmed**. Key presence alone cannot enable a live probe. Operator revocation/rotation confirmation is external evidence, not something this program can infer from a key string without retrieving the exposed value.

Scoped local scan: **5 available local Git commits** (all refs plus reflog commits), **62 unique blobs**, **54 tracked files**, an empty index, and **134 build/browser output files**. No credential candidates were found in Git history, tracked files or the index. Six initial prefix matches in Next file-trace JSON were structurally verified as embedded substrings in existing `node_modules` file paths, not credential literals. No matched value was printed. No history rewrite was attempted. The scan checks contextual credential literals/assignments, common provider prefixes and private-key markers; it cannot prove the absence of every unlabeled/unknown secret format.

`.gitignore` already excludes private state, env files, artifacts, dependencies and caches; `.env.example` credentials remain blank. No private dotenv file was present (filenames/existence only were checked). Validation subprocesses removed Qloo/LLM/public-Qloo credential variables and unsafe diagnostic hooks without logging their values. The source config additionally rejects `NEXT_PUBLIC_QLOO_API_KEY`.

New private evidence root `private/qloo-probes/` was created with NTFS inheritance disabled and an allow rule for the current operator only; observed other-identity allow-rule count was **0**. No checkpoint, credential file or real raw response was created. This local ACL check is recorded separately; other deployments must review their own private directory access. POSIX directory/file modes are 0700/0600, links/junctions are rejected, and writes are exclusive and flushed. This is not a malicious-host sandbox or authenticated multi-user service.

## Implemented runner and limits

| Files | Actual behavior |
| --- | --- |
| `src/qloo/p01-profile.ts` | Strict exact P01 request, short-lived operator checkpoint and bounded summary contracts; unknown fields rejected. A raw/unreviewed probe cannot assert semantic PASS. |
| `src/qloo/p01-runner.ts` | Default BLOCKED; separate opt-in live path; existing server-config loader; fixed GET profile; <=1 HTTP dispatch, <=4s including body reading, <=65536 response bytes, one in flight, zero retries, no redirects. Node HTTPS uses TLS verification and no pooled agent. Errors expose fixed categories only. |
| `src/qloo/p01-private-store.ts` | Fixed ignored private paths; exclusive persistent one-attempt marker; UTC/local probe ID and actual Git/source-file hashes; capped raw JSON stored privately only after syntax and credential-reflection checks; safe summary has no auth headers/raw data. No automatic reset/replay after failure, timeout, cancellation or restart. |
| `scripts/qloo-probe.mjs`, `package.json` | Separate server-only CLI, no Next route wiring. Uses the already pinned TypeScript compiler to compile a small fixed module list into ignored `.cache/qloo-probe`; no added package/global tool. No-argument invocation prints a blocked preview only. SIGINT/SIGTERM abort handling; an unexpected interruption after execution starts reports unknown dispatch count, never a fabricated zero. |
| `src/qloo/server-config.ts`, `.env.example` | Existing exact event-origin/private-env loader retained; public env credential rejected; no dotenv loading by the probe runner. |
| `tests/p01-probe.test.ts` | **58** new local-only cases. Global fetch and Node HTTPS are guarded against accidental network dispatch in this suite. |

The existing LiveQlooAdapter stays disabled. Existing fixture adapter, audit workflow, rules and strict domain/report schemas are unchanged. There is no mapper for provider fields, score, location, tag or entity results. Only JSON syntax/media/UTF-8/size is checked; valid JSON of any shape stays `unknown`. A 200 result is UNKNOWN/SCHEMA_REVIEW_REQUIRED, not proof of authentication semantics, entity identity or cultural relevance. Provider data never becomes fixture evidence or an accepted audit report.

401/403 return FAIL with safe classification; 429/5xx/deadline/abort/malformed/oversized responses return UNKNOWN and stop. Redirects are not followed and return FAIL. Every attempted transport call, including failure, consumes the single dispatch allowance. Invalid/missing approval, configuration, quota, rights or profile stops with BLOCKED before dispatch. Error bodies and headers are not captured. Valid raw JSON is private; a literal, URL/base64 or JSON-escaped reflection of the configured credential is discarded before writing. This reflection check is bounded defense, not permission to share any raw provider response.

The private checkpoint contains operator assertions, not credentials or authenticated-human proof. The owner must first confirm revocation, private replacement setup, numeric remaining quota/rate/concurrency/expiry, usage/capture rights, private access and exact request profile, and **separately approve P01**. Approval is P01-only, one dispatch, expires within 15 minutes and is rechecked before dispatch. Unsafe HTTP/TLS diagnostics, key logging or disabled TLS verification block execution. Operator identity, host integrity, clock correctness and honest external revocation confirmation remain trusted prerequisites.

## Exact preview and future checkpoint

Executed safe command:

```text
npm run probe:p01
```

It prints BLOCKED/CHECKPOINT_REQUIRED, `source_mode=not_executed`, 0 dispatches. It does not load the key or read private checkpoint state. Proposed request for later independent approval:

```text
GET https://hackathon.api.qloo.com/search
query=Radiohead&types=urn%3Aentity%3Aartist&take=5&page=1
Authentication: X-Api-Key header from private server environment only
Budget: 1 HTTP dispatch total, including failure; 4s maximum; 65536 bytes; no redirects/retries
```

The future execution command is `node scripts/qloo-probe.mjs --execute-p01`; **NOT RUN**. It requires an independently approved private `private/qloo-probes/p01-checkpoint.json`. Do not put a key in this file, a CLI flag, chat or shell-history assignment. Provision it through a private server environment/secret manager. Do not fill the following intentionally blocked template by guessing:

```json
{
  "revision": "tastegate.p01.checkpoint.v1",
  "profile_revision": "tastegate.p01.radiohead.v1",
  "exposed_key_revoked": false,
  "replacement_installed_privately": false,
  "host_and_header_reviewed": false,
  "usage_rights_confirmed": false,
  "private_capture_permitted": false,
  "private_directory_access_reviewed": false,
  "quota": { "remaining_calls": 0, "rate_limit_per_minute": 0, "concurrency_limit": 0, "key_expires_at": null },
  "approval": "NOT_APPROVED",
  "max_dispatches": 1,
  "approved_at": null,
  "approval_expires_at": null
}
```

The template is invalid on purpose; actual confirmed values and fresh UTC timestamps are required after approval. It has not been written to private setup state. Never delete/rename the attempt marker to obtain a retry; any new attempt requires a separately reviewed authorization and allocation. There is no `--force`, batch, arbitrary query, host, endpoint, budget or credential argument.

## Official documentation recheck and first wave

Re-read the [event developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide), [Kit README](https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/README.md), [access policy](https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/API_ACCESS.md), [safe use](https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/SAFE_USE.md), CLI and MCP starters on 2026-10-17. Kit HEAD remains `0db91b8d9c5aae2160d53596e57ea6c9da251cde`; retrieval hashes/UTC are saved. The browser fetch could not open the guide; direct public documentation retrieval returned 200. These were documentation reads, not Qloo API requests. Native transport API reference: [Node HTTPS](https://nodejs.org/api/https.html).

The guide confirms event origin/header, but does not establish this participant's numeric entitlement or exact permitted export/display fields. General Kit docs still advertise read-only `qloo explore`, conflicting with the supplied organizer restriction on chat. Apply the narrower event instruction: no chat/explore/plan/build/integrate. No harness was installed or executed; only `qloo exec` and local stdio `qloo mcp` are reserved for later approved tooling work. Any proposed use of a conflicting mode must first get organizer clarification. Aggregate affinities are not personal predictions; the fixed Radiohead query sends no user identity data.

P01-P04 proposed total ceiling remains **8 HTTP dispatches**, including failures, following the [existing plan](PHASE1B_LIVE_PROBE_PLAN.md). Only P01 is executable in this runner:

| Probe | Prepared experiment | Cap and current blocker |
| --- | --- | --- |
| P01 | Exact Radiohead artist search above; inspect raw envelope after review; do not select a best hit automatically | 1; replacement/revocation, quotas/rights and fresh explicit P01 approval unconfirmed |
| P02 | GET `/search`, single artist/movie type, `query={human-confirmed public artist or film}`, `take=5`, `page=1`; inspect actual IDs/types/ambiguity | <=2; wait for P01 review and owner's specific Wong Kar-wai film confirmation; synthetic film selection is not consent |
| P03 | GET `/search`, `types=urn:entity:place`, each human-reviewed venue name, `take=5`, `page=1`; include wrong-city/ambiguous-branch control | <=3; venue/control choices and actual geography unconfirmed; no guessed address, branch or city |
| P04 | GET `/v2/tags`, `filter.query=jazz`, `take=5`, `page=1`; inspect actual tag IDs/labels/types and semantic ambiguity | <=2, one at a time with separate reviewed follow-up; no static invented tag IDs |

No batch dispatch or executable P02-P10 path was added. All later probes need separate review; stop on credential/privacy/rights/quota uncertainty, unexpected structure/redirect, unapproved parameters, auth/rate errors or exhaustion. Inadequate bodies stay UNKNOWN; no auto retry, fallback or cap increase.

## Actual engineering results

Node **v26.5.0**, npm **12.0.1**. Existing dependency versions and lockfile SHA-256 `f47a98a7ade572c4e26199f6dd0bef1c13f1554e55a78aa6dc5ab90fdb8b8bea` remain unchanged. Logs live under ignored `.artifacts/secure-probe-20261017T062600Z/`.

| Actual command | Observed result |
| --- | --- |
| `npm ci --cache .cache/npm-secure-probe-20261017T062600Z --registry=https://registry.npmjs.org --no-audit --no-fund` | exit 0, fresh empty cache, 62 packages, 41.936s |
| Same locked `npm ci --offline` from that populated cache on final source | exit 0, 35.543s; no audit/package upgrades |
| `npm run typecheck` | final exit 0; first development attempt exit 2 for two missing callback type annotations, corrected before final run |
| `npm test` | final exit 0, **185 passed / 0 failed**, 7 files, 2.01s Vitest; includes original 127 and 58 new cases |
| `npm run build` | final exit 0, real production build, telemetry disabled |
| `npm run test:e2e` | final exit 0, **4 passed / 0 failed**, 6.7s Playwright, actual loopback production server/local Chromium; screenshots captured |
| `npm run probe:p01` | final exit 0, safe blocked preview, no key load or dispatch |
| `git diff --check` and final new-file/security/package checks | exit 0 / PASS; per-file hashes, source scope, protected baselines and client asset checks in review package |

The historical 127/4 counts were not reused as current validation. A harmless NO_COLOR/FORCE_COLOR warning remains in browser logs. Browser installation was reused, not newly installed. npm vulnerability audit was not run. Real API transport/credential/response compatibility remains NOT VERIFIED; all new failure tests used local doubles, not external Qloo faults.

## Delivery and stopping point

Private sanitized package: `private/qloo-probes/review/TasteGate_Phase1B_Secure_Probe_Review.zip`, with SHA-256 sidecar, source revision/file hashes, relevant source/tests/docs, actual sanitized logs and Chromium evidence. Actual credential/checkpoint state, auth headers, private raw provider responses, caches and dependencies are excluded. This local unencrypted ZIP has not been uploaded or committed.

AGENTS, the frozen strategy and accepted workflow/fixtures are unchanged. The current direct owner task authorizes this product-owned read-only probe preparation and explicitly excludes Python Runtime archival; no Runtime-first acceptance is claimed or bypassed for a SIDE_EFFECT integration. No further Runtime amendment was applied.

**Stop at the human checkpoint.** The [P01 report](PHASE1B2_P01_LIVE_PROBE_REPORT.md) and [raw schema observations](PHASE1B2_RAW_SCHEMA_OBSERVATIONS.md) remain BLOCKED/NOT RUN. Confirm revocation/replacement and numeric limits/rights without sending credentials, then request a separate explicit one-dispatch P01 approval. After a future authorized P01, save private evidence and stop before P02-P04.
