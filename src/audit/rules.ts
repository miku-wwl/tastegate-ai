import type {
  AuditInput, AuditReport, CandidateAudit, Confirmation, Entity, Finding, IdentityBasis, InsightsPolicy, PendingConfirmation,
  PreferenceResolution, ProviderMode, Repair, RepairOutcome, Snapshot, StopReason,
} from "../domain/contracts";
import { REPAIR_TARGET_PREFIX, aggregate } from "../domain/contracts";

export type EvidenceMode = "fixture" | ProviderMode;
const SOURCE_LABEL: Record<EvidenceMode, string> = {
  fixture: "Source is an authored synthetic fixture.",
  recorded_live: "Source is a recorded Qloo response field (geocode/type); no new request was made.",
  authorized_live: "Source is a Qloo response field (geocode/type) from an owner-authorized live request.",
};
const same = (a: string, b: string) => a.normalize("NFKC").trim().toLowerCase() === b.normalize("NFKC").trim().toLowerCase();
export function checkConstraints(input: AuditInput, entity: Entity | null, evidenceRef: string | null, inputRef: string, mode: EvidenceMode = "fixture"): Finding[] {
  return input.constraints.map((c): Finding => {
    const actual = c.kind === "city" ? entity?.city : c.kind === "country" ? entity?.country : c.kind === "entity_type" ? entity?.kind : input.recommendations.length;
    const state = actual == null ? "unknown" : c.kind === "max_items" ?
      (Number(actual) <= Number(c.value) ? "pass" : "fail") : (same(String(actual), String(c.value)) ? "pass" : "fail");
    const code = state === "unknown" ? "FACT_MISSING" : c.kind === "city" ? (state === "pass" ? "CITY_MATCH" : "CITY_MISMATCH") :
      c.kind === "country" ? (state === "pass" ? "COUNTRY_MATCH" : "COUNTRY_MISMATCH") : c.kind === "entity_type" ?
        (state === "pass" ? "TYPE_MATCH" : "TYPE_MISMATCH") : (state === "pass" ? "MAX_ITEMS_MATCH" : "MAX_ITEMS_EXCEEDED");
    return { code, category: "hard_constraint", state, constraint_id: c.id,
      evidence_refs: c.kind === "max_items" || !evidenceRef ? [inputRef] : [inputRef, evidenceRef],
      explanation: `${c.kind} constraint ${c.id}: ${state}. ${SOURCE_LABEL[mode]}` };
  });
}
// Facts reported by discovery for an identity that no independent lookup or user confirmation has established. A
// proven contradiction still rejects the proposal; agreement can never pass it.
export function checkUnconfirmedConstraints(input: AuditInput, entity: Entity, discoveryRef: string, inputRef: string, mode: EvidenceMode = "fixture"): Finding[] {
  return checkConstraints(input, entity, discoveryRef, inputRef, mode).map((f): Finding => {
    const kind = input.constraints.find((c) => c.id === f.constraint_id)?.kind;
    return f.state !== "pass" || kind === "max_items" ? f : { ...f, state: "unknown", code: "FACT_UNCONFIRMED",
      explanation: `${kind} constraint ${f.constraint_id}: unknown. The discovery reported a matching value, but the identity is unconfirmed.` };
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
// Repair only proven failures and slots without an identity. Missing taste evidence is a soft gate:
// replacing a verified venue would assert unsuitability without evidence.
export function repairTargets(originals: CandidateAudit[]): CandidateAudit[] {
  return [...originals.filter((a) => a.verdict === "BLOCKED"),
    ...originals.filter((a) => a.verdict !== "BLOCKED" && a.resolution === "unresolved")];
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

// Identity resolution shared by the workflow and the report validator.
type Resolution = { resolution: CandidateAudit["resolution"]; entity: Entity | null };
export const lookupMatches = (s: Snapshot | undefined): Entity[] => s?.kind === "entity_lookup" ? s.matches : [];
export function resolveOriginal(mode: EvidenceMode, lookup: Snapshot | undefined, decision?: Confirmation): Resolution {
  const matches = lookupMatches(lookup);
  if (mode === "fixture") {
    // Authored synthetic world: an exact unique label is the authored identity.
    const entity = matches.length === 1 ? matches[0]! : null;
    return { resolution: entity ? "resolved" : matches.length > 1 ? "ambiguous" : "unresolved", entity };
  }
  // Provider candidates are never selected by rank, count or label: only an explicit decision resolves.
  if (!matches.length || decision?.decision === "skip") return { resolution: "unresolved", entity: null };
  const entity = decision?.decision === "select" ? matches.find((m) => m.id === decision.ref) ?? null : null;
  return entity ? { resolution: "resolved", entity } : { resolution: "unconfirmed", entity: null };
}
export type ReplacementResolution = Resolution & { basis: IdentityBasis | null };
// A user's decision about a proposed replacement. A decision naming a different reference than the proposal is stale
// or foreign: it is not a decision at all, so the proposal stays pending.
export type ReplacementDecision = "confirmed" | "declined" | "none";
export function replacementDecision(decision: Confirmation | undefined, proposedId: string): ReplacementDecision {
  if (!decision) return "none";
  if (decision.decision === "skip") return "declined";
  return decision.ref === proposedId ? "confirmed" : "none";
}
export const replacementTarget = (slot: string) => `${REPAIR_TARGET_PREFIX}${slot}`;
// A replacement's identity needs an independent lookup that returns the very same provider identity, or the
// user's explicit confirmation of the provider's candidate details. Discovery alone never establishes identity.
export function resolveReplacement(mode: EvidenceMode, lookup: Snapshot | undefined, proposed: Entity, decision: ReplacementDecision): ReplacementResolution {
  if (mode === "fixture") { const r = resolveOriginal(mode, lookup); return { ...r, basis: r.entity ? "independent_lookup" : null }; }
  const independent = lookupMatches(lookup).find((m) => m.id === proposed.id) ?? null;
  if (independent) return { resolution: "resolved", entity: independent, basis: "independent_lookup" };
  if (decision === "confirmed") return { resolution: "resolved", entity: proposed, basis: "user_confirmation" };
  return { resolution: "unresolved", entity: null, basis: null };
}
type PreferenceKind = AuditInput["preferences"][number]["kind"];
export function preferenceCandidates(kind: PreferenceKind, lookup: Snapshot | undefined): Array<{ id: string }> {
  if (kind === "tag_concept") return lookup?.kind === "tag_lookup" ? lookup.matches : [];
  return lookupMatches(lookup).filter((m) => m.kind === (kind === "artist" ? "artist" : "movie"));
}
export function resolvePreference(kind: PreferenceKind, lookup: Snapshot | undefined, decision?: Confirmation): Pick<PreferenceResolution, "status" | "selected_id"> {
  const candidates = preferenceCandidates(kind, lookup);
  if (!candidates.length) return { status: "unresolved", selected_id: null };
  if (decision?.decision === "skip") return { status: "skipped", selected_id: null };
  const selected = decision?.decision === "select" ? candidates.find((c) => c.id === decision.ref) : undefined;
  return selected ? { status: "resolved", selected_id: selected.id } : { status: "pending", selected_id: null };
}
// Signals actually sent to Insights under the trusted host policy.
export function insightsSignals(scope: InsightsPolicy["signal_scope"], resolved: Array<{ kind: PreferenceKind; id: string }>) {
  if (scope === "first_confirmed_artist") {
    const artist = resolved.find((p) => p.kind === "artist");
    return { preference_entity_ids: artist ? [artist.id] : [], preference_tag_ids: [] as string[] };
  }
  return { preference_entity_ids: resolved.filter((p) => p.kind !== "tag_concept").map((p) => p.id),
    preference_tag_ids: resolved.filter((p) => p.kind === "tag_concept").map((p) => p.id) };
}

// What the repair step did for each target slot. `discovery` describes the one discovery request, if any.
export type OutcomeContext = {
  targets: string[]; repairs: Repair[]; decisions: ReadonlyMap<string, Confirmation>; stop: StopReason;
  hasCountFailure: boolean; hasSignal: boolean; discovery: "not_attempted" | "unavailable" | "returned";
};
const STOPPED: ReadonlySet<StopReason> = new Set(["TIMEOUT", "CANCELLED", "ADAPTER_ERROR", "PROVENANCE_REJECTED", "NEEDS_INPUT"]);
export function deriveRepairOutcomes(c: OutcomeContext): RepairOutcome[] {
  return c.targets.map((slot): RepairOutcome => {
    const mine = c.repairs.filter((r) => r.replaces === slot);
    const outcome = (status: RepairOutcome["status"], reason: RepairOutcome["reason"], repair?: Repair): RepairOutcome =>
      ({ replaces: slot, status, reason, replacement_candidate_id: repair?.replacement_candidate_id ?? null });
    const accepted = mine.find((r) => r.accepted);
    if (accepted) return outcome("REPAIR_VERIFIED", "REPLACEMENT_VERIFIED", accepted);
    if (mine.length) {
      // A proven hard-constraint or integrity failure outranks every other reason: it is the most informative.
      if (mine.every((r) => r.revalidation.verdict === "BLOCKED")) return outcome("REPAIR_REJECTED", "REPLACEMENT_FAILED_HARD_CHECK", mine[0]);
      if (mine.some((r) => replacementDecision(c.decisions.get(replacementTarget(slot)), r.proposed_entity_id) === "declined"))
        return outcome("REPAIR_REJECTED", "REPLACEMENT_DECLINED_BY_USER", mine[0]);
      const awaiting = mine.some((r) => r.revalidation.resolution === "unresolved" && r.revalidation.hard_constraints !== "fail");
      return outcome("EVIDENCE_INSUFFICIENT", awaiting ? "REPLACEMENT_AWAITING_IDENTITY_CONFIRMATION" : "REPLACEMENT_EVIDENCE_MISSING", mine[0]);
    }
    // No proposal exists for this slot: say exactly why, most specific cause first.
    if (STOPPED.has(c.stop)) return outcome("UNKNOWN", "WORKFLOW_STOPPED");
    if (c.stop === "CALL_BUDGET_EXHAUSTED") return outcome("UNKNOWN", "CALL_BUDGET_EXHAUSTED");
    if (c.hasCountFailure) return outcome("REPAIR_UNAVAILABLE", "COUNT_CONSTRAINT_NOT_REPAIRABLE");
    if (!c.hasSignal) return outcome("REPAIR_UNAVAILABLE", "NO_CONFIRMED_SIGNAL");
    if (c.discovery === "not_attempted") return outcome("REPAIR_UNAVAILABLE", "REPAIR_DISABLED");
    if (c.discovery === "unavailable") return outcome("REPAIR_UNAVAILABLE", "NO_DISCOVERY_EVIDENCE");
    return outcome("REPAIR_UNAVAILABLE", "DISCOVERY_EMPTY");
  });
}
// Non-blocking: a proposal whose only gap is its identity, with no proven hard failure and no user decision yet.
export function pendingReplacementConfirmations(repairs: Repair[], decisions: ReadonlyMap<string, Confirmation>): PendingConfirmation[] {
  return repairs.flatMap((r) => r.revalidation.resolution === "unresolved" && r.revalidation.hard_constraints !== "fail" &&
    replacementDecision(decisions.get(replacementTarget(r.replaces)), r.proposed_entity_id) === "none" && r.discovery_evidence_refs[0]
    ? [{ target_id: replacementTarget(r.replaces), target_kind: "replacement" as const, lookup_ref: r.discovery_evidence_refs[0], candidate_ids: [r.proposed_entity_id] }] : []);
}
