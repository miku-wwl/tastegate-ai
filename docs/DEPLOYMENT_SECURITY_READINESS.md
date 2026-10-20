# Deployment and security readiness

2026-10-20, Pacific/Auckland. Commit `6b446784d` plus uncommitted changes. **Nothing was deployed, committed, pushed or submitted.** This document records what was verified, what the organizer's terms allow, what they leave open, and the plan for a deployment the owner has not yet approved.

## Verdict

| Question | Answer |
| --- | --- |
| Can the app be built so that private evidence, credentials and local files never ship? | **Yes, verified** by a repeatable gate: 47 checks, 47 PASS, 0 FAIL, 0 NOT RUN. A self-test plants leaks and the gate reports every one. |
| Does the built server degrade safely with no private evidence? | **Yes, verified** against the standalone server: recorded mode unavailable and empty, synthetic and custom plans work, live locked, nothing substituted. |
| Can a visitor start a live Qloo request? | **No**, unless a server operator configures a credential **and** an owner creates a grant **and** the visitor confirms each run. `TASTEGATE_DISABLE_LIVE=1` removes even that. |
| May a public site display or replay Qloo-derived data? | **Not settled.** The developer guide allows private server-side caching and forbids response data in a public repository; it says nothing about public display. Ask the organizer before exposing any. |
| Is it deployed? | **No.** |

## The gate: `npm run safety:deploy`

It does not deploy, does not contact Qloo or any external host, and prints only labels, relative paths and counts (never a secret, an identifier or a response).

1. **Clean copy.** Copies tracked and untracked-but-not-ignored files (none of `private/`, `.env*`, `.artifacts/`, `.cache/`, `test-results/`) into a throwaway directory outside the repository, with a real copy of the installed dependencies, so the build has its own root like a fresh clone.
2. **Synthetic canaries.** Plants random canary strings in the build environment (`QLOO_API_KEY`, `LLM_API_KEY`), in `.env.local` and `.env.production.local`, in a planted `private/` tree (a fake capture, identity review and live grant), in `.artifacts/` and in `test-results/`.
3. **Production build** with `TASTEGATE_STANDALONE=1` (opt-in standalone output).
4. **Scans** of everything that ships: server bundles, static assets, manifests, `public/`, source maps and the standalone directory (only `cache/`, `diagnostics/` and `dev/` are skipped, and the report says so). Each canary is searched in plain, URL-encoded, JSON-escaped, base64 and hex form. Every file-trace (`*.nft.json`) entry is checked against sensitive paths. No browser source map may be published.
5. **Real private tokens.** Tokens derived from the owner's ignored captures on this machine (610 tokens from 6 captures, including the P06 capture) and the provider-derived place strings (kept in an ignored private file, not in the tool) are searched in the build output **and** the tracked source. On a machine with no private evidence this check reports **NOT RUN**, never PASS.
6. **Runtime.** Starts the standalone server from a working tree with no private directory, twice (live switched off; live not switched off but no grant), and checks: pages and static assets load, security headers are present, the catalog reports recorded mode unavailable and empty and live locked for the right reason, a synthetic scenario works, the curated recorded scenario is refused with a fixed 503, a custom plan gets an honest no-evidence audit, live attempts with and without acknowledgement are refused, malformed/oversized/wrong-type requests are refused, and **no canary appears in any response, header or the server's own output**.
7. **Report** in `.artifacts/deploy-safety-report.json`; exit status 1 on any FAIL.

`npm run safety:deploy:selftest` proves the gate can fail: it plants a canary in `public/` and a trace that pulls the private directory into the output, and passes only if the gate reports them (6 expected FAILs: canary content, sensitive path, trace entry, the standalone working tree, and the two runtime consequences). Both runs leave no temporary copy behind.

**What the gate cannot see.** The hosting platform's own configuration, a secret pasted into a dashboard, a tracked file added after the run, behaviour against the real Qloo API, or a differently built artifact. Re-run it on the exact commit to be deployed.

## Controls

| Risk | Control | Verified by |
| --- | --- | --- |
| Private recordings or captures shipped | `private/` excluded from every file trace and the build; recorded mode reads `process.cwd()/private` at runtime only and is absent elsewhere | gate (paths, traces, standalone tree) |
| Credential exposure | Server-side only; never `NEXT_PUBLIC_`; the live adapter refuses a response that reflects it; reports and the catalog never carry it | gate (canary in env and `.env.local`), `live-adapter`, `audit-service` |
| Live abuse | Credential **and** grant **and** exact acknowledgement **and** same-origin caller **and** per-process rate limit **and** one run at a time; budgets reserved in a durable ledger before dispatch; 4 s deadline, 256 KiB cap, no retries or redirects; kill switch | `audit-service`, `live-adapter`, `live-grant-cli`, gate |
| Cross-site request to a live run | `Origin` and `Sec-Fetch-Site` must be same-origin; JSON content type required | `audit-service` |
| Silent mode switching | A locked or failed live run never falls back to recordings or fixtures; the UI cannot run a locked mode | `live-ui`, `audit-service` |
| Hostile input | Strict schema, 24 KiB body, 16 KiB plan, control/bidi/zero-width characters, reserved IDs, unknown and authority fields, depth and size bounds; errors carry a path and a fixed reason, never a value | `custom-input` (93), `audit-service` |
| Information in errors | Fixed error codes only; no exception text, path or configuration | `audit-service`, gate |
| Clickjacking, sniffing, referrer leaks | `Content-Security-Policy` (self only; inline allowed for Next hydration), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, no `X-Powered-By` | gate, browser tests (no console errors) |
| Stale or cached results | `Cache-Control: no-store` on the API | `audit-service`, gate |

Known weaknesses, stated: the rate limiter is per process (a multi-instance deployment needs a shared one); there is no authentication (the owner grant, not a login, is the authority for live); the CSP needs `'unsafe-inline'` for Next's own scripts; no penetration test was performed.

## Organizer terms: what is known

Checked 2026-10-20.

| Source | Finding |
| --- | --- |
| Developer guide (`docs.qloo.com/reference/qloo-llm-hackathon-developer-guide`, read today) | "Private server-side caching is fine and there is no time limit on how long you can keep cached responses." · "Do not store Qloo response data in a public repository" (it would put the data in public view, beyond the key's terms). · Keys work only on `https://hackathon.api.qloo.com` with `X-Api-Key`. · "Keys remain active through the end of the judging period and are deactivated after the hackathon closes." · Limits are "high enough to support typical hackathon projects"; no number is given and they can be raised per user. |
| Same guide | **Not addressed:** displaying or redistributing Qloo-derived data in an app or demo; attribution; caching that is not private or not server-side. |
| Event rules (`qloo.devpost.com/rules`) | Devpost refused the fetch tool today (HTTP 403) and web search did not return it. The Phase 0 review on 2026-10-16 recorded: submission and judging periods, eligibility, software and access requirements, English materials, reuse disclosure, equally weighted criteria, public source and licence, external hosting, no mandatory video ([sources S01/S02](PHASE0_SOURCES.md)). **Not re-verified today. Re-read the rules page before submission.** |

**What follows.** Recording responses privately on the server is allowed. A public repository must contain no Qloo response data: this repository has none (authored fixtures only; recordings stay in the ignored `private/`). **Serving recorded or live Qloo-derived entity names and facts to anonymous visitors is a grey area.** A reasonable reading is that showing a few results is the normal use of an API, but "beyond your key's terms" and "public view" argue for caution.

**Recommended question** (Discord `#api-help` or the Devpost Q&A): *"May our hosted demo display entity names, addresses and affinity-derived ordering that Qloo returned for our demo queries, and may it replay privately cached responses to judges? If not, may we show them only in a recorded demo video?"* Until answered, treat public display as **not permitted**.

## Production deployment plan (not executed; needs the owner's approval)

### Tiers

| Tier | Audience | Modes | Needs |
| --- | --- | --- | --- |
| **0 (recommended default)** | Anyone | FIXTURE and custom plans (no provider evidence). RECORDED and LIVE absent. | Nothing private. `TASTEGATE_DISABLE_LIVE=1`. No `private/`, no key. |
| 1 (only if the organizer confirms display terms) | Judges, access-restricted | Adds RECORDED replay of the owner's recordings | Recordings copied to the server's private directory, never into the repository or the image; access control in front of the app |
| 2 (owner-run) | The owner, locally | Adds LIVE under a time-boxed grant | Server credential, grant, confirmation per run; screen-recorded for the video if the terms allow |

### Steps (Tier 0)

1. Owner approval to commit and push (not given). Confirm the repository is public-safe: no Qloo response data, no secrets (gate: tracked-path and token checks).
2. `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run safety:deploy` on the exact commit.
3. Build with `TASTEGATE_STANDALONE=1 npm run build`. Deploy `.next/standalone` together with `.next/static` (and `public/` if present): `PORT=… HOSTNAME=0.0.0.0 TASTEGATE_DISABLE_LIVE=1 NEXT_TELEMETRY_DISABLED=1 node server.js`. Any Node 22.12+/24/26 host works; the gate verifies the standalone artifact serves its own static assets.
4. Set **no** Qloo or LLM variables on the host. Terminate TLS in front; keep the CSP.
5. After deployment, repeat the runtime checks against the URL: catalog shows recorded unavailable and live locked (`LIVE_DISABLED`); a synthetic run succeeds; a custom run returns the no-evidence audit; a live attempt returns 403.
6. Smoke-test in a mobile viewport and with a keyboard.
7. Rollback: redeploy the previous artifact; there is no state to migrate (no database, no sessions).

### After the hackathon

Keys are deactivated when it closes, so LIVE ends. If Tier 1 was approved, delete the private recordings at the organizer's request or at the retention limit the owner chooses.

## Before any deployment, the owner decides

1. Commit and push (and the licence, already MIT in `LICENSE`).
2. Tier 0 only, or Tier 1 after the organizer answers.
3. Whether to publish the recorded-derived evaluation aggregates (`EVAL_PUBLISH_RECORDED=1`); default is withheld.
4. Whether screenshots and the demo video may show Qloo-derived text (private-derived screenshots stay in `private/` until then).
