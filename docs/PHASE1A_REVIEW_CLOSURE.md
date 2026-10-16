# Phase 1A review closure

**PASS for offline scope.** Review performed 2026-10-16, Pacific/Auckland. Base revision `ee210f2398ef6e53afc1e919d695341d4d835cdc`, branch `main`, initial worktree clean. The review changes are uncommitted; source snapshot hashes identify them. No commit/push, deployment, Devpost operation or real Qloo/LLM call occurred in this scope.

The earlier [Phase 1A report](PHASE1A_REPORT.md) reported 75 Vitest tests and 4 Chromium tests. Those counts were independently reproduced here after repairing lockfile portability. They are not merely carried-forward claims. All original workflow source, strict domain/report schemas, rules and authored fixtures remain unchanged.

## Reproduction and actual failures

Environment observed: Windows/PowerShell, Node **v26.5.0**, npm **12.0.1**. Evidence root: ignored `.artifacts/review-20261016T073129Z/`. Each stage has commands, start UTC, elapsed time, exit code and raw console log. Package/browser downloads are distinct from Qloo API execution.

The first clean install on the original lockfile failed with **EALLOWREMOTE**: npm 12 rejected its `registry.npmmirror.com` tarball URLs as disabled remote package sources when using the official registry. `npm ci` had removed the prior installation, so subsequent baseline typecheck/test/build/E2E attempts also exited 1 (missing executables/modules). `git diff --check` exited 0. These failures are retained under `baseline/`; copied pre-existing artifacts were moved to `prior-artifacts/` and explicitly labeled historical, not evidence of this failed attempt.

Normalized **120** `resolved` URLs from `https://registry.npmmirror.com/` to `https://registry.npmjs.org/`. Compared every package entry: versions, integrity hashes, dependency metadata and every non-URL field remained identical; zero upgrades or additions. Original lock SHA-256: `a06cd9a711398c5237a6ae8d506cf710cccbed4fc6eba29c620dbe68e796458e`; normalized SHA-256: `f47a98a7ade572c4e26199f6dd0bef1c13f1554e55a78aa6dc5ab90fdb8b8bea`.

Actual install command for each passing stage:

```text
npm ci --cache {new-empty-stage-cache} --registry=https://registry.npmjs.org --no-audit --no-fund
```

Caches `npm-cache-portable-baseline` and `npm-cache-final` did not exist before their respective installs. No cache was copied into either. Network installation of 62 platform-selected packages succeeded from the normalized lockfile in **61.156s** and **44.379s**, respectively (both exit 0). This proves clean installation on the observed Windows/Node environment, not every platform. npm's update notice was informational; npm was not upgraded. Vulnerability audit was not run (`--no-audit`).

| Command | Portable baseline (only lock changed) | Final Phase 1B code |
| --- | --- | --- |
| `npm ci ...` above | exit 0, fresh cache | exit 0, different fresh cache |
| `npm run typecheck` | exit 0 | exit 0 |
| `npm test` | exit 0, **75/75**, 5 files, 1.01s Vitest | exit 0, **127/127**, 6 files, 1.40s Vitest |
| `npm run build` with `NEXT_TELEMETRY_DISABLED=1` | exit 0 | exit 0, production routes `/`, `/_not-found`, `/api/audit` |
| `npm run test:e2e` | exit 0, **4/4**, 6.1s Playwright | exit 0, **4/4**, 7.4s Playwright |
| `git diff --check` | exit 0 | exit 0; extended to new text files in final package checks |

A development run (125 tests) preceded two extra configuration/error-code tests; final totals are 127, not 125. Browser logs contain an environment `NO_COLOR`/`FORCE_COLOR` warning; all tests passed. No dependency or tool upgrade was made to suppress it.

## Executed evidence and preserved behavior

The final suite ran a real loopback production Next server and local installed Chromium, produced a full JSON Chromium report with **4 expected, 0 unexpected, 0 flaky, 0 skipped**, and captured desktop 1280x960 / mobile 390x844 viewport screenshots. Both screenshots were visually inspected. The test server carried an intentionally fake live credential canary; the inspector still returned only fixture reports and did not expose it in page/report content. The first captured browser run recorded no non-loopback page requests or page errors. Browser binaries were reused from the prior installation; no new browser-install claim is made.

Six actual computed workflows in `final/phase1a-offline-e2e.json`:

| Scenario | Before -> after | Completion | Fixture calls / repair rounds |
| --- | --- | --- | --- |
| nyc-evening | BLOCKED -> UNKNOWN | partial | 10 / 1 |
| valid-only | PASS -> PASS | complete | 5 / 0 |
| wrong-city-repair | BLOCKED -> PASS | complete | 8 / 1 |
| unresolved-only | UNKNOWN -> UNKNOWN | partial | 5 / 1 |
| missing-evidence | UNKNOWN -> UNKNOWN | partial | 6 / 1 |
| repair-fails | BLOCKED -> BLOCKED | complete | 8 / 1 |

Every report has 0 Qloo/LLM dispatches, synthetic provenance and archive `not_requested`. The original 14-call ceiling, one-repair limit, UNKNOWN semantics, deterministic hard constraints and evidence graph checks are preserved. Fixture PASS is not external-provider validation or a personal-liking prediction.

Final evidence SHA-256 examples (the package manifest covers every included file):

- Offline execution JSON: `fd3c79d63f6f450358790e1c45a3ab38e1e76a36bef56fbbc85e8af5c6e01617`.
- Browser execution JSON: `cf74aea9b17dfb742da5ad21e870556a4269ebf32999802c64fd81fac2794765`.
- Chromium report: `e5141ffde103bed970b0cbbc6ba2eb6c8c9ce45035395b4cb7a203aa0c279006`.
- Desktop PNG: `d1ef2e69745d2ed1f5f923d15fda46258164c5058762b95d31f9109b4e7102b7`.
- Mobile PNG: `db3955c09d0cc1fbc5738277e06b427ab072cde5fecd2a3892f51708c12e4c40`.

## Review package and remaining scope

Local private ZIP: `private/review/TasteGate_Phase1A_Closure_Phase1B_Offline_Review.zip`, with external `.sha256` sidecar. Includes implementation snapshot, original/final lock comparison, test/Chromium reports, command logs, captured screenshots, Git/source metadata, official-source retrieval record, evidence manifest and per-file SHA-256 list. It excludes credentials, `.git`, `node_modules`, `.next`, browser/npm caches and private Runtime state. It is a local unencrypted review file, ignored by Git; it has not been uploaded or published.

Root AGENTS and the frozen strategy were read completely. The approved Runtime exception literally names Phase 1A; this newer direct owner instruction explicitly authorizes Phase 1B offline boundaries and forbids Runtime archival. That instruction governs this scope without silently extending/editing AGENTS. Its existing Runtime pin/safety rules stay intact for any future approved SIDE_EFFECT integration. No Python Runtime installation/integration was attempted. Frozen strategy and all historical reports remain unchanged.

Live response mapping, Qloo authentication, entitlements, real cultural/geographic coverage and public data-use rights remain BLOCKED/UNVERIFIED. Closure of offline review does not clear them. Stop for independent human review; see [offline readiness](PHASE1B_OFFLINE_READINESS_REPORT.md) and [proposed Live gates](PHASE1B_LIVE_PROBE_PLAN.md).
