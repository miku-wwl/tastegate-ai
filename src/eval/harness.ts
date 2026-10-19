import type { AnyAuditReport, CandidateAudit } from "../domain/contracts";

// Strata are never pooled: each is summarized separately with its own denominators.
export type Stratum = "SYNTHETIC" | "RECORDED_LIVE" | "LIVE_EXECUTED";
export type Gold = {
  // Applicable hard-constraint violations a correct gate must flag, by slot ("repair:N" = Nth proposed replacement).
  violations: Array<{ slot: string; constraint: string }>;
  // Originals whose identity and hard facts are valid: blocking them is a false rejection.
  validOriginals: string[];
  // Originals with no resolvable identity in the available evidence: claiming one would be fabrication.
  unresolvable: string[];
  // Proposed replacements that should be accepted / rejected after revalidation.
  validRepairs: number; invalidRepairs: number;
  // Identities that require an explicit human decision (provider candidates); auto-selection is a failure.
  requiresConfirmation: number;
  expectStop: AnyAuditReport["stop_reason"];
};
export type EvalCase = { id: string; stratum: Stratum; category: string; description: string; gold: Gold; run: () => Promise<AnyAuditReport> };
type Ratio = { numerator: number; denominator: number };
export type CaseResult = {
  id: string; stratum: Stratum; category: string; description: string; status: "PASS" | "FAIL" | "ERROR";
  stop_reason: string | null; final_status: string | null; elapsed_ms: number | null; adapter_calls: number | null; qloo_dispatches: number | null;
  violations_detected: Ratio; false_rejections: Ratio; fabricated_identities: Ratio; repairs_valid_accepted: Ratio; repairs_invalid_rejected: Ratio;
  auto_selected_identities: number; claims_marked_supported: Ratio; failures: string[];
};
const auditFor = (r: AnyAuditReport, slot: string): CandidateAudit | undefined => slot.startsWith("repair:") ?
  r.repairs[Number(slot.slice("repair:".length))]?.revalidation : r.original_audits.find((a) => a.candidate_id === slot);
export function scoreCase(c: EvalCase, r: AnyAuditReport): CaseResult {
  const g = c.gold; const failures: string[] = [];
  const detected = g.violations.filter((v) => auditFor(r, v.slot)?.findings.some((f) => f.constraint_id === v.constraint && f.state === "fail")).length;
  const falseRejections = g.validOriginals.filter((id) => auditFor(r, id)?.verdict === "BLOCKED").length;
  const fabricated = g.unresolvable.filter((id) => auditFor(r, id)?.resolution === "resolved").length;
  const accepted = r.repairs.filter((x) => x.accepted).length; const rejected = r.repairs.filter((x) => !x.accepted).length;
  // Provider identities resolved without a matching explicit decision would be automatic promotion.
  const autoSelected = r.source_mode === "recorded_live" ? [
    ...r.preference_resolution.filter((p) => p.status === "resolved" && !r.confirmations.some((c) => c.target_id === p.preference_id && c.decision === "select")),
    ...r.original_audits.filter((a) => a.resolution === "resolved" && !r.confirmations.some((c) => c.target_id === a.candidate_id && c.decision === "select")),
  ].length : 0;
  const claims = r.input.recommendations.reduce((n, x) => n + x.claims.length, 0);
  const supported = r.original_audits.filter((a) => (r.input.recommendations.find((x) => x.id === a.candidate_id)?.claims.length ?? 0) > 0 &&
    !a.findings.some((f) => f.code === "CLAIM_UNVERIFIED")).length;
  if (detected !== g.violations.length) failures.push(`violations detected ${detected}/${g.violations.length}`);
  if (falseRejections) failures.push(`false rejections ${falseRejections}`);
  if (fabricated) failures.push(`fabricated identities ${fabricated}`);
  if (accepted !== g.validRepairs) failures.push(`valid repairs accepted ${accepted}/${g.validRepairs}`);
  if (rejected !== g.invalidRepairs) failures.push(`invalid repairs rejected ${rejected}/${g.invalidRepairs}`);
  if (autoSelected) failures.push(`auto-selected identities ${autoSelected}`);
  if (supported) failures.push(`claims marked supported ${supported}`);
  if (r.stop_reason !== g.expectStop) failures.push(`stop ${r.stop_reason} != ${g.expectStop}`);
  if (g.requiresConfirmation && (r.source_mode !== "recorded_live" || r.pending_confirmations.length !== g.requiresConfirmation))
    failures.push(`pending confirmations != ${g.requiresConfirmation}`);
  if (r.usage.qloo_dispatches !== 0) failures.push("unexpected Qloo dispatch");
  return { id: c.id, stratum: c.stratum, category: c.category, description: c.description, status: failures.length ? "FAIL" : "PASS",
    stop_reason: r.stop_reason, final_status: r.final_status, elapsed_ms: Math.round(r.usage.elapsed_ms * 100) / 100,
    adapter_calls: r.source_mode === "fixture" ? r.usage.fixture_calls : r.usage.adapter_calls, qloo_dispatches: r.usage.qloo_dispatches,
    violations_detected: { numerator: detected, denominator: g.violations.length },
    false_rejections: { numerator: falseRejections, denominator: g.validOriginals.length },
    fabricated_identities: { numerator: fabricated, denominator: g.unresolvable.length },
    repairs_valid_accepted: { numerator: Math.min(accepted, g.validRepairs), denominator: g.validRepairs },
    repairs_invalid_rejected: { numerator: Math.min(rejected, g.invalidRepairs), denominator: g.invalidRepairs },
    auto_selected_identities: autoSelected, claims_marked_supported: { numerator: supported, denominator: claims }, failures };
}
export function errorResult(c: EvalCase, message: string): CaseResult {
  const zero = { numerator: 0, denominator: 0 };
  return { id: c.id, stratum: c.stratum, category: c.category, description: c.description, status: "ERROR", stop_reason: null, final_status: null,
    elapsed_ms: null, adapter_calls: null, qloo_dispatches: null, violations_detected: zero, false_rejections: zero, fabricated_identities: zero,
    repairs_valid_accepted: zero, repairs_invalid_rejected: zero, auto_selected_identities: 0, claims_marked_supported: zero, failures: [message] };
}
const sum = (rows: CaseResult[], key: keyof Pick<CaseResult, "violations_detected" | "false_rejections" | "fabricated_identities" |
  "repairs_valid_accepted" | "repairs_invalid_rejected" | "claims_marked_supported">): Ratio & { rate: number | "N/A" } => {
  const numerator = rows.reduce((n, r) => n + r[key].numerator, 0); const denominator = rows.reduce((n, r) => n + r[key].denominator, 0);
  return { numerator, denominator, rate: denominator ? Math.round((numerator / denominator) * 1000) / 1000 : "N/A" };
};
const percentile = (values: number[], p: number) => {
  if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};
// One summary per stratum; a stratum with no executed case is NOT RUN, never 0% or 100%.
export function summarize(results: CaseResult[], strata: Stratum[] = ["SYNTHETIC", "RECORDED_LIVE", "LIVE_EXECUTED"]) {
  return Object.fromEntries(strata.map((s) => {
    const rows = results.filter((r) => r.stratum === s && r.status !== "ERROR");
    if (!rows.length) return [s, { status: "NOT RUN", cases: results.filter((r) => r.stratum === s).length }];
    const latency = rows.flatMap((r) => r.elapsed_ms === null ? [] : [r.elapsed_ms]);
    return [s, { status: "RUN", cases: rows.length, cases_passed: rows.filter((r) => r.status === "PASS").length,
      errors: results.filter((r) => r.stratum === s && r.status === "ERROR").length,
      hard_violation_detection: sum(rows, "violations_detected"), false_rejection: sum(rows, "false_rejections"),
      fabricated_identity: sum(rows, "fabricated_identities"), valid_repair_acceptance: sum(rows, "repairs_valid_accepted"),
      invalid_repair_rejection: sum(rows, "repairs_invalid_rejected"), claims_marked_supported: sum(rows, "claims_marked_supported"),
      auto_selected_identities: rows.reduce((n, r) => n + r.auto_selected_identities, 0),
      adapter_calls_total: rows.reduce((n, r) => n + (r.adapter_calls ?? 0), 0), qloo_dispatches_total: rows.reduce((n, r) => n + (r.qloo_dispatches ?? 0), 0),
      local_latency_ms: { samples: latency.length, p50: percentile(latency, 50), p95: percentile(latency, 95), max: latency.length ? Math.max(...latency) : null } }];
  }));
}
