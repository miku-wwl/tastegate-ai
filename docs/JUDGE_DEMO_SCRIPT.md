# Judge demo script (2–3 minutes)

> Current Phase 3D/4A scene order and evidence boundaries: [FINAL_JUDGE_DEMO](FINAL_JUDGE_DEMO.md). This earlier script is preserved as historical preparation; no video was recorded.

2026-10-21, Pacific/Auckland. A script, **not a recording: no video was made.** It uses only the authored synthetic sample and the public results page, so every screen in it is safe to show publicly. Nothing here shows or describes provider data beyond what the repository already states.

**Before you start:** `npm run build && npm start`, open <http://127.0.0.1:3000>. No key, no account, no network request to Qloo. Browser at about 1280 px wide.

| Time | On screen | Say (English, plain words) |
| --- | --- | --- |
| 0:00 | The home page: the headline and **How it works, in 30 seconds** | "AI agents recommend places that are in the wrong city, never checked, or backed by claims nobody verified. TasteGate is the quality gate between the agent and the person: it audits the plan, repairs only what fails, once, and says what it could not prove." |
| 0:15 | Press **Start the 2-minute guided demo** | "This is an authored synthetic plan, so there is no private data and no request to Qloo." |
| 0:25 | **Audit** screen, guide step 1. Point at the red card, then at an UNKNOWN card | "Each recommendation gets four checks: identity, hard constraints, taste evidence and claims. The red one failed a hard constraint and the card says exactly which. This one is UNKNOWN, not wrong: no evidence, so TasteGate claims nothing." |
| 0:55 | **Repair** screen, guide step 2. Point at the two pills, **SYNTHETIC SUCCESS**, then open **Mandatory evidence (10 of 10 met)** | "Only the failing item gets a replacement, once, and it is audited from scratch. Two separate questions: do the hard constraints hold, and does cultural evidence support it. A high Qloo ranking never fixes a failed hard check. A replacement is verified only if its identity has a second source; a click on Qloo's own candidate is not one. Because this data is authored, the success is labelled synthetic." |
| 1:35 | **Compare** screen, guide step 3. Scroll to the **Decision trace** | "Before and after, as plain counts. The trace lists each decision in a fixed vocabulary, for example *hard constraint failed, repair considered*, then *valid replacement verified*. It is read from the audit's own findings: at most 14 evidence calls, one repair round, no retries, no free-form agent reasoning." |
| 2:05 | Press **Finish the guide**, open **Evaluation results** | "The same plans go through three policies on the same evidence, scored by an oracle that does not use our rules. On the 50-plan synthetic holdout, shipping the plan as proposed lets 26 violating items through; trusting the first Qloo hit, 31; TasteGate, none. We also ran a **control without Qloo's cultural evidence**." |
| 2:30 | The cultural-evidence section and the badge `QUALITY_UPLIFT_NOT_ESTABLISHED` | "Qloo's evidence adds coverage on 90 % of kept items, changes no kept plan on these synthetic plans, and we cannot show an independent quality gain, because no ground truth for taste exists apart from Qloo's own affinity. We publish the null result." |
| 2:45 | (spoken; do not show recorded data) | "With real recorded Qloo responses we found one thing worth saying: in a single shortlist query, Qloo's own ordering ranked an out-of-city place above the verified NYC venue. TasteGate kept the venue and rejected the place on the provider's own geography." |
| 2:55 | Close | "What is real: six captured Qloo responses and a gate that holds. What is not: a live run against Qloo, which is built but owner-gated, and a quality-uplift claim. Thank you." |

## If you only have 30 seconds

Phase 3C results-page addition: point to **Can cultural evidence prioritize valid candidates?** Say: "On the same valid pool, authored evidence changes priority in six of fifty scored synthetic holdout plans. This changes no acceptance. Our real recorded shortlist has only one valid candidate, so we cannot yet demonstrate this with multiple real venues." The results page now has keyboard skip navigation and a verified phone-width layout.

Show the **How it works** strip, press the guided demo, stop at the Repair screen's two pills and say: "Hard constraints and cultural evidence are separate questions; a high Qloo rank never overrides a failed hard check."

## What not to show

- Anything under `private/` or any screenshot from `private/phase2b-screens/` (recorded, provider-derived). Public-safe images are in `.artifacts/screens/` (`judge-*` and the synthetic ones).
- The **RECORDED** scenario on a public screen until the organizer confirms display terms. The recorded story above is told in words only.
- Any live run. LIVE is locked by default and is for the owner's machine only.

## Likely questions

| Question | Honest answer |
| --- | --- |
| "Is this an AI agent?" | It is the deterministic gate that sits behind one. The workflow is a bounded state machine with no LLM; every claim in a report is re-derived by a validator from the evidence. |
| "Does it call Qloo live?" | Not in the demo. Seven real requests were made with the event key under the owner's per-request approvals; six captured responses are replayed read-only. A live adapter exists, is tested against doubles and has never been run against Qloo. |
| "Why isn't the user's confirmation enough to verify a replacement?" | Because the user is confirming Qloo's own candidate details. That is a decision, not a second source. A separate provider lookup or a registered official page is. |
| "How do you know the control is fair?" | It shares the recommendations, constraints, identity decisions, candidate pool and every non-cultural rule, is built from a view of the report with no cultural field, and a test scrambles all cultural evidence to prove its decisions do not move. |
| "What would convince you that Qloo improves quality?" | A human-judged taste study, or an AUTHORIZED_LIVE stratum with independent labels. Neither exists yet; we do not claim it. |
| "Can I try it?" | Yes: `npm ci && npm run build && npm start`. No key or account. A hosted demo is pending the owner (`PENDING_OWNER_HOSTING`). |

## If something fails

Reload; the guided demo is a single synthetic request. If the page will not load, run `npm run smoke:prod` to check the server, or show the screenshots in `.artifacts/screens/judge-*.png`. Never switch to recorded or live data to "make it work": a locked or failed mode never falls back to another.
