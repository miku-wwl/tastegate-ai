# Phase 1B.3.2 — P04 local semantic review

The local semantic-review/preparation account below precedes the separately owner-approved [single P03 execution](PHASE1B32_P03_EXECUTION_REPORT.md). Its zero-request statements describe that preparation, not the subsequent authorized dispatch. The P04 review and original evidence remain unchanged.

2026-10-18, Pacific/Auckland. **Concept-level musical-jazz association SUPPORTED FOR REVIEW; trusted tag admission UNKNOWN pending independent acceptance. Overall Phase 1B remains CONDITIONAL PASS.** The independent reviewer accepted the single P04 live probe. This phase made zero Qloo requests and selected no provider ID.

Baseline: clean main `6aba20a40e963c2a2b389a8f3f655ec7e3593d91`. Read AGENTS, the frozen strategy, P04 execution, P02 identity/schema closure, P03 controls, the shared probe engine/store/CLI and existing regression tests. No Runtime SIDE_EFFECT integration or Python archive is introduced; the AIG pin and frozen strategy remain unchanged.

## Observed facts from the original saved response

Read the original P04 response at attempt `67409a5c-ec05-4b36-8f29-ffaa7996812f` locally. The five items are at `$.results.tags`. Relevant paths are `[].name`, `[].type`, `[].parents[].type`, `[].properties.description` and other observed properties. Exact type strings, tag IDs and source fields are retained in the private review supplement. The table gives actual names and lossless category words from the observed type namespace, with the URN prefix omitted to keep identifiers private. Rows are arranged for comparison, not selection rank.

| Actual name | Observed type category words | Observed parent entity categories | Observed description/properties, paraphrased |
| --- | --- | --- | --- |
| Jazz | genre / music | artist, album | Description identifies a musical genre with improvisation and syncopation. Other properties discuss history, melody, performance, rhythm, tempo and vocals. |
| Jazz Fusion | genre / music | artist, album | Description combines jazz harmony/improvisation with rock rhythm/instruments. Similar descriptive property categories are present. |
| Jazz | genre / media | book, author | No description or other properties observed. |
| Jazz | keyword / qloo | tv_show, podcast, movie | No description or other properties observed. |
| Jazz Musician | occupation / wikidata | person | No description or other properties observed. |

There are four distinct types across five tags. The ten parent objects contain entity-type information, not observed parent tag IDs/names. They do not prove a genre-subgenre hierarchy or a particular entity-to-tag relationship. Top-level tag id is distinct from type and name. Neither top-level tag_id nor value occurs in this sample; a nested attached tag uses a different structure. No field is invented or transferred from P01/P02 search tags.

## Interpretation and independent context

The exact-name Jazz item in the music-genre category is responsibly associated with the intended **musical concept** at this bounded review level: name, musical type, artist/album context and actual descriptive content agree. This reasoning does not use response position or popularity. The [Smithsonian Music account of jazz](https://music.si.edu/story/jazz) independently discusses improvisation, syncopation and its New Orleans/African American history. That supports the broad concept, not authenticity or stability of a Qloo ID. The web reader supplied the article; a separate direct HTTP retrieval was unavailable and is recorded as such.

The two other exact-name Jazz items have different domain contexts. A book/author media category or movie/podcast/TV keyword cannot be substituted for a musical genre merely because its label matches. Their more specific meanings remain UNKNOWN without descriptions or independent taxonomy evidence. Jazz Musician denotes an occupation context around persons, not a genre preference; the namespace text alone does not establish a verified Wikidata mapping. Jazz Fusion is musically related according to its observed description but is not identical to the broad requested concept. No explicit parent edge from Jazz Fusion to Jazz was observed.

The [official Tags documentation](https://docs.qloo.com/reference/get-tags) and [official mirror](https://raw.githubusercontent.com/qloo/docs-public/main/reference/get-tags.md) distinguish a partial name query, exact tag-type filters and parental entity-type filters. These parameter definitions support keeping concepts/types separate; they do not independently resolve every returned tag's meaning. No Tag Types, Insights, entity-detail or extra-page API request was issued.

**Outcome:** a human reviewer has a supported musical-Jazz association to assess. This is a documented review conclusion, not an automatic ID selection, model score, preference prediction or trusted application admission. `selected_tag_id = null`; cultural affinity remains NOT_ESTABLISHED. No universal P04 response mapper or taxonomy schema was implemented. The immutable original runner summary remains UNKNOWN / SCHEMA_REVIEW_REQUIRED / NOT_REVIEWED; this supplementary review does not rewrite it.

## P02 preservation and integrity

The observed search projection is byte-identical to the preceding phase. Fresh local replay accepts the original five P02 movies and **437 attached tags without value**, without fabricating a default; all five P01 artists and 55 string-valued attached tags still pass. Existing tests continue to reject malformed known fields, invalid types/IDs and conflicting entities, quarantine unknown fields and preserve selected_entity_id null.

The [independently corroborated P02 external-reference review](PHASE1B31_P02_IDENTITY_REVIEW.md) remains unchanged. Local comparisons still find one title/type/year match, exact equality to the independently obtained IMDb reference, and the explicitly documented lowercase-prefix Wikidata comparison. The literal canonical-prefix mismatch is retained. No director field, provider link, new identity evidence or automatic entity selection is fabricated. Trusted movie identity remains UNKNOWN pending independent acceptance.

All **16 original P01/P02 private files and five original P04 files** match their prior private integrity records. New review supplements are stored separately. No raw provider body, tag/entity ID, raw-body hash, credential or private checkpoint is exported in the reports or ZIP. No P01/P02/P04 repeat, commit, push, deployment, Devpost mutation, LiveQlooAdapter enablement or next-phase transition occurred.

Fresh regression: typecheck/build exit 0, **365 Vitest tests in 12 files passed**, and **four real local Chromium E2E tests passed**. See [P03 readiness](PHASE1B32_P03_READINESS.md) for exact commands/timings and the remaining execution gate.
