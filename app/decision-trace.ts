// The bounded decisions the audit workflow actually made, as `condition -> action` pairs from a CLOSED vocabulary. Pure and read-only:
// every line is derived from a report the validator already accepted (verdicts, findings, repair outcomes), so it cannot describe a
// decision that did not happen, and it contains no free-form reasoning, no provider identifier and no private value.
// The workflow is deterministic code with one repair round and at most 14 evidence calls: this is its record, not an explanation an agent made up.
import type { AnyAuditReport, CandidateAudit, RepairOutcome } from "../src/domain/contracts";

export const CONDITIONS = ["IDENTITY_AMBIGUOUS", "IDENTITY_UNRESOLVED", "HARD_CONSTRAINT_FAILED", "COUNT_CONSTRAINT_FAILED", "CULTURAL_EVIDENCE_MISSING", "VERIFIED_WITH_EVIDENCE",
  "VERIFIED_NEEDS_HUMAN_REVIEW", "REPLACEMENT_WRONG_CITY", "REPLACEMENT_WRONG_COUNTRY", "REPLACEMENT_FAILED_HARD_CHECK", "REPLACEMENT_DECLINED_BY_USER", "REPLACEMENT_NOT_CORROBORATED",
  "REPLACEMENT_IDENTITY_UNCONFIRMED", "REPLACEMENT_EVIDENCE_MISSING", "VALID_REPLACEMENT_VERIFIED", "NO_SUPPORTED_CANDIDATE", "NO_CONFIRMED_SIGNAL", "REPAIR_DISABLED", "BUDGET_EXHAUSTED", "WORKFLOW_STOPPED"] as const;
export const ACTIONS = ["HUMAN_CONFIRMATION_REQUIRED", "HOLD_UNKNOWN", "REPAIR_CONSIDERED", "NOT_REPAIRABLE_BY_SWAP", "KEEP_WITH_UNKNOWN", "KEEP", "KEEP_FOR_HUMAN_REVIEW", "REPAIR_REJECTED",
  "REPAIR_VERIFIED", "REPAIR_UNAVAILABLE", "EVIDENCE_INSUFFICIENT", "STOPPED_UNKNOWN"] as const;
export type TraceCondition = typeof CONDITIONS[number];
export type TraceAction = typeof ACTIONS[number];
export type TraceStep = { slot: string; name: string; phase: "AUDIT" | "REPAIR"; condition: TraceCondition; action: TraceAction; evidence: string[]; synthetic: boolean };

// The first failing hard check of an audit, by what it checks.
const failedCodes = (a: CandidateAudit) => a.findings.filter((f) => f.category === "hard_constraint" && f.state === "fail").map((f) => f.code);

function auditStep(a: CandidateAudit): { condition: TraceCondition; action: TraceAction } {
  const failed = failedCodes(a);
  if (a.resolution === "ambiguous" || a.resolution === "unconfirmed") return { condition: "IDENTITY_AMBIGUOUS", action: "HUMAN_CONFIRMATION_REQUIRED" };
  if (a.resolution !== "resolved") return { condition: "IDENTITY_UNRESOLVED", action: "HOLD_UNKNOWN" };
  if (failed.includes("MAX_ITEMS_EXCEEDED")) return { condition: "COUNT_CONSTRAINT_FAILED", action: "NOT_REPAIRABLE_BY_SWAP" };
  if (a.verdict === "BLOCKED" || a.hard_constraints === "fail") return { condition: "HARD_CONSTRAINT_FAILED", action: "REPAIR_CONSIDERED" };
  if (a.hard_constraints === "pass" && a.evidence_coverage === "missing") return { condition: "CULTURAL_EVIDENCE_MISSING", action: "KEEP_WITH_UNKNOWN" };
  if (a.verdict === "PASS") return { condition: "VERIFIED_WITH_EVIDENCE", action: "KEEP" };
  if (a.verdict === "REVIEW") return { condition: "VERIFIED_NEEDS_HUMAN_REVIEW", action: "KEEP_FOR_HUMAN_REVIEW" };
  // Resolved, hard checks pass, evidence partly there but something unresolved elsewhere: nothing is decided, nothing is claimed.
  return { condition: "CULTURAL_EVIDENCE_MISSING", action: "KEEP_WITH_UNKNOWN" };
}
function repairStep(r: AnyAuditReport, outcome: RepairOutcome): { condition: TraceCondition; action: TraceAction } {
  const repair = r.repairs.find((x) => x.replaces === outcome.replaces);
  const failed = repair ? failedCodes(repair.revalidation) : [];
  switch (outcome.reason) {
    case "REPLACEMENT_VERIFIED": return { condition: "VALID_REPLACEMENT_VERIFIED", action: "REPAIR_VERIFIED" };
    case "REPLACEMENT_FAILED_HARD_CHECK": return { condition: failed.includes("CITY_MISMATCH") ? "REPLACEMENT_WRONG_CITY" : failed.includes("COUNTRY_MISMATCH") ? "REPLACEMENT_WRONG_COUNTRY" : "REPLACEMENT_FAILED_HARD_CHECK", action: "REPAIR_REJECTED" };
    case "REPLACEMENT_DECLINED_BY_USER": return { condition: "REPLACEMENT_DECLINED_BY_USER", action: "REPAIR_REJECTED" };
    case "REPLACEMENT_NEEDS_INDEPENDENT_CORROBORATION": return { condition: "REPLACEMENT_NOT_CORROBORATED", action: "EVIDENCE_INSUFFICIENT" };
    case "REPLACEMENT_AWAITING_IDENTITY_CONFIRMATION": return { condition: "REPLACEMENT_IDENTITY_UNCONFIRMED", action: "HUMAN_CONFIRMATION_REQUIRED" };
    case "REPLACEMENT_EVIDENCE_MISSING": return { condition: "REPLACEMENT_EVIDENCE_MISSING", action: "EVIDENCE_INSUFFICIENT" };
    case "NO_DISCOVERY_EVIDENCE": case "DISCOVERY_EMPTY": return { condition: "NO_SUPPORTED_CANDIDATE", action: "REPAIR_UNAVAILABLE" };
    case "NO_CONFIRMED_SIGNAL": return { condition: "NO_CONFIRMED_SIGNAL", action: "REPAIR_UNAVAILABLE" };
    case "COUNT_CONSTRAINT_NOT_REPAIRABLE": return { condition: "COUNT_CONSTRAINT_FAILED", action: "NOT_REPAIRABLE_BY_SWAP" };
    case "REPAIR_DISABLED": return { condition: "REPAIR_DISABLED", action: "REPAIR_UNAVAILABLE" };
    case "CALL_BUDGET_EXHAUSTED": return { condition: "BUDGET_EXHAUSTED", action: "STOPPED_UNKNOWN" };
    case "WORKFLOW_STOPPED": return { condition: "WORKFLOW_STOPPED", action: "STOPPED_UNKNOWN" };
  }
}
export function decisionTrace(r: AnyAuditReport): TraceStep[] {
  const name = (slot: string) => r.input.recommendations.find((x) => x.id === slot)?.name ?? slot;
  const synthetic = r.source_mode === "fixture";
  const steps: TraceStep[] = [];
  for (const audit of r.original_audits) {
    const { condition, action } = auditStep(audit);
    steps.push({ slot: audit.candidate_id, name: name(audit.candidate_id), phase: "AUDIT", condition, action, evidence: [...new Set(audit.findings.filter((f) => f.state === "fail" || f.state === "unknown").map((f) => f.code))].slice(0, 4), synthetic });
    for (const outcome of r.repair_outcomes.filter((o) => o.replaces === audit.candidate_id)) {
      const step = repairStep(r, outcome); const repair = r.repairs.find((x) => x.replaces === outcome.replaces);
      steps.push({ slot: audit.candidate_id, name: name(audit.candidate_id), phase: "REPAIR", ...step, synthetic,
        evidence: repair ? [...new Set(repair.revalidation.findings.filter((f) => f.state === "fail" || f.code === "IDENTITY_USER_CONFIRMED" || f.code === "IDENTITY_OFFICIAL_REFERENCE").map((f) => f.code))].slice(0, 4) : [outcome.reason] });
    }
  }
  return steps;
}
export const TRACE_NOTE = "Each line is read from the audit's own findings by deterministic code: at most 14 evidence calls, one repair round, no retries. There is no free-form agent reasoning here.";
