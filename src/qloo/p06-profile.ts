import { z } from "zod";
import { HACKATHON_ORIGIN } from "./server-config";
import { P01CheckpointSchema, P01SummarySchema, blockedP01, validProbeWindow, rawSummaryInvariant, type ProbeReason } from "./p01-profile";
import { SAVED_P01_ATTEMPT } from "./p02-profile";

// Public attempt identifiers of the two captures whose entity IDs form the reviewed shortlist.
export const SAVED_P03R_ATTEMPT = "4a3bc272-29d7-4e29-aee5-1cef45caaff2" as const;
export const SAVED_P05_ATTEMPT = "154bd4c0-ea64-49c5-ad95-cb57efd7647a" as const;

// Public display profile only. The markers are never sent: a separately validated PRIVATE shortlist review
// supplies the exact artist ID and the two reviewed place IDs after every execution gate has passed.
// One fixed GET against the documented `filter.results.entities` shortlist parameter. No geography, tags,
// explainability, demographics, paging or offset parameters exist in this profile.
const SIGNAL_MARKER = "<PRIVATE_ACCEPTED_RADIOHEAD_ENTITY_ID>";
const SHORTLIST_MARKER = "<PRIVATE_REVIEWED_NYC_PLACE_ID>,<PRIVATE_REVIEWED_POSITIVE_CONTROL_PLACE_ID>";
export const P06_PROFILE = Object.freeze({ revision: "tastegate.p06.shortlist-rank.capture-256k.v1" as const,
  method: "GET" as const, origin: HACKATHON_ORIGIN, path: "/v2/insights" as const, max_response_bytes: 262_144 as const,
  params: Object.freeze({ "filter.type": "urn:entity:place", "signal.interests.entities": SIGNAL_MARKER,
    "filter.results.entities": SHORTLIST_MARKER, take: "2" }) });
export const P06ProfileSchema = z.strictObject({ revision: z.literal(P06_PROFILE.revision), method: z.literal("GET"),
  origin: z.literal(HACKATHON_ORIGIN), path: z.literal("/v2/insights"), max_response_bytes: z.literal(262_144),
  params: z.strictObject({ "filter.type": z.literal("urn:entity:place"), "signal.interests.entities": z.literal(SIGNAL_MARKER),
    "filter.results.entities": z.literal(SHORTLIST_MARKER), take: z.literal("2") }) });

// Opaque provider IDs: no whitespace/control characters and, because the shortlist is a comma-separated list,
// no comma. Never printed, logged or placed in public JSON.
const privateId = z.string().min(1).max(256).regex(/^[^\s\u0000-\u001f\u007f,]+$/u);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const P06CheckpointSchema = z.strictObject({ ...P01CheckpointSchema.shape,
  revision: z.literal("tastegate.p06.checkpoint.v1"), profile_revision: z.literal(P06_PROFILE.revision),
  approval: z.literal("APPROVE_P06_SHORTLIST_RANK_ONLY"), max_response_bytes: z.literal(262_144), request_timeout_ms: z.literal(4000),
  signal_entity_id: privateId, signal_entity_type: z.literal("urn:entity:artist"), signal_review_sha256: sha, p01_raw_sha256: sha,
  p01_source_attempt_id: z.literal(SAVED_P01_ATTEMPT),
  shortlist_review_sha256: sha, shortlist_entity_ids: z.tuple([privateId, privateId]),
  shortlist_source_attempts: z.strictObject({ reviewed_nyc_candidate: z.literal(SAVED_P03R_ATTEMPT), positive_control: z.literal(SAVED_P05_ATTEMPT) }),
  signal_identity_reviewed: z.literal(true), shortlist_identity_reviewed: z.literal(true),
  no_geographic_tag_or_explanation_parameters: z.literal(true), unreviewed_semantics_acknowledged: z.literal(true),
  shortlist_semantics_unverified_acknowledged: z.literal(true),
  prior_probe_dispatches_reviewed: z.strictObject({ P01: z.literal(1), P02: z.literal(1), P03: z.literal(1), P04: z.literal(1), P03R: z.literal(1), P05: z.literal(1) }) });
export type P06Checkpoint = z.infer<typeof P06CheckpointSchema>;
export function validP06Checkpoint(value: unknown, now = Date.now()): boolean {
  const v = P06CheckpointSchema.safeParse(value);
  return v.success && v.data.prior_reserved_attempts === 0 && v.data.previous_attempt_id === null &&
    v.data.shortlist_entity_ids[0] !== v.data.shortlist_entity_ids[1] && !v.data.shortlist_entity_ids.includes(v.data.signal_entity_id) &&
    validProbeWindow(v.data, now);
}
// A new summary version: P01-P04 (v2), P03-R (v3) and P05 (v4) contracts keep their original shape and history.
export const P06SummarySchema = z.strictObject({ ...P01SummarySchema.shape,
  schema_revision: z.literal("tastegate.raw-probe.v5"), probe: z.literal("P06"),
  profile_revision: z.literal(P06_PROFILE.revision), max_response_bytes: z.literal(262_144),
  response_bytes: z.number().int().min(0).max(262_145).nullable(),
}).superRefine(rawSummaryInvariant).superRefine((v, ctx) => {
  if ((v.response_bytes === 262_145 && !["RESPONSE_TOO_LARGE", "EVIDENCE_UNAVAILABLE"].includes(v.reason)) ||
      (v.dispatches === 1 && v.reason === "RESPONSE_TOO_LARGE" && (v.response_bytes !== 262_145 || v.raw_saved_privately)) ||
      (v.raw_saved_privately && (v.response_bytes === null || v.response_bytes > 262_144)))
    ctx.addIssue({ code: "custom", message: "P06 capture exceeds its independently reviewed budget" });
});
export type P06Summary = z.infer<typeof P06SummarySchema>;
export function blockedP06(reason: ProbeReason = "CHECKPOINT_REQUIRED", attemptId: string | null = null): P06Summary {
  return P06SummarySchema.parse({ ...blockedP01(reason, attemptId), schema_revision: "tastegate.raw-probe.v5", probe: "P06",
    profile_revision: P06_PROFILE.revision, max_response_bytes: 262_144 });
}
