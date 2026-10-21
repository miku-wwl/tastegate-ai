import { CONTROL_ID, TREATMENT_ID } from "./ablation";
import type { AblationRow, PairedResult } from "./paired";

// The ablation, per stratum (never pooled). Three different questions, kept apart on purpose:
//   EVIDENCE_COVERAGE_GAIN                how many kept items carry cultural evidence the control does not have (coverage, NOT quality)
//   DECISION_DIFFERENCE                   how often the two gates keep a different plan
//   INDEPENDENTLY_VALIDATED_QUALITY_GAIN  plans where the treatment is strictly better on a metric the independent oracle judges from
//                                         TRUE facts (never from Qloo affinity) and not worse on another
// There is no ground truth for cultural fit that is independent of Qloo's own affinity, so quality uplift is NOT established unless the
// oracle metrics show it. The shared rules make hard-fact quality identical by construction; the honest default is a null result.
export const UPLIFT_NOT_ESTABLISHED = "QUALITY_UPLIFT_NOT_ESTABLISHED" as const;
export type EvidenceKind = "AUTHORED_SYNTHETIC" | "RECORDED_QLOO" | "LIVE_QLOO";
const ORACLE = [["shipped_violating", -1], ["shipped_unverifiable", -1], ["identity_errors", -1], ["valid_kept", 1]] as const;
type OracleMetric = typeof ORACLE[number][0];
const median = (values: number[]) => { if (!values.length) return null; const s = [...values].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]!; };
const rate = (a: number, b: number) => b ? Math.round((a / b) * 1000) / 1000 : "N/A" as const;

export function plansVerdict(r: AblationRow): "gain" | "loss" | "tie" {
  const deltas = ORACLE.map(([metric, better]) => Math.sign((r.treatment[metric] - r.control[metric]) * better));
  return deltas.some((d) => d > 0) && !deltas.some((d) => d < 0) ? "gain" : deltas.some((d) => d < 0) && !deltas.some((d) => d > 0) ? "loss" : "tie";
}
export function summarizeAblation(rows: PairedResult[], evidenceKind: EvidenceKind) {
  const sum = (pick: (r: AblationRow) => number) => rows.reduce((n, r) => n + pick(r.ablation), 0);
  const verdicts = rows.map((r) => plansVerdict(r.ablation)); const gains = verdicts.filter((v) => v === "gain").length; const losses = verdicts.filter((v) => v === "loss").length;
  const shipped = sum((r) => r.treatment.shipped); const audited = sum((r) => r.unknown.audited);
  const oracle = (metric: OracleMetric) => ({ treatment: sum((r) => r.treatment[metric]), control: sum((r) => r.control[metric]) });
  return {
    treatment: TREATMENT_ID, control: CONTROL_ID, plans: rows.length, evidence_kind: evidenceKind,
    shared_with_control: ["recommendations", "constraints", "identity decisions", "provider geography", "candidate pool", "every non-cultural rule"],
    EVIDENCE_COVERAGE_GAIN: { shipped_items: shipped, with_cultural_evidence: { treatment: sum((r) => r.shipped_with_cultural_evidence), control: 0 }, coverage_treatment: rate(sum((r) => r.shipped_with_cultural_evidence), shipped),
      note: "Coverage counts kept items that carry Qloo's query-relative evidence. It is not a statement that those items are better." },
    DECISION_DIFFERENCE: { plans_with_a_different_kept_plan: rows.filter((r) => !r.ablation.differing.same_shipped_set).length, items_only_in_treatment: sum((r) => r.differing.only_treatment), items_only_in_control: sum((r) => r.differing.only_control) },
    INDEPENDENTLY_VALIDATED_QUALITY_GAIN: { plans_treatment_strictly_better: gains, plans_control_strictly_better: losses, plans_tied: verdicts.length - gains - losses,
      oracle_metrics: { false_accepts_violating_items_shipped: oracle("shipped_violating"), items_shipped_with_nothing_proving_them: oracle("shipped_unverifiable"), wrong_identities_shipped: oracle("identity_errors"),
        valid_items_kept: oracle("valid_kept"), false_rejects_valid_items_dropped: { treatment: sum((r) => r.treatment.proposal_valid - r.treatment.valid_kept), control: sum((r) => r.control.proposal_valid - r.control.valid_kept) } },
      cultural_fit_ground_truth: "NONE_EXISTS_INDEPENDENT_OF_QLOO_AFFINITY" },
    CANDIDATE_ASSESSMENT_DIFFERENCES: { audited_items: audited, items_whose_verdict_differs: sum((r) => r.assessments.verdict_differs),
      note: "A rules-only gate cannot tell PASS from REVIEW or UNKNOWN-for-missing-evidence; these are the items whose label changes when the cultural evidence is removed." },
    EVIDENCE_SUPPORTED_RANKING: { items_with_a_cultural_ordering: { treatment: sum((r) => r.items_with_cultural_ordering), control: 0 },
      note: "An ordering position (a ranking or a discovery order) exists only with cultural evidence. It orders items for display; it decides no hard check." },
    VALID_REPAIRS: { accepted: { treatment: sum((r) => r.replacements.treatment_accepted), control: sum((r) => r.replacements.control_accepted) },
      accepted_and_valid_by_oracle: { treatment: sum((r) => r.replacements.treatment_valid), control: sum((r) => r.replacements.control_valid) },
      accepted_but_not_valid_by_oracle: { treatment: sum((r) => r.replacements.treatment_accepted - r.replacements.treatment_valid), control: sum((r) => r.replacements.control_accepted - r.replacements.control_valid) } },
    unknown_frequency: { audited_items: audited, treatment: sum((r) => r.unknown.treatment), control: sum((r) => r.unknown.rules_only), treatment_rate: rate(sum((r) => r.unknown.treatment), audited), control_rate: rate(sum((r) => r.unknown.rules_only), audited),
      note: "Items the treatment leaves UNKNOWN beyond the control are those missing cultural evidence or an unresolved taste signal; they are kept, not guessed." },
    runtime: { treatment_local_latency_ms_median: median(rows.map((r) => r.ablation.treatment.elapsed_ms)), control: "NOT_SEPARATELY_MEASURED" as const,
      note: "In-process time of the treatment's own run; the control is derived from the same run, so no separate time exists and none is invented." },
    cost: { calls_per_plan_with_cultural_evidence: rate(sum((r) => r.calls.with_cultural_evidence), rows.length), calls_per_plan_without: rate(sum((r) => r.calls.without), rows.length),
      note: "The control skips the common-set ranking request. Its elapsed time is derived from the same run and is not separately measured." },
    quality_uplift: gains > losses && gains > 0 ? "ESTABLISHED_ON_ORACLE_METRICS_ONLY" : UPLIFT_NOT_ESTABLISHED,
    reading: evidenceKind === "AUTHORED_SYNTHETIC" ? "The cultural evidence in this stratum is authored, so nothing here is evidence about Qloo." :
      "These numbers describe this stratum only. They do not show that anyone would like a recommended place.",
  };
}
export type AblationSummary = ReturnType<typeof summarizeAblation>;
