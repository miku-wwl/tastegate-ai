import type { AuditInput, AuditReport, CandidateAudit, Entity, Finding, Repair } from "../domain/contracts";
import { aggregate } from "../domain/contracts";

const same = (a: string, b: string) => a.normalize("NFKC").trim().toLowerCase() === b.normalize("NFKC").trim().toLowerCase();
export function checkConstraints(input: AuditInput, entity: Entity | null, evidenceRef: string | null, inputRef: string): Finding[] {
  return input.constraints.map((c): Finding => {
    const actual = c.kind === "city" ? entity?.city : c.kind === "country" ? entity?.country : c.kind === "entity_type" ? entity?.kind : input.recommendations.length;
    const state = actual == null ? "unknown" : c.kind === "max_items" ?
      (Number(actual) <= Number(c.value) ? "pass" : "fail") : (same(String(actual), String(c.value)) ? "pass" : "fail");
    const code = state === "unknown" ? "FACT_MISSING" : c.kind === "city" ? (state === "pass" ? "CITY_MATCH" : "CITY_MISMATCH") :
      c.kind === "country" ? (state === "pass" ? "COUNTRY_MATCH" : "COUNTRY_MISMATCH") : c.kind === "entity_type" ?
        (state === "pass" ? "TYPE_MATCH" : "TYPE_MISMATCH") : (state === "pass" ? "MAX_ITEMS_MATCH" : "MAX_ITEMS_EXCEEDED");
    return { code, category: "hard_constraint", state, constraint_id: c.id,
      evidence_refs: c.kind === "max_items" || !evidenceRef ? [inputRef] : [inputRef, evidenceRef],
      explanation: `${c.kind} constraint ${c.id}: ${state}. Source is an authored synthetic fixture.` };
  });
}
export function hardState(findings: Finding[]): CandidateAudit["hard_constraints"] {
  const checks = findings.filter((f) => f.category === "hard_constraint");
  return checks.some((f) => f.state === "fail") ? "fail" : checks.some((f) => f.state === "unknown") ? "unknown" : "pass";
}
export function candidateVerdict(a: Omit<CandidateAudit, "verdict">): CandidateAudit["verdict"] {
  if (a.findings.some((f) => f.category === "integrity") || a.hard_constraints === "fail") return "BLOCKED";
  if (a.resolution !== "resolved" || a.hard_constraints === "unknown" || a.evidence_coverage === "missing" ||
      a.findings.some((f) => f.code === "PREFERENCE_UNRESOLVED")) return "UNKNOWN";
  if (a.evidence_coverage === "partial" || a.findings.some((f) => f.code === "CLAIM_UNVERIFIED")) return "REVIEW";
  return "PASS";
}
export function reportSummary(originals: CandidateAudit[], repairs: Repair[], unresolved: string[], stop: AuditReport["stop_reason"]) {
  const effective = originals.map((a) => repairs.find((r) => r.replaces === a.candidate_id && r.accepted)?.revalidation ?? a);
  let final_status = aggregate(effective, unresolved.length > 0);
  if (stop === "PROVENANCE_REJECTED") final_status = "BLOCKED";
  else if (stop !== "COMPLETE" && final_status !== "BLOCKED") final_status = "UNKNOWN";
  return {
    before_status: aggregate(originals, unresolved.length > 0), final_status,
    completion: (stop !== "COMPLETE" || unresolved.length > 0 || effective.some((a) => a.verdict === "UNKNOWN") ? "partial" : "complete") as AuditReport["completion"],
    final_candidate_ids: effective.filter((a) => ["PASS", "REVIEW", "REPAIR_SUGGESTED"].includes(a.verdict)).map((a) => a.candidate_id),
  };
}
