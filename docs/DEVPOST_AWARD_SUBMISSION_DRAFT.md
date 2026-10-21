# Devpost submission draft: TasteGate AI

2026-10-21, Pacific/Auckland. **DRAFT. Nothing was submitted, and nothing on Devpost was opened for editing.** Written for the owner to review, trim and paste. Workstream G (P1) of Phase 3B.

## 0. Official rules: verification status

| Item | Status | Basis |
| --- | --- | --- |
| Deadline | **UNVERIFIED today.** Last known reading: **2026-10-30 23:45 EDT = 2026-10-31 16:45 NZDT** (Phase 0, 2026-10-16). A secondhand roundup says the window runs 30 Sept – 30 Oct 2026 without naming a time or time zone. | `qloo.devpost.com` and `/rules` return **HTTP 403** to this tool (2026-10-21), as they did in earlier phases. Search returned no first-hand rules page. |
| Hosted, publicly reachable demo | **Probably required, UNVERIFIED.** Phase 0 recorded "working accessible application", "free judge access", "external hosting"; the secondhand roundup says "live, publicly reachable demo". | [PHASE0_SOURCES](PHASE0_SOURCES.md) S01/S02; roundup |
| Public repository + open-source license | Recorded in Phase 0; the repository is public and MIT-licensed (`LICENSE`). | S01/S02 |
| Demo video | Phase 0 read it as **not mandatory**; recheck. | S01/S02 |
| "Substantive Qloo integration" | Recorded in Phase 0. Whether recorded responses satisfy it is a question for the organizer (below). | S02 |
| Qloo data display and storage | Developer guide (read 2026-10-21): private server-side caching is fine with no time limit; **do not store Qloo response data in a public repository**; **no explicit rules on public display or attribution**; keys work through judging and are then turned off. | [developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide) |
| Eligibility, AI-assistance disclosure wording, judging weights | UNVERIFIED; Phase 0 read four equally weighted criteria and a reuse-disclosure requirement with a malformed phrase in section 4. | S02 |

**Action for the owner:** open the rules and overview in a browser and tick each row. Nothing below should be submitted before the deadline, the hosting requirement and the display terms are confirmed. Private-caching permission is **not** treated as permission to display Qloo data publicly.

## 1. Fields

**Title.** TasteGate AI

**Tagline.** The cultural quality gate for AI agents: audit a recommendation plan, repair only what fails, and say what could not be proven.

**Short description (≈50 words).** TasteGate checks an AI agent's venue recommendations against Qloo taste evidence **and** hard constraints (city, country, type, size), repairs only the failures once, re-audits every replacement from scratch, and reports `UNKNOWN` instead of guessing. A replacement counts as verified only with a second source.

## 2. The problem

AI agents recommend places that are in the wrong city, never checked, or described with claims nobody verified. "Looks plausible" is not the same as "correct": a venue with the right name can be the wrong branch, and a taste score can rank an out-of-city place first. Agent builders need a gate between the model's proposal and the user, one that is honest about what it can and cannot prove.

## 3. What TasteGate does

1. **Resolve** which provider entity each venue and taste signal means. A person confirms among the candidates; TasteGate never picks by rank, count or label.
2. **Audit** identity, hard constraints and Qloo evidence as **separate** checks. `UNKNOWN` means "no evidence", never "wrong".
3. **Repair** only blocked or unidentified items, **once**, with a replacement from Qloo discovery, audited from scratch.
4. **Verify**: `REPAIR_VERIFIED` needs identity, every hard constraint and cultural evidence, **and** a second source for the replacement's identity (a separate provider lookup or a registered official public page). The user's own click is recorded but is not a second source. A high Qloo rank never overrides a failed hard check.
5. **Report**: before/after, a decision trace in a closed vocabulary (for example `HARD_CONSTRAINT_FAILED → REPAIR_CONSIDERED`, `REPLACEMENT_WRONG_CITY → REPAIR_REJECTED`), and the limits of what was shown.

## 4. Why Qloo

Qloo supplies the **evidence layer**: identity candidates (`/search`), tag resolution (`/v2/tags`), a candidate source for replacements and a query-relative ordering (`/v2/insights`, including a shortlist ranking with `filter.results.entities`). The product is built around Qloo's own data being useful **and fallible**: in the one real shortlist query, Qloo's ordering ranked an out-of-city place above the verified NYC venue, and TasteGate kept the venue and rejected the place on the provider's own geography. That is the point of a gate.

How Qloo is used, exactly: 7 owner-approved real requests were made, one at a time (the first place search exceeded its capture budget and was not saved), and **6 captured responses** (3 `/search`, 1 `/v2/tags`, 2 `/v2/insights`) are verified against integrity manifests and **replayed read-only**; no Qloo response data is in the public repository. An opt-in **live** adapter (a fresh, ledgered, budgeted request per operation under an owner-created grant) is built and tested against doubles but **has not been run against Qloo**. A geography-filtered discovery request (P07) is prepared and awaits the owner's approval.

## 5. The agentic workflow

A bounded, deterministic state machine: **Validate → Resolve → Retrieve → Audit → Repair → Revalidate → Report**, at most 14 evidence calls, one repair round, no retries, explicit stop reasons (`COMPLETE`, `NEEDS_INPUT`, `CALL_BUDGET_EXHAUSTED`, `TIMEOUT`, `CANCELLED`, `PROVENANCE_REJECTED`, `ADAPTER_ERROR`). It contains **no LLM**: it is the gate that sits *behind* an agent. Every claim in a report is re-derived by a validator from the evidence; a forged or hand-edited report does not validate.

## 6. Demo story (2–3 minutes; see [JUDGE_DEMO_SCRIPT](JUDGE_DEMO_SCRIPT.md))

Open the app, press **Start the 2-minute guided demo**. An imaginary agent proposes three venues. One failed a hard constraint (wrong city): the card says exactly which check. TasteGate proposes one replacement and audits it from scratch: **Hard constraints: VALID**, **Cultural evidence: SUPPORTED**, second source: a separate provider lookup, labelled **SYNTHETIC SUCCESS** because the data is authored. The decision trace lists each decision. Then `/results`: the paired evaluation and an honest `QUALITY_UPLIFT_NOT_ESTABLISHED`.

## 7. Technical implementation

Next.js 16 / React 19 / TypeScript / Zod. Strict domain contracts and a validator that re-derives every claim; a closed registry of fixed Qloo request profiles; a durable reserve-before-send ledger; private, integrity-verified captures; three evidence modes that are never merged (`FIXTURE`, `RECORDED_LIVE`, `AUTHORIZED_LIVE`); runtime profiles (`production-safe` is the default and serves no private data); exact, single-use, digest-bound owner consent for every live grant and probe approval; a clean-copy privacy gate with planted canaries (91 checks); a hardened container image; real-Chromium tests. The Agentic Intent Gate Runtime archive is **not** integrated (deferred by an approved exception) and is disclosed as not used.

## 8. Evaluation

The same plan goes through three policies (ship as proposed, trust the first Qloo hit, TasteGate) on the same evidence, scored by an oracle that does not use TasteGate's rules. On the 50-plan seeded synthetic holdout: shipping as proposed passes 26 violating and 23 unverifiable items to the user, trusting the first hit passes 31 violating items, **TasteGate passes none**, at the cost of 3 valid items dropped (plans over their own size limit) and a person asked on 10 plans. A **control without Qloo's cultural evidence** shows what the evidence adds: evidence coverage on 90 % of kept items, **no change to what is kept**, and **no independently validated quality gain** (`QUALITY_UPLIFT_NOT_ESTABLISHED`), at +1 request per plan and 5 points more `UNKNOWN`. Synthetic strata are authored and say nothing about Qloo; the live stratum was **not run**.

## 9. Impact

For builders of recommendation agents: a drop-in audit that catches wrong-city and unverified items before a person acts on them, and a vocabulary for "I could not prove this". The method generalizes beyond venues to any plan whose items can be identified and checked against hard facts. We claim **no** improvement in anyone's taste outcome.

## 10. Challenges

Keeping three evidence modes honest (never silently switching); a first live-authorization rule that interpreted free text and was **replaced by exact, digest-bound consent**; deciding when a replacement may be called verified (a click on Qloo's own candidate is not independent); proving a deployment leaks nothing (a gate with planted canaries that must fail when a leak is planted).

## 11. Limitations (state these)

Quality uplift is not established; the evaluation is synthetic plus one recorded plan; city checks compare the provider's `geocode.city` exactly and borough normalization is unverified; opening hours, availability and free-text claims are not verified; quota, rate limits and key expiry are unknown; public live access is not authorized; recorded Qloo data is not displayed publicly because the developer guide is silent on public display.

## 12. Roadmap

P07 (a geography-filtered discovery) and a registered official reference for the first real `REPAIR_VERIFIED`; a human-judged taste study; a shared ledger and operator controls before any public live access; integrating the Agentic Intent Gate Runtime for durable, approved actions.

## 13. Links

- Code: <https://github.com/miku-wwl/tastegate-ai> (public, MIT)
- Live demo: **`PENDING_OWNER_HOSTING`** (not deployed; see [PUBLIC_DEPLOYMENT_PREPARATION](PUBLIC_DEPLOYMENT_PREPARATION.md))
- Video: optional; if recorded, show only the synthetic guided demo and `/results`
- Built with: Next.js, React, TypeScript, Zod, Vitest, Playwright, Docker; Qloo API (recorded responses)
- Testing instructions for judges: [README](../README.md) "Try it in two minutes"; no key or account is needed

## 14. Disclosures to make

The code was written with an AI coding assistant under the owner's direction. The Agentic Intent Gate Runtime is **not** integrated. Synthetic data is authored and labelled. No Qloo response data is published. Re-read the rules for the exact wording of the AI-assistance and reuse disclosures.

## 15. Organizer inquiry (English): DRAFT, NOT SENT

> Subject: Questions about public display, hosting and API use for our Qloo Hackathon entry (TasteGate AI)
>
> Hello Qloo team,
>
> We are preparing an entry (TasteGate AI, a quality gate that audits an AI agent's place recommendations against Qloo evidence and hard constraints). Four questions, so we do not guess:
>
> 1. **Public display.** The developer guide allows private server-side caching and forbids storing response data in a public repository, but is silent on public display. May a publicly hosted demo **display or replay Qloo-derived data** (entity names, rankings, relative affinity)? If yes, are there attribution or retention requirements? Until we hear back we will show only synthetic data publicly.
> 2. **Hosting and live access at judging.** Must the entry be a publicly reachable hosted app, or may judges use the repository and a video? Must the hosted app make live Qloo calls at judging time, or is an integration that replays responses we collected with the event key (with an opt-in live adapter that is off by default) acceptable as "substantive integration"?
> 3. **Quota and key lifetime.** Are there documented rate limits or a monthly quota for the event key, and will it stay active through the judging period?
> 4. **Deadline and deliverables.** Please confirm the submission deadline including time zone, and whether a demo video is required.
>
> Thank you,
> *(name)*

## 16. What to fix before submitting

1. Tick every row in section 0 against the live pages.
2. Decide hosting (Tier 0 recommended) and fill the link; never claim live capability the host does not have.
3. Decide P07 and, if approved, update the sections that say "prepared".
4. Re-run the full regression and the privacy gate on the exact commit that will be submitted.
