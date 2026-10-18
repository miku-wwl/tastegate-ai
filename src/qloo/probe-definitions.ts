import { P01_PROFILE, P01ProfileSchema, P01CheckpointSchema, P01SummarySchema, validP01Checkpoint, blockedP01, type P01Summary } from "./p01-profile";
import { P02_PROFILE, P02ProfileSchema, P02CheckpointSchema, P02SummarySchema, validP02Checkpoint, blockedP02, type P02Summary } from "./p02-profile";
import { P03_PROFILE, P03ProfileSchema, P03CheckpointSchema, P03SummarySchema, validP03Checkpoint, blockedP03, type P03Summary } from "./p03-profile";
import { P04_PROFILE, P04ProfileSchema, P04CheckpointSchema, P04SummarySchema, validP04Checkpoint, blockedP04, type P04Summary } from "./p04-profile";
import { P03R_PROFILE, P03RProfileSchema, P03RCheckpointSchema, P03RSummarySchema, validP03RCheckpoint, blockedP03R, type P03RSummary } from "./p03r-profile";

export const EXECUTABLE_PROBES = Object.freeze(["P01", "P02", "P03", "P04", "P03R"] as const);
export type ExecutableProbe = typeof EXECUTABLE_PROBES[number];
export type RawProbeSummary = P01Summary | P02Summary | P03Summary | P04Summary | P03RSummary;
const definitions = Object.freeze({
  P01: Object.freeze({ profile: P01_PROFILE, profileSchema: P01ProfileSchema, checkpointSchema: P01CheckpointSchema,
    summarySchema: P01SummarySchema, validCheckpoint: validP01Checkpoint, blocked: blockedP01, maxResponseBytes: 65_536 }),
  P02: Object.freeze({ profile: P02_PROFILE, profileSchema: P02ProfileSchema, checkpointSchema: P02CheckpointSchema,
    summarySchema: P02SummarySchema, validCheckpoint: validP02Checkpoint, blocked: blockedP02, maxResponseBytes: 65_536 }),
  P03: Object.freeze({ profile: P03_PROFILE, profileSchema: P03ProfileSchema, checkpointSchema: P03CheckpointSchema,
    summarySchema: P03SummarySchema, validCheckpoint: validP03Checkpoint, blocked: blockedP03, maxResponseBytes: 65_536 }),
  P04: Object.freeze({ profile: P04_PROFILE, profileSchema: P04ProfileSchema, checkpointSchema: P04CheckpointSchema,
    summarySchema: P04SummarySchema, validCheckpoint: validP04Checkpoint, blocked: blockedP04, maxResponseBytes: 65_536 }),
  P03R: Object.freeze({ profile: P03R_PROFILE, profileSchema: P03RProfileSchema, checkpointSchema: P03RCheckpointSchema,
    summarySchema: P03RSummarySchema, validCheckpoint: validP03RCheckpoint, blocked: blockedP03R, maxResponseBytes: P03R_PROFILE.max_response_bytes }),
});
// Closed trusted registry. P05-P10 remain excluded; no caller URL/host registry.
export function probeDefinition(id: ExecutableProbe) {
  if (id !== "P01" && id !== "P02" && id !== "P03" && id !== "P04" && id !== "P03R") throw new Error("PROBE_NOT_EXECUTABLE");
  return definitions[id];
}
