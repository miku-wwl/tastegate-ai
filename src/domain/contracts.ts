import { createHash } from "node:crypto";
import { z } from "zod";

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9:_-]+$/);
const text = (max: number) => z.string().min(1).max(max).refine((v) => v.trim().length > 0 && !/[\uD800-\uDFFF]/u.test(v), "Nonblank well-formed Unicode required");
const ids = z.array(id).max(16).refine((v) => new Set(v).size === v.length, "Duplicate IDs");
const syntheticId = id.refine((v) => v.startsWith("synthetic:"), "Synthetic ID required");
export const VerdictSchema = z.enum(["PASS", "REVIEW", "REPAIR_SUGGESTED", "BLOCKED", "UNKNOWN"]);
export const CheckStateSchema = z.enum(["pass", "fail", "unknown", "not_applicable"]);
export const ConstraintSchema = z.discriminatedUnion("kind", [
  z.strictObject({ id, kind: z.literal("city"), value: text(100) }),
  z.strictObject({ id, kind: z.literal("country"), value: z.string().regex(/^[A-Z]{2}$/) }),
  z.strictObject({ id, kind: z.literal("entity_type"), value: z.literal("place") }),
  z.strictObject({ id, kind: z.literal("max_items"), value: z.number().int().min(1).max(3) }),
]);
export const AuditInputSchema = z.strictObject({
  schema_revision: z.literal("tastegate.input.v0"),
  preferences: z.array(z.strictObject({
    id, text: text(200), kind: z.enum(["artist", "film_concept", "tag_concept"]),
    confirmed_anchor: text(200).nullable(),
  })).min(1).max(3),
  task: text(500), destination: text(200),
  constraints: z.array(ConstraintSchema).min(1).max(8),
  recommendations: z.array(z.strictObject({
    id, name: text(200), address_hint: text(300).nullable(), claims: z.array(text(300)).max(5),
  })).min(1).max(3),
}).superRefine((v, ctx) => {
  for (const key of ["preferences", "recommendations", "constraints"] as const) {
    if (new Set(v[key].map((x) => x.id)).size !== v[key].length)
      ctx.addIssue({ code: "custom", path: [key], message: "Duplicate IDs" });
  }
  if (new TextEncoder().encode(JSON.stringify(v)).length > 16_384)
    ctx.addIssue({ code: "custom", message: "Input exceeds 16 KiB" });
});
export type AuditInput = z.infer<typeof AuditInputSchema>;

// Normalized authored fixture records. These are deliberately NOT Qloo wire schemas.
export const EntitySchema = z.strictObject({
  id: syntheticId, name: text(200), kind: z.enum(["artist", "movie", "place", "brand"]),
  city: text(100).nullable(), country: z.string().regex(/^[A-Z]{2}$/).nullable(),
});
export type Entity = z.infer<typeof EntitySchema>;
const signals = {
  preference_entity_ids: z.array(syntheticId).max(3),
  preference_tag_ids: z.array(syntheticId).max(3),
};
export const SnapshotSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("input"), input: AuditInputSchema }),
  z.strictObject({ kind: z.literal("entity_lookup"), query: text(200),
    requested_kind: z.enum(["artist", "movie", "place"]), matches: z.array(EntitySchema).max(5) }),
  z.strictObject({ kind: z.literal("tag_lookup"), query: text(200),
    matches: z.array(z.strictObject({ id: syntheticId, name: text(200) })).max(5) }),
  z.strictObject({ kind: z.literal("rank_places"), ...signals,
    candidate_entity_ids: z.array(syntheticId).max(6),
    ordered_entity_ids: z.array(syntheticId).max(6),
    explainability: z.enum(["missing", "available"]) }),
  z.strictObject({ kind: z.literal("discover_places"), ...signals,
    exclude_entity_ids: z.array(syntheticId).max(6),
    candidates: z.array(EntitySchema).max(5) }),
]);
export type Snapshot = z.infer<typeof SnapshotSchema>;
export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex");
}
export function snapshotEntityIds(s: Snapshot): string[] {
  if (s.kind === "input") return [];
  if (s.kind === "entity_lookup" || s.kind === "tag_lookup") return s.matches.map((x) => x.id);
  return s.kind === "rank_places" ? s.ordered_entity_ids : s.candidates.map((x) => x.id);
}
export const EvidenceSchema = z.strictObject({
  evidence_id: id, run_id: z.uuid(), source_mode: z.literal("fixture"), provider: z.literal("synthetic"),
  fixture_id: id, operation: z.enum(["input", "entity_lookup", "tag_lookup", "insights"]),
  call_id: id.nullable(), upstream_request_id: z.null(), retrieved_at: z.null(),
  query_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), pointer: text(200),
  entity_ids: ids, cache_hit: z.literal(false), fetched_at: z.null(),
  warnings: z.array(text(300)).min(1).max(10), snapshot: SnapshotSchema,
}).superRefine((e, ctx) => {
  const operation = ["rank_places", "discover_places"].includes(e.snapshot.kind) ? "insights" : e.snapshot.kind;
  if (e.query_fingerprint !== digest(e.snapshot) || e.operation !== operation ||
      JSON.stringify(e.entity_ids) !== JSON.stringify(snapshotEntityIds(e.snapshot)))
    ctx.addIssue({ code: "custom", message: "Evidence does not match its captured snapshot" });
  if (e.snapshot.kind === "input" ? e.call_id !== null : e.call_id === null)
    ctx.addIssue({ code: "custom", message: "Invalid evidence call identity" });
});
export type Evidence = z.infer<typeof EvidenceSchema>;
export const FindingCodeSchema = z.enum([
  "CITY_MATCH", "CITY_MISMATCH", "COUNTRY_MATCH", "COUNTRY_MISMATCH", "TYPE_MATCH", "TYPE_MISMATCH",
  "MAX_ITEMS_MATCH", "MAX_ITEMS_EXCEEDED", "FACT_MISSING", "UNRESOLVED_ENTITY", "AMBIGUOUS_ENTITY",
  "TASTE_EVIDENCE_PRESENT", "TASTE_EVIDENCE_MISSING", "CLAIM_UNVERIFIED", "EXPLAINABILITY_MISSING",
  "PREFERENCE_UNRESOLVED", "PROVENANCE_REJECTED", "CALL_BUDGET_EXHAUSTED", "TIMEOUT", "CANCELLED",
  "REVALIDATION_ID_MISMATCH", "LOOKUP_FAILED",
]);
export const FindingSchema = z.strictObject({
  code: FindingCodeSchema,
  category: z.enum(["hard_constraint", "insufficient_evidence", "relative_relevance", "uncertainty", "integrity"]),
  state: CheckStateSchema, constraint_id: id.nullable(), evidence_refs: ids, explanation: text(500),
});
export type Finding = z.infer<typeof FindingSchema>;
export const CandidateAuditSchema = z.strictObject({
  candidate_id: id, resolution: z.enum(["resolved", "ambiguous", "unresolved"]),
  entity_id: syntheticId.nullable(), resolution_evidence_ref: id.nullable(),
  hard_constraints: CheckStateSchema, evidence_coverage: z.enum(["covered", "partial", "missing"]),
  cultural_relevance: z.strictObject({ query_ref: id, ordinal_rank: z.number().int().min(1).max(6) }).nullable(),
  explainability: z.enum(["available", "missing", "not_requested"]), verdict: VerdictSchema,
  findings: z.array(FindingSchema).min(1).max(32),
}).superRefine((a, ctx) => {
  if ((a.resolution === "resolved") !== (a.entity_id !== null))
    ctx.addIssue({ code: "custom", message: "Resolution and entity ID disagree" });
  if (a.verdict === "PASS" && (a.resolution !== "resolved" || a.hard_constraints !== "pass" ||
      a.evidence_coverage !== "covered" || a.findings.some((f) => f.state === "fail" ||
      f.code === "CLAIM_UNVERIFIED" || f.code === "PREFERENCE_UNRESOLVED")))
    ctx.addIssue({ code: "custom", message: "Unsupported PASS verdict" });
});
export type CandidateAudit = z.infer<typeof CandidateAuditSchema>;
export const RepairSchema = z.strictObject({
  replaces: id, replacement_candidate_id: id, proposed_entity_id: syntheticId, discovery_evidence_refs: ids,
  revalidation: CandidateAuditSchema, accepted: z.boolean(),
}).superRefine((r, ctx) => {
  if (r.replacement_candidate_id !== r.revalidation.candidate_id ||
      (r.accepted && (r.revalidation.verdict !== "PASS" || r.revalidation.entity_id !== r.proposed_entity_id)))
    ctx.addIssue({ code: "custom", message: "Replacement has not passed revalidation" });
});
export type Repair = z.infer<typeof RepairSchema>;
export const StateSchema = z.enum(["Validate", "Resolve", "Retrieve", "Audit", "Repair", "Revalidate", "NeedsInput", "Report"]);
export type State = z.infer<typeof StateSchema>;
export const StopReasonSchema = z.enum(["COMPLETE", "NEEDS_INPUT", "CALL_BUDGET_EXHAUSTED", "PROVENANCE_REJECTED", "TIMEOUT", "CANCELLED", "ADAPTER_ERROR"]);
export type StopReason = z.infer<typeof StopReasonSchema>;
export function aggregate(audits: CandidateAudit[], unresolvedPreferences = false): CandidateAudit["verdict"] {
  if (audits.some((a) => a.verdict === "BLOCKED")) return "BLOCKED";
  if (!audits.length || unresolvedPreferences || audits.some((a) => a.verdict === "UNKNOWN")) return "UNKNOWN";
  if (audits.some((a) => a.verdict === "REVIEW")) return "REVIEW";
  if (audits.some((a) => a.verdict === "REPAIR_SUGGESTED")) return "REPAIR_SUGGESTED";
  return "PASS";
}
export const ReportShapeSchema = z.strictObject({
  schema_revision: z.literal("tastegate.report.v1a"), run_id: z.uuid(), source_mode: z.literal("fixture"),
  input: AuditInputSchema, input_ref: z.literal("/input"),
  before_status: VerdictSchema, final_status: VerdictSchema, completion: z.enum(["complete", "partial"]),
  original_audits: z.array(CandidateAuditSchema).min(1).max(3), repairs: z.array(RepairSchema).max(3),
  final_candidate_ids: ids, evidence: z.array(EvidenceSchema).min(1).max(15),
  preference_evidence_refs: ids, unresolved_preferences: ids, limitations: z.array(text(500)).min(1).max(20),
  stop_reason: StopReasonSchema, trace: z.array(z.strictObject({ state: StateSchema, call_id: id.nullable() })).max(64),
  usage: z.strictObject({ qloo_dispatches: z.literal(0), llm_dispatches: z.literal(0),
    fixture_calls: z.number().int().min(0).max(14), repair_rounds: z.number().int().min(0).max(1), elapsed_ms: z.number().finite().nonnegative() }),
  archive: z.strictObject({ status: z.literal("not_requested"), action_id: z.null(), receipt_ref: z.null() }),
});
export type AuditReport = z.infer<typeof ReportShapeSchema>;
