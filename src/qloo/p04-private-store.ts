import { type P04Checkpoint, P04SummarySchema } from "./p04-profile";
import { createPrivateProbeStore, inspectPrivateProbeLedger, liveProbeFromPrivateCheckpoint, type SourceRecord } from "./raw-probe-store";

export function inspectPrivateP04Ledger(root: string) { return inspectPrivateProbeLedger(root, "P04"); }
export function createPrivateP04Store(root: string, checkpoint: P04Checkpoint, source: SourceRecord | null = null) {
  return createPrivateProbeStore(root, "P04", checkpoint, source);
}
export async function liveP04FromPrivateCheckpoint(root: string, signal?: AbortSignal) {
  return P04SummarySchema.parse(await liveProbeFromPrivateCheckpoint(root, "P04", signal));
}
