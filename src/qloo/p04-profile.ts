import { z } from "zod";
import { HACKATHON_ORIGIN } from "./server-config";
import { P01CheckpointSchema, P01SummarySchema, blockedP01, validProbeWindow, rawSummaryInvariant, type ProbeReason } from "./p01-profile";

export const P04_PROFILE = Object.freeze({ revision: "tastegate.p04.jazz.v1" as const, method: "GET" as const,
  origin: HACKATHON_ORIGIN, path: "/v2/tags" as const,
  params: Object.freeze({ "filter.query": "jazz", take: "5", page: "1" }) });
export const P04ProfileSchema = z.strictObject({ revision: z.literal(P04_PROFILE.revision), method: z.literal("GET"),
  origin: z.literal(HACKATHON_ORIGIN), path: z.literal("/v2/tags"),
  params: z.strictObject({ "filter.query": z.literal("jazz"), take: z.literal("5"), page: z.literal("1") }) });
export const P04CheckpointSchema = z.strictObject({ ...P01CheckpointSchema.shape,
  revision: z.literal("tastegate.p04.checkpoint.v1"), profile_revision: z.literal(P04_PROFILE.revision),
  approval: z.literal("APPROVE_P04_ONLY"), public_jazz_query_confirmed: z.literal(true),
  prior_probe_dispatches_reviewed: z.strictObject({ P01: z.literal(1), P02: z.literal(1) }) });
export type P04Checkpoint = z.infer<typeof P04CheckpointSchema>;
export function validP04Checkpoint(value: unknown, now = Date.now()): boolean {
  const result = P04CheckpointSchema.safeParse(value);
  return result.success && validProbeWindow(result.data, now);
}
export const P04SummarySchema = z.strictObject({ ...P01SummarySchema.shape, probe: z.literal("P04") }).superRefine(rawSummaryInvariant);
export type P04Summary = z.infer<typeof P04SummarySchema>;
export function blockedP04(reason: ProbeReason = "CHECKPOINT_REQUIRED", attemptId: string | null = null): P04Summary {
  return P04SummarySchema.parse({ ...blockedP01(reason, attemptId), probe: "P04" });
}
