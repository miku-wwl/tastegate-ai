import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { inspectSavedP01 } from "./p01-reuse";
import { SAVED_P01_ATTEMPT } from "./p02-profile";
import { P05CheckpointSchema } from "./p05-profile";

const id = z.string().min(1).max(256).regex(/^[^\s\u0000-\u001f\u007f]+$/u);
export const P05SignalReviewSchema = z.strictObject({ revision: z.literal("tastegate.p05.radiohead-review.v1"),
  decision: z.literal("ACCEPTED_FOR_P05_ONLY"), independent_review_completed: z.literal(true),
  source_attempt_id: z.literal(SAVED_P01_ATTEMPT), p01_raw_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  selected_entity_id: id, entity_name: z.literal("Radiohead"), entity_type: z.literal("urn:entity:artist"),
  musicbrainz_id: z.uuid(), spotify_id: id, public_musicbrainz_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  review_scope: z.literal("ARTIST_IDENTITY_ONLY_NO_AFFINITY_OR_DISPATCH_AUTHORITY") });
export type P05SignalBinding = Readonly<{ entityId: string; reviewSha256: string; p01RawSha256: string }>;
// Untrusted checkpoint/model objects cannot construct a trusted in-process binding.
const bindings = new WeakSet<object>();
export function matchesP05Signal(checkpoint: unknown, binding?: P05SignalBinding): binding is P05SignalBinding {
  const cp = P05CheckpointSchema.safeParse(checkpoint);
  return !!binding && bindings.has(binding) && cp.success && cp.data.signal_entity_id === binding.entityId &&
    cp.data.signal_review_sha256 === binding.reviewSha256 && cp.data.p01_raw_sha256 === binding.p01RawSha256;
}
// The same trust check for a later probe's checkpoint that carries the P05 identity fields (P07 sends this signal too).
export function matchesAcceptedSignal(fields: { signal_entity_id: string; signal_review_sha256: string; p01_raw_sha256: string }, binding?: P05SignalBinding): binding is P05SignalBinding {
  return !!binding && bindings.has(binding) && fields.signal_entity_id === binding.entityId &&
    fields.signal_review_sha256 === binding.reviewSha256 && fields.p01_raw_sha256 === binding.p01RawSha256;
}
async function boundedPrivate(root: string, parts: string[], cap: number) {
  let path = root;
  for (const part of parts) {
    path = join(path, part); const info = await lstat(path);
    if (info.isSymbolicLink() || await realpath(path) !== path || (process.platform !== "win32" && (info.mode & 0o077))) throw new Error();
  }
  const info = await lstat(path); if (!info.isFile() || info.size > cap) throw new Error();
  const bytes = await readFile(path); if (bytes.length > cap) throw new Error(); return bytes;
}
// Local read/verification only. This never searches by rank, accepts a new ID, or issues HTTP.
// The private manual review is an operator assertion, not authenticated human consent.
export async function inspectAcceptedP05Signal(projectRoot: string): Promise<P05SignalBinding> {
  try {
    const root = await realpath(projectRoot), base = ["private", "qloo-probes"];
    const reviewBytes = await boundedPrivate(root, [...base, "p05-radiohead-identity.private.json"], 8192);
    const review = P05SignalReviewSchema.parse(JSON.parse(reviewBytes.toString("utf8")));
    const saved = await inspectSavedP01(root);
    if (saved.rawSha256 !== review.p01_raw_sha256) throw new Error();
    const raw = await boundedPrivate(root, [...base, "p01", "attempts", SAVED_P01_ATTEMPT, "response.raw.json"], 65_536);
    if (createHash("sha256").update(raw).digest("hex") !== saved.rawSha256) throw new Error();
    const candidates = z.object({ results: z.array(z.unknown()) }).parse(JSON.parse(raw.toString("utf8"))).results;
    const matches = candidates.filter(v => !!v && typeof v === "object" && (v as { entity_id?: unknown }).entity_id === review.selected_entity_id);
    if (matches.length !== 1) throw new Error();
    const candidate = z.object({ name: z.literal("Radiohead"), types: z.array(z.string()),
      properties: z.object({ external: z.object({ musicbrainz: z.object({ id: z.literal(review.musicbrainz_id) }), spotify: z.object({ id: z.literal(review.spotify_id) }) }) }) }).parse(matches[0]);
    if (!candidate.types.includes("urn:entity:artist") || new Set(candidate.types).size !== candidate.types.length) throw new Error();
    const publicBytes = await boundedPrivate(root, [...base, "p05-radiohead-musicbrainz.public.json"], 131_072);
    if (createHash("sha256").update(publicBytes).digest("hex") !== review.public_musicbrainz_sha256) throw new Error();
    const publicRecord = z.object({ id: z.literal(review.musicbrainz_id), name: z.literal("Radiohead"), type: z.literal("Group"),
      relations: z.array(z.object({ type: z.string(), url: z.object({ resource: z.string() }).optional() })) }).parse(JSON.parse(publicBytes.toString("utf8")));
    if (!publicRecord.relations.some(v => v.type === "official homepage" && ["https://www.radiohead.com/", "https://radiohead.com/", "http://www.radiohead.com/"].includes(v.url?.resource ?? "")) ||
        !publicRecord.relations.some(v => v.url?.resource === "https://open.spotify.com/artist/" + review.spotify_id)) throw new Error();
    const binding = Object.freeze({ entityId: review.selected_entity_id,
      reviewSha256: createHash("sha256").update(reviewBytes).digest("hex"), p01RawSha256: saved.rawSha256 });
    bindings.add(binding); return binding;
  } catch { throw new Error("P05_SIGNAL_IDENTITY_REVIEW_REQUIRED"); }
}
