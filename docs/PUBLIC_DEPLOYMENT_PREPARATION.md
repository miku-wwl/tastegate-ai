# Public deployment: preparation only

> **Phase 3D/4A, 2026-10-22.** No hosting resource, public tunnel, DNS change, cloud login or deployment. Current checks and actual resource limitations are in [PHASE3D4A_EXECUTION_REPORT](PHASE3D4A_EXECUTION_REPORT.md). Docker Desktop's engine remains unavailable; container execution is NOT RUN. Current local source excludes active approval sentences from shipping and scans their private digest bindings, including quoted env credentials. Original data and screenshot histories are preserved.

> **Phase 3C (2026-10-21).** Preparation remains local; `PUBLIC_DEPLOYMENT_STATUS=NOT_DEPLOYED_OWNER_RESOURCE_PENDING`. Current production build, clean-copy gate, refusal self-test and local smoke results are in the [execution report](PHASE3C_EXECUTION_REPORT.md). The Docker engine is unavailable in this session, so the container test is **NOT RUN**; the container PASS below is a previous Phase 3B result. No host, tunnel, DNS, public Qloo mode or uploaded private evidence.

2026-10-21, Pacific/Auckland. Base commit `8c4937011` plus uncommitted Phase 3B changes. Workstream E (P0) of Phase 3B.

**Nothing was deployed. No hosting was bought, no cloud resource provisioned, no DNS or production credential touched, no image pushed.** This document records what was prepared, what was verified on the development machine, and what only the owner can decide.

```
LOCAL_PRODUCTION_BUILD_STATUS   = PASS
DEPLOYMENT_ARTIFACT_STATUS      = PREPARED_AND_LOCALLY_VERIFIED   (Dockerfile built and run on Docker 29.8.0; compose file schema-validated; nginx example reviewed, not executed)
SECURITY_GATE_STATUS            = PASS                            (npm run safety:deploy: 91 passed, 0 failed, 0 not run; self-test passed)
CLEAN_ENVIRONMENT_STATUS        = PASS                            (clean-copy build and start with none of: .env.local, private/, recordings, review artifacts)
HOSTING_RESOURCE_STATUS         = OWNER_PENDING
PUBLIC_DEPLOYMENT_STATUS        = NOT_DEPLOYED_OWNER_RESOURCE_PENDING
```

`PUBLIC_DEPLOYMENT_STATUS` stays as above until the owner supplies a hosting resource and approves a deployment; nothing in this document is evidence that a deployment exists or works.

## 1. What a public host runs: the production-safe profile

A runtime profile (`src/server/runtime-profile.ts`) decides what a server may do. It can only make a server **more** restrictive, and an invalid configuration fails closed.

| Profile | Recorded replay | Live | Credential allowed | Default for |
| --- | --- | --- | --- | --- |
| `development` | yes (if the owner's recordings exist) | possible, **owner grant + credential + per-run confirmation** | yes | `next dev` |
| `test` | no | no | no | a test runner |
| `recorded-local` | yes | no | no | explicit only |
| **`production-safe`** | **no, never loaded** | **no** | **no (refused if present)** | **`NODE_ENV=production`** |
| `production-live` | — | — | — | **reserved and refused**: `PRODUCTION_LIVE_AUTHORIZED = false` is a code constant, not an environment switch |

What a production-safe server serves: the authored synthetic scenarios and **custom plans audited with no provider evidence** (every lookup is `UNKNOWN`, nothing is replayed or requested). It never loads `private/` even if a host mounts it, never allows a live request, and **an environment variable alone is never authority** for either.

Configuration the server refuses (fixed codes only; no value is ever printed): an unknown profile; `production-live`; a credential (`QLOO_API_KEY`, `LLM_API_KEY`) or `QLOO_MODE=live` on a profile that must not hold one; a secret-looking `NEXT_PUBLIC_*` variable. The start script exits **78** before anything listens; `/api/health` reports HTTP **503** `degraded` with the codes and serves as production-safe in the meantime. `TASTEGATE_DISABLE_LIVE=1` is an additional operator kill switch.

## 2. Artifacts

| Artifact | Purpose | Verified how |
| --- | --- | --- |
| `Dockerfile` | 3-stage build (`deps`, `build`, `runner`); `npm ci --ignore-scripts`; standalone output; non-root user `10001`; `HEALTHCHECK`; starts through the validating script; profile and kill switch baked in; no secret, no `ADD http`, no `COPY . .` in the runner | **Built and run** locally (below); static tests in `tests/deploy-artifacts.test.ts` |
| `.dockerignore` | Keeps `private/`, `.env*`, `.artifacts`, `.cache`, `test-results`, `.git`, `*.pem`, `*.key`, `*.sqlite3`, logs, `node_modules`, `.next` out of the build context | The **real** Docker context was listed (115 files) and compared with the model; 0 extra files; no private path |
| `scripts/start-production.mjs` | Validates the environment, then starts the server (`--check` validates only); loopback unless told otherwise | `tests/runtime-profile.test.ts` (differential test: the script and the TypeScript profile agree on 224 environment combinations); smoke and gate |
| `app/api/health/route.ts` | Liveness + configuration: fixed labels and process figures only; no path, identifier, secret or provider value | `tests/health.test.ts`; gate (response scanned) |
| `deploy/compose.example.yml` | Read-only root, `cap_drop: ALL`, `no-new-privileges`, loopback port, health check, CPU/memory/pid limits, no secret, no registry | `docker compose config` validates it; **not started** from this file |
| `deploy/nginx.example.conf` | TLS termination placeholders (`example.invalid`), 32 KiB body cap, rate and connection limits, health restricted to loopback, `server_tokens off` | Static tests only; **not executed** (it needs real certificates) |
| `deploy/env.production.example` | The complete safe environment; lists the variables that must be absent | Static test |
| `scripts/build-standalone.mjs`, `smoke-production.mjs`, `container-smoke.mjs`, `deploy-safety.mjs` | Build, local smoke test, container smoke test, privacy gate | Run; results below |

Examples are provider-neutral: no cloud provider, registry, region, account, real host or certificate appears in any of them (a test scans for that). Base images use a tag via `ARG NODE_VERSION`; **pin by digest at release time** (a tag can move; the digest could not be resolved without a registry round trip that this phase did not need).

## 3. Verification results (development machine, Windows, Node 26.5.0, Docker 29.8.0)

| Check | Command | Result |
| --- | --- | --- |
| Production build (standalone) | `npm run build:standalone` | success; **19.6 MiB** standalone output + **0.6 MiB** static |
| Local smoke test | `npm run smoke:prod` | **16 / 16** (start script refusals, health, headers, no recordings, live locked, synthetic and custom audits, burst of 30 audits) |
| Privacy gate | `npm run safety:deploy` | **91 passed, 0 failed, 0 not run** |
| Gate self-test | `npm run safety:deploy:selftest` | **passed**: the gate reported every planted leak (public canary, trace including `private/`, developer path in a public asset, a `.dockerignore` that no longer excludes `private/`) |
| Container smoke test | `npm run smoke:container` | **19 / 19**: real context holds no private path; image builds in 96.5 s cold and 40.9 s with cached layers (**284.5 MiB**; re-run on the final tree); non-root; no secret-looking variable; refuses a credential, `production-live` and live mode (exit 78); starts hardened (read-only, no capabilities, 512 MiB, 1 CPU); health, headers, synthetic audit, recorded unavailable, live refused by the profile; Docker health `healthy`; output names no secret |

**Privacy audit scope (what the gate scans, with synthetic canaries planted in the environment, `.env.local`, a planted `private/` tree and public assets):** server bundles, static assets, browser JavaScript, source maps, manifests, the standalone output and its file-trace entries (14 traces, 2,969 entries), the build log, the response bodies and headers of the running server, the server's own output, the Docker build context, and the source checkout's absolute path. It also scans the **owner's real private tokens** (610 tokens derived at run time from 6 private captures, never printed) and 7 provider-derived place strings against the build output and the tracked source: **zero hits**. Findings are reported as labels, relative paths and counts only.

**Honest gaps.** A standalone build records the directory it was built in; the gate builds in a clean copy and checks that the *source checkout's* path is absent, and a container build embeds `/app`. The compose example was schema-validated but not started from the file; the nginx example was not executed. The container check ran on one machine and says nothing about a target host.

## 4. Clean-environment test

The gate builds from a clean copy that has **none of**: the owner's `.env.local` (a canary one is planted instead), `private/qloo-probes/` (a canary tree is planted and must not reach the output), recordings, review artifacts, `.artifacts/`, caches. The built server then runs with no private directory and degrades to explicit `UNAVAILABLE`/`UNKNOWN` (the recorded scenario returns 503 `RECORDED_EVIDENCE_UNAVAILABLE`; a custom plan is audited with no provider evidence). The container build uses the real repository as its context, with the same guarantee.

## 5. Sizing (measured; not a target-host statement)

| Figure | Measured |
| --- | --- |
| Node process memory at idle / after 30 audits | 89–93 MB / 119 MB RSS (Windows) |
| Container memory after a burst of 30 audits | 46.8–47.5 MiB of a 512 MiB limit (two runs) |
| Image / standalone output / static assets | 284.5 MiB / 19.6 MiB / 0.6 MiB |
| Clean build | 30 s locally; 96.5 s in the container (includes `npm ci`) |
| Synthetic audit latency | in-process milliseconds (see `/results`); no network |

**Suggested starting point:** 1 vCPU, 512 MiB memory limit (about 4× the measured peak), 1 instance. A single Node process is enough for a judging audience of this kind; more replicas are *not* a scale-out of live access (section 7).

## 6. Hosting tiers and what each needs

| Tier | Serves | Needs from the owner |
| --- | --- | --- |
| **0 (recommended)** | Synthetic scenarios and custom plans; recordings absent; live off | A host that runs the container, a domain/TLS, a decision on who watches it until judging ends |
| 1 | Recorded replay behind access control | Organizer confirmation that a hosted demo may show Qloo-derived data (the developer guide allows private server-side caching, forbids response data in a public repository and is **silent on public display**; do not infer permission from private caching). Not built or approved. |
| 2 | Owner-run live for a video | The owner's machine; `development` profile; a grant; never a public host |

**HOSTING_RESOURCE_STATUS = OWNER_PENDING.** Owner decisions: provider and plan, domain, TLS, who monitors and takes it down, retention of logs, and the takedown date after judging (keys deactivate after the hackathon).

## 7. Production-live safety design (NOT AUTHORIZED; a design, not a feature)

Public live Qloo access is **refused in code** and stays refused until every control below exists, is tested and the owner approves a separate gate. A single-process limiter, a local-file ledger and a per-host kill switch are **not** sufficient for a distributed or public deployment.

| Control | Requirement before any public live access |
| --- | --- |
| Operator authorization | A separate, expiring authorization record naming scope, quotas and approver (distinct from the owner's local grant), checked at start and on every request; enabling it is a reviewed code change |
| Cumulative quotas | A **shared, durable** budget (per hour/day, per operation, global) that survives restarts and counts unsettled requests; provider quota is UNKNOWN, so default conservatively and alert at 50/80/100 % |
| Rate limiting | At the edge and in the app, per client and global, in a shared store; the nginx example is per instance only |
| Shared concurrency | A global lease with a TTL so replicas never exceed the provider's unknown concurrency limit (the adapter's one-in-flight slot is per process) |
| Abuse prevention | No custom live plans from the public; fixed request builders only; pre-registered scenarios; no echo of provider data; request-size and time caps already enforced |
| Grant expiry and revocation | Time-boxed grants; revocation checked on every reservation (implemented locally); revocation visible to every replica |
| Credentials | Server-side secret store, never in an image, a log, a URL or the browser bundle; rotation runbook; the key deactivates after the event |
| Kill switch | `TASTEGATE_DISABLE_LIVE=1` plus a runtime flag that takes effect without a redeploy; tested |
| Observability | Structured logs with no secret or identifier; counters for requests, refusals, budget remaining; a ledger export for audit; alerts on spikes |
| Incident response | Leaked key: disable live, rotate, review the ledger, tell the organizer. Abuse spike: block at the edge, disable live. Data exposure: take the site down, assess, notify |
| Rollback | Immutable image tags; redeploying the previous tag; flipping to `production-safe` is always the safe rollback |

## 8. Commands

```powershell
npm run build:standalone          # self-contained production server
npm run start:prod                # validates the environment, then starts it (production-safe by default)
npm run smoke:prod                # local production smoke test
npm run safety:deploy             # clean-copy privacy gate (builds, scans, runs the server)
npm run safety:deploy:selftest    # proves the gate can fail
npm run smoke:container           # Docker build + hardened run + checks (needs a Docker engine)
docker build -t tastegate-ai:local .
docker compose -f deploy/compose.example.yml up
```

## 9. Runtime requirements and environment contract

| Requirement | Value |
| --- | --- |
| Runtime | Node 22.12+, 24 or 26+ (the image uses `node:24-alpine` through `ARG NODE_VERSION`) |
| Process | one Node process, `node scripts/start-production.mjs`; stateless; no database; no writable root filesystem needed (Next writes only under `.next/cache`, a tmpfs in the examples) |
| Network in | HTTP on `PORT` (default 3000), behind a TLS-terminating reverse proxy; the health check is `GET /api/health` |
| Network out | **none required** for `production-safe`. The server never contacts Qloo, any LLM or any other host in that profile. Egress can be denied entirely. |
| Storage | the image (about 285 MiB); no persistent volume; logs to stdout |

| Variable | Public host | Meaning |
| --- | --- | --- |
| `TASTEGATE_PROFILE` | `production-safe` (or unset: it is the default under `NODE_ENV=production`) | what the server may do; `production-live` is refused |
| `TASTEGATE_DISABLE_LIVE` | `1` | an additional kill switch on top of the profile |
| `NODE_ENV` | `production` | |
| `PORT`, `HOSTNAME` | `3000`, `0.0.0.0` in a container (`127.0.0.1` for a bare process behind a local proxy) | |
| `NEXT_TELEMETRY_DISABLED` | `1` | |
| `QLOO_API_KEY`, `LLM_API_KEY`, `QLOO_MODE=live`, any secret-looking `NEXT_PUBLIC_*` | **must be absent** | the server refuses to start (exit 78) if any is set |

## 10. Required hosting features

A host that can run a container (or a Node process) with: a configurable `PORT`, environment variables, HTTPS termination or a proxy that does it, a health check that treats HTTP 200 as healthy and 503 as unhealthy, at least 256 MiB (512 MiB recommended) and 0.5 vCPU (1 recommended), stdout log capture, and the ability to restart on failure and to take the site down on request. It does **not** need a database, a volume, a queue, outbound internet access or a secret manager (no secret exists in this profile).

## 11. Deployment procedure after the owner approves (not performed)

1. Owner decisions in section 14 are made; a hosting resource and a domain exist; the owner explicitly approves deployment.
2. On the exact commit to be released: `npm ci && npm run typecheck && npm test && npm run build && npm run test:e2e && npm run eval && npm run safety:deploy && npm run safety:deploy:selftest` all pass.
3. Build the image from a clean checkout of that commit (`docker build -t tastegate-ai:<commit> .`), pin the base image by digest, and run `npm run smoke:container` against it.
4. Push the image **only** to the registry the owner names. Never tag `latest`.
5. Configure the host with the environment of section 9 and **no** secret; set the health check to `/api/health`; terminate TLS (certificate and DNS are the owner's).
6. Start one instance. Confirm `GET /api/health` is `ok`, `production-safe`, `live: DISABLED_BY_PROFILE`, `recorded_replay: DISABLED_BY_PROFILE`; run `npm run safety:deploy` logic against the public URL by hand: the home page, `/results`, a synthetic audit, a refused live attempt, and the security headers.
7. Re-read the page as a judge would, from a clean browser, on desktop and phone width.
8. Record the commit, image digest, time and operator.

## 12. Production security checklist

- [ ] The release is built from a clean checkout; the gate and self-test pass on that exact commit.
- [ ] No `.env*`, `private/`, recordings, review archive or credential is in the image or the build context (the container smoke test lists the real context).
- [ ] `TASTEGATE_PROFILE=production-safe`; the start script and `/api/health` agree.
- [ ] No Qloo-derived data is shown (organizer display terms are unanswered).
- [ ] TLS is on, HTTP redirects to HTTPS, HSTS set; the proxy limits body size and rate; `server_tokens off`.
- [ ] Security headers (CSP, `frame-ancestors 'none'`, `nosniff`, referrer, permissions) are present on every response (checked by the gate and smoke tests).
- [ ] Egress is denied if the host supports it.
- [ ] Logs carry no secret or identifier; retention and access are decided.
- [ ] The takedown date is set (keys deactivate after the hackathon).

## 13. Rollback and operational risks

**Rollback.** Redeploy the previous image tag (immutable tags only). The always-safe fallback is to keep `production-safe`, which holds no data, credential or private evidence. If the site misbehaves, take it down: it has no state to lose.

| Risk | Likelihood / impact | Mitigation |
| --- | --- | --- |
| A host mounts `private/` or sets a credential | low / high | the profile never loads recordings and refuses a credential; the start script exits 78 |
| Judges expect live Qloo calls | medium / medium | state plainly what is recorded, synthetic and live; offer the owner-run video |
| Abuse of `/api/audit` | low / low | it is local, bounded (16 KiB body, 60 s budget) and holds no secret; the proxy rate-limits per instance |
| Organizer terms forbid public display | medium / high | only synthetic data is shown; recordings are never loaded |
| Single-process limits mistaken for global ones | medium / high for live | public live access is refused in code until the section 7 controls exist |
| Base-image tag drifts | low / medium | pin by digest at release |

## 14. Outstanding owner decisions

1. Hosting provider, plan, region and budget (not selected, not assumed).
2. Domain and TLS ownership; who renews and who is the contact.
3. Who watches the site until judging ends, and the takedown date.
4. Tier: 0 (synthetic and custom only, recommended), 1 (recorded replay; needs the organizer's confirmation), 2 (owner-run live for a video).
5. Whether to ask the organizer about public display now (a draft inquiry is in the [Devpost draft](DEVPOST_AWARD_SUBMISSION_DRAFT.md); it was not sent).
6. Approval to commit, push and deploy, each separately.

## 15. Graceful failure and error handling (verified)

With no provider reachable the app stays usable: `production-safe` never contacts one; in the owner's profiles a failed or timed-out live request becomes explicit `UNAVAILABLE` evidence with a fixed reason (never a guess, never a fallback to recorded or synthetic data) and stops the run after the first failure (circuit breaker); a missing recording makes the recorded scenario return 503 `RECORDED_EVIDENCE_UNAVAILABLE` while a custom plan is still audited with no provider evidence. Errors returned to a client are fixed codes: no stack, path, exception text or provider value. Tests: `tests/live-adapter.test.ts` (failure modes, breaker, deadline), `tests/audit-service.test.ts`, `tests/route.test.ts`, `tests/health.test.ts`, and the gate's runtime checks.
