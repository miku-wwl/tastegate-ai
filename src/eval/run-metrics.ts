import type { AnyAuditReport } from "../domain/contracts";
import { assessReport } from "../audit/assessment";

// Observed evidence completeness, separate from correctness. Only the independent oracle can score accuracy.
export function runEvidenceMetrics(report: AnyAuditReport) {
  const audits = [...report.original_audits, ...report.repairs.map((r) => r.revalidation)];
  const checklists = assessReport(report).flatMap((r) => r.assessment.checklist).filter((i) => i.state !== "NOT_APPLICABLE");
  return { assessed_candidates: audits.length, identities_established: audits.filter((a) => a.resolution === "resolved").length,
    hard_constraints_pass: audits.filter((a) => a.hard_constraints === "pass").length,
    hard_constraints_fail: audits.filter((a) => a.hard_constraints === "fail").length,
    hard_constraints_unknown: audits.filter((a) => a.hard_constraints === "unknown" || a.hard_constraints === "not_applicable").length,
    cultural_evidence_present: audits.filter((a) => a.cultural_relevance !== null).length,
    mandatory_repair_evidence_items: checklists.length, mandatory_repair_evidence_met: checklists.filter((i) => i.state === "PASS").length,
    repair_targets: report.repair_outcomes.length, verified_repairs: report.repair_outcomes.filter((r) => r.status === "REPAIR_VERIFIED").length,
    rejected_repairs: report.repair_outcomes.filter((r) => r.status === "REPAIR_REJECTED").length,
    unavailable_repairs: report.repair_outcomes.filter((r) => r.status === "REPAIR_UNAVAILABLE").length,
    insufficient_repairs: report.repair_outcomes.filter((r) => r.status === "EVIDENCE_INSUFFICIENT").length,
    unknown_repairs: report.repair_outcomes.filter((r) => r.status === "UNKNOWN").length,
    actual_qloo_dispatches: report.usage.qloo_dispatches };
}
export function summarizeRunEvidence(rows: Array<{ evidence_metrics?: ReturnType<typeof runEvidenceMetrics> }>) {
  const measured = rows.flatMap((r) => r.evidence_metrics ? [r.evidence_metrics] : []);
  const keys = Object.keys(measured[0] ?? {}) as Array<keyof ReturnType<typeof runEvidenceMetrics>>;
  return { plans_measured: measured.length,
    counts: Object.fromEntries(keys.map((key) => [key, measured.reduce((n, r) => n + r[key], 0)])),
    reading: "Counts of observed evidence, not independent truth labels or accuracy. Candidate rates use assessed_candidates; repair rates use repair_targets; completeness uses mandatory_repair_evidence_items. Latency elsewhere is local end-to-end workflow time, not provider latency." };
}
