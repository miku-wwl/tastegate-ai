import { summarizeAblation, type EvidenceKind } from "./ablation-summary";
import { summarizeCandidatePriority } from "./candidate-priority";
import { summarizeRunEvidence } from "./run-metrics";
import { aggregate, pairedSigns, runPaired, type PairedResult } from "./paired";
import { POLICIES } from "./baselines";
import { errorResult, scoreCase, summarize, type CaseResult, type EvalCase, type Stratum } from "./harness";

export type PairedRow = PairedResult & { stratum: Stratum; category: string };
export const STRATA: readonly Stratum[] = ["SYNTHETIC", "SYNTHETIC_HOLDOUT", "RECORDED_LIVE", "AUTHORIZED_LIVE"];
const EVIDENCE_KIND: Record<Stratum, EvidenceKind> = { SYNTHETIC: "AUTHORED_SYNTHETIC", SYNTHETIC_HOLDOUT: "AUTHORED_SYNTHETIC", RECORDED_LIVE: "RECORDED_QLOO", AUTHORIZED_LIVE: "LIVE_QLOO" };
export type Evaluated = { results: CaseResult[]; paired: PairedRow[] };

// Runs every case through the gate (scored against its gold or invariants) and, where meaningful, through both baselines.
export async function evaluate(cases: EvalCase[]): Promise<Evaluated> {
  const results: CaseResult[] = []; const paired: PairedRow[] = [];
  for (const c of cases) {
    try {
      const built = await c.build(); const report = await built.runGate();
      results.push(scoreCase(c, report, built));
      if (c.paired) paired.push({ ...(await runPaired(c.id, built, report)), stratum: c.stratum, category: c.category });
    } catch { results.push(errorResult(c, "CASE_EXECUTION_FAILED")); }
  }
  return { results, paired };
}

// Per stratum, never pooled. A plan on which the gate paused for a human decision is NOT scored against the baselines (the
// gate has not shipped anything yet); it is counted separately so the cost of asking is visible, not hidden.
export function summarizePaired(paired: PairedRow[], strata: readonly Stratum[] = STRATA) {
  return Object.fromEntries(strata.map((stratum) => {
    const rows = paired.filter((p) => p.stratum === stratum);
    if (!rows.length) return [stratum, { status: "NOT RUN", plans: 0 }];
    const scored = rows.filter((r) => !r.scores.TASTEGATE.paused_for_human); const paused = rows.length - scored.length;
    const policies = Object.fromEntries(POLICIES.map((p) => [p, aggregate(scored, p)]));
    const finalItems = scored.reduce((n, r) => n + r.gate.final_items, 0); const withEvidence = scored.reduce((n, r) => n + r.gate.final_with_taste_evidence, 0);
    const signs = (baseline: "AS_PROPOSED" | "TOP_HIT_UNCHECKED") => ({ shipped_violating: pairedSigns(scored, baseline, "shipped_violating"),
      shipped_unverifiable: pairedSigns(scored, baseline, "shipped_unverifiable"), identity_errors: pairedSigns(scored, baseline, "identity_errors") });
    const finals: Record<string, number> = {}; for (const r of scored) finals[r.gate.final_status] = (finals[r.gate.final_status] ?? 0) + 1;
    // Plans on which the gate asked a human: what the baselines did on the same plans (they never ask).
    const asked = rows.filter((r) => r.scores.TASTEGATE.paused_for_human);
    const sum = (policy: "AS_PROPOSED" | "TOP_HIT_UNCHECKED", key: "identity_errors" | "shipped_unverifiable" | "shipped_violating") => asked.reduce((n, r) => n + r.scores[policy][key], 0);
    const pausedPlans = { plans: asked.length, gate_decisions_requested: asked.reduce((n, r) => n + r.scores.TASTEGATE.human_decisions, 0),
      baseline_identity_errors: { AS_PROPOSED: sum("AS_PROPOSED", "identity_errors"), TOP_HIT_UNCHECKED: sum("TOP_HIT_UNCHECKED", "identity_errors") },
      baseline_unverifiable_shipped: { AS_PROPOSED: sum("AS_PROPOSED", "shipped_unverifiable"), TOP_HIT_UNCHECKED: sum("TOP_HIT_UNCHECKED", "shipped_unverifiable") },
      baseline_violating_shipped: { AS_PROPOSED: sum("AS_PROPOSED", "shipped_violating"), TOP_HIT_UNCHECKED: sum("TOP_HIT_UNCHECKED", "shipped_violating") } };
    const ablation = summarizeAblation(scored, EVIDENCE_KIND[stratum]), priority = summarizeCandidatePriority(scored);
    return [stratum, { status: "RUN", plans: rows.length, scored_plans: scored.length, paused_for_human_decision: paused, paused_plans: pausedPlans, policies,
      paired_signs: { vs_AS_PROPOSED: signs("AS_PROPOSED"), vs_TOP_HIT_UNCHECKED: signs("TOP_HIT_UNCHECKED") },
      // What does Qloo's cultural evidence add? The same gate with and without it, scored by the same independent oracle.
      cultural_evidence_ablation: ablation,
      valid_candidate_priority: priority,
      evidence_completeness: summarizeRunEvidence(scored),
      cultural_decision_outcomes: {
        EVIDENCE_COVERAGE_GAIN: ablation.EVIDENCE_COVERAGE_GAIN,
        CANDIDATE_ORDER_DIFFERENCE: priority,
        VALID_REPAIR_GAIN: { treatment: ablation.VALID_REPAIRS.accepted_and_valid_by_oracle.treatment,
          control: ablation.VALID_REPAIRS.accepted_and_valid_by_oracle.control,
          note: "Same pool and hard facts; independently scored for fact validity, not cultural fit." },
        INDEPENDENT_QUALITY_GAIN: { status: "NOT_ESTABLISHED", reason: "No cultural-fit labels independent of Qloo affinity." },
      },
      gate: { final_status_counts: finals, final_items: finalItems, final_items_with_taste_evidence: withEvidence,
        taste_evidence_coverage: finalItems ? Math.round((withEvidence / finalItems) * 1000) / 1000 : "N/A" } }];
  }));
}
export { summarize };
