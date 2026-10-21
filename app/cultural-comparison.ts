import type { AnyAuditReport } from "../src/domain/contracts";
import { assessRepair } from "../src/audit/assessment";
import { proposedEntity, resolvedEntity } from "./view-model";

// Presentation only: no new gate, inference, transport or selection. Read the server-validated report.
export function culturalComparison(report: AnyAuditReport) {
  const rows = [...report.original_audits.map((audit) => ({ audit, repair: null })),
    ...report.repairs.map((repair) => ({ audit: repair.revalidation, repair }))].map(({ audit, repair }) => {
    const entity = repair ? proposedEntity(report, repair)?.entity ?? null : resolvedEntity(report, audit);
    const corroborated = !repair || ["INDEPENDENT_PROVIDER_LOOKUP", "OFFICIAL_PUBLIC_REFERENCE"].includes(assessRepair(report, repair).identity_corroboration);
    const eligible = audit.resolution === "resolved" && audit.hard_constraints === "pass" && corroborated &&
      !audit.findings.some((f) => f.category === "integrity" && f.state === "fail");
    const culture = audit.cultural_relevance;
    const snapshot = report.evidence.find((e) => e.evidence_id === culture?.query_ref)?.snapshot;
    const score = report.source_mode === "fixture" || !entity || (snapshot?.kind !== "rank_places" && snapshot?.kind !== "discover_places") ? null :
      snapshot.scores?.find((s) => s.entity_id === entity.id)?.query_affinity ?? null;
    const geo = audit.findings.filter((f) => report.input.constraints.some((c) => c.id === f.constraint_id && (c.kind === "city" || c.kind === "country")));
    return { candidate_id: audit.candidate_id, entity_id: entity?.id ?? null,
      name: entity?.name ?? report.input.recommendations.find((r) => r.id === audit.candidate_id)?.name ?? "Unidentified proposal",
      role: repair ? "REPLACEMENT" as const : "ORIGINAL" as const, identity: audit.resolution,
      geography: geo.some((f) => f.state === "fail") ? "INVALID" : geo.length && geo.every((f) => f.state === "pass") ? "VALID" : "NOT_ESTABLISHED",
      hard_constraints: audit.hard_constraints, independent_identity: repair ? corroborated : null,
      cultural_evidence: culture ? "PRESENT" as const : "MISSING" as const,
      eligible, query_ref: culture?.query_ref ?? null, ordinal_rank: culture?.ordinal_rank ?? null, query_affinity: score,
      result: repair ? report.repair_outcomes.find((o) => o.replacement_candidate_id === audit.candidate_id)?.status ?? "UNKNOWN" : audit.verdict,
      evidence_refs: [...new Set([...audit.findings.flatMap((f) => f.evidence_refs), ...(culture ? [culture.query_ref] : [])])]
        .filter((ref) => report.evidence.some((e) => e.evidence_id === ref)),
      reason: !eligible ? audit.hard_constraints === "fail" ? "A failed hard constraint excludes this candidate regardless of its rank." :
        !corroborated ? "The replacement identity has no independent second source." : "Identity or required facts are not established." :
        !culture ? "Valid facts; no cultural priority can be inferred." : "Eligible under this report's identity and hard-constraint assumptions." };
  });
  const eligible = rows.filter((r, index) => r.eligible && rows.findIndex((other) => other.eligible && other.entity_id === r.entity_id) === index);
  const queries = [...new Set(eligible.map((r) => r.query_ref))];
  const commonQuery = eligible.length >= 2 && queries.length === 1 && queries[0] !== null ? queries[0]! : null;
  const base = report.evidence.find((e) => e.evidence_id === commonQuery)?.snapshot;
  const comparable = base?.kind === "rank_places" && eligible.every((r) => r.entity_id && base.ordered_entity_ids.includes(r.entity_id));
  const control = eligible.map((r) => r.candidate_id);
  const order = comparable ? [...eligible].sort((a, b) => a.query_affinity !== null && a.query_affinity === b.query_affinity ? 0 :
    (a.ordinal_rank ?? Infinity) - (b.ordinal_rank ?? Infinity)).map((r) => r.candidate_id) : [...control];
  return { source_mode: report.source_mode, rows, valid_candidates: eligible.length,
    status: eligible.length < 2 ? "INSUFFICIENT_VALID_CANDIDATES" as const : comparable ? "COMPARABLE_WITHIN_QUERY" as const : "NO_COMMON_QUERY" as const,
    control_order: control, cultural_order: order, changed_order: order.some((id, i) => id !== control[i]),
    EVIDENCE_COVERAGE_GAIN: rows.filter((r) => r.cultural_evidence === "PRESENT").length,
    CANDIDATE_ORDER_DIFFERENCE: comparable ? order.some((id, i) => id !== control[i]) : null,
    VALID_REPAIR_GAIN: "NOT_ESTABLISHED_BY_THIS_REPORT" as const, INDEPENDENT_QUALITY_GAIN: "NOT_ESTABLISHED" as const };
}
