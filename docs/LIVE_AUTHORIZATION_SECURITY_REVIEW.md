# Live authorization: security review and closure

2026-10-21, Pacific/Auckland. Base commit `8c4937011b9e2dcc40b289ccd24bcbad6d2b4a5b` plus uncommitted Phase 3B changes. **No Qloo request was made while fixing or testing this.** Workstream A (P0) of Phase 3B.

**Verdict.** The defect is **closed in the code of this repository**: no free-text interpretation of an owner reply remains, and a static test fails if one is reintroduced. What the fix does *not* do is authenticate the human who approves (see [Residual risk](#residual-risk)).

## 1. The defect

`ownerReplyAuthorizesLive(reply)` in `src/qloo/live-grant.ts` decided from the owner's free text whether to create a live grant. Its rule was "non-empty, ≤ 500 characters, contains the word LIVE as a whole word, and names no probe". It therefore **accepted replies that mean the opposite**:

| Reply | Old result | Why |
| --- | --- | --- |
| `I do not approve LIVE access.` | accepted | contains the word LIVE |
| `I refuse LIVE requests.` | accepted | same |
| `Maybe turn on LIVE later.` | accepted | same |
| `Do not enable LIVE.` | accepted | same |
| `LIVE` | accepted | the bare word |

A keyword test cannot be made safe by adding negative keywords: the space of refusals, hedges and other languages is open. A second function with the same defect class, `ownerReplyNamesOnlyP06` (the P06 probe approval), was found during the review.

**Impact in this repository: none was realised.** No live grant was ever created (`private/qloo-live` does not exist on the owner's machine), live mode has never been run against Qloo, and the one P06 approval was registered from an explicit, structured selection by the owner. The defect was latent: an assistant or script that passed an ambiguous reply to the CLI could have created a grant.

## 2. The fix: exact, structured, single-use consent

Implemented in `src/qloo/owner-consent.ts` (primitives), `src/qloo/live-grant.ts` (live grants) and `src/qloo/p07-consent.ts` / `p07-approval.ts` (the P07 probe gate).

1. **Write the terms down first.** A *proposal* records everything being approved as one JSON document: environment, endpoint origin and method, each allowed operation with its path **and the exact query-parameter names its builder may send**, request and run budgets, concurrency (1), per-request timeout (4 s), response cap (256 KiB), retries and redirects (0), validity of the grant (minutes), the deadline for approving, revocation rule, and that the credential is server-side only. Constants in the code (endpoints, parameter lists, limits) are part of the document, so changing a constant invalidates earlier approvals.
2. **Reduce them to a digest.** `SHA-256(revision ‖ kind ‖ unique identity ‖ canonical JSON of the terms)`. Canonical JSON has sorted keys and refuses anything JSON cannot represent exactly (`NaN`, `undefined`, non-plain objects).
3. **One canonical sentence approves them:** `APPROVE LIVE-GRANT <uuid> SHA256:<first 32 hex of the digest>` (for P07: `APPROVE P07-NYC-DISCOVERY <attempt uuid> SHA256:<32 hex>`).
4. **Accept only that sentence.** The check is exact equality after trimming outer whitespace. There is **no keyword matching and no negative-word list**: a refusal, a hedge, a bare `LIVE`, another language, a sentence for other terms, another identity or another kind are all simply "not equal".
5. **The caller supplies no terms.** `createLiveGrant({ proposalId, ownerReply })` reads the terms from the stored proposal. A budget, operation or deadline cannot be substituted at approval time.
6. **Single use, in the safe order.** The proposal is marked consumed *before* the grant is written. A crash between the two leaves a spent proposal and no grant (fail closed), never a replayable sentence.
7. **Every load re-checks.** `loadLiveGrant` re-derives the terms from the grant, recomputes the digest and the sentence, requires the proposal to exist and to be consumed, requires the window to equal the approved duration, and requires the running environment to equal the grant's. A hand-edited limit, a swapped identity, a free-text reply or a legacy-format grant is `GRANT_INVALID`.
8. **Revocation is immediate.** A revoke marker is checked on every load **and on every reservation inside a running run**, and `revokeLiveGrant` also withdraws every unused proposal so an offer the owner no longer wants cannot be approved later.
9. **A forged in-memory grant cannot start a run.** `startLiveRun` re-loads the stored grant and refuses any object that differs from it (a stale, widened or hand-built grant).
10. **The adapter enforces the parameter profile.** Before a request slot is reserved, the request's parameter names must be in the grant's allowed list for that operation.

`PRODUCTION_LIVE` grants cannot be proposed: the environment is bound into the terms, but public live access is not authorized (`PRODUCTION_LIVE_AUTHORIZED = false`, see [PUBLIC_DEPLOYMENT_PREPARATION](PUBLIC_DEPLOYMENT_PREPARATION.md)).

### Compatibility with historical records

The probe approvals, receipts, checkpoints and ledgers of P01–P06 are **untouched**: nothing in the new code reads, rewrites or adds to them (a test creates, approves and revokes a grant next to authored historical files and compares their bytes). The P06 registration path was **retired rather than patched**: its single approval is consumed and sealed, so no registration path is needed, and removing it leaves no free-text matcher in the repository. The historical P06 checkpoint, receipt and ledger are still read, unchanged, by the modules that verify them. Live grants in the retired `v1` format are refused as `GRANT_INVALID`.

## 3. The owner commands

```
npm run live:grant -- --propose --minutes=15 --max-requests=14 --max-runs=3 --operations=entity_lookup,tag_lookup,rank_places,discover_places
    prints the terms and the one sentence that approves them (no authority yet; the offer lapses after 60 minutes)
npm run live:grant -- --create --proposal=<id> --owner-reply="<the sentence, exactly>"
npm run live:grant -- --status
npm run live:grant -- --revoke          # revokes the grant and withdraws unused offers
```

## 4. Test evidence

All offline; `fetch` and `https.request` are replaced by throwing doubles in these files, so a request would fail the test.

| Requirement | Test (file) |
| --- | --- |
| Negative, hedged, bare, other-language and malformed replies are refused | `tests/live-authorization.test.ts` — "accepts the exact sentence … nothing that merely contains or resembles it" (≈70 replies incl. the brief's five, look-alike and invisible characters, wrong kinds) and "ambiguous, negative and mismatched replies create nothing" |
| A refused reply leaves the offer approvable by the exact sentence | same file, `refuses %j, writes no grant, and leaves the proposal approvable` |
| Replay (after use, after revocation, after expiry) | "a sentence is single-use" |
| Another proposal's sentence or identity | "a sentence approves exactly one proposal" |
| Parameter / budget / scope / deadline substitution | "the terms come from the stored proposal" and "scope mismatch", "budget mismatch", "identity, digest and sentence cannot be swapped" |
| Expiry (before the offer, after its window) | "the offer lapses" |
| Revocation (load, run start, next reservation) | "revocation: loading, starting a run and the very next reservation all stop" |
| Environment binding | "a grant is only valid in the environment it was approved for" |
| Legacy format | "the retired v1 format, whatever its reply says, is not a grant" |
| Forged in-memory grant | "a run cannot start from a stale or hand-built grant object" |
| Parameter profile equals what the builders send | "every request a builder sends uses exactly the parameters listed" |
| Historical records untouched | "owner grant operations never read, rewrite or add to historical probe approvals" |
| No free-text matcher remains | "no free-text interpretation of an owner reply remains in the source" (static) |
| CLI refusals and lifecycle | `tests/live-grant-cli.test.ts` |
| Same machinery for the P07 gate | `tests/p07-preparation.test.ts` ("approval: only the exact sentence, once, for exactly this request") |

Reproduce: `npx vitest run tests/live-authorization.test.ts tests/live-grant-cli.test.ts tests/live-adapter.test.ts tests/audit-service.test.ts tests/p06-preparation.test.ts tests/p07-preparation.test.ts`.

## Residual risk

| Risk | Status |
| --- | --- |
| **The sentence is not authentication.** Whoever can run the local owner command can paste it. The relay is the owner's own tool (an assistant, a terminal). | OPEN, inherent. Mitigation: the sentence is specific, single-use and digest-bound, and the owner can run `--create` themselves in their own terminal so no relay is trusted. Do not describe it as proof of human approval. |
| Local file-system write access to `private/qloo-live` lets an attacker forge a self-consistent grant and consumption marker. | OPEN, equal to owner-level trust. The credential is the larger secret. |
| A 128-bit digest prefix is shown to the owner. | Accepted: the stored proposal holds the full digest and is the authority; the prefix only has to defeat accidental approval. |
| Clock changes affect expiry. | Accepted; expiry uses the server clock and is conservative (offers are 60 minutes, grants ≤ 60). |
| Limits are per process (rate limiter) and per host (ledger). | OPEN for any distributed or public deployment. A shared limiter and operator controls are required before public live access; see the production-live safety design. |
| Public live access. | NOT AUTHORIZED. Refused in code. |
