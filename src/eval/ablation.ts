import type { AnyAuditReport, CandidateAudit } from "../domain/contracts";
import { isCorroborated } from "../audit/rules";
import { entityInReport, type PolicyOutcome, type ShippedItem } from "./baselines";

// A FAIR CONTROL for "what does Qloo's cultural evidence add?". It is not a naive baseline: it is the same gate with the cultural
// evidence taken away. It shares, because it is derived from the very same run:
//   the recommendations and constraints, the identity decisions, the provider geography, the candidate pool (the replacements
//   TasteGate audited) and every non-cultural rule (identity, corroboration, city, country, type, size, consistency).
// It differs in exactly one thing: it neither collects nor uses cultural evidence (the common-set ranking, discovery order,
// query-relative affinity). It is built from a REDACTED view of the report, so no cultural field can influence it by construction,
// and a test scrambles the cultural evidence to prove the control does not move.
export const CONTROL_ID = "RULES_AND_IDENTITY_ONLY" as const;
export const TREATMENT_ID = "TASTEGATE_WITH_QLOO_CULTURAL_EVIDENCE" as const;
export type ControlId = typeof CONTROL_ID;

type RulesAudit = { slot: string; entity_id: string | null; resolved: boolean; hard: CandidateAudit["hard_constraints"]; integrity: boolean };
export type RulesView = { originals: RulesAudit[]; repairs: Array<RulesAudit & { corroborated: boolean }>; rank_calls: number };
const audit = (slot: string, a: CandidateAudit): RulesAudit =>
  ({ slot, entity_id: a.entity_id, resolved: a.resolution === "resolved", hard: a.hard_constraints, integrity: a.findings.some((f) => f.category === "integrity") });
// The ONLY fields the control may read. No cultural_relevance, no taste finding, no ranking or discovery order, no affinity.
export function rulesView(report: AnyAuditReport): RulesView {
  return {
    originals: report.original_audits.map((a) => audit(a.candidate_id, a)),
    repairs: report.repairs.map((r) => ({ ...audit(r.replaces, r.revalidation), entity_id: r.proposed_entity_id, corroborated: isCorroborated(r.identity_basis) })),
    // Calls that exist only to collect cultural evidence (the ranking), counted for the cost comparison. Not an input to any decision.
    rank_calls: report.evidence.filter((e) => e.snapshot.kind === "rank_places" || (e.snapshot.kind === "unavailable" && e.snapshot.request.operation === "rank_places")).length,
  };
}
// Keep an original whose identity is established and whose hard facts pass; accept a replacement that does the same AND is corroborated.
// Missing cultural evidence changes neither (the original gate treats it as a soft gate for originals).
// What a rules-and-identity assessment would call an audited item. It has no PASS/REVIEW distinction (that distinction comes from cultural
// evidence and claims), so a resolved item whose hard facts pass is simply PASS.
export type RulesVerdict = "PASS" | "UNKNOWN" | "BLOCKED";
export const rulesVerdict = (a: RulesAudit): RulesVerdict => a.integrity || a.hard === "fail" ? "BLOCKED" : !a.resolved || a.hard === "unknown" ? "UNKNOWN" : "PASS";
export function decideRulesOnly(view: RulesView): { keptOriginals: string[]; acceptedRepairs: number[] } {
  const sound = (a: RulesAudit) => a.resolved && a.hard === "pass" && !a.integrity;
  return { keptOriginals: view.originals.filter(sound).map((a) => a.slot), acceptedRepairs: view.repairs.flatMap((r, i) => sound(r) && r.corroborated ? [i] : []) };
}
export function rulesAndIdentityOnly(report: AnyAuditReport): PolicyOutcome {
  const view = rulesView(report); const decided = decideRulesOnly(view);
  const shipped: ShippedItem[] = [
    ...report.original_audits.filter((a) => decided.keptOriginals.includes(a.candidate_id)).map((a) => ({ slot: a.candidate_id, entity: entityInReport(report, a.entity_id), origin: "original" as const })),
    ...decided.acceptedRepairs.map((i) => ({ slot: report.repairs[i]!.replaces, entity: entityInReport(report, report.repairs[i]!.proposed_entity_id), origin: "replacement" as const })),
  ];
  const provider = report.source_mode !== "fixture" ? report : null;
  const calls = (report.source_mode === "fixture" ? report.usage.fixture_calls : report.usage.adapter_calls) - view.rank_calls;
  return { policy: CONTROL_ID, shipped, requests: calls, elapsed_ms: 0, paused_for_human: report.stop_reason === "NEEDS_INPUT", notes: ["derived from the same run; elapsed time is not separately measured"],
    human_decisions: provider ? provider.pending_confirmations.length + provider.confirmations.length : 0 };
}
// What the treatment attaches that the control does not: items that carry cultural evidence, and how many audited items remain UNKNOWN.
export function culturalFootprint(report: AnyAuditReport, outcome: PolicyOutcome) {
  const evidenceFor = new Map<string, boolean>([
    ...report.original_audits.map((a) => [`original:${a.candidate_id}`, a.cultural_relevance !== null] as const),
    ...report.repairs.map((r) => [`replacement:${r.replaces}`, r.revalidation.cultural_relevance !== null] as const),
  ]);
  const verdicts = [...report.original_audits.map((a) => a.verdict), ...report.repairs.map((r) => r.revalidation.verdict)];
  const view = rulesView(report);
  // Rules-only UNKNOWN: identity not established or a hard fact unknown, and not already BLOCKED by a proven failure (nothing about culture can make an item unknown).
  const rulesUnknown = [...view.originals, ...view.repairs].filter((a) => !(a.integrity || a.hard === "fail") && (!a.resolved || a.hard === "unknown")).length;
  // Candidate assessments (originals, then proposals, in report order) whose verdict differs once cultural evidence is taken away.
  const controlVerdicts = [...view.originals, ...view.repairs].map(rulesVerdict);
  const labelDifferences = verdicts.filter((v, i) => v !== controlVerdicts[i]).length;
  // Items that carry a cultural ordering (a ranking position or a discovery order): the only thing a rules-only gate cannot produce.
  const ordered = [...report.original_audits, ...report.repairs.map((r) => r.revalidation)].filter((a) => a.cultural_relevance !== null).length;
  return { shipped_with_cultural_evidence: outcome.shipped.filter((s) => evidenceFor.get(`${s.origin}:${s.slot}`) === true).length,
    audited_items: verdicts.length, tastegate_unknown: verdicts.filter((v) => v === "UNKNOWN").length, rules_only_unknown: rulesUnknown,
    label_differences: labelDifferences, items_with_cultural_ordering: ordered };
}
