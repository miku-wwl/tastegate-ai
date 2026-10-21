import { createHash } from "node:crypto";
import { z } from "zod";
import { HACKATHON_ORIGIN } from "./server-config";
import { P01CheckpointSchema, P01SummarySchema, blockedP01, validProbeWindow, rawSummaryInvariant, type ProbeReason } from "./p01-profile";
import { SAVED_P01_ATTEMPT } from "./p02-profile";

// P07: ONE locality-scoped place discovery for the already-reviewed artist signal. Public display profile only: the marker is
// never sent; a separately validated PRIVATE identity review supplies the artist ID after every gate has passed.
//
// What the official documentation says about each parameter (checked 2026-10-21; see docs/P07_NYC_REPAIR_READINESS.md):
//   filter.type=urn:entity:place            documented, required                                          consistent across pages
//   signal.interests.entities=<artist ID>   documented, optional for place                                consistent across pages
//   take=3                                  documented (default 20, maximum 50)                           consistent across pages
//   filter.location.radius=0                documented, meters; 0 = results strictly inside the locality  consistent across pages
//   filter.location.query=New York City     documented in the Insights reference and the Parameter Reference (Destination, Place),
//                                           but NOT listed for place in the Entity Type Parameter Guide    DOCUMENTATION CONFLICT
// The developer guide says unsupported parameters are silently ignored, so a 200 response is never proof that the locality was
// applied: the response is judged only by what it contains (a resolved-locality marker and each returned place's own geography).
const SIGNAL_MARKER = "<PRIVATE_REVIEWED_RADIOHEAD_ID>";
export const P07_PROFILE = Object.freeze({ revision: "tastegate.p07.nyc-locality-discovery.capture-256k.v1" as const,
  method: "GET" as const, origin: HACKATHON_ORIGIN, path: "/v2/insights" as const, max_response_bytes: 262_144 as const,
  params: Object.freeze({ "filter.type": "urn:entity:place", "signal.interests.entities": SIGNAL_MARKER,
    "filter.location.query": "New York City", "filter.location.radius": "0", take: "3" }) });
export const P07ProfileSchema = z.strictObject({ revision: z.literal(P07_PROFILE.revision), method: z.literal("GET"),
  origin: z.literal(HACKATHON_ORIGIN), path: z.literal("/v2/insights"), max_response_bytes: z.literal(262_144),
  params: z.strictObject({ "filter.type": z.literal("urn:entity:place"), "signal.interests.entities": z.literal(SIGNAL_MARKER),
    "filter.location.query": z.literal("New York City"), "filter.location.radius": z.literal("0"), take: z.literal("3") }) });

// The one function that turns the fixed profile plus the verified artist ID into a request URL. The runner, the approval and the
// tests all use it, so what the owner approves (by hash) is byte-for-byte what is sent.
export function p07RequestUrl(signalEntityId: string): string {
  const url = new URL(P07_PROFILE.path, P07_PROFILE.origin);
  url.search = new URLSearchParams({ ...P07_PROFILE.params, "signal.interests.entities": signalEntityId }).toString();
  return url.toString();
}
export const p07RequestSha256 = (signalEntityId: string): string => createHash("sha256").update(p07RequestUrl(signalEntityId), "utf8").digest("hex");

const privateId = z.string().min(1).max(256).regex(/^[^\s\u0000-\u001f\u007f]+$/u);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const P07CheckpointSchema = z.strictObject({ ...P01CheckpointSchema.shape,
  revision: z.literal("tastegate.p07.checkpoint.v1"), profile_revision: z.literal(P07_PROFILE.revision),
  approval: z.literal("APPROVE_P07_NYC_DISCOVERY_ONLY"), max_response_bytes: z.literal(262_144), request_timeout_ms: z.literal(4000),
  signal_entity_id: privateId, signal_entity_type: z.literal("urn:entity:artist"), signal_review_sha256: sha, p01_raw_sha256: sha,
  p01_source_attempt_id: z.literal(SAVED_P01_ATTEMPT), signal_identity_reviewed: z.literal(true),
  // The exact request the owner approved (by hash) and the consent it came from. The runner recomputes the request and refuses a mismatch.
  request_sha256: sha, consent_terms_sha256: sha, consent_proposal_id: z.uuidv4(),
  location_parameters_reviewed: z.literal(true), locality_filter_unverified_acknowledged: z.literal(true),
  silent_parameter_ignore_acknowledged: z.literal(true), unreviewed_semantics_acknowledged: z.literal(true),
  prior_probe_dispatches_reviewed: z.strictObject({ P01: z.literal(1), P02: z.literal(1), P03: z.literal(1), P04: z.literal(1), P03R: z.literal(1), P05: z.literal(1), P06: z.literal(1) }) });
export type P07Checkpoint = z.infer<typeof P07CheckpointSchema>;
export function validP07Checkpoint(value: unknown, now = Date.now()): boolean {
  const v = P07CheckpointSchema.safeParse(value);
  return v.success && v.data.prior_reserved_attempts === 0 && v.data.previous_attempt_id === null && v.data.consent_proposal_id === v.data.attempt_id &&
    validProbeWindow(v.data, now);
}
// A new summary version: P01-P04 (v2), P03-R (v3), P05 (v4) and P06 (v5) contracts keep their original shape and history.
export const P07SummarySchema = z.strictObject({ ...P01SummarySchema.shape,
  schema_revision: z.literal("tastegate.raw-probe.v6"), probe: z.literal("P07"),
  profile_revision: z.literal(P07_PROFILE.revision), max_response_bytes: z.literal(262_144),
  response_bytes: z.number().int().min(0).max(262_145).nullable(),
}).superRefine(rawSummaryInvariant).superRefine((v, ctx) => {
  if ((v.response_bytes === 262_145 && !["RESPONSE_TOO_LARGE", "EVIDENCE_UNAVAILABLE"].includes(v.reason)) ||
      (v.dispatches === 1 && v.reason === "RESPONSE_TOO_LARGE" && (v.response_bytes !== 262_145 || v.raw_saved_privately)) ||
      (v.raw_saved_privately && (v.response_bytes === null || v.response_bytes > 262_144)))
    ctx.addIssue({ code: "custom", message: "P07 capture exceeds its independently reviewed budget" });
});
export type P07Summary = z.infer<typeof P07SummarySchema>;
export function blockedP07(reason: ProbeReason = "CHECKPOINT_REQUIRED", attemptId: string | null = null): P07Summary {
  return P07SummarySchema.parse({ ...blockedP01(reason, attemptId), schema_revision: "tastegate.raw-probe.v6", probe: "P07",
    profile_revision: P07_PROFILE.revision, max_response_bytes: 262_144 });
}
