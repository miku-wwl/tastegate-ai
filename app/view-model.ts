// Pure presentation helpers shared by the client UI and unit tests. Type-only imports keep server code
// (node:crypto, fs, credentials) out of the browser bundle.
import type { AnyAuditReport, AuditInput, CandidateAudit, Entity, Finding, ProviderAuditReport, Repair, RepairOutcome, RepairReason, RepairStatus, Snapshot } from "../src/domain/contracts";

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
  REVALIDATION_ID_MISMATCH: "Identity changed on revalidation", LOOKUP_FAILED: "Lookup failed", IDENTITY_USER_CONFIRMED: "Identity confirmed by you",
};
export const STAGES = ["Validate", "Resolve", "Retrieve", "Audit", "Repair", "Revalidate", "Report"] as const;
export const isProvider = (r: AnyAuditReport): r is ProviderAuditReport => r.source_mode === "recorded_live" || r.source_mode === "authorized_live";
// The three evidence modes are never merged or blurred: each report carries exactly one, and the UI names it everywhere.
export type EvidenceMode = AnyAuditReport["source_mode"];
export const MODE_INFO: Record<EvidenceMode, { label: "FIXTURE" | "RECORDED" | "LIVE"; badge: string; tone: string; summary: string }> = {
  fixture: { label: "FIXTURE", badge: "synthetic data", tone: "synthetic", summary: "Authored synthetic data. It contains no Qloo data and no network request was made." },
  recorded_live: { label: "RECORDED", badge: "replayed Qloo responses", tone: "recorded", summary: "Owner-approved Qloo responses replayed from private storage. No new Qloo request was made." },
  authorized_live: { label: "LIVE", badge: "fresh Qloo requests (authorized)", tone: "live", summary: "Fresh Qloo responses requested under the owner's time-boxed grant. Every request is ledgered; nothing was replayed or cached." },
};
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
    if (r.usage.unavailable_operations) out.push({ tone: "unknown", text: r.source_mode === "authorized_live" ?
      `${r.usage.unavailable_operations} operation${r.usage.unavailable_operations === 1 ? " was" : "s were"} not completed (refused, failed or outside the grant) and stay${r.usage.unavailable_operations === 1 ? "s" : ""} UNKNOWN — never treated as negative.` :
      `${r.usage.unavailable_operations} operation${r.usage.unavailable_operations === 1 ? " has" : "s have"} no recorded evidence and stay UNKNOWN — never treated as negative.` });
  }
  const claims = r.input.recommendations.reduce((n, x) => n + x.claims.length, 0);
  if (claims) out.push({ tone: "review", text: `${claims} upstream claim${claims === 1 ? " remains" : "s remain"} unverified; free-text claims are never marked as supported.` });
  // Most consequential first: failures, then verified outcomes, then open evidence questions.
  const order = ["blocked", "pass", "unknown", "review", "recorded"];
  return out.sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone));
}
export type Choice = { targetId: string; kind: "preference" | "recommendation" | "replacement"; question: string;
  options: Array<{ id: string; title: string; detail: string; tags: string[] }> };
export function pendingChoices(r: ProviderAuditReport): Choice[] {
  return r.pending_confirmations.map((p) => {
    const s = snapshotFor(r, p.lookup_ref);
    const preference = r.input.preferences.find((x) => x.id === p.target_id);
    // A replacement decision is keyed "repair:<slot>"; the question is about the slot's recommendation, never an internal ID.
    const slot = p.target_kind === "replacement" ? p.target_id.slice("repair:".length) : p.target_id;
    const recommendation = r.input.recommendations.find((x) => x.id === slot);
    const subject = preference ? `${preference.text} (searched as “${preference.confirmed_anchor}”)` : recommendation?.name ?? p.target_id;
    const options = p.candidate_ids.map((id) => {
      if (s?.kind === "tag_lookup") {
        const t = s.matches.find((m) => m.id === id)!;
        return { id, title: t.name, detail: [t.type_label, t.parent_types?.length ? `used for ${t.parent_types.join(", ")}` : ""].filter(Boolean).join(" · "), tags: [] };
      }
      const e = s?.kind === "entity_lookup" ? s.matches.find((m) => m.id === id) : s?.kind === "discover_places" ? s.candidates.find((c) => c.id === id) : undefined;
      const place = e ? [e.neighborhood, e.city, e.country].filter(Boolean).join(", ") : "";
      return { id, title: e?.name ?? "Unnamed candidate", detail: [e?.kind, e?.detail && e.detail !== e.name ? e.detail : "", place].filter(Boolean).join(" · "), tags: e?.descriptive_tags ?? [] };
    });
    return { targetId: p.target_id, kind: p.target_kind, options,
      question: p.target_kind === "preference" ? `Which ${preference?.kind === "tag_concept" ? "tag" : "entity"} means ${subject}?` :
        p.target_kind === "replacement" ? `Use this proposed venue to replace “${subject}”?` : `Is this the venue the plan meant by “${subject}”?` };
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
  const c = e.capture!; const live = e.source_mode === "authorized_live";
  return { label: live ? "Live Qloo" : "Recorded Qloo", tone: live ? "live" : "recorded",
    detail: `${live ? "LIVE request" : c.probe} · GET ${c.endpoint} · HTTP ${c.http_status} · ${c.response_bytes.toLocaleString("en-US")} bytes · ${c.recorded_at.slice(0, 16).replace("T", " ")} UTC` };
}
export function describeConstraint(c: AuditInput["constraints"][number]): string {
  return c.kind === "city" ? `City is ${c.value}` : c.kind === "country" ? `Country is ${c.value}` : c.kind === "entity_type" ? "Each item is a physical place" : `At most ${c.value} items`;
}

// ---- Wizard: five screens (Input, Identity, Audit, Repair, Compare) ----
export type Screen = 1 | 2 | 3 | 4 | 5;
export const SCREENS: ReadonlyArray<{ n: Screen; id: string; label: string }> = Object.freeze([
  { n: 1, id: "input", label: "Input" }, { n: 2, id: "identity", label: "Identity" }, { n: 3, id: "audit", label: "Audit" }, { n: 4, id: "repair", label: "Repair" }, { n: 5, id: "compare", label: "Compare" }]);
export const blockingChoices = (r: ProviderAuditReport) => pendingChoices(r).filter((c) => c.kind !== "replacement");
export const replacementChoices = (r: ProviderAuditReport) => pendingChoices(r).filter((c) => c.kind === "replacement");
// After a run: a report that is waiting on identities opens the Identity screen, anything else opens the Audit.
export const screenAfterRun = (r: AnyAuditReport): Screen => isProvider(r) && blockingChoices(r).length > 0 ? 2 : 3;
export function reachableScreens(r: AnyAuditReport | null): Set<Screen> {
  if (!r) return new Set<Screen>([1]);
  const waiting = isProvider(r) && blockingChoices(r).length > 0;
  return waiting ? new Set<Screen>([1, 2]) : new Set<Screen>([1, ...(isProvider(r) ? [2 as const] : []), 3, 4, 5]);
}
export const statusText = (r: AnyAuditReport) => isProvider(r) && blockingChoices(r).length ?
  `Waiting for your confirmation: ${blockingChoices(r).length} identities.` : `Final status: ${r.final_status}. Completion: ${r.completion}.`;

// ---- Repair: one row per repair target, with an honest status and a plain-language reason ----
export const REPAIR_STATUS: Record<RepairStatus, { label: string; tone: string; icon: string }> = {
  REPAIR_VERIFIED: { label: "Repair verified", tone: "pass", icon: "✓" },
  REPAIR_REJECTED: { label: "Replacement rejected", tone: "blocked", icon: "✕" },
  REPAIR_UNAVAILABLE: { label: "Repair unavailable", tone: "unknown", icon: "–" },
  EVIDENCE_INSUFFICIENT: { label: "Evidence insufficient", tone: "review", icon: "!" },
  UNKNOWN: { label: "Unknown", tone: "unknown", icon: "?" },
};
export const REPAIR_REASON_TEXT: Record<RepairReason, string> = {
  REPLACEMENT_VERIFIED: "A replacement passed every revalidation gate: its identity was established, every hard constraint passes and taste evidence is present.",
  REPLACEMENT_FAILED_HARD_CHECK: "The proposed replacement failed a hard constraint according to the provider's own data, so it was rejected. The original is not repaired.",
  REPLACEMENT_DECLINED_BY_USER: "You declined the proposed replacement, so it was not used.",
  REPLACEMENT_AWAITING_IDENTITY_CONFIRMATION: "A replacement was proposed, but its identity cannot be established without your confirmation. Confirm or decline it below.",
  REPLACEMENT_EVIDENCE_MISSING: "A replacement was proposed, but the evidence needed to verify it is missing. It is not accepted, and it is not treated as wrong either.",
  NO_DISCOVERY_EVIDENCE: "No discovery evidence was available to propose a replacement (the request was not recorded, not authorized or did not complete). This is not a judgment about the original.",
  DISCOVERY_EMPTY: "The provider returned no candidate to propose.",
  NO_CONFIRMED_SIGNAL: "There is no confirmed taste signal to search from, so no replacement was proposed.",
  COUNT_CONSTRAINT_NOT_REPAIRABLE: "The plan has more items than the limit allows. Choosing which to drop is a decision for a person, so nothing was replaced automatically.",
  REPAIR_DISABLED: "Repair is disabled for this run.",
  CALL_BUDGET_EXHAUSTED: "The bounded call budget ran out before a replacement could be verified.",
  WORKFLOW_STOPPED: "The audit stopped before a replacement could be verified (cancelled, timed out or waiting for your input).",
};
export type RepairRow = { slot: string; name: string; outcome: RepairOutcome; repairs: Repair[]; accepted: Repair | null };
export function repairRows(r: AnyAuditReport): RepairRow[] {
  return r.repair_outcomes.map((outcome) => ({ slot: outcome.replaces, outcome, name: r.input.recommendations.find((x) => x.id === outcome.replaces)?.name ?? outcome.replaces,
    repairs: r.repairs.filter((x) => x.replaces === outcome.replaces), accepted: r.repairs.find((x) => x.replaces === outcome.replaces && x.accepted) ?? null }));
}

// ---- Comparison: the plain numbers behind "as proposed" versus "after the gate" ----
export function comparisonStats(r: AnyAuditReport) {
  const slots = slotOutcomes(r); const count = (status: RepairStatus) => r.repair_outcomes.filter((o) => o.status === status).length;
  return {
    items: slots.length,
    hardViolations: slots.filter((s) => s.audit.hard_constraints === "fail").length,
    identityNotEstablished: slots.filter((s) => s.audit.resolution !== "resolved").length,
    unverifiedClaims: r.input.recommendations.reduce((n, x) => n + x.claims.length, 0),
    keptVerified: slots.filter((s) => s.outcome === "verified" || s.outcome === "keep_review" || s.outcome === "keep_pending").length,
    replaced: slots.filter((s) => s.outcome === "replaced").length,
    removed: slots.filter((s) => s.outcome === "remove").length,
    held: slots.filter((s) => s.outcome === "hold").length,
    repairTargets: r.repair_outcomes.length, repairsProposed: r.repairs.length,
    repairVerified: count("REPAIR_VERIFIED"), repairRejected: count("REPAIR_REJECTED"), repairUnavailable: count("REPAIR_UNAVAILABLE"),
    evidenceInsufficient: count("EVIDENCE_INSUFFICIENT"), repairUnknown: count("UNKNOWN"),
    requests: isProvider(r) ? r.usage.qloo_dispatches : 0,
  };
}
