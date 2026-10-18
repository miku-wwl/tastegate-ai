# Phase 1B.4 — Radiohead signal identity review

Preparation snapshot: the owner subsequently approved the single P05 attempt. See the [actual execution report](PHASE1B4_P05_EXECUTION_REPORT.md) for HTTP 200, private capture, UNKNOWN/exit 3 and consumed consent. Unapproved/zero-call statements below describe preparation, not that later request.

2026-10-19, Pacific/Auckland. **ACCEPTED_FOR_P05_ONLY: the intended public artist is the band Radiohead.** This is a local engineering identity review, not owner consent, a trusted product-wide ID promotion, an assertion of affinity or an executed Insights result. P01 was read locally and never repeated.

The original P01 attempt is `ed655afc-82d7-4efd-ba99-9f55bd031f27`. Its saved attempt/checkpoint/summary, raw body and private integrity record were validated. All five artist candidates were considered; a candidate was not accepted merely because it occupied result position one or had the exact label.

Independent evidence: the [public MusicBrainz Radiohead record](https://musicbrainz.org/artist/a74b1b7f-71a5-4011-9441-d0b5e4122711/details) identifies the artist as a group. Its [public structured record](https://musicbrainz.org/ws/2/artist/a74b1b7f-71a5-4011-9441-d0b5e4122711?inc=url-rels&fmt=json) links the official Radiohead homepage and a Spotify artist reference. The [band's official site](https://radiohead.com/) was separately retrieved. These are public identity references, not evidence about Qloo cross-domain recommendation behavior.

| P01 observed field | Actual local check | Interpretation |
| --- | --- | --- |
| `$.results[].entity_id` | One exact private ID recorded in a separate review artifact | Only this reviewed ID may bind the proposed P05; it is never exported in logs/review ZIP. |
| `$.results[].name/types` | One Radiohead label with artist type | Necessary context, insufficient by itself. |
| `$.results[].properties.external.musicbrainz.id` | Exact match to the independently retrieved public record's identifier | Corroborates association with the intended band. |
| `$.results[].properties.external.spotify.id` | Exact artist-path identifier match to the same public catalog's Spotify link | A second matching external reference; this is not a second independent catalog adjudication. |
| Other external references | Wikidata/Last.fm representations were not resolved by the attempted exact comparisons | Remain unverified; no numeric/Q-prefix/URL translation is invented and no contradictory meaning is inferred from an opaque value. Social accounts, audience counts and image URLs were not used as proof. |

No demonstrated conflicting artist identity appeared in the corroborated MusicBrainz/Spotify/name/type combination. Unknown representations remain quarantined, not silently repaired. Shared upstream source lineage between catalogs and Qloo is unknown. This supports the narrow signal-identity judgment; it does not establish cultural relevance, current membership, individual preferences or correctness of every attached property.

The accepted association is recorded in ignored `private/qloo-probes/p05-radiohead-identity.private.json`, with the exact selected ID, original raw hash and public-record snapshot hash. The public snapshot is also stored privately. These files are reviewer-authored assertions, not cryptographic evidence of authenticated human approval. No P05 checkpoint or approval receipt was created.

`p05-signal.ts` only verifies an existing explicit accepted review. It never chooses an ID from rank/name or accepts an arbitrary caller binding: it rechecks P01 integrity, the exact reviewed candidate, artist type, the observed external references and the hashed public corroboration snapshot. A private in-process binding is created only after those checks. A copied/fabricated binding object, missing/rejected review or different ID/type/hash fails closed. The review is checked again during durable reservation. Public profiles/CLI output contain a display marker; only the gated request assembly uses the actual private ID.

The original search observation continues to return `selected_entity_id = null`. The inspector stays synthetic, LiveQlooAdapter disabled, and all original P01–P04/P03-R files unchanged. See [P05 readiness](PHASE1B4_P05_READINESS.md) for fresh consent, exact parameter handling, budgets, actual tests and stop conditions.
