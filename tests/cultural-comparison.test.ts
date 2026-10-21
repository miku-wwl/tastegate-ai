import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { culturalComparison } from "../app/cultural-comparison";
import { CulturalComparisonView } from "../app/cultural-comparison-view";
import { decisionTrace } from "../app/decision-trace";
import { runAudit } from "../src/audit/workflow";
import { getScenario, type ScenarioId } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";
import { runEvidenceMetrics } from "../src/eval/run-metrics";
import { evaluateIndependentFacts } from "../src/eval/independent-facts";
async function run(id: ScenarioId) { const s = getScenario(id); return runAudit(s.input, createFixtureAdapter(s.world)); }
describe("judge-facing cultural comparison", () => {
  it("changes priority among two valid authored choices without changing the report or retained pool", async () => {
    const report = await run("valid-pool-priority"), before = JSON.stringify(report), c = culturalComparison(report);
    expect(c.status).toBe("COMPARABLE_WITHIN_QUERY"); expect(c.valid_candidates).toBe(2); expect(c.changed_order).toBe(true);
    expect(new Set(c.control_order)).toEqual(new Set(c.cultural_order)); expect(JSON.stringify(report)).toBe(before);
    expect(c.rows.every((r) => r.query_affinity === null)).toBe(true);
    const html = renderToStaticMarkup(createElement(CulturalComparisonView, { report }));
    for (const label of ["SYNTHETIC", "Rules and identity only", "The retained set is unchanged", "Independent quality gain: NOT ESTABLISHED", "Open evidence record"]) expect(html).toContain(label);
  });
  it("excludes failed hard checks and abstains without complete common-query evidence", async () => {
    const c = culturalComparison(await run("nyc-evening"));
    expect(c.rows.filter((r) => r.hard_constraints === "fail").every((r) => !r.eligible)).toBe(true);
    const s = getScenario("valid-pool-priority"); s.world.rankOrder = [];
    const missing = culturalComparison(await runAudit(s.input, createFixtureAdapter(s.world)));
    expect(missing.status).toBe("NO_COMMON_QUERY"); expect(missing.CANDIDATE_ORDER_DIFFERENCE).toBeNull();
  });
  it("keeps duplicate slots for one venue out of a purported two-candidate comparison", async () => {
    const s = getScenario("valid-only");
    s.input.recommendations.push({ ...s.input.recommendations[0]!, id: "another-slot" });
    expect(culturalComparison(await runAudit(s.input, createFixtureAdapter(s.world))).valid_candidates).toBe(1);
  });
  it("missing geographic facts remain unestablished rather than being inferred from a matching city", async () => {
    const s = getScenario("valid-only"); s.world.entities.find((e) => e.id === "synthetic:place-1")!.country = null;
    const c = culturalComparison(await runAudit(s.input, createFixtureAdapter(s.world)));
    expect(c.rows[0]!.geography).toBe("NOT_ESTABLISHED"); expect(c.rows[0]!.eligible).toBe(false);
  });
  it("links every decision only to actual evidence and keeps evidence completeness separate from accuracy", async () => {
    const report = await run("wrong-city-repair");
    for (const step of decisionTrace(report)) {
      expect(step.evidence_refs.length).toBeGreaterThan(0);
      expect(step.evidence_refs.every((ref) => report.evidence.some((e) => e.evidence_id === ref))).toBe(true);
    }
    const m = runEvidenceMetrics(report);
    expect(m.actual_qloo_dispatches).toBe(0);
    expect(m.mandatory_repair_evidence_met).toBe(m.mandatory_repair_evidence_items);
    expect(m.verified_repairs).toBe(1);
    expect(() => evaluateIndependentFacts(report as never)).toThrow("INDEPENDENT_LABEL_CONTEXT_MISMATCH");
  });
});
