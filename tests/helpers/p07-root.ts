import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { prepareP06ShortlistReview } from "../../src/qloo/p06-approval";
import { inspectAcceptedP06Shortlist } from "../../src/qloo/p06-shortlist";
import { createLocalRawProbeRunner } from "../../src/qloo/raw-probe-runner";
import { createPrivateProbeStore } from "../../src/qloo/raw-probe-store";
import { QlooServerConfig } from "../../src/qloo/server-config";
import { AUTH, seedP06, type SeedOptions } from "./p06-root";

// ENTIRELY AUTHORED: P01-P05 history comes from seedP06 and a settled P06 attempt is produced by running the real P06 runner and store
// against a local test double. Nothing here contacts a network or uses a real credential, identifier or captured body.
export const p07Config = (ms = "4000") => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: AUTH.key, QLOO_REQUEST_TIMEOUT_MS: ms });
export async function seedP07(options: SeedOptions = {}) {
  const s = await seedP06(options); await prepareP06ShortlistReview(s.root);
  const binding = await inspectAcceptedP06Shortlist(s.root); const cp = await s.checkpoint();
  const store = createPrivateProbeStore(s.root, "P06", cp, null, binding);
  const summary = await createLocalRawProbeRunner("P06", p07Config(), { kind: "local-test-double", send: async () => Response.json({ authored: true }) }, store, binding).run({ checkpoint: cp });
  if (summary.dispatches !== 1 || !summary.transport_settled) throw new Error("seed: the authored P06 attempt did not settle");
  const dir = join(s.base, "p06/attempts", cp.attempt_id);
  const p06Files = (await readdir(dir)).map((name) => join(dir, name));
  return { ...s, p06Files, p06Review: join(s.base, "p06-shortlist-review.private.json"), historical: [...s.historicalFiles, ...p06Files, join(s.base, "p06-shortlist-review.private.json")] };
}
