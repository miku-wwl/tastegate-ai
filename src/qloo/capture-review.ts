import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { assertServer } from "./boundary-error";
import { decodeJson, readPrivateSmall } from "./p07-consent";
import { interpretNycDiscovery } from "./p07-interpretation";

// Offline building blocks only. No guessed P07 fields, new transport, approval, executor or replay profile.
// The body is opaque until the existing, pre-registered projection accepts it. A seal records byte integrity and a
// local structural review; it never authorizes adapter replay, establishes a venue identity or verifies a repair.
export const captureSha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const Review = z.strictObject({ body_sha256: sha, structural_review: z.literal("REVIEWED"),
  projection_revision: z.string().regex(/^[a-z0-9.-]{1,80}$/), reviewed_utc: z.iso.datetime() });
const FILES = ["attempt.json", "summary.json", "response.raw.json"] as const;

export function inspectCapturedBody(bytes: Uint8Array) {
  assertServer();
  if (!bytes.length || bytes.length > 262144) throw new Error("CAPTURE_SIZE_INVALID");
  try {
    const value = decodeJson(Buffer.from(bytes));
    const interpretation = interpretNycDiscovery(value);
    return { status: interpretation.class === "E_UNUSABLE" ? "SCHEMA_REVIEW_REQUIRED" as const : "REVIEWED_PROJECTION_COMPATIBLE" as const,
      bytes: bytes.length, interpretation, replay: "NOT_ENABLED" as const, repair: "NOT_VERIFIED" as const };
  } catch { throw new Error("CAPTURE_JSON_INVALID"); }
}

export async function sealReviewedCapture(projectRoot: string, attemptId: string, reviewInput: unknown) {
  assertServer();
  try {
    if (!z.uuidv4().safeParse(attemptId).success) throw new Error();
    const review = Review.parse(reviewInput);
    const root = await realpath(projectRoot);
    const parts = ["private", "qloo-probes", "p07", "attempts", attemptId];
    const captured = await Promise.all(FILES.map(async (name) => {
      const bytes = await readPrivateSmall(root, [...parts, name], name === "response.raw.json" ? 262144 : 65536);
      if (!bytes) throw new Error(); return { name, bytes };
    }));
    const raw = captured.find((f) => f.name === "response.raw.json")!;
    if (captureSha256(raw.bytes) !== review.body_sha256) throw new Error();
    const inspected = inspectCapturedBody(raw.bytes);
    if (inspected.status !== "REVIEWED_PROJECTION_COMPATIBLE") throw new Error();
    const seal = { revision: "tastegate.capture-review-seal.v1", review,
      files: captured.map((f) => ({ name: f.name, sha256: captureSha256(f.bytes) })),
      geography: inspected.interpretation, replay: "NOT_ENABLED", repair: "NOT_VERIFIED" };
    // Exclusive write, like the existing P06 seal. Historical records and prior seals are never overwritten.
    const path = join(root, ...parts, "capture-review-seal.json");
    const handle = await open(path, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(seal, null, 2) + "\n"); await handle.sync(); } finally { await handle.close(); }
    return { status: "SEALED_REPLAY_NOT_ENABLED" as const, files: FILES.length, repair: "NOT_VERIFIED" as const };
  } catch { throw new Error("CAPTURE_SEAL_REFUSED"); }
}

// Re-read and re-hash on every future use. The manifest's presence alone is not evidence of integrity.
export async function verifyCaptureSeal(projectRoot: string, attemptId: string) {
  assertServer();
  try {
    if (!z.uuidv4().safeParse(attemptId).success) throw new Error();
    const root = await realpath(projectRoot), parts = ["private", "qloo-probes", "p07", "attempts", attemptId];
    const bytes = await readPrivateSmall(root, [...parts, "capture-review-seal.json"], 16384); if (!bytes) throw new Error();
    const sealed = z.strictObject({ revision: z.literal("tastegate.capture-review-seal.v1"), review: Review,
      files: z.array(z.strictObject({ name: z.enum(FILES), sha256: sha })).length(3),
      geography: z.unknown(), replay: z.literal("NOT_ENABLED"), repair: z.literal("NOT_VERIFIED") }).parse(decodeJson(bytes));
    if (new Set(sealed.files.map((f) => f.name)).size !== 3) throw new Error();
    for (const entry of sealed.files) {
      const data = await readPrivateSmall(root, [...parts, entry.name], entry.name === "response.raw.json" ? 262144 : 65536);
      if (!data || captureSha256(data) !== entry.sha256) throw new Error();
      if (entry.name === "response.raw.json" && (entry.sha256 !== sealed.review.body_sha256 ||
          JSON.stringify(inspectCapturedBody(data).interpretation) !== JSON.stringify(sealed.geography))) throw new Error();
    }
    return { status: "CAPTURE_REVIEW_INTACT_REPLAY_NOT_ENABLED" as const, repair: "NOT_VERIFIED" as const };
  } catch { throw new Error("CAPTURE_SEAL_INVALID"); }
}
