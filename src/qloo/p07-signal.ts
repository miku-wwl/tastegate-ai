import { matchesAcceptedSignal, type P05SignalBinding } from "./p05-signal";
import { P07CheckpointSchema } from "./p07-profile";

// P07 sends the artist signal that P05 and P06 already used. Its identity is not re-reviewed here: the trusted in-process binding
// can only be minted by `inspectAcceptedP05Signal`, which re-derives it from the immutable P01 capture and the public record.
// A checkpoint, a copied object or a model can never stand in for it.
export function matchesP07Signal(checkpoint: unknown, binding?: P05SignalBinding): binding is P05SignalBinding {
  const cp = P07CheckpointSchema.safeParse(checkpoint);
  return cp.success && matchesAcceptedSignal(cp.data, binding);
}
