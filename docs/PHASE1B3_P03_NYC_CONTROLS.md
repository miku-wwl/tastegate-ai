# Phase 1B.3 — P03 NYC place controls

2026-10-18, Pacific/Auckland. **PLAN ONLY; zero requests; no executable P03 profile or consent.**

## Independently reviewed public controls

| Control | Exact proposed query | Independently established fact | Future interpretation |
| --- | --- | --- | --- |
| NYC location | Blue Note New York | 131 West 3rd Street, New York, NY 10012, from the venue's [official contact page](https://www.bluenotejazz.com/nyc/contact/) | Link the actual provider candidate to this branch and usable geography before a NYC finding. |
| Wrong city | Blue Note Tokyo | 〒107-0062 東京都港区南青山6-3-16, from the venue's [official access page](https://www.bluenote.co.jp/jp/access/) | A candidate linked to this Tokyo branch must fail the NYC constraint. |
| Branch ambiguity | Blue Note | The two official sources establish distinct New York and Tokyo venues sharing the Blue Note name. | A bare shared name cannot select a branch; missing branch evidence => AMBIGUOUS/UNKNOWN. |

These public controls are independent of Qloo. No Qloo IDs, coordinates, provider addresses or expected results are invented. The sources establish venue locations, not provider coverage, current availability or branch ownership equivalence. The third control is an ambiguous query, not an invented third address.

## Documented request profiles

The [official Search reference](https://docs.qloo.com/reference/get-search) confirms GET /search, string query, types including urn:entity:place, take and page. Proposed URLs:

```text
https://hackathon.api.qloo.com/search?query=Blue+Note+New+York&types=urn%3Aentity%3Aplace&take=5&page=1
https://hackathon.api.qloo.com/search?query=Blue+Note+Tokyo&types=urn%3Aentity%3Aplace&take=5&page=1
https://hackathon.api.qloo.com/search?query=Blue+Note&types=urn%3Aentity%3Aplace&take=5&page=1
```

The documented filter.location, filter.radius and filter.address are omitted: a NYC search restriction would filter away the wrong-city control and confound later location validation. A city word in query text proves no returned geography. No guessed coordinates/address-filter syntax is sent.

Future proposed accounting: at most three separately approved attempts, one request per control, sequentially, no automatic next control/retry; each <=4000 ms / <=65536 bytes / no redirects. This plan authorizes **none**. Each exact request needs its own reviewed profile, approval, attempt, ledger and private evidence. P03 is absent from the executable registry/CLI.

## Actual geography evidence needed

- Privately inspect actual place identity/type and geography fields. P01 artist properties establish no place address/city/country/coordinate response path. Review observed paths/types/units/meaning/missingness before implementing mapping.
- Link a candidate to the independent branch using actual address and reviewed public-domain/external identity evidence. Name/rank/popularity alone is insufficient. No silent geocoding, provider-link fetching or extra page.
- Establish NYC membership using verified branch address/city/state/country or actual usable coordinates with reviewed coordinate conventions and independent NYC boundary evidence. Missing, conflicting or boundary-ambiguous geography => UNKNOWN. An assumed search radius is not NYC's boundary.
- Supported Tokyo identity proves wrong-city rejection independently of jazz relevance. Supported New York identity/geography may pass location only, not affinity, opening hours or availability.
- Retain absent results and conflicting/ambiguous candidates. Even one result for Blue Note does not prove catalog-wide uniqueness; do not force a shared public name into a preferred branch.

Separate public facts, provider observations, identity review and audit outcomes. Do not relabel synthetic NYC fixtures as live data. **Do not execute P03 in Phase 1B.3.**
