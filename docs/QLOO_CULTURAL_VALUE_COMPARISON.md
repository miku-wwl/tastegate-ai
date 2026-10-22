# Qloo cultural value comparison

> **2026-10-23:** frozen strata and 6/50 priority result below are unchanged. A separate P07 case now has one real independently corroborated REPAIR_VERIFIED; its whole plan remains UNKNOWN. No pair of independently corroborated P07 candidates or independent preference gain is established. [Current evidence](FINAL_QLOO_EVIDENCE_STATUS.md).

2026-10-22, Pacific/Auckland. **INDEPENDENT_QUALITY_GAIN = NOT_ESTABLISHED.**

Both arms share initial recommendations, the valid candidate pool, human-confirmed identities, geography, hard constraints and non-cultural evidence. The control keeps input order without cultural fields. Treatment priority can change only under complete coverage within one reviewed query. Tied scores imply no preference; separate queries are never compared. This changes no gate acceptance.

| Outcome | Authored development (10 scored) | Synthetic holdout (50 scored) | Recorded (one plan, 3 scored confirmation variants) |
| --- | --- | --- | --- |
| EVIDENCE_COVERAGE_GAIN | 4/5 kept items carry authored evidence | 61/68 kept items carry authored evidence | Measured locally; not evidence of preference accuracy |
| CANDIDATE_ORDER_DIFFERENCE | 1 priority change; 1 common-query valid pool | 6 changes; 22 multiple-valid pools, 16 common queries | 0: only one hard-valid candidate per pool |
| Retained-set difference | 0/10 | 0/50 | Existing retention result preserved |
| VALID_REPAIR_GAIN | 2 valid accepted versus 2 control | 16 versus 16 control | No real verified repair |
| INDEPENDENT_QUALITY_GAIN | Not established | Not established | No independent cultural labels |

The new **Compare two valid choices** product example is authored and is excluded from the frozen development/holdout evaluation. It demonstrates the difference between ranking and retention; it contributes no new real-world success count.

## Independent location check

The two original slots were fixed by the existing recorded NYC scenario before this check. Both were included, using [Blue Note's official location page](https://www.bluenotejazz.com/nyc/) and [Village Vanguard's official page](https://villagevanguard.com/), reviewed 2026-10-22. The machine-readable labels are [independent-venue-facts.json](../data/independent-venue-facts.json); they contain no Qloo IDs, scores or response fields.

Of 4 possible city/country labels: **3 supported, 1 unlabelled** (country is not explicit in the reviewed Blue Note text). Of the 3 supported fields, **1** can be compared with established provider evidence and is consistent; **2** lack established provider evidence. Those gaps are abstention, not fabricated incorrect-location labels. This check is conditional on existing human-confirmed provider identities and does not admit an official-to-Qloo identity mapping.

Selection limits: a complete census of **two existing inputs in one plan**, not a random venue sample, negative-example benchmark or satisfaction study. No source is used as a label for cultural taste, opening hours or availability. The extra facts establish neither a verified replacement nor Qloo quality uplift.

Fresh runs go to `.artifacts/evaluation/<timestamp>-<unique>/`. `results.private.json/md` stay owner-local; `summary.public.json` withholds recorded comparisons. Earlier Phase 2B/3C outputs and published data remain unchanged. Additional completeness metrics count observed evidence; independent correctness is still judged separately by the existing oracle. AUTHORIZED_LIVE remains NOT RUN.
