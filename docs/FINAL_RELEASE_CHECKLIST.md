# Final owner release checklist

2026-10-23 NZDT. **Local candidate prepared; NOT READY TO SUBMIT.** Source: `395f31ef0d32318eb7edb580153e74494c109427` plus uncommitted work. [Actual verification](FINAL_PREDEPLOYMENT_REPORT.md).

## External gates

- [ ] Independent review of source, release evidence and sanitized archive.
- [ ] Owner explicitly approves commit/push; neither occurred.
- [ ] Organizer clarifies public display and real-Qloo judge access. **QLOO_PUBLIC_DEMO_VALUE=BLOCKED** until resolved.
- [ ] Owner supplies hosting, domain/TLS, access period and deployment authorization.
- [ ] Verify the actual public URL using [the runbook](PUBLIC_DEPLOYMENT_RUNBOOK.md).
- [ ] Confirm eligibility, account-specific fields, disclosures and final submission.

Each approval is separate. P07 approval authorizes none of these.

## P07 — complete, do not repeat

- [x] Exact active-session approval received.
- [x] One dispatch; HTTP 200, 55,555 bytes, 3,388.801 ms; zero retries/redirects; settled ledger.
- [x] Observed schema reviewed, locality ambiguity retained, private capture sealed and exact-profile replay admitted.
- [x] One replacement independently corroborated/revalidated; whole plan UNKNOWN/partial.
- [x] P01–P06/P03-R remain historical and must never be repeated. No further probe is authorized.

## Before publishing the release

- [ ] Run `npm run release:verify` on the exact reviewed tree; inspect FAIL, NOT_RUN and skipped tests separately.
- [ ] Review actual artifact scans and private-token availability, not only command exit status.
- [ ] Check source/package manifests and confirm no private files, credentials, approval tokens or response facts are staged.
- [ ] Confirm MIT license and public repository metadata; preserve AGENTS.md and the frozen strategy.
- [ ] Build the chosen immutable commit; retain lockfile, base/image digest and rollback identifier.

## Before public deployment

- [ ] Choose the permitted judged experience; do not describe a synthetic-only host as real Qloo execution.
- [ ] Default production-safe; no credentials/private mounts; live disabled.
- [ ] Review Node/container procedure, proxy limits, TLS and health checks.
- [ ] Verify external HTTPS, synthetic demo/export, custom UNKNOWN, refused live/recorded requests, headers and restart.
- [ ] Record release SHA, image digest, URL, operator and time.
- [ ] Maintain free judge access through the confirmed required window. Keep the later November 16 handover target until the organizer reconciles the rules page's November 5 date.

## Submission package

- [x] [Final English Devpost content](FINAL_DEVPOST_SUBMISSION.md).
- [x] [Two honest demos and three-reviewer script](FINAL_JUDGE_DEMO.md).
- [x] [Evidence status and unsent organizer inquiry](FINAL_QLOO_EVIDENCE_STATUS.md).
- [x] [Deployment runbook](PUBLIC_DEPLOYMENT_RUNBOOK.md).
- [ ] Replace `PUBLIC_DEMO_URL=PENDING_OWNER_HOSTING` only after verification.
- [ ] Owner approves/submits Devpost. No video recorded.

[Official rules](https://qloo.devpost.com/rules) were re-read: October 30, 2026 23:45 EDT deadline (October 31 16:45 NZDT), working integration, functional demo link, public licensed source and English materials. Current fetched judging dates differ from the handover; inquiry remains unsent. Video is optional.
