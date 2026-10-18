import { z } from "zod";
import { HACKATHON_ORIGIN } from "./server-config";
import { P01CheckpointSchema, P01SummarySchema, blockedP01, validProbeWindow, rawSummaryInvariant, type ProbeReason } from "./p01-profile";
import { P03_PROFILE } from "./p03-profile";

export const HISTORICAL_P03_ATTEMPT = "0db5496e-4055-43da-9043-0c6591d7e5d9" as const;
export const P03R_PROFILE = Object.freeze({ revision: "tastegate.p03r.bluenote-nyc.capture-256k.v1" as const,
  method: "GET" as const, origin: HACKATHON_ORIGIN, path: "/search" as const, max_response_bytes: 262_144 as const,
  params: Object.freeze({ query: "Blue Note New York", types: "urn:entity:place", take: "1", page: "1" }) });
export const P03RProfileSchema = z.strictObject({ revision: z.literal(P03R_PROFILE.revision), method: z.literal("GET"),
  origin: z.literal(HACKATHON_ORIGIN), path: z.literal("/search"), max_response_bytes: z.literal(262_144),
  params: z.strictObject({ query: z.literal("Blue Note New York"), types: z.literal("urn:entity:place"), take: z.literal("1"), page: z.literal("1") }) });
export const P03RCheckpointSchema = z.strictObject({ ...P01CheckpointSchema.shape,
  revision: z.literal("tastegate.p03r.checkpoint.v1"), profile_revision: z.literal(P03R_PROFILE.revision),
  approval: z.literal("APPROVE_P03R_NYC_ONLY"), max_response_bytes: z.literal(262_144),
  public_venue_confirmed: z.literal(true), independent_location_reviewed: z.literal(true),
  expanded_capture_budget_acknowledged: z.literal(true), recovery_is_new_attempt: z.literal(true),
  historical_p03_reviewed: z.strictObject({ attempt_id: z.literal(HISTORICAL_P03_ATTEMPT),
    profile_revision: z.literal(P03_PROFILE.revision), reason: z.literal("RESPONSE_TOO_LARGE"), dispatches: z.literal(1) }),
  prior_probe_dispatches_reviewed: z.strictObject({ P01: z.literal(1), P02: z.literal(1), P03: z.literal(1), P04: z.literal(1) }) });
export type P03RCheckpoint = z.infer<typeof P03RCheckpointSchema>;
export function validP03RCheckpoint(value: unknown, now = Date.now()): boolean {
  const result = P03RCheckpointSchema.safeParse(value);
  return result.success && result.data.attempt_id !== HISTORICAL_P03_ATTEMPT && validProbeWindow(result.data, now);
}
// New version only. Historical v2 contracts keep their original 65537 bound and shape.
export const P03RSummarySchema = z.strictObject({ ...P01SummarySchema.shape,
  schema_revision: z.literal("tastegate.raw-probe.v3"), probe: z.literal("P03R"),
  profile_revision: z.literal(P03R_PROFILE.revision), max_response_bytes: z.literal(262_144),
  response_bytes: z.number().int().min(0).max(262_145).nullable(),
}).superRefine(rawSummaryInvariant).superRefine((v, ctx) => {
  if ((v.response_bytes === 262_145 && !["RESPONSE_TOO_LARGE", "EVIDENCE_UNAVAILABLE"].includes(v.reason)) ||
      (v.dispatches === 1 && v.reason === "RESPONSE_TOO_LARGE" && (v.response_bytes !== 262_145 || v.raw_saved_privately)) ||
      (v.raw_saved_privately && (v.response_bytes === null || v.response_bytes > 262_144)))
    ctx.addIssue({ code: "custom", message: "Capture size must match the reviewed P03R profile and outcome" });
});
export type P03RSummary = z.infer<typeof P03RSummarySchema>;
export function blockedP03R(reason: ProbeReason = "CHECKPOINT_REQUIRED", attemptId: string | null = null): P03RSummary {
  return P03RSummarySchema.parse({ ...blockedP01(reason, attemptId), schema_revision: "tastegate.raw-probe.v3", probe: "P03R",
    profile_revision: P03R_PROFILE.revision, max_response_bytes: 262_144 });
}
