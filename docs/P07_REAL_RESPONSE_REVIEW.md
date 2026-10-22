# P07 actual response review

Executed once after exact active-session owner approval, 2026-10-22 UTC / 2026-10-23 NZDT. No raw response, provider identity, private request URL, credential or private checksum is included here.

| Layer | Observation |
| --- | --- |
| Transport | HTTP 200, 55,555 bytes, 3,388.801 ms; one dispatch; zero retries/redirects; settled ledger |
| Pre-registered interpretation | C_PARAMETER_APPARENTLY_IGNORED; the earlier parser did not recognize the observed locality path |
| Observed structure | `success`, `results.entities` and `query.localities.filter`; three place entities with candidate city/country/address/website and finite, non-increasing query-relative affinities |
| Locality | One filter locality named “New York”; ambiguous. Neither boundary enforcement nor actual parameter omission is proved. |
| Geography | All three report NYC/US; independent venue corroboration is separate |
| Integrity | Original bytes sealed without rewriting; separate observed-schema admission rechecked on use |
| Product context | Existing adapter, fixed `p07-nyc-v1` host profile, artist-only signal, take=3 and client exclusions; other contexts unavailable |
| Version | P07 provider reports v2c; historical provider reports v2b; synthetic reports v1b |
| Independent review | One exact venue/branch and a separately bound official country source admitted by the authorized host; two candidates not independently admitted |
| Outcome | One REPAIR_VERIFIED; whole authored plan UNKNOWN/partial; zero new requests during replay |

Private source metadata records actual retrieval scope and reviewer basis. The contact text came from the official page's delivered bootstrap data. Country evidence is an explicit excerpt capture from the official web reader; direct urllib returned 403. An initial saved-byte hash mismatch was refused and its draft preserved before correction.

No personal liking, hours, access, tickets, evening suitability or general quality uplift is established. [Current evidence/display gate](FINAL_QLOO_EVIDENCE_STATUS.md).
