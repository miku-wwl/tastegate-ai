import { type P03RCheckpoint, P03RSummarySchema } from "./p03r-profile";
import { createPrivateProbeStore, inspectPrivateProbeLedger, liveProbeFromPrivateCheckpoint, type SourceRecord } from "./raw-probe-store";

export function inspectPrivateP03RLedger(root: string) { return inspectPrivateProbeLedger(root, "P03R"); }
export function createPrivateP03RStore(root: string, checkpoint: P03RCheckpoint, source: SourceRecord | null = null) {
  return createPrivateProbeStore(root, "P03R", checkpoint, source);
}
export async function liveP03RFromPrivateCheckpoint(root: string, signal?: AbortSignal) {
  return P03RSummarySchema.parse(await liveProbeFromPrivateCheckpoint(root, "P03R", signal));
}
