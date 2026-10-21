# Final judge demo — 2 minutes 45 seconds

2026-10-22. English storyboard only; **no recording or upload**. Primary local guided path is synthetic repair. The real recorded path demonstrates rejection; a real successful repair is unavailable.

Start: `npm run build` then `npm start`; open `http://127.0.0.1:3000`. No judge key or live grant is needed. Default public production-safe runs synthetic/custom input only. Owner-private recorded replay requires the existing permitted local development profile and recordings; it is never enabled on a public host by this script.

| Time | Scene | English narration |
| --- | --- | --- |
| 0:00–0:20 | Problem / home explainer | “A plausible AI venue recommendation can still be in the wrong city or lack identity evidence. TasteGate audits the plan, repairs only what fails, and says what it cannot prove.” |
| 0:20–0:35 | Input / Start the 2-minute guided demo | “This sample is authored synthetic data. Nothing here makes a fresh Qloo request.” |
| 0:35–0:55 | Audit finding | “Here is the precise hard constraint that failed. UNKNOWN is missing evidence, not proof that a venue is bad.” |
| 0:55–1:15 | Qloo cultural evidence / candidate comparison | “Identity, geography and cultural support are separate. Query position is relative within one request. A higher cultural rank cannot override a wrong city.” |
| 1:15–1:35 | Repair attempt / mandatory checklist | “One replacement is audited again. Identity needs a second source; clicking the provider's own candidate is not independent corroboration. This successful example is labelled SYNTHETIC.” |
| 1:35–1:55 | Revalidation / trace / source link | “Every decision comes from the workflow's own findings. Follow this link to the supporting evidence record. No invented reasoning is generated afterwards.” |
| 1:55–2:25 | Before/after, then home / Compare two valid choices | “These two authored candidates both pass the same hard constraints. The cultural ordering changes their priority; the retained set stays the same. This demonstrates the mechanism, not real preference uplift.” |
| 2:25–2:45 | Results / honest takeaway | “The frozen synthetic holdout changes priority in six of fifty scored plans, with no retained-set change. Real recorded Qloo evidence demonstrates rejection of a high-ranked out-of-city candidate. Real verified repair and independent cultural quality uplift are not yet established.” |

**Recommended owner-local combined demonstration:** use the recorded NYC sample for input/identity/audit/Qloo-evidence scenes (0:20–1:15), explicitly confirm the four identities, and show the real rejected replacement. The original slot lacks established identity; the proposed replacement fails geography. Then return home and start the synthetic guided repair for scenes 1:15–1:55, followed by before/after and the separate valid-choice example. Each run keeps its own mode and report. Explain the switch: “The real case demonstrates rejection. The successful repair is authored synthetic data.” Never call the combined story a real success.

This local combined variant uses the existing recorded-sample selector and five-screen flow. Do not show or record provider-derived screens publicly until display terms are approved. The public-safe storyboard above uses synthetic evidence and public aggregates only.

Failure states: unavailable private evidence stays unavailable; an unresolved identity waits for confirmation; a timeout/limit failure remains explicit. Never switch modes automatically to manufacture a result.

Current manual usability study: NOT RUN. Automated Chromium covers the guided path, both valid-choice priorities, source links, keyboard navigation and mobile layout; exact current results are in the execution report.
