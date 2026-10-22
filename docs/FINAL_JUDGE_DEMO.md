# Final judge demo and reviewer walkthrough

2026-10-23 NZDT. English script, **2 minutes 45 seconds**. No recording/upload. Public-safe default is synthetic; recorded screens stay owner-local pending display permission.

Clean start: `npm ci --ignore-scripts --no-audit --no-fund`, `npm run build`, `npm start`; open `http://127.0.0.1:3000`. No key/account needed.

| Time | Action | English narration |
| --- | --- | --- |
| 0:00–0:20 | Home | “AI recommendations can sound convincing while identifying the wrong venue or lacking evidence. TasteGate audits, attempts one repair and shows what it can verify.” |
| 0:20–0:35 | Start guided demo | “This complete repair example is authored synthetic data. It makes no Qloo request.” |
| 0:35–0:55 | Audit | “The red card names the failed hard check. UNKNOWN means missing evidence, not that a venue is wrong.” |
| 0:55–1:20 | Repair / checks | “A replacement is audited from scratch. Identity, constraints and cultural support are separate; a second source is mandatory. This success is synthetic.” |
| 1:20–1:40 | Compare / source / export | “Here is the before-and-after result and its supporting record. JSON export is versioned and validated.” |
| 1:40–2:05 | Compare two valid choices | “Both authored choices pass the rules. Cultural evidence changes priority within one query, while the retained set stays the same.” |
| 2:05–2:25 | Audit your own recommendations | “Enter a destination, interests and existing places. Missing provider evidence stays UNKNOWN; the app never substitutes a sample.” |
| 2:25–2:45 | Results / takeaway | “The frozen synthetic holdout changes order in six of fifty scored plans, with no retained-set change. Owner-local real Qloo cases demonstrate one verified replacement and a separate rejection. Personal preference uplift is not established.” |

## Primary recorded variant — owner-local / permission required

Install the owner's admitted evidence/references only in a permitted recorded-local/development profile on loopback, with live disabled. Keep credentials absent in recorded-local; an existing .env.local must not inject one. Never copy private files into a public image.

1. Press **Try the recorded Qloo case**: historical playback, no fresh request.
2. Review and explicitly confirm the artist and original venue. No identity is selected by rank.
3. Inspect the replacement's ten mandatory checks, venue/branch link, separate country corroboration and query-relative cultural support.
4. Say: “This replacement is verified. The whole plan remains UNKNOWN because another original lacks cultural evidence. Hours, access, availability and personal liking were not checked.”
5. Open the three-candidate pool: two are **not independently revalidated**. The ambiguous locality name does not verify boundary enforcement.
6. Optionally show the original recorded evening sample as a **separate** rejection case. Never splice cases into a fictional successful itinerary.

Recorded exports/screenshots remain private. The public success stays labelled synthetic. [Evidence/display gate](FINAL_QLOO_EVIDENCE_STATUS.md).

## Optional three-reviewer script — no outreach performed

Give each reviewer a fresh public-safe session without explaining the implementation first.

| Reviewer | Task | Observe |
| --- | --- | --- |
| A, first visitor | Explain purpose after 30 seconds; finish guide and export | Purpose, next action, synthetic label, before/after |
| B, custom-input user | Enter a new city/place; submit incomplete input, fix it and run | Errors, retained input, honest UNKNOWN, no substituted scenario |
| C, evidence reviewer | Inspect ambiguity/missing culture, source links and final report; repeat by keyboard/phone width | Clarification, uncertainty, focus, table scrolling, provenance |

Reviewer C may inspect owner-local recorded cases only under the permitted display arrangement. Record actual participant consent, confusion, failed controls, timings and interpretation errors. Do not call scripted Chromium checks a human study.

**HUMAN_USABILITY_REVIEW=NOT_RUN.** Actual engineering/browser evidence is in [the release report](FINAL_PREDEPLOYMENT_REPORT.md).
