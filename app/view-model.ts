// Pure presentation helpers shared by the client UI and unit tests. Type-only imports keep server code
// (node:crypto, fs, credentials) out of the browser bundle.
import type { AnyAuditReport, AuditInput, CandidateAudit, Entity, Finding, ProviderAuditReport, Repair, Snapshot } from "../src/domain/contracts";

export type Verdict = CandidateAudit["verdict"];
export const VERDICT: Record<Verdict, { label: string; icon: string; tone: string; description: string }> = {
  PASS: { label: "Pass", icon: "✓", tone: "pass", description: "Identity, hard constraints and taste evidence verified." },
  REVIEW: { label: "Review", icon: "!", tone: "review", description: "Identity and constraints verified; some claims or evidence need a human." },
  REPAIR_SUGGESTED: { label: "Repair suggested", icon: "↻", tone: "repair", description: "A better-supported alternative is suggested." },
  BLOCKED: { label: "Blocked", icon: "✕", tone: "blocked", description: "A hard constraint or integrity check failed." },
  UNKNOWN: { label: "Unknown", icon: "?", tone: "unknown", description: "Essential evidence is missing. Not a negative judgment." },
};
export const FINDING_LABEL: Record<Finding["code"], string> = {
  CITY_MATCH: "City matches", CITY_MISMATCH: "Wrong city", COUNTRY_MATCH: "Country matches", COUNTRY_MISMATCH: "Wrong country",
  TYPE_MATCH: "Venue type matches", TYPE_MISMATCH: "Wrong entity type", MAX_ITEMS_MATCH: "Plan size within limit",
  MAX_ITEMS_EXCEEDED: "Too many items", FACT_MISSING: "Fact not available", FACT_UNCONFIRMED: "Reported, identity unconfirmed",
  UNRESOLVED_ENTITY: "Identity not resolved", AMBIGUOUS_ENTITY: "Ambiguous identity", CONFIRMATION_REQUIRED: "Awaiting your confirmation",
  EVIDENCE_UNAVAILABLE: "No recorded evidence", TASTE_EVIDENCE_PRESENT: "Taste evidence present", TASTE_EVIDENCE_MISSING: "No taste evidence",
  CLAIM_UNVERIFIED: "Claim unverified", EXPLAINABILITY_MISSING: "No detailed attribution", PREFERENCE_UNRESOLVED: "A taste signal is unresolved",
  PROVENANCE_REJECTED: "Provenance rejected", CALL_BUDGET_EXHAUSTED: "Call budget exhausted", TIMEOUT: "Timed out", CANCELLED: "Cancelled",
  REVALIDATION_ID_MISMATCH: "Identity changed on revalidation", LOOKUP_FAILED: "Lookup failed",
};
export const STAGES = ["Validate", "Resolve", "Retrieve", "Audit", "Repair", "Revalidate", "Report"] as const;
export const isProvider = (r: AnyAuditReport): r is ProviderAuditReport => r.source_mode === "recorded_live";
export const evidenceById = (r: AnyAuditReport, ref: string | null | undefined) => ref ? r.evidence.find((e) => e.evidence_id === ref) : undefined;
export const snapshotFor = (r: AnyAuditReport, ref: string | null | undefined): Snapshot | undefined => evidenceById(r, ref)?.snapshot;
export function resolvedEntity(r: AnyAuditReport, audit: CandidateAudit): Entity | null {
  const s = snapshotFor(r, audit.resolution_evidence_ref);
  return s?.kind === "entity_lookup" ? s.matches.find((m) => m.id === audit.entity_id) ?? null : null;
}
export function proposedEntity(r: AnyAuditReport, repair: Repair): { entity: Entity; score: number | null; evidenceRef: string } | null {
  for (const ref of repair.discovery_evidence_refs) {
    const s = snapshotFor(r, ref);
    const entity = s?.kind === "discover_places" ? s.candidates.find((c) => c.id === repair.proposed_entity_id) : undefined;
    if (entity && s?.kind === "discover_places")
      return { entity, evidenceRef: ref, score: s.scores?.find((x) => x.entity_id === entity.id)?.query_affinity ?? null };
  }
  return null;
}
export type CheckTone = "pass" | "fail" | "unknown" | "pending";
// Four plain-language sub-checks so an UNKNOWN verdict still shows what did pass.
export function subChecks(audit: CandidateAudit, claims: number): Array<{ name: string; tone: CheckTone; text: string }> {
  const hard = audit.findings.filter((f) => f.category === "hard_constraint");
  const failed = hard.filter((f) => f.state === "fail").map((f) => FINDING_LABEL[f.code]);
  const identity: CheckTone = audit.resolution === "resolved" ? "pass" : audit.resolution === "unconfirmed" ? "pending" : "unknown";
  return [
    { name: "Identity", tone: identity, text: { pass: "Confirmed", pending: "Awaiting you", unknown: audit.resolution === "ambiguous" ? "Ambiguous" : "Not resolved", fail: "" }[identity] },
    { name: "Constraints", tone: audit.hard_constraints === "pass" ? "pass" : audit.hard_constraints === "fail" ? "fail" : "unknown",
      text: audit.hard_constraints === "pass" ? "All pass" : audit.hard_constraints === "fail" ? failed.join(", ") : "Unverified" },
    { name: "Taste evidence", tone: audit.cultural_relevance ? "pass" : "unknown", text: audit.cultural_relevance ? `Rank ${audit.cultural_relevance.ordinal_rank} in query` : "Not established" },
    { name: "Claims", tone: claims ? "unknown" : "pass", text: claims ? `${claims} unverified` : "None made" },
  ];
}
export type SlotOutcome = "verified" | "keep_review" | "keep_pending" | "replaced" | "remove" | "hold";
export function slotOutcomes(r: AnyAuditReport) {
  return r.original_audits.map((audit) => {
    const repairs = r.repairs.filter((x) => x.replaces === audit.candidate_id);
    const accepted = repairs.find((x) => x.accepted);
    const outcome: SlotOutcome = accepted ? "replaced" : audit.verdict === "PASS" ? "verified" :
      audit.verdict === "BLOCKED" ? "remove" : r.final_candidate_ids.includes(audit.candidate_id) ? "keep_review" :
        audit.resolution === "resolved" && audit.hard_constraints === "pass" ? "keep_pending" : "hold";
    return { audit, repairs, accepted, outcome, recommendation: r.input.recommendations.find((x) => x.id === audit.candidate_id)! };
  });
}
export const OUTCOME_TEXT: Record<SlotOutcome, { title: string; tone: string; note: string }> = {
  verified: { title: "Keep — verified", tone: "pass", note: "No change needed for this slot." },
  keep_review: { title: "Keep — needs human review", tone: "review", note: "Verified identity and constraints; a person should review the remaining claims or evidence." },
  keep_pending: { title: "Keep — cultural fit not yet established", tone: "unknown",
    note: "Identity and every hard constraint are verified. Missing taste evidence is a soft gate: TasteGate does not replace a verified venue without evidence against it." },
  replaced: { title: "Replace — revalidated alternative", tone: "pass", note: "" },
  remove: { title: "Remove — failed a hard check", tone: "blocked", note: "No replacement passed independent revalidation within the bounded repair round." },
  hold: { title: "Hold — identity or evidence missing", tone: "unknown", note: "No replacement passed independent revalidation within the bounded repair round and available evidence." },
};
const failedChecks = (a: CandidateAudit) => a.findings.filter((f) => f.category === "hard_constraint" && f.state === "fail").map((f) => FINDING_LABEL[f.code].toLowerCase());
// Plain-language findings for the top of the result, derived only from the validated report.
export function highlights(r: AnyAuditReport): Array<{ tone: string; text: string }> {
  const out: Array<{ tone: string; text: string }> = [];
  for (const { audit, repairs, accepted, outcome, recommendation } of slotOutcomes(r)) {
    if (outcome === "remove") out.push({ tone: "blocked", text: `${recommendation.name}: ${failedChecks(audit).join(", ") || "an integrity check failed"}.` });
    if (accepted) out.push({ tone: "pass", text: `${recommendation.name} replaced by ${proposedEntity(r, accepted)?.entity.name ?? "an alternative"} after an independent lookup and common-set ranking.` });
    for (const rejected of repairs.filter((x) => !x.accepted)) {
      const failed = failedChecks(rejected.revalidation);
      out.push({ tone: "blocked", text: `Rejected the proposed replacement ${proposedEntity(r, rejected)?.entity.name ?? ""} for ${recommendation.name}: ${failed.length ?
        `${failed.join(" and ")}, according to the provider's own data` : "its identity, constraints or taste evidence could not be confirmed"}.` });
    }
    if (outcome === "keep_pending") out.push({ tone: "unknown", text: `${recommendation.name}: identity and all hard constraints verified; cultural fit not yet established.` });
    if (outcome === "verified") out.push({ tone: "pass", text: `${recommendation.name}: identity, hard constraints and taste evidence verified.` });
  }
  if (isProvider(r)) {
    const picks = r.confirmations.filter((c) => c.decision === "select").length;
    if (picks) out.push({ tone: "recorded", text: `${picks} identit${picks === 1 ? "y" : "ies"} confirmed by you among Qloo candidates; none were selected automatically.` });
    if (r.usage.unavailable_operations) out.push({ tone: "unknown", text: `${r.usage.unavailable_operations} operation${r.usage.unavailable_operations === 1 ? " has" : "s have"} no recorded evidence and stay UNKNOWN — never treated as negative.` });
  }
  const claims = r.input.recommendations.reduce((n, x) => n + x.claims.length, 0);
  if (claims) out.push({ tone: "review", text: `${claims} upstream claim${claims === 1 ? " remains" : "s remain"} unverified; free-text claims are never marked as supported.` });
  // Most consequential first: failures, then verified outcomes, then open evidence questions.
  const order = ["blocked", "pass", "unknown", "review", "recorded"];
  return out.sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone));
}
export type Choice = { targetId: string; kind: "preference" | "recommendation"; question: string;
  options: Array<{ id: string; title: string; detail: string; tags: string[] }> };
export function pendingChoices(r: ProviderAuditReport): Choice[] {
  return r.pending_confirmations.map((p) => {
    const s = snapshotFor(r, p.lookup_ref);
    const preference = r.input.preferences.find((x) => x.id === p.target_id);
    const recommendation = r.input.recommendations.find((x) => x.id === p.target_id);
    const subject = preference ? `${preference.text} (searched as “${preference.confirmed_anchor}”)` : recommendation?.name ?? p.target_id;
    const options = p.candidate_ids.map((id) => {
      if (s?.kind === "tag_lookup") {
        const t = s.matches.find((m) => m.id === id)!;
        return { id, title: t.name, detail: [t.type_label, t.parent_types?.length ? `used for ${t.parent_types.join(", ")}` : ""].filter(Boolean).join(" · "), tags: [] };
      }
      const e = s?.kind === "entity_lookup" ? s.matches.find((m) => m.id === id) : undefined;
      return { id, title: e?.name ?? id, detail: [e?.kind, e?.detail && e.detail !== e.name ? e.detail : ""].filter(Boolean).join(" · "), tags: e?.descriptive_tags ?? [] };
    });
    return { targetId: p.target_id, kind: p.target_kind, options,
      question: p.target_kind === "preference" ? `Which ${preference?.kind === "tag_concept" ? "tag" : "entity"} means ${subject}?` : `Is this the venue the plan meant by “${subject}”?` };
  });
}
export function stageCalls(r: AnyAuditReport): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of r.trace) if (t.call_id) counts[t.state] = (counts[t.state] ?? 0) + 1;
  return counts;
}
export function reachedStages(r: AnyAuditReport): Set<string> { return new Set(r.trace.map((t) => t.state)); }
export function evidenceSource(r: AnyAuditReport, ref: string): { label: string; tone: string; detail: string } {
  const e = evidenceById(r, ref);
  if (!e) return { label: "Missing", tone: "blocked", detail: "Reference not found" };
  if (e.source_mode === "fixture") return { label: "Synthetic", tone: "synthetic", detail: e.snapshot.kind === "input" ? "Authored input" : `Authored fixture · ${e.operation}` };
  if (e.provider === "user") return { label: "Input", tone: "neutral", detail: "Authored plan and your confirmations" };
  if (e.provider === "tastegate") return { label: "Unavailable", tone: "unknown", detail: e.snapshot.kind === "unavailable" ? e.snapshot.detail : "" };
  const c = e.capture!;
  return { label: "Recorded Qloo", tone: "recorded", detail: `${c.probe} · GET ${c.endpoint} · HTTP ${c.http_status} · ${c.response_bytes.toLocaleString("en-US")} bytes · ${c.recorded_at.slice(0, 16).replace("T", " ")} UTC` };
}
export function describeConstraint(c: AuditInput["constraints"][number]): string {
  return c.kind === "city" ? `City is ${c.value}` : c.kind === "country" ? `Country is ${c.value}` : c.kind === "entity_type" ? "Each item is a physical place" : `At most ${c.value} items`;
}
