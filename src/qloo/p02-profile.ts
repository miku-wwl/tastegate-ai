import { z } from "zod";
import { HACKATHON_ORIGIN } from "./server-config";
import { P01CheckpointSchema, P01SummarySchema, blockedP01, validProbeWindow, rawSummaryInvariant, type ProbeReason } from "./p01-profile";

export const SAVED_P01_ATTEMPT = "ed655afc-82d7-4efd-ba99-9f55bd031f27" as const;
// A proposal only: this constant does not establish operator confirmation or provider identity.
export const P02_FILM_PROPOSAL = Object.freeze({ title: "In the Mood for Love", year: 2000, director: "Wong Kar Wai",
  reference: "https://www.criterion.com/films/198-in-the-mood-for-love" });
export const P02_PROFILE = Object.freeze({ revision: "tastegate.p02.film.v1" as const, method: "GET" as const,
  origin: HACKATHON_ORIGIN, path: "/search" as const,
  params: Object.freeze({ query: P02_FILM_PROPOSAL.title, types: "urn:entity:movie", take: "5", page: "1" }) });
export const P02ProfileSchema = z.strictObject({ revision: z.literal(P02_PROFILE.revision), method: z.literal("GET"),
  origin: z.literal(HACKATHON_ORIGIN), path: z.literal("/search"),
  params: z.strictObject({ query: z.literal("In the Mood for Love"), types: z.literal("urn:entity:movie"), take: z.literal("5"), page: z.literal("1") }) });
export const P02CheckpointSchema = z.strictObject({ ...P01CheckpointSchema.shape,
  revision: z.literal("tastegate.p02.checkpoint.v1"), profile_revision: z.literal(P02_PROFILE.revision), approval: z.literal("APPROVE_P02_ONLY"),
  film_selection_confirmed: z.literal(true), p01_reuse_reviewed: z.literal(true), p01_source_attempt_id: z.literal(SAVED_P01_ATTEMPT),
  p01_raw_sha256: z.string().regex(/^[a-f0-9]{64}$/), p01_total_dispatches_reviewed: z.literal(1) });
export type P02Checkpoint = z.infer<typeof P02CheckpointSchema>;
export function validP02Checkpoint(value: unknown, now = Date.now()): boolean {
  const result = P02CheckpointSchema.safeParse(value);
  return result.success && result.data.attempt_id !== SAVED_P01_ATTEMPT && validProbeWindow(result.data, now);
}
export const P02SummarySchema = z.strictObject({ ...P01SummarySchema.shape, probe: z.literal("P02") }).superRefine(rawSummaryInvariant);
export type P02Summary = z.infer<typeof P02SummarySchema>;
export function blockedP02(reason: ProbeReason = "CHECKPOINT_REQUIRED", attemptId: string | null = null): P02Summary {
  return P02SummarySchema.parse({ ...blockedP01(reason, attemptId), probe: "P02" });
}
