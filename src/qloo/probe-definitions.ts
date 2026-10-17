import { P01_PROFILE, P01ProfileSchema, P01CheckpointSchema, P01SummarySchema, validP01Checkpoint, blockedP01, type P01Summary } from "./p01-profile";
import { P02_PROFILE, P02ProfileSchema, P02CheckpointSchema, P02SummarySchema, validP02Checkpoint, blockedP02, type P02Summary } from "./p02-profile";

export type ExecutableProbe = "P01" | "P02";
export type RawProbeSummary = P01Summary | P02Summary;
const definitions = Object.freeze({
  P01: Object.freeze({ profile: P01_PROFILE, profileSchema: P01ProfileSchema, checkpointSchema: P01CheckpointSchema,
    summarySchema: P01SummarySchema, validCheckpoint: validP01Checkpoint, blocked: blockedP01 }),
  P02: Object.freeze({ profile: P02_PROFILE, profileSchema: P02ProfileSchema, checkpointSchema: P02CheckpointSchema,
    summarySchema: P02SummarySchema, validCheckpoint: validP02Checkpoint, blocked: blockedP02 }),
});
// Closed trusted registry. P03/P04 are plans, never executable definitions; no caller URL/host registry.
export function probeDefinition(id: ExecutableProbe) {
  if (id !== "P01" && id !== "P02") throw new Error("PROBE_NOT_EXECUTABLE");
  return definitions[id];
}
