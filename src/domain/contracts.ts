import { createHash } from "node:crypto";
import { z } from "zod";

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9:_-]+$/);
const text = (max: number) => z.string().min(1).max(max).refine((v) => v.trim().length > 0 && !/[\uD800-\uDFFF]/u.test(v), "Nonblank well-formed Unicode required");
const ids = z.array(id).max(16).refine((v) => new Set(v).size === v.length, "Duplicate IDs");
// Pseudonymous, equality-preserving reference to a provider (Qloo) identifier. Raw provider IDs never
// leave the server: the keyed digest is meaningless outside the server process that issued it.
export const QLOO_REF_PATTERN = /^qloo-ref:[a-f0-9]{16}$/;
export const isSyntheticId = (v: string) => v.startsWith("synthetic:");
export const isQlooRef = (v: string) => QLOO_REF_PATTERN.test(v);
const qlooRef = id.refine(isQlooRef, "Pseudonymous provider reference required");
// Mode consistency (synthetic-only fixtures, provider-only recordings) is enforced by each report validator.
const entityRef = id.refine((v) => isSyntheticId(v) || isQlooRef(v), "Synthetic ID or provider reference required");
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

// A user's explicit identity decision for one preference or recommendation. Untrusted input: it can only
// choose among candidates the provider actually returned in the same run, never introduce an ID.
export const ConfirmationSchema = z.discriminatedUnion("decision", [
  z.strictObject({ target_id: id, decision: z.literal("select"), ref: qlooRef }),
  z.strictObject({ target_id: id, decision: z.literal("skip") }),
]);
export type Confirmation = z.infer<typeof ConfirmationSchema>;
export const ConfirmationsSchema = z.array(ConfirmationSchema).max(8)
  .refine((v) => new Set(v.map((c) => c.target_id)).size === v.length, "One decision per target");
// Trusted host policy for Insights requests; never selected by the browser or a model.
export const InsightsPolicySchema = z.strictObject({
  signal_scope: z.enum(["all_confirmed", "first_confirmed_artist"]),
  discovery_take: z.number().int().min(1).max(5),
  discovery_exclusion: z.enum(["server", "client"]),
});
export type InsightsPolicy = z.infer<typeof InsightsPolicySchema>;

// Normalized records. Fixtures are authored; provider records are strict projections of observed
// responses (see src/qloo/projections.ts). Neither is a Qloo wire schema.
export const EntitySchema = z.strictObject({
  id: entityRef, name: text(200), kind: z.enum(["artist", "movie", "place", "brand"]),
  city: text(100).nullable(), country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  // Provider descriptors for display and human review only; no verdict uses them.
  detail: text(300).nullable().optional(), neighborhood: text(100).nullable().optional(),
  provider_class: text(160).optional(), descriptive_tags: z.array(text(100)).max(8).optional(),
});
export type Entity = z.infer<typeof EntitySchema>;
const TagSchema = z.strictObject({ id: entityRef, name: text(200),
  type_label: text(120).optional(), parent_types: z.array(text(60)).max(8).optional() });
const signals = {
  preference_entity_ids: z.array(entityRef).max(3),
  preference_tag_ids: z.array(entityRef).max(3),
};
const LookupRequestSchema = { query: text(200), requested_kind: z.enum(["artist", "movie", "place"]) };
const DiscoveryOptions = {
  signal_scope: InsightsPolicySchema.shape.signal_scope.optional(),
  take: InsightsPolicySchema.shape.discovery_take.optional(),
  exclusion: InsightsPolicySchema.shape.discovery_exclusion.optional(),
};
const UnavailableRequestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("entity_lookup"), ...LookupRequestSchema }),
  z.strictObject({ operation: z.literal("tag_lookup"), query: text(200) }),
  z.strictObject({ operation: z.literal("rank_places"), ...signals, candidate_entity_ids: z.array(entityRef).max(6) }),
  z.strictObject({ operation: z.literal("discover_places"), ...signals, exclude_entity_ids: z.array(entityRef).max(6), ...DiscoveryOptions }),
]);
export const SnapshotSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("input"), input: AuditInputSchema, confirmations: ConfirmationsSchema.optional() }),
  z.strictObject({ kind: z.literal("entity_lookup"), ...LookupRequestSchema, matches: z.array(EntitySchema).max(5) }),
  z.strictObject({ kind: z.literal("tag_lookup"), query: text(200), matches: z.array(TagSchema).max(5) }),
  z.strictObject({ kind: z.literal("rank_places"), ...signals,
    candidate_entity_ids: z.array(entityRef).max(6),
    ordered_entity_ids: z.array(entityRef).max(6),
    explainability: z.enum(["missing", "available"]) }),
  z.strictObject({ kind: z.literal("discover_places"), ...signals,
    exclude_entity_ids: z.array(entityRef).max(6), ...DiscoveryOptions,
    client_excluded_ids: z.array(entityRef).max(6).optional(),
    // Provider query.affinity, kept for transparency only: query-relative, not comparable across queries.
    scores: z.array(z.strictObject({ entity_id: entityRef, query_affinity: z.number().finite().nullable() })).max(5).optional(),
    candidates: z.array(EntitySchema).max(5) }),
  // TasteGate's record that no provider evidence exists for this exact request. Never negative evidence.
  z.strictObject({ kind: z.literal("unavailable"), request: UnavailableRequestSchema,
    reason: z.enum(["NOT_CAPTURED", "APPROVAL_REQUIRED"]), detail: text(300) }),
]);
export type Snapshot = z.infer<typeof SnapshotSchema>;
export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex");
}
export function snapshotEntityIds(s: Snapshot): string[] {
  if (s.kind === "input" || s.kind === "unavailable") return [];
  if (s.kind === "entity_lookup" || s.kind === "tag_lookup") return s.matches.map((x) => x.id);
  return s.kind === "rank_places" ? s.ordered_entity_ids : s.candidates.map((x) => x.id);
}
// Every entity/tag reference a snapshot mentions, including request echoes; used for namespace checks.
export function snapshotRefs(s: Snapshot): string[] {
  if (s.kind === "input") return [];
  const signalIds = (v: { preference_entity_ids: string[]; preference_tag_ids: string[] }) => [...v.preference_entity_ids, ...v.preference_tag_ids];
  if (s.kind === "unavailable") {
    const r = s.request;
    return r.operation === "rank_places" ? [...signalIds(r), ...r.candidate_entity_ids] :
      r.operation === "discover_places" ? [...signalIds(r), ...r.exclude_entity_ids] : [];
  }
  if (s.kind === "entity_lookup" || s.kind === "tag_lookup") return s.matches.map((m) => m.id);
  if (s.kind === "rank_places") return [...signalIds(s), ...s.candidate_entity_ids, ...s.ordered_entity_ids];
  return [...signalIds(s), ...s.exclude_entity_ids, ...(s.client_excluded_ids ?? []), ...(s.scores ?? []).map((x) => x.entity_id), ...s.candidates.map((c) => c.id)];
}
export function snapshotOperation(s: Snapshot): "input" | "entity_lookup" | "tag_lookup" | "insights" {
  const kind = s.kind === "unavailable" ? s.request.operation : s.kind;
  return kind === "rank_places" || kind === "discover_places" ? "insights" : kind;
}
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const EvidenceSchema = z.strictObject({
  evidence_id: id, run_id: z.uuid(), source_mode: z.literal("fixture"), provider: z.literal("synthetic"),
  fixture_id: id, operation: z.enum(["input", "entity_lookup", "tag_lookup", "insights"]),
  call_id: id.nullable(), upstream_request_id: z.null(), retrieved_at: z.null(),
  query_fingerprint: fingerprint, pointer: text(200),
  entity_ids: ids, cache_hit: z.literal(false), fetched_at: z.null(),
  warnings: z.array(text(300)).min(1).max(10), snapshot: SnapshotSchema,
}).superRefine((e, ctx) => {
  if (e.query_fingerprint !== digest(e.snapshot) || e.operation !== snapshotOperation(e.snapshot) ||
      JSON.stringify(e.entity_ids) !== JSON.stringify(snapshotEntityIds(e.snapshot)))
    ctx.addIssue({ code: "custom", message: "Evidence does not match its captured snapshot" });
  if (e.snapshot.kind === "input" ? e.call_id !== null : e.call_id === null)
    ctx.addIssue({ code: "custom", message: "Invalid evidence call identity" });
  if (e.snapshot.kind === "unavailable" || (e.snapshot.kind === "input" && e.snapshot.confirmations))
    ctx.addIssue({ code: "custom", message: "Provider-only snapshot in fixture evidence" });
});
export type Evidence = z.infer<typeof EvidenceSchema>;
// Metadata of an immutable, owner-approved recorded Qloo response, verified against private manifests.
export const CaptureSchema = z.strictObject({
  probe: z.enum(["P01", "P02", "P03R", "P04", "P05"]), attempt_id: z.uuid(),
  endpoint: z.enum(["/search", "/v2/tags", "/v2/insights"]), profile_revision: text(120),
  recorded_at: z.iso.datetime(), http_status: z.literal(200),
  response_bytes: z.number().int().min(1).max(262_144),
  // Exact request parameters; any provider ID is replaced by its pseudonymous reference.
  request_params: z.record(z.string().min(1).max(64), text(200)),
  integrity: z.literal("SHA256_MATCHES_PRIVATE_MANIFEST"),
});
export type Capture = z.infer<typeof CaptureSchema>;
const ENDPOINT_BY_OPERATION = { entity_lookup: "/search", tag_lookup: "/v2/tags", insights: "/v2/insights" } as const;
export const ProviderEvidenceSchema = z.strictObject({
  evidence_id: id, run_id: z.uuid(), source_mode: z.literal("recorded_live"),
  provider: z.enum(["user", "qloo", "tastegate"]), dataset_id: id,
  operation: z.enum(["input", "entity_lookup", "tag_lookup", "insights"]),
  call_id: id.nullable(), capture: CaptureSchema.nullable(), upstream_request_id: z.null(),
  query_fingerprint: fingerprint, pointer: text(200), entity_ids: ids,
  cache_hit: z.boolean(), fetched_at: z.iso.datetime().nullable(),
  warnings: z.array(text(300)).min(1).max(10), snapshot: SnapshotSchema,
}).superRefine((e, ctx) => {
  const reject = (message: string) => ctx.addIssue({ code: "custom", message });
  if (e.query_fingerprint !== digest(e.snapshot) || e.operation !== snapshotOperation(e.snapshot) ||
      JSON.stringify(e.entity_ids) !== JSON.stringify(snapshotEntityIds(e.snapshot)))
    reject("Evidence does not match its captured snapshot");
  if (e.snapshot.kind === "input" ? e.call_id !== null : e.call_id === null) reject("Invalid evidence call identity");
  const expectedProvider = e.snapshot.kind === "input" ? "user" : e.snapshot.kind === "unavailable" ? "tastegate" : "qloo";
  if (e.provider !== expectedProvider) reject("Evidence provider contradicts its snapshot");
  if (expectedProvider === "qloo") {
    // Every provider fact must come from a verified recording of the matching endpoint.
    if (!e.capture || e.operation === "input" || e.capture.endpoint !== ENDPOINT_BY_OPERATION[e.operation] ||
        !e.cache_hit || e.fetched_at !== e.capture.recorded_at) reject("Provider evidence lacks a matching recording");
  } else if (e.capture || e.cache_hit || e.fetched_at !== null) reject("Non-provider evidence claims a recording");
});
export type ProviderEvidence = z.infer<typeof ProviderEvidenceSchema>;
export const FindingCodeSchema = z.enum([
  "CITY_MATCH", "CITY_MISMATCH", "COUNTRY_MATCH", "COUNTRY_MISMATCH", "TYPE_MATCH", "TYPE_MISMATCH",
  "MAX_ITEMS_MATCH", "MAX_ITEMS_EXCEEDED", "FACT_MISSING", "UNRESOLVED_ENTITY", "AMBIGUOUS_ENTITY",
  "TASTE_EVIDENCE_PRESENT", "TASTE_EVIDENCE_MISSING", "CLAIM_UNVERIFIED", "EXPLAINABILITY_MISSING",
  "PREFERENCE_UNRESOLVED", "PROVENANCE_REJECTED", "CALL_BUDGET_EXHAUSTED", "TIMEOUT", "CANCELLED",
  "REVALIDATION_ID_MISMATCH", "LOOKUP_FAILED",
  "CONFIRMATION_REQUIRED", "EVIDENCE_UNAVAILABLE", "FACT_UNCONFIRMED",
]);
export const FindingSchema = z.strictObject({
  code: FindingCodeSchema,
  category: z.enum(["hard_constraint", "insufficient_evidence", "relative_relevance", "uncertainty", "integrity"]),
  state: CheckStateSchema, constraint_id: id.nullable(), evidence_refs: ids, explanation: text(500),
});
export type Finding = z.infer<typeof FindingSchema>;
export const CandidateAuditSchema = z.strictObject({
  candidate_id: id, resolution: z.enum(["resolved", "ambiguous", "unconfirmed", "unresolved"]),
  entity_id: entityRef.nullable(), resolution_evidence_ref: id.nullable(),
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
  replaces: id, replacement_candidate_id: id, proposed_entity_id: entityRef, discovery_evidence_refs: ids,
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
const reportCommon = {
  run_id: z.uuid(), input: AuditInputSchema, input_ref: z.literal("/input"),
  before_status: VerdictSchema, final_status: VerdictSchema, completion: z.enum(["complete", "partial"]),
  original_audits: z.array(CandidateAuditSchema).min(1).max(3), repairs: z.array(RepairSchema).max(3),
  final_candidate_ids: ids, preference_evidence_refs: ids, unresolved_preferences: ids,
  limitations: z.array(text(500)).min(1).max(20), stop_reason: StopReasonSchema,
  trace: z.array(z.strictObject({ state: StateSchema, call_id: id.nullable() })).max(64),
  archive: z.strictObject({ status: z.literal("not_requested"), action_id: z.null(), receipt_ref: z.null() }),
};
export const ReportShapeSchema = z.strictObject({
  schema_revision: z.literal("tastegate.report.v1a"), source_mode: z.literal("fixture"), ...reportCommon,
  evidence: z.array(EvidenceSchema).min(1).max(15),
  usage: z.strictObject({ qloo_dispatches: z.literal(0), llm_dispatches: z.literal(0),
    fixture_calls: z.number().int().min(0).max(14), repair_rounds: z.number().int().min(0).max(1), elapsed_ms: z.number().finite().nonnegative() }),
});
export type AuditReport = z.infer<typeof ReportShapeSchema>;
export const PreferenceResolutionSchema = z.strictObject({
  preference_id: id, lookup_ref: id.nullable(),
  status: z.enum(["resolved", "pending", "skipped", "unresolved", "not_attempted"]), selected_id: qlooRef.nullable(),
});
export type PreferenceResolution = z.infer<typeof PreferenceResolutionSchema>;
export const PendingConfirmationSchema = z.strictObject({
  target_id: id, target_kind: z.enum(["preference", "recommendation"]), lookup_ref: id,
  candidate_ids: z.array(qlooRef).min(1).max(5),
});
export const ProviderReportShapeSchema = z.strictObject({
  schema_revision: z.literal("tastegate.report.v2a"), source_mode: z.literal("recorded_live"), scenario_id: id,
  ...reportCommon, insights_policy: InsightsPolicySchema, confirmations: ConfirmationsSchema,
  preference_resolution: z.array(PreferenceResolutionSchema).min(1).max(3),
  pending_confirmations: z.array(PendingConfirmationSchema).max(6),
  evidence: z.array(ProviderEvidenceSchema).min(1).max(15),
  usage: z.strictObject({ qloo_dispatches: z.literal(0), llm_dispatches: z.literal(0),
    adapter_calls: z.number().int().min(0).max(14), recorded_replays: z.number().int().min(0).max(14),
    unavailable_operations: z.number().int().min(0).max(14),
    repair_rounds: z.number().int().min(0).max(1), elapsed_ms: z.number().finite().nonnegative() }),
});
export type ProviderAuditReport = z.infer<typeof ProviderReportShapeSchema>;
export type AnyAuditReport = AuditReport | ProviderAuditReport;
