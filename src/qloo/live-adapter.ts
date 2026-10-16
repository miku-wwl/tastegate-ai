import type { LiveQlooAdapter } from "./ports";
import { assertServer, QlooBoundaryError } from "./boundary-error";
import type { QlooServerConfig } from "./server-config";

// Intentionally incomplete: no production transport, wire mapper, verification flag or fixture fallback.
// Even a configured key cannot enable this adapter. P01-P10 and separate review are required first.
export function createDisabledLiveAdapter(config: QlooServerConfig): LiveQlooAdapter {
  assertServer();
  if (config.mode !== "live") throw new QlooBoundaryError("MODE_MISMATCH");
  const blocked = async (): Promise<never> => { throw new QlooBoundaryError("LIVE_NOT_VERIFIED"); };
  return Object.freeze({ mode: "live", searchEntity: blocked, searchTags: blocked, rankPlaces: blocked, discoverPlaces: blocked });
}
