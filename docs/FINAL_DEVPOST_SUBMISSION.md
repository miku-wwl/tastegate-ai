# TasteGate AI — final English submission draft

Copy-ready content, not submitted. `PUBLIC_DEMO_URL=PENDING_OWNER_HOSTING`. Exact validation accompanies [the predeployment report](FINAL_PREDEPLOYMENT_REPORT.md). Insert an owner-verified public URL only after deployment.

## Project name

TasteGate AI

## Tagline

The Cultural Quality Gate for AI Agents.

## One-sentence description

TasteGate audits an AI agent's place recommendations against hard constraints and Qloo cultural evidence, attempts one bounded repair, and shows exactly what was verified or remains unknown.

## Problem

A plausible recommendation can still identify the wrong venue, violate the destination constraint or promise a personal fit that nobody checked. Agent builders need a reliable check between a generated plan and a person acting on it.

## Solution

TasteGate separates identity, hard validity and cultural support. It checks the proposed plan, asks for identity clarification when needed, proposes replacements only for failed or unidentified items, and revalidates each replacement from scratch. A replacement is verified only with independent identity corroboration and every mandatory check. Missing evidence remains UNKNOWN.

## How it works

Provide the destination, interests, constraints and up to three existing recommendations, or start the guided sample. Follow Input → Identity → Audit → Repair → Compare. Read concise findings first; open source records and the decision trace when needed. Export a validated, versioned JSON report for an upstream agent.

## Why Qloo is essential

Ordinary rules can compare a known city or type with a constraint. They do not supply an artist-to-place relationship or a cultural ordering. Qloo provides entity candidates, taste-tag resolution, cross-domain replacement discovery and query-relative ranking. TasteGate uses those signals without treating them as a probability of liking or letting them override hard constraints.

## Agentic decision flow

Validate → Resolve → Retrieve → Audit → Repair → Revalidate → Report. The product-owned deterministic workflow permits at most 14 evidence calls, one repair round and no retries. It is a tool behind a recommendation agent; it does not contain an LLM, generate hidden reasoning or book anything. Trace entries are derived from actual findings.

## Real Qloo case study

Two distinct owner-local recorded cases demonstrate the gate. In the original case, a highly ranked replacement was outside the required city and was rejected. In the new P07 case, one candidate from an owner-approved request was independently corroborated against official sources and passed every replacement check. **The replacement is verified; the whole plan remains UNKNOWN/partial** because another original item lacks cultural evidence.

P07 was one actual event-API request. Subsequent playback makes zero new requests. Its response reports three NYC/US places, but the locality name is ambiguous, so we do not claim that the requested boundary was proved. Raw responses and provider identifiers remain private.

## Technical architecture

Next.js, React, TypeScript and Zod implement a five-screen application, strict input/report contracts and a graph validator that re-derives decisions. A recorded Qloo adapter verifies private captures and exact request contexts. Fixed live profiles require separate, single-use owner consent and durable reservation. Production-safe disables both private replay and provider calls. Docker and ordinary Node hosting use a validating standalone startup wrapper.

Agentic Intent Gate Runtime integration is deferred and **not used** in this application; no shared Runtime code was copied.

## User experience

A no-key guided synthetic repair explains the product in two minutes. A prominent custom-input action opens the real bounded form. Source labels distinguish authored data, historical provider playback and fresh execution. Technical owner controls stay on demand. Keyboard navigation, mobile layout, invalid input, malformed reports and recovery are exercised in Chromium.

## Results and validation

The frozen 50-plan scored synthetic holdout retains its earlier result: 6 plans change candidate priority within comparable cultural queries; none changes the retained set against the rules-only control. These are authored cases, not a real-world accuracy estimate. Separate recorded evaluation now includes one source-corroborated replacement, with ten mandatory checks met, while preserving the original rejection case. No independent human preference uplift is claimed.

The final local release verification exited 0: 1392 unit/integration tests, 21 Chromium checks, 91 deployment checks, 19 production smoke checks, a separate 19-check clean-install smoke and 19 actual Docker checks passed. An additional five-flow engineering walkthrough passed; no human study is claimed. The leak self-test deliberately injected faults and detected them. These local results do not establish a public deployment.

## Impact

For teams building recommendation agents, TasteGate offers an auditable boundary between a plausible suggestion and a defensible result. It preserves useful cultural evidence, catches hard failures and makes uncertainty actionable. The delivered domain is places; broader domains are future work.

## What we built

Custom input and JSON import; identity clarification; constraint audit; Qloo-backed discovery/ranking; independently corroborated repair; mandatory revalidation; before/after comparison; source-linked decision trace; versioned JSON export; isolated evidence modes; local production verification and deployment packaging.

## Challenges

HTTP success was not enough to establish semantics. The actual P07 locality shape differed from the pre-registered parser, and its name remained ambiguous. We kept the original classification, reviewed the observed schema separately and validated candidate facts independently. Public caching permission also could not be treated as public-display permission.

## What we learned

Cultural support, geographic validity, venue identity and personal satisfaction are different questions. A high rank cannot repair a failed hard check. One verified replacement is meaningful product progress without becoming a claim of general recommendation quality.

## Limitations

The synthetic holdout is authored. Recorded evidence covers a small, fixed context. Independent preference quality, opening hours, availability, tickets and free-text claims are not verified. Two P07 candidates have not been independently admitted. Public display of recorded provider-derived fields needs organizer clarification; public live access is not authorized. No human usability study has been conducted.

## Future roadmap

Resolve the exact display/judge-access permission, deploy the reviewed safe release on owner-provided hosting, verify the public URL and collect real user feedback. Any fresh provider request or production integration needs its own scope and approval.

## Links and disclosures

- GitHub: https://github.com/miku-wwl/tastegate-ai
- Public demo: `PENDING_OWNER_HOSTING`
- License: MIT, preserved in the repository.
- Demo script: [FINAL_JUDGE_DEMO.md](FINAL_JUDGE_DEMO.md); no video recorded or uploaded.
- AI coding assistance was used under the owner's direction. The guided success is synthetic; owner-local real cases are labelled recorded playback. No raw Qloo response data is published.

## Owner-only submission checks

Confirm eligibility and account-specific fields, the permitted real-Qloo judge experience, availability dates and the actual demo URL. The official [rules](https://qloo.devpost.com/rules) require a working integration, functional demo link, public licensed repository and English materials. Video is optional. The fetched rules list November 2–5 judging, differing from the handover's November 2–16; confirm rather than silently shortening access.
