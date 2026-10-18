import { z } from "zod";
import { HACKATHON_ORIGIN } from "./server-config";
import { P01CheckpointSchema, P01SummarySchema, blockedP01, validProbeWindow, rawSummaryInvariant, type ProbeReason } from "./p01-profile";
import { SAVED_P01_ATTEMPT } from "./p02-profile";

// Public display profile only. The marker is never sent; a separately validated PRIVATE
// review binding supplies the exact saved artist ID after all execution gates pass.
export const P05_PROFILE = Object.freeze({ revision: "tastegate.p05.radiohead-to-place.capture-256k.v1" as const,
  method: "GET" as const, origin: HACKATHON_ORIGIN, path: "/v2/insights" as const, max_response_bytes: 262_144 as const,
  params: Object.freeze({ "filter.type": "urn:entity:place", "signal.interests.entities": "<PRIVATE_ACCEPTED_RADIOHEAD_ENTITY_ID>", take: "1" }) });
export const P05ProfileSchema = z.strictObject({ revision: z.literal(P05_PROFILE.revision), method: z.literal("GET"),
  origin: z.literal(HACKATHON_ORIGIN), path: z.literal("/v2/insights"), max_response_bytes: z.literal(262_144),
  params: z.strictObject({ "filter.type": z.literal("urn:entity:place"),
    "signal.interests.entities": z.literal(P05_PROFILE.params["signal.interests.entities"]), take: z.literal("1") }) });
const privateId = z.string().min(1).max(256).regex(/^[^\s\u0000-\u001f\u007f]+$/u);
export const P05CheckpointSchema = z.strictObject({ ...P01CheckpointSchema.shape,
  revision: z.literal("tastegate.p05.checkpoint.v1"), profile_revision: z.literal(P05_PROFILE.revision),
  approval: z.literal("APPROVE_P05_RADIOHEAD_TO_PLACE_ONLY"), max_response_bytes: z.literal(262_144),
  request_timeout_ms: z.literal(4000), signal_entity_id: privateId, signal_entity_type: z.literal("urn:entity:artist"),
  signal_review_sha256: z.string().regex(/^[a-f0-9]{64}$/), p01_raw_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  p01_source_attempt_id: z.literal(SAVED_P01_ATTEMPT), signal_identity_reviewed: z.literal(true),
  no_geographic_or_explanation_parameters: z.literal(true), unreviewed_semantics_acknowledged: z.literal(true),
  prior_probe_dispatches_reviewed: z.strictObject({ P01: z.literal(1), P02: z.literal(1), P03: z.literal(1), P04: z.literal(1), P03R: z.literal(1) }) });
export type P05Checkpoint = z.infer<typeof P05CheckpointSchema>;
export function validP05Checkpoint(value: unknown, now = Date.now()): boolean {
  const v = P05CheckpointSchema.safeParse(value);
  return v.success && v.data.prior_reserved_attempts === 0 && v.data.previous_attempt_id === null && validProbeWindow(v.data, now);
}
export const P05SummarySchema = z.strictObject({ ...P01SummarySchema.shape,
  schema_revision: z.literal("tastegate.raw-probe.v4"), probe: z.literal("P05"),
  profile_revision: z.literal(P05_PROFILE.revision), max_response_bytes: z.literal(262_144),
  response_bytes: z.number().int().min(0).max(262_145).nullable(),
}).superRefine(rawSummaryInvariant).superRefine((v, ctx) => {
  if ((v.response_bytes === 262_145 && !["RESPONSE_TOO_LARGE", "EVIDENCE_UNAVAILABLE"].includes(v.reason)) ||
      (v.dispatches === 1 && v.reason === "RESPONSE_TOO_LARGE" && (v.response_bytes !== 262_145 || v.raw_saved_privately)) ||
      (v.raw_saved_privately && (v.response_bytes === null || v.response_bytes > 262_144)))
    ctx.addIssue({ code: "custom", message: "P05 capture exceeds its independently reviewed budget" });
});
export type P05Summary = z.infer<typeof P05SummarySchema>;
export function blockedP05(reason: ProbeReason = "CHECKPOINT_REQUIRED", attemptId: string | null = null): P05Summary {
  return P05SummarySchema.parse({ ...blockedP01(reason, attemptId), schema_revision: "tastegate.raw-probe.v4", probe: "P05",
    profile_revision: P05_PROFILE.revision, max_response_bytes: 262_144 });
}
