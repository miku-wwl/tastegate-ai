import { type P03Checkpoint, P03SummarySchema } from "./p03-profile";
import { createPrivateProbeStore, inspectPrivateProbeLedger, liveProbeFromPrivateCheckpoint, type SourceRecord } from "./raw-probe-store";

export function inspectPrivateP03Ledger(root: string) { return inspectPrivateProbeLedger(root, "P03"); }
export function createPrivateP03Store(root: string, checkpoint: P03Checkpoint, source: SourceRecord | null = null) {
  return createPrivateProbeStore(root, "P03", checkpoint, source);
}
export async function liveP03FromPrivateCheckpoint(root: string, signal?: AbortSignal) {
  return P03SummarySchema.parse(await liveProbeFromPrivateCheckpoint(root, "P03", signal));
}
