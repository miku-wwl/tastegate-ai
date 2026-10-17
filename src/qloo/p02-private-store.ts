import { type P02Checkpoint, P02SummarySchema } from "./p02-profile";
import { createPrivateProbeStore, inspectPrivateProbeLedger, liveProbeFromPrivateCheckpoint, type SourceRecord } from "./raw-probe-store";

export function inspectPrivateP02Ledger(root: string) { return inspectPrivateProbeLedger(root, "P02"); }
export function createPrivateP02Store(root: string, checkpoint: P02Checkpoint, source: SourceRecord | null = null) {
  return createPrivateProbeStore(root, "P02", checkpoint, source);
}
export async function liveP02FromPrivateCheckpoint(root: string, signal?: AbortSignal) {
  return P02SummarySchema.parse(await liveProbeFromPrivateCheckpoint(root, "P02", signal));
}
