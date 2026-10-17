import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { P01_PROFILE, P01ProfileSchema, P01CheckpointSchema, P01SummarySchema } from "./p01-profile";
import { SAVED_P01_ATTEMPT } from "./p02-profile";
import { observeSearch } from "./search-observation";

async function readPrivate(root: string, name: string, cap: number) {
  let path = root;
  for (const part of ["private", "qloo-probes", "p01", "attempts", SAVED_P01_ATTEMPT]) {
    path = join(path, part); const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path) throw new Error("P01_REUSE_REVIEW_REQUIRED");
  }
  path = join(path, name); const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > cap || await realpath(path) !== path) throw new Error("P01_REUSE_REVIEW_REQUIRED");
  const bytes = await readFile(path);
  if (bytes.length > cap) throw new Error("P01_REUSE_REVIEW_REQUIRED");
  return bytes;
}
const json = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
// Returns a PRIVATE binding and sanitized counts; callers must never print or export raw bytes/hash.
export async function inspectSavedP01(projectRoot: string) {
  const root = await realpath(projectRoot);
  const record = z.object({ profile: P01ProfileSchema, checkpoint: P01CheckpointSchema }).parse(json(await readPrivate(root, "attempt.json", 32768)));
  const summary = z.object({ summary: P01SummarySchema }).parse(json(await readPrivate(root, "summary.json", 32768))).summary;
  if (record.checkpoint.attempt_id !== SAVED_P01_ATTEMPT || summary.attempt_id !== SAVED_P01_ATTEMPT ||
      summary.source_mode !== "live_probe" || summary.dispatches !== 1 || summary.http_status !== 200 ||
      !summary.raw_saved_privately || !summary.transport_settled) throw new Error("P01_REUSE_REVIEW_REQUIRED");
  const raw = await readPrivate(root, "response.raw.json", 65536);
  const integrity = z.object({ raw_sha256: z.string().regex(/^[a-f0-9]{64}$/), response_bytes: z.number().int() })
    .parse(json(await readPrivate(root, "raw-integrity.private.json", 8192)));
  const rawSha256 = createHash("sha256").update(raw).digest("hex");
  if (rawSha256 !== integrity.raw_sha256 || raw.length !== integrity.response_bytes || raw.length !== summary.response_bytes)
    throw new Error("P01_REUSE_REVIEW_REQUIRED");
  const observation = observeSearch(json(raw), "urn:entity:artist", P01_PROFILE.params.query);
  return { rawSha256, observation, sourceAttempt: SAVED_P01_ATTEMPT };
}
