import { createHmac, randomBytes } from "node:crypto";
import { assertServer } from "./boundary-error";

// Per-process secret: a reference is stable within one server process (so equality checks and a user's
// confirmation round-trip work) but reveals nothing about the raw provider ID and cannot be correlated
// across processes. A server restart therefore invalidates pending confirmations, which fails closed.
const key = randomBytes(32);
export function providerRef(kind: "entity" | "tag", providerId: string): string {
  assertServer();
  return "qloo-ref:" + createHmac("sha256", key).update(`${kind}\u0000${providerId}`).digest("hex").slice(0, 16);
}
