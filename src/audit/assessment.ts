import type { AnyAuditReport, CandidateAudit, Finding, Repair } from "../domain/contracts";

// A derived, read-only view of WHY a proposed replacement is or is not verified. It stores nothing and decides nothing: every
// field is computed from a report the validator already accepted, so it can never disagree with `Repair.accepted`.
//
// Two questions are answered separately and never blended into one score:
//   HARD_CONSTRAINT_VALIDITY   do the replacement's own facts satisfy the plan's constraints (city, country, type, size) and agree with each other?
//   CULTURAL_EVIDENCE_SUPPORT  does Qloo's query-relative evidence include it?
// A high Qloo affinity can never repair a hard violation or an unestablished identity: affinity is not an input to any hard check.
export type HardConstraintValidity = "VALID" | "INVALID" | "UNKNOWN";
export type CulturalEvidenceSupport = "SUPPORTED" | "NOT_AVAILABLE";
export type IdentityCorroboration = "INDEPENDENT_PROVIDER_LOOKUP" | "OFFICIAL_PUBLIC_REFERENCE" | "USER_CONFIRMATION_ONLY" | "NONE";
export type EvidenceLabel = "SYNTHETIC" | "RECORDED_LIVE" | "AUTHORIZED_LIVE";
export const CHECKLIST_ITEMS = ["IDENTITY", "BRANCH_CORROBORATION", "CITY", "COUNTRY", "TYPE", "OTHER_CONSTRAINTS", "CONSISTENCY", "PROVENANCE", "FRESHNESS", "CULTURAL_EVIDENCE"] as const;
export type ChecklistItemId = typeof CHECKLIST_ITEMS[number];
export type ChecklistState = "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";
export type ChecklistItem = { item: ChecklistItemId; state: ChecklistState; note: string };
export type RepairAssessment = {
  evidence_label: EvidenceLabel; hard_constraint_validity: HardConstraintValidity; cultural_evidence_support: CulturalEvidenceSupport;
  identity_corroboration: IdentityCorroboration; checklist: ChecklistItem[]; verified: boolean; first_unmet: ChecklistItemId | null;
  // A success on authored synthetic data: it is a demonstration of the rules, never evidence about real recommendations.
  synthetic_success: boolean;
};

const LABEL = { fixture: "SYNTHETIC", recorded_live: "RECORDED_LIVE", authorized_live: "AUTHORIZED_LIVE" } as const;
const worst = (states: ChecklistState[]): ChecklistState => states.includes("FAIL") ? "FAIL" : states.includes("UNKNOWN") ? "UNKNOWN" : states.length ? "PASS" : "NOT_APPLICABLE";
const hardFor = (report: AnyAuditReport, audit: CandidateAudit, kind: "city" | "country" | "entity_type" | "max_items"): ChecklistState => {
  const checks = audit.findings.filter((f) => f.category === "hard_constraint" && report.input.constraints.find((c) => c.id === f.constraint_id)?.kind === kind);
  return worst(checks.map((f): ChecklistState => f.state === "pass" ? "PASS" : f.state === "fail" ? "FAIL" : "UNKNOWN"));
};
const has = (findings: Finding[], code: Finding["code"]) => findings.some((f) => f.code === code);

export function assessRepair(report: AnyAuditReport, repair: Repair): RepairAssessment {
  const audit = repair.revalidation; const findings = audit.findings; const label = LABEL[report.source_mode];
  const cited = [...repair.discovery_evidence_refs, repair.lookup_evidence_ref].map((ref) => report.evidence.find((e) => e.evidence_id === ref));
  const discovery = repair.discovery_evidence_refs.map((ref) => report.evidence.find((e) => e.evidence_id === ref)).find((e) => e?.snapshot.kind === "discover_places");
  const capturedAt = discovery && "capture" in discovery ? discovery.capture?.recorded_at ?? null : null;
  const basis = repair.identity_basis;
  const corroboration: IdentityCorroboration = basis === "independent_lookup" ? "INDEPENDENT_PROVIDER_LOOKUP" : basis === "official_public_reference" ? "OFFICIAL_PUBLIC_REFERENCE" :
    basis === "user_confirmation" ? "USER_CONFIRMATION_ONLY" : "NONE";
  const conflict = has(findings, "FACT_CONFLICT") || has(findings, "REVALIDATION_ID_MISMATCH");
  const taste = has(findings, "TASTE_EVIDENCE_PRESENT");
  const checklist: ChecklistItem[] = [
    { item: "IDENTITY", state: audit.resolution === "resolved" ? "PASS" : "UNKNOWN",
      note: audit.resolution === "resolved" ? "The replacement's identity is established." : "The replacement's identity is not established; nothing about it is assumed." },
    { item: "BRANCH_CORROBORATION", state: conflict ? "FAIL" : corroboration === "INDEPENDENT_PROVIDER_LOOKUP" || corroboration === "OFFICIAL_PUBLIC_REFERENCE" ? "PASS" : "UNKNOWN",
      note: conflict ? "A second source contradicts the provider record." : corroboration === "INDEPENDENT_PROVIDER_LOOKUP" ? "A separate provider lookup returned the same identity." :
        corroboration === "OFFICIAL_PUBLIC_REFERENCE" ? "A reviewed official public page names the same venue, city and country." :
          corroboration === "USER_CONFIRMATION_ONLY" ? "Only your confirmation of the provider's own details: a decision, not a second source." : "No second source for this identity." },
    { item: "CITY", state: hardFor(report, audit, "city"), note: "Compared with the provider's own geocode.city (exact match; boroughs are not normalized)." },
    { item: "COUNTRY", state: hardFor(report, audit, "country"), note: "Compared with the provider's own geocode.country_code." },
    { item: "TYPE", state: hardFor(report, audit, "entity_type"), note: "The provider's entity subtype must be the requested type." },
    { item: "OTHER_CONSTRAINTS", state: hardFor(report, audit, "max_items"), note: "Plan size and any other hard constraint." },
    { item: "CONSISTENCY", state: conflict ? "FAIL" : has(findings, "FACT_MISSING") || has(findings, "FACT_UNCONFIRMED") ? "UNKNOWN" : "PASS",
      note: conflict ? "Sources disagree about this identity." : has(findings, "FACT_MISSING") || has(findings, "FACT_UNCONFIRMED") ? "A required fact is missing or only reported for an unconfirmed identity." : "No required fact is missing or contradicted." },
    { item: "PROVENANCE", state: cited.some((e) => !e) ? "FAIL" : report.source_mode !== "fixture" && !(discovery && "capture" in discovery && discovery.capture) ? "UNKNOWN" : "PASS",
      note: cited.some((e) => !e) ? "A cited evidence record is missing." : report.source_mode === "fixture" ? "Cites only authored synthetic records of this run." :
        discovery && "capture" in discovery && discovery.capture ? "Cites a provider response with an origin record, in the same mode as the run." : "The discovery has no origin record." },
    { item: "FRESHNESS", state: report.source_mode === "fixture" ? "NOT_APPLICABLE" : capturedAt ? "PASS" : "UNKNOWN",
      note: report.source_mode === "fixture" ? "Authored data has no age." : capturedAt ? `The discovery is dated ${capturedAt.slice(0, 10)}. The provider's own data freshness is not verified.` : "The discovery has no capture date." },
    { item: "CULTURAL_EVIDENCE", state: taste && !has(findings, "PREFERENCE_UNRESOLVED") ? "PASS" : "UNKNOWN",
      note: taste ? has(findings, "PREFERENCE_UNRESOLVED") ? "Present, but a taste signal is unresolved." : "Present in a query-relative ranking or discovery order. Not a probability of liking." : "No candidate-specific taste evidence; absence is not a negative score." },
  ];
  // A proven failure outranks a missing piece of evidence: it is the most informative reason (same order of precedence as the outcome reasons).
  const unmet = checklist.find((c) => c.state === "FAIL") ?? checklist.find((c) => c.state === "UNKNOWN") ?? null;
  const hard: HardConstraintValidity = audit.hard_constraints === "fail" || conflict ? "INVALID" : audit.hard_constraints === "pass" ? "VALID" : "UNKNOWN";
  return { evidence_label: label, hard_constraint_validity: hard, cultural_evidence_support: taste ? "SUPPORTED" : "NOT_AVAILABLE", identity_corroboration: corroboration,
    checklist, verified: repair.accepted, first_unmet: unmet?.item ?? null, synthetic_success: repair.accepted && report.source_mode === "fixture" };
}
export const assessReport = (report: AnyAuditReport) => report.repairs.map((repair) => ({ repair, assessment: assessRepair(report, repair) }));
