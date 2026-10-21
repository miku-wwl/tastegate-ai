import { describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/workflow";
import { compareCandidatePriority, orderWithinReviewedQuery, summarizeCandidatePriority } from "../src/eval/candidate-priority";
import { getScenario } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";

// Authored data only. The existing evaluation/holdout remains frozen; this tests the secondary comparison mechanism.
async function sample(options: { wrongCity?: boolean; missing?: boolean; reverse?: boolean } = {}) {
  const s = getScenario("valid-only");
  const second = s.world.entities.find((e) => e.id === "synthetic:place-4")!;
  s.input.recommendations.push({ id: "original-2", name: second.name, address_hint: null, claims: [] });
  if (options.wrongCity) second.city = "Elsewhere";
  s.world.rankOrder = options.missing ? [] : options.reverse === false ? ["synthetic:place-1", second.id] : [second.id, "synthetic:place-1"];
  return runAudit(s.input, createFixtureAdapter(s.world));
}
describe("priority among the same hard-constraint-valid candidates", () => {
  it("changes priority on authored evidence while preserving the entire pool, retention and report", async () => {
    const report = await sample(); const before = JSON.stringify(report); const p = compareCandidatePriority(report);
    expect(p).toMatchObject({ evidence_mode: "fixture", status: "PRIORITIZED_WITHIN_QUERY", valid_candidates: 2, changed_priority: true, quality_uplift: "QUALITY_UPLIFT_NOT_ESTABLISHED" });
    expect(p.treatment_order).toEqual([...p.control_order].reverse());
    expect(new Set(p.control_order)).toEqual(new Set(p.treatment_order)); expect(JSON.stringify(report)).toBe(before);
  });
  it("does not manufacture a change when the two orders agree", async () => {
    expect(compareCandidatePriority(await sample({ reverse: false })).changed_priority).toBe(false);
  });
  it("equal query scores establish no preference and preserve the control order (authored provider snapshot)", () => {
    const a = "qloo-ref:aaaaaaaaaaaaaaaa", b = "qloo-ref:bbbbbbbbbbbbbbbb";
    expect(orderWithinReviewedQuery([a, b], { kind: "rank_places", preference_entity_ids: [], preference_tag_ids: [],
      candidate_entity_ids: [a, b], ordered_entity_ids: [b, a], explainability: "missing",
      scores: [{ entity_id: b, query_affinity: 0.5 }, { entity_id: a, query_affinity: 0.5 }] })).toEqual([a, b]);
  });
  it("a high-ranked out-of-city place cannot enter either valid pool", async () => {
    const p = compareCandidatePriority(await sample({ wrongCity: true }));
    expect(p).toMatchObject({ status: "INSUFFICIENT_VALID_CANDIDATES", valid_candidates: 1, changed_priority: false });
    expect(p.control_order).not.toContain("synthetic:place-4");
  });
  it("abstains when the valid pool has no complete common query", async () => {
    expect(compareCandidatePriority(await sample({ missing: true }))).toMatchObject({ status: "NO_COMMON_REVIEWED_QUERY", valid_candidates: 2, changed_priority: false });
  });
  it("rejects forged cultural references instead of comparing unrelated queries", async () => {
    const r = await sample(); r.original_audits[1]!.cultural_relevance!.query_ref = "another-query";
    expect(() => compareCandidatePriority(r)).toThrow();
  });
  it("aggregates ranking differences separately from quality gains", async () => {
    const summary = summarizeCandidatePriority([{ priority: compareCandidatePriority(await sample()) }, { priority: compareCandidatePriority(await sample({ wrongCity: true })) }]);
    expect(summary).toMatchObject({ plans_checked: 2, plans_with_multiple_valid_candidates: 1, plans_with_common_reviewed_query: 1, plans_with_changed_priority: 1, quality_uplift: "QUALITY_UPLIFT_NOT_ESTABLISHED" });
  });
});
