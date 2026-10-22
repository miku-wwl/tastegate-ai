# Public deployment runbook

Prepared locally, **NOT_DEPLOYED_OWNER_RESOURCE_PENDING**. Do not execute public deployment, registry push, DNS changes or cloud provisioning without the owner's separate instructions.

## Release decision

Use the exact reviewed commit plus its release evidence. The current working tree is uncommitted. Run `npm run release:verify` before a release; read `.artifacts/release-latest.json` and that run's `results.json`, totals and privacy reports. Exit 0 means applicable checks passed; **NOT_RUN is still NOT_RUN**, and the overall status may be PARTIAL.

The command runs existing checks, a real clean locked installation/build/smoke, Docker smoke if an engine exists, actual output scans and source/diff checks. It writes fresh UUID/timestamp directories, retains its clean checkout and logs, and sends no Qloo request. Public package verification is an additional archive gate.

## Runtime contract

| Item | Contract |
| --- | --- |
| Node | `^22.12.0 || ^24.0.0 || >=26.0.0` from package.json; actual tested versions are recorded with this release, not inferred |
| Container base | Node 24 Alpine, immutable multi-platform digest pinned in Dockerfile |
| Runtime size | Start with 1 vCPU / 512 MiB, matching the hardened local container test. Actual RSS/image measurements are in the release logs; this is not a target-host guarantee. |
| Build resources | Allow at least 2 GiB RAM and 2 vCPU for npm/Next builds; this is a practical allowance, not a measured minimum. Verification caps each Node child heap at 512 MiB and Rayon at 2 threads. |
| Storage | Allow several GiB for source/dependencies/build cache; use the measured image size for the runtime plus log headroom |
| Listener | HTTP 3000 internally; bind bare Node to 127.0.0.1 behind a proxy; publish Docker only on host loopback |
| HTTPS | Owner's host/reverse proxy terminates TLS, redirects HTTP, sets HSTS and supplies the certificate/domain |
| State | Production-safe needs no database, persistent evidence volume or shared limiter/store. One instance is sufficient. |
| Writes | Logs to stdout; ephemeral Next cache only, mounted as tmpfs in the container example |
| Egress | No provider egress is required in production-safe; deny it when the host supports doing so |

Required environment: `NODE_ENV=production`, `TASTEGATE_PROFILE=production-safe`, `TASTEGATE_DISABLE_LIVE=1`, `NEXT_TELEMETRY_DISABLED=1`. Choose `PORT` and `HOSTNAME` for the host. **No QLOO_API_KEY, LLM_API_KEY, QLOO_MODE=live, private mount or secret-looking NEXT_PUBLIC variable.** Startup refuses invalid configuration with exit 78.

## Route A — Linux VPS / Docker

After approval, on the named host:

1. Check out the exact release commit. Verify its package lock and Dockerfile base digest; do not copy the developer's .env, private directory or Windows build.
2. Build `docker build -t tastegate-ai:<release-sha> .`. Run `npm run smoke:container` locally first; the smoke test starts a separate hardened test container and publishes only loopback.
3. Review `deploy/compose.example.yml` and replace its example image tag with the reviewed release tag. Start with `docker compose -f deploy/compose.example.yml up -d`.
4. Put the service behind the owner's TLS proxy using `deploy/nginx.example.conf` as a reviewed example, not a preconfigured domain. Keep body/rate limits and security headers.
5. Verify the public URL as below. Record source commit, image digest, operator and time. Nothing in this sprint pushes an image or performs these host steps.

## Route B — ordinary Node.js hosting

After approval, on a host supporting a persistent Node process, configurable port and health check:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:standalone
NODE_ENV=production TASTEGATE_PROFILE=production-safe TASTEGATE_DISABLE_LIVE=1 HOSTNAME=127.0.0.1 PORT=3000 npm run start:prod
```

Build on the target OS or an equivalent build image. Keep the complete `.next/standalone` tree, `.next/static` beside its server and `scripts/start-production.mjs` in the documented layout. The build helper copies static assets. Do not transplant a Windows standalone build to Linux or run raw `server.js` without the validating startup wrapper. Configure the host's supervisor to restart the process and capture stdout.

The release verifier tests this clean-install/standalone path locally, including absence of private data, default-safe startup, health and refusal paths. Host-specific installation, TLS and external access remain untested until a host is supplied.

## Public URL acceptance — owner-authorized deployment only

Verify from a clean desktop browser and a phone:

- HTTPS and redirects work; health is HTTP 200 with `profile=production-safe`, `live=DISABLED_BY_PROFILE`, `recorded_replay=DISABLED_BY_PROFILE`.
- The guided synthetic audit reaches comparison and downloads a validated report. A custom unsupported recommendation reports UNKNOWN without provider requests.
- A request selecting live is refused; private recorded scenarios are unavailable. No credential or private recording is installed.
- CSP, nosniff, referrer, frame and permissions headers exist. Invalid JSON and oversized bodies fail safely.
- Restart retains healthy, stateless behavior. Inspect stdout for fixed codes without private values.

Then record the real URL in Devpost materials. Until that verification, `PUBLIC_DEMO_URL=PENDING_OWNER_HOSTING`.

## Rollback and availability

Retain the previous immutable image/release artifact and environment. Roll back by restarting the previous safe release; there is no production-safe database migration. If uncertain, stop public access rather than enabling live or private replay.

Keep free judge access through the later of the confirmed official requirement and the owner's November 16 handover window. The currently fetched rules page says November 5; ask the organizer to reconcile it. Do not shorten access on an unconfirmed interpretation. Recorded provider display remains a separate unresolved permission gate; see [evidence status](FINAL_QLOO_EVIDENCE_STATUS.md).
