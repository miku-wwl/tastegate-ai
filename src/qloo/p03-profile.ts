import { z } from "zod";
import { HACKATHON_ORIGIN } from "./server-config";
import { P01CheckpointSchema, P01SummarySchema, blockedP01, validProbeWindow, rawSummaryInvariant, type ProbeReason } from "./p01-profile";

// Public proposal only. This reference establishes no provider coverage or selected ID.
export const P03_VENUE_PROPOSAL = Object.freeze({ name: "Blue Note New York",
  address: "131 West 3rd Street, New York, NY 10012", reference: "https://www.bluenotejazz.com/nyc/contact/" });
export const P03_PROFILE = Object.freeze({ revision: "tastegate.p03.bluenote-nyc.v1" as const, method: "GET" as const,
  origin: HACKATHON_ORIGIN, path: "/search" as const,
  params: Object.freeze({ query: P03_VENUE_PROPOSAL.name, types: "urn:entity:place", take: "3", page: "1" }) });
export const P03ProfileSchema = z.strictObject({ revision: z.literal(P03_PROFILE.revision), method: z.literal("GET"),
  origin: z.literal(HACKATHON_ORIGIN), path: z.literal("/search"),
  params: z.strictObject({ query: z.literal("Blue Note New York"), types: z.literal("urn:entity:place"), take: z.literal("3"), page: z.literal("1") }) });
export const P03CheckpointSchema = z.strictObject({ ...P01CheckpointSchema.shape,
  revision: z.literal("tastegate.p03.checkpoint.v1"), profile_revision: z.literal(P03_PROFILE.revision),
  approval: z.literal("APPROVE_P03_NYC_ONLY"), public_venue_confirmed: z.literal(true), independent_location_reviewed: z.literal(true),
  prior_probe_dispatches_reviewed: z.strictObject({ P01: z.literal(1), P02: z.literal(1), P04: z.literal(1) }) });
export type P03Checkpoint = z.infer<typeof P03CheckpointSchema>;
export function validP03Checkpoint(value: unknown, now = Date.now()): boolean {
  const result = P03CheckpointSchema.safeParse(value);
  return result.success && validProbeWindow(result.data, now);
}
export const P03SummarySchema = z.strictObject({ ...P01SummarySchema.shape, probe: z.literal("P03") }).superRefine(rawSummaryInvariant);
export type P03Summary = z.infer<typeof P03SummarySchema>;
export function blockedP03(reason: ProbeReason = "CHECKPOINT_REQUIRED", attemptId: string | null = null): P03Summary {
  return P03SummarySchema.parse({ ...blockedP01(reason, attemptId), probe: "P03" });
}
