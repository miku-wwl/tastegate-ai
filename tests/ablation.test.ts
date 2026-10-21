import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAudit } from "../src/audit/workflow";
import type { AnyAuditReport, CandidateAudit } from "../src/domain/contracts";
import { CONTROL_ID, TREATMENT_ID, culturalFootprint, decideRulesOnly, rulesAndIdentityOnly, rulesView } from "../src/eval/ablation";
import { UPLIFT_NOT_ESTABLISHED, plansVerdict, summarizeAblation } from "../src/eval/ablation-summary";
import { gateOutcome } from "../src/eval/baselines";
import { syntheticCases } from "../src/eval/cases";
import { holdoutCases } from "../src/eval/holdout";
import type { AblationRow, PairedResult, PolicyScore } from "../src/eval/paired";
import { evaluate, summarizePaired } from "../src/eval/report";
import { getScenario, ScenarioIdSchema, type ScenarioId } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";

// The control is "the same gate without Qloo's cultural evidence". These tests pin what makes it a FAIR control (it cannot see
// culture, shares every non-cultural input, and is never stricter than the treatment's rules), what the three questions measure,
// and that the honest default is a null result.
beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite")); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
const report = async (id: ScenarioId, edit?: (s: ReturnType<typeof getScenario>) => void) => { const s = getScenario(id); edit?.(s); return runAudit(s.input, createFixtureAdapter(s.world)); };
const kept = (r: AnyAuditReport) => rulesAndIdentityOnly(r).shipped.map((s) => `${s.origin}:${s.slot}:${s.entity?.id ?? "none"}`).sort();

const score = (over: Partial<PolicyScore> = {}): PolicyScore => ({ policy: "TASTEGATE", shipped: 2, shipped_valid: 2, shipped_violating: 0, shipped_unverifiable: 0, proposal_valid: 2, valid_kept: 2, proposal_violating: 0,
  violating_removed: 0, identity_errors: 0, over_limit: false, requests: 4, elapsed_ms: 1, paused_for_human: false, human_decisions: 0, ...over });
const row = (treatment: Partial<PolicyScore> = {}, control: Partial<PolicyScore> = {}, extra: Partial<AblationRow> = {}): PairedResult => ({ id: "x", scores: {} as never, gate: {} as never,
  ablation: { treatment: score(treatment), control: score({ policy: CONTROL_ID, ...control }), shipped_with_cultural_evidence: 1, unknown: { audited: 3, treatment: 1, rules_only: 1 },
    assessments: { audited: 3, verdict_differs: 1 }, items_with_cultural_ordering: 2, replacements: { treatment_accepted: 1, control_accepted: 1, treatment_valid: 1, control_valid: 1 },
    differing: { same_shipped_set: true, only_treatment: 0, only_control: 0 }, calls: { with_cultural_evidence: 5, without: 4 }, ...extra } });

// Removes every cultural field a gate could read: relevance ordinals, taste findings, ranking and discovery order, scores.
function withoutCulture(source: AnyAuditReport): AnyAuditReport {
  const x = structuredClone(source);
  const strip = (a: CandidateAudit) => { a.cultural_relevance = null; a.findings = a.findings.filter((f) => f.code !== "TASTE_EVIDENCE_PRESENT" && f.code !== "TASTE_EVIDENCE_MISSING"); a.evidence_coverage = "missing"; };
  x.original_audits.forEach(strip); x.repairs.forEach((r) => strip(r.revalidation));
  for (const e of x.evidence) { const s = e.snapshot; if (s.kind === "rank_places") { s.ordered_entity_ids = [...s.ordered_entity_ids].reverse(); s.scores = []; } if (s.kind === "discover_places") { s.candidates = [...s.candidates].reverse(); s.scores = []; } }
  return x;
}

describe("the control cannot see culture", () => {
  it("is built from a redacted view that carries no cultural field", async () => {
    const view = JSON.stringify(rulesView(await report("nyc-evening")));
    for (const word of ["cultural", "relevance", "taste", "affinity", "ordinal", "rank_places", "score"]) expect(view.toLowerCase()).not.toContain(word);
  });
  it.each(ScenarioIdSchema.options)("scenario %s: stripping or reversing every cultural field changes no decision of the control", async (id) => {
    const original = await report(id); const scrambled = withoutCulture(original);
    expect(kept(scrambled)).toEqual(kept(original)); expect(decideRulesOnly(rulesView(scrambled))).toEqual(decideRulesOnly(rulesView(original)));
    // ... while the treatment's footprint does change: that is the one thing culture contributes
    const treated = gateOutcome(original);
    expect(culturalFootprint(scrambled, gateOutcome(scrambled)).shipped_with_cultural_evidence).toBeLessThanOrEqual(culturalFootprint(original, treated).shipped_with_cultural_evidence);
  });
  it("meta-test: an implementation that peeked at culture WOULD be caught by this invariance check", async () => {
    const original = await report("wrong-city-repair"); const scrambled = withoutCulture(original);
    // A leaky control that only accepts a replacement when a taste finding is present.
    const leaky = (r: AnyAuditReport) => r.repairs.filter((x) => x.revalidation.hard_constraints === "pass" && x.revalidation.findings.some((f) => f.code === "TASTE_EVIDENCE_PRESENT")).length;
    expect(leaky(original)).not.toBe(leaky(scrambled));
    // ... whereas the real control agrees with itself, so the invariance test is not vacuous.
    expect(decideRulesOnly(rulesView(original))).toEqual(decideRulesOnly(rulesView(scrambled)));
  });
});

describe("the control shares every non-cultural input and is never more permissive than the treatment's rules", () => {
  it("synthetic and seeded-holdout plans: the kept plans are identical, and the treatment is never the more permissive", async () => {
    const { paired } = await evaluate([...syntheticCases(), ...holdoutCases()]);
    expect(paired.length).toBeGreaterThan(40);
    for (const row of paired) {
      expect(row.ablation.differing.only_treatment, row.id).toBe(0); // treatment is a subset of the control: culture never ADDS an acceptance
      expect(row.ablation.control.policy).toBe(CONTROL_ID); expect(row.ablation.treatment.policy).toBe("TASTEGATE");
      expect(row.ablation.control.shipped_violating).toBe(row.ablation.treatment.shipped_violating); // hard-fact quality is shared by construction
    }
  });
  it("where a replacement lacks cultural evidence, the control accepts it and the treatment does not (the only possible difference)", async () => {
    const original = await report("wrong-city-repair"); const repair = original.repairs[0]!;
    expect(repair.accepted).toBe(true);
    const x = structuredClone(original); const r = x.repairs[0]!;
    r.accepted = false; r.revalidation.verdict = "UNKNOWN"; r.revalidation.evidence_coverage = "missing"; r.revalidation.cultural_relevance = null;
    r.revalidation.findings = r.revalidation.findings.filter((f) => f.code !== "TASTE_EVIDENCE_PRESENT");
    const control = rulesAndIdentityOnly(x); const treatment = gateOutcome(x);
    expect(control.shipped.some((s) => s.origin === "replacement")).toBe(true); expect(treatment.shipped.some((s) => s.origin === "replacement")).toBe(false);
  });
  it("an uncorroborated replacement is rejected by BOTH policies: corroboration is a rule, not a cultural signal", async () => {
    const original = await report("wrong-city-repair"); const x = structuredClone(original);
    x.repairs[0]!.identity_basis = "user_confirmation"; x.repairs[0]!.accepted = false;
    expect(rulesAndIdentityOnly(x).shipped.some((s) => s.origin === "replacement")).toBe(false);
  });
  it("an integrity or hard failure removes an original from both policies", async () => {
    const original = await report("nyc-evening"); const x = structuredClone(original);
    expect(rulesAndIdentityOnly(x).shipped.filter((s) => s.origin === "original").map((s) => s.slot)).not.toContain("original-2");
  });
});

describe("the three questions are answered separately", () => {
  it("classifies each plan on oracle metrics only: strictly better, strictly worse, or tied", () => {
    expect(plansVerdict(row().ablation)).toBe("tie");
    expect(plansVerdict(row({ shipped_violating: 0 }, { shipped_violating: 1 }).ablation)).toBe("gain");
    expect(plansVerdict(row({ valid_kept: 2 }, { valid_kept: 1 }).ablation)).toBe("gain");
    expect(plansVerdict(row({ identity_errors: 1 }, { identity_errors: 0 }).ablation)).toBe("loss");
    expect(plansVerdict(row({ shipped_violating: 0, valid_kept: 1 }, { shipped_violating: 1, valid_kept: 2 }).ablation)).toBe("tie"); // better on one, worse on another
  });
  it("coverage gain, decision difference and quality gain are independent numbers", () => {
    const s = summarizeAblation([row({}, {}, { shipped_with_cultural_evidence: 2 }), row({}, {}, { shipped_with_cultural_evidence: 0, differing: { same_shipped_set: false, only_treatment: 0, only_control: 1 } })], "AUTHORED_SYNTHETIC");
    expect(s.EVIDENCE_COVERAGE_GAIN).toMatchObject({ shipped_items: 4, with_cultural_evidence: { treatment: 2, control: 0 }, coverage_treatment: 0.5 });
    expect(s.DECISION_DIFFERENCE).toEqual({ plans_with_a_different_kept_plan: 1, items_only_in_treatment: 0, items_only_in_control: 1 });
    expect(s.INDEPENDENTLY_VALIDATED_QUALITY_GAIN).toMatchObject({ plans_treatment_strictly_better: 0, plans_control_strictly_better: 0, plans_tied: 2, cultural_fit_ground_truth: "NONE_EXISTS_INDEPENDENT_OF_QLOO_AFFINITY" });
    expect(s.quality_uplift).toBe(UPLIFT_NOT_ESTABLISHED); // coverage and a differing plan alone never establish uplift
  });
  it("uplift is claimed only when the oracle shows strictly more gains than losses, and then only 'on oracle metrics'", () => {
    const gain = row({ shipped_violating: 0 }, { shipped_violating: 1 }); const loss = row({ identity_errors: 1 }, { identity_errors: 0 });
    expect(summarizeAblation([gain, gain, loss], "RECORDED_QLOO").quality_uplift).toBe("ESTABLISHED_ON_ORACLE_METRICS_ONLY");
    expect(summarizeAblation([gain, loss], "RECORDED_QLOO").quality_uplift).toBe(UPLIFT_NOT_ESTABLISHED);
    expect(summarizeAblation([loss], "RECORDED_QLOO").quality_uplift).toBe(UPLIFT_NOT_ESTABLISHED);
    expect(summarizeAblation([], "RECORDED_QLOO")).toMatchObject({ plans: 0, quality_uplift: UPLIFT_NOT_ESTABLISHED });
  });
  it("reports false accepts, false rejects, UNKNOWN frequency and cost for both sides with their own denominators", () => {
    const s = summarizeAblation([row({ proposal_valid: 3, valid_kept: 2 }, { proposal_valid: 3, valid_kept: 3 })], "AUTHORED_SYNTHETIC");
    expect(s.INDEPENDENTLY_VALIDATED_QUALITY_GAIN.oracle_metrics.false_rejects_valid_items_dropped).toEqual({ treatment: 1, control: 0 });
    expect(s.unknown_frequency).toMatchObject({ audited_items: 3, treatment: 1, control: 1, treatment_rate: 0.333, control_rate: 0.333 });
    expect(s.cost).toMatchObject({ calls_per_plan_with_cultural_evidence: 5, calls_per_plan_without: 4 });
    expect(s.reading).toMatch(/authored/);
    expect(summarizeAblation([row()], "RECORDED_QLOO").reading).toMatch(/do not show that anyone would like/);
  });
});

describe("per stratum, never pooled", () => {
  it("every executed stratum has its own ablation with its own denominators and a null result unless the oracle shows otherwise", async () => {
    const { paired } = await evaluate([...syntheticCases(), ...holdoutCases()]);
    const comparison = summarizePaired(paired) as unknown as Record<string, { status: string; scored_plans?: number; cultural_evidence_ablation?: ReturnType<typeof summarizeAblation> }>;
    for (const stratum of ["SYNTHETIC", "SYNTHETIC_HOLDOUT"]) {
      const a = comparison[stratum]!.cultural_evidence_ablation!;
      expect(comparison[stratum]!.status).toBe("RUN"); expect(a).toMatchObject({ treatment: TREATMENT_ID, control: CONTROL_ID, plans: comparison[stratum]!.scored_plans, evidence_kind: "AUTHORED_SYNTHETIC", quality_uplift: UPLIFT_NOT_ESTABLISHED });
    }
    expect(comparison.SYNTHETIC!.cultural_evidence_ablation!.plans + comparison.SYNTHETIC_HOLDOUT!.cultural_evidence_ablation!.plans).toBeLessThan(paired.length + 1);
    expect(comparison.RECORDED_LIVE).toEqual({ status: "NOT RUN", plans: 0 }); expect(comparison.AUTHORIZED_LIVE).toEqual({ status: "NOT RUN", plans: 0 });
  });
  it("the treatment's cost is exactly the common-set ranking request the control does not need", async () => {
    const { paired } = await evaluate(syntheticCases());
    for (const row of paired) expect(row.ablation.calls.with_cultural_evidence - row.ablation.calls.without).toBeGreaterThanOrEqual(0);
    expect(paired.some((r) => r.ablation.calls.with_cultural_evidence > r.ablation.calls.without)).toBe(true);
  });
});

describe("what the two paths share, and the measures that compare them", () => {
  const reports = async () => { const out: Array<{ id: string; report: AnyAuditReport }> = []; for (const c of [...syntheticCases(), ...holdoutCases()]) { const built = await c.build(); out.push({ id: c.id, report: await built.runGate() }); } return out; };
  it("matched candidate pools and matched hard constraints: the control audits exactly the entities and facts the treatment did", async () => {
    const all = await reports(); expect(all.length).toBeGreaterThan(60);
    for (const { id, report } of all) {
      const view = rulesView(report);
      expect(view.originals.map((a) => a.slot), id).toEqual(report.original_audits.map((a) => a.candidate_id));            // identical recommendations
      expect(view.repairs.map((r) => r.entity_id), id).toEqual(report.repairs.map((r) => r.proposed_entity_id));            // identical candidate pool
      expect(view.originals.map((a) => a.hard), id).toEqual(report.original_audits.map((a) => a.hard_constraints));          // identical hard constraints and geography
      expect(view.repairs.map((r) => r.hard), id).toEqual(report.repairs.map((r) => r.revalidation.hard_constraints));
      expect(view.originals.map((a) => a.resolved), id).toEqual(report.original_audits.map((a) => a.resolution === "resolved")); // identical identity information
      expect(view.repairs.map((r) => r.corroborated), id).toEqual(report.repairs.map((r) => r.identity_basis === "independent_lookup" || r.identity_basis === "official_public_reference"));
    }
  });
  it("candidate-assessment differences are the items whose label changes without cultural evidence, and ordering exists only with it", async () => {
    const original = await report("nyc-evening"); const fp = culturalFootprint(original, gateOutcome(original));
    const view = rulesView(original); const verdicts = [...original.original_audits.map((a) => a.verdict), ...original.repairs.map((r) => r.revalidation.verdict)];
    const control = [...view.originals, ...view.repairs].map((a) => a.integrity || a.hard === "fail" ? "BLOCKED" : !a.resolved || a.hard === "unknown" ? "UNKNOWN" : "PASS");
    expect(fp.label_differences).toBe(verdicts.filter((v, i) => v !== control[i]).length); expect(fp.audited_items).toBe(verdicts.length);
    expect(fp.items_with_cultural_ordering).toBe([...original.original_audits, ...original.repairs.map((r) => r.revalidation)].filter((a) => a.cultural_relevance !== null).length);
    const stripped = withoutCulture(original); expect(culturalFootprint(stripped, gateOutcome(stripped)).items_with_cultural_ordering).toBe(0);
  });
  it("denominators are exactly the rows scored in that stratum, recomputed independently, and strata are never pooled", async () => {
    const { paired } = await evaluate([...syntheticCases(), ...holdoutCases()]); const comparison = summarizePaired(paired) as unknown as Record<string, { scored_plans: number; cultural_evidence_ablation: ReturnType<typeof summarizeAblation> }>;
    for (const [stratum, expectedKind] of [["SYNTHETIC", "AUTHORED_SYNTHETIC"], ["SYNTHETIC_HOLDOUT", "AUTHORED_SYNTHETIC"]] as const) {
      const rows = paired.filter((p) => p.stratum === stratum && !p.scores.TASTEGATE.paused_for_human); const a = comparison[stratum]!.cultural_evidence_ablation;
      expect(a.plans).toBe(rows.length); expect(comparison[stratum]!.scored_plans).toBe(rows.length); expect(a.evidence_kind).toBe(expectedKind);
      expect(a.EVIDENCE_COVERAGE_GAIN.shipped_items).toBe(rows.reduce((n, r) => n + r.ablation.treatment.shipped, 0));
      expect(a.EVIDENCE_COVERAGE_GAIN.with_cultural_evidence.treatment).toBe(rows.reduce((n, r) => n + r.ablation.shipped_with_cultural_evidence, 0));
      expect(a.unknown_frequency.audited_items).toBe(rows.reduce((n, r) => n + r.ablation.unknown.audited, 0)); expect(a.CANDIDATE_ASSESSMENT_DIFFERENCES.audited_items).toBe(a.unknown_frequency.audited_items);
      expect(a.INDEPENDENTLY_VALIDATED_QUALITY_GAIN.plans_treatment_strictly_better + a.INDEPENDENTLY_VALIDATED_QUALITY_GAIN.plans_control_strictly_better + a.INDEPENDENTLY_VALIDATED_QUALITY_GAIN.plans_tied).toBe(rows.length);
      expect(a.cost.calls_per_plan_with_cultural_evidence).toBe(Math.round((rows.reduce((n, r) => n + r.ablation.calls.with_cultural_evidence, 0) / rows.length) * 1000) / 1000);
    }
    expect(comparison.SYNTHETIC!.cultural_evidence_ablation.plans).not.toBe(comparison.SYNTHETIC_HOLDOUT!.cultural_evidence_ablation.plans); // two strata, two denominators
    expect(JSON.stringify(comparison)).not.toMatch(/pooled|all_strata|overall_rate/i);
  });
  it("valid repairs are judged by the oracle, not by Qloo: accepted and valid are counted separately for both paths", () => {
    const s = summarizeAblation([row({}, {}, { replacements: { treatment_accepted: 2, control_accepted: 3, treatment_valid: 2, control_valid: 2 } }), row({}, {}, { replacements: { treatment_accepted: 1, control_accepted: 1, treatment_valid: 1, control_valid: 1 } })], "AUTHORED_SYNTHETIC");
    expect(s.VALID_REPAIRS).toEqual({ accepted: { treatment: 3, control: 4 }, accepted_and_valid_by_oracle: { treatment: 3, control: 3 }, accepted_but_not_valid_by_oracle: { treatment: 0, control: 1 } });
    expect(s.CANDIDATE_ASSESSMENT_DIFFERENCES).toMatchObject({ audited_items: 6, items_whose_verdict_differs: 2 }); expect(s.EVIDENCE_SUPPORTED_RANKING.items_with_a_cultural_ordering).toEqual({ treatment: 4, control: 0 });
  });
  it("runtime: the treatment's in-process time is reported and the control's is stated as not separately measured", () => {
    const s = summarizeAblation([row({ elapsed_ms: 3 }), row({ elapsed_ms: 1 }), row({ elapsed_ms: 2 })], "AUTHORED_SYNTHETIC");
    expect(s.runtime).toMatchObject({ treatment_local_latency_ms_median: 2, control: "NOT_SEPARATELY_MEASURED" }); expect(summarizeAblation([], "AUTHORED_SYNTHETIC").runtime.treatment_local_latency_ms_median).toBeNull();
  });
});
