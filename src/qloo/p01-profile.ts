import { z } from "zod";
import { HACKATHON_ORIGIN } from "./server-config";

export const P01_PROFILE = Object.freeze({
  revision: "tastegate.p01.radiohead.v1" as const, method: "GET" as const,
  origin: HACKATHON_ORIGIN, path: "/search" as const,
  params: Object.freeze({ query: "Radiohead", types: "urn:entity:artist", take: "5", page: "1" }),
});
export const P01ProfileSchema = z.strictObject({
  revision: z.literal("tastegate.p01.radiohead.v1"), method: z.literal("GET"),
  origin: z.literal(HACKATHON_ORIGIN), path: z.literal("/search"),
  params: z.strictObject({ query: z.literal("Radiohead"), types: z.literal("urn:entity:artist"), take: z.literal("5"), page: z.literal("1") }),
});
// Private operator assertions, not cryptographic proof of entitlement or authenticated human identity.
// A key/flag alone never satisfies the checkpoint. No credential value belongs in this object.
const entitlement = z.union([z.number().int().positive().safe(), z.literal("UNKNOWN")]);
export const P01CheckpointSchema = z.strictObject({
  revision: z.literal("tastegate.p01.checkpoint.v2"), profile_revision: z.literal(P01_PROFILE.revision),
  attempt_id: z.uuidv4(), previous_attempt_id: z.uuidv4().nullable(), prior_reserved_attempts: z.number().int().nonnegative().safe(),
  prior_attempts_reviewed: z.literal(true), credential_exposure_risk_acknowledged: z.literal(true),
  credential_basis: z.literal("ORIGINALLY_ISSUED_EVENT_KEY"), unknown_entitlements_acknowledged: z.literal(true),
  host_and_header_reviewed: z.literal(true), request_shape_reviewed: z.literal(true), usage_rights_confirmed: z.literal(true),
  private_capture_permitted: z.literal(true), private_directory_access_reviewed: z.literal(true),
  quota: z.strictObject({ remaining_calls: entitlement, rate_limit_per_minute: entitlement,
    concurrency_limit: entitlement, key_expires_at: z.union([z.iso.datetime(), z.literal("UNKNOWN")]) }),
  approval: z.literal("APPROVE_P01_ONLY"), max_dispatches: z.literal(1),
  approved_at: z.iso.datetime(), approval_expires_at: z.iso.datetime(),
});
export type P01Checkpoint = z.infer<typeof P01CheckpointSchema>;
export function validP01Checkpoint(value: unknown, now = Date.now()): boolean {
  const result = P01CheckpointSchema.safeParse(value);
  if (!result.success) return false;
  const v = result.data; const start = Date.parse(v.approved_at); const end = Date.parse(v.approval_expires_at);
  return (v.prior_reserved_attempts === 0 ? v.previous_attempt_id === null : v.previous_attempt_id !== null) &&
    v.attempt_id !== v.previous_attempt_id && start <= now && end > now && end > start && end - start <= 15 * 60_000 &&
    (v.quota.key_expires_at === "UNKNOWN" || Date.parse(v.quota.key_expires_at) > now);
}

export const ProbeReasonSchema = z.enum(["CHECKPOINT_REQUIRED", "INVALID_PROFILE", "CONFIG_BLOCKED", "UNSAFE_DIAGNOSTICS",
  "CONCURRENCY_LIMIT", "CALL_BUDGET_EXHAUSTED", "EVIDENCE_UNAVAILABLE", "CANCELLED", "TIMEOUT", "NETWORK_ERROR",
  "AUTH_INVALID", "FORBIDDEN", "RATE_LIMITED", "UPSTREAM_ERROR", "HTTP_ERROR", "REDIRECT_REJECTED", "SCHEMA_MISMATCH",
  "RESPONSE_TOO_LARGE", "CREDENTIAL_REFLECTION", "SCHEMA_REVIEW_REQUIRED"]);
export type ProbeReason = z.infer<typeof ProbeReasonSchema>;
export const P01SummarySchema = z.strictObject({
  schema_revision: z.literal("tastegate.raw-probe.v2"), probe: z.literal("P01"), attempt_id: z.uuidv4().nullable(),
  source_mode: z.enum(["not_executed", "offline_test", "live_probe"]),
  status: z.enum(["PASS", "FAIL", "UNKNOWN", "BLOCKED"]), reason: ProbeReasonSchema,
  dispatches: z.number().int().min(0).max(1), max_dispatches: z.literal(1), automatic_retries: z.literal(0),
  http_status: z.number().int().min(100).max(599).nullable(), response_bytes: z.number().int().min(0).max(65_537).nullable(),
  elapsed_ms: z.number().nonnegative().finite().nullable(), transport_settled: z.boolean(),
  raw_saved_privately: z.boolean(), semantic_review: z.literal("NOT_REVIEWED"),
}).superRefine((v, ctx) => {
  if (v.status === "PASS" || (v.dispatches === 0 && (v.source_mode !== "not_executed" || v.raw_saved_privately || v.http_status !== null)) ||
      (v.dispatches === 1 && (v.source_mode === "not_executed" || v.attempt_id === null || v.elapsed_ms === null)))
    ctx.addIssue({ code: "custom", message: "Unreviewed probe cannot assert semantic PASS or fabricated dispatch provenance" });
});
export type P01Summary = z.infer<typeof P01SummarySchema>;
export function blockedP01(reason: ProbeReason = "CHECKPOINT_REQUIRED", attemptId: string | null = null): P01Summary {
  return P01SummarySchema.parse({ schema_revision: "tastegate.raw-probe.v2", probe: "P01", attempt_id: attemptId, source_mode: "not_executed",
    status: "BLOCKED", reason, dispatches: 0, max_dispatches: 1, automatic_retries: 0,
    http_status: null, response_bytes: 0, elapsed_ms: null, transport_settled: true,
    raw_saved_privately: false, semantic_review: "NOT_REVIEWED" });
}
