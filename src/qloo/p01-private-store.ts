import { type P01Checkpoint, P01SummarySchema } from "./p01-profile";
import { createPrivateProbeStore, inspectPrivateProbeLedger, liveProbeFromPrivateCheckpoint, type SourceRecord } from "./raw-probe-store";

export function inspectPrivateP01Ledger(root: string) { return inspectPrivateProbeLedger(root, "P01"); }
export function createPrivateP01Store(root: string, checkpoint: P01Checkpoint, source: SourceRecord | null = null) {
  return createPrivateProbeStore(root, "P01", checkpoint, source);
}
export async function liveP01FromPrivateCheckpoint(root: string, signal?: AbortSignal) {
  return P01SummarySchema.parse(await liveProbeFromPrivateCheckpoint(root, "P01", signal));
}
