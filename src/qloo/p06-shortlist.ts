import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { inspectAcceptedP05Signal, type P05SignalBinding } from "./p05-signal";
import { P06CheckpointSchema, SAVED_P03R_ATTEMPT, SAVED_P05_ATTEMPT } from "./p06-profile";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(256).regex(/^[^\s\u0000-\u001f\u007f,]+$/u);
// Private reviewer assertion (not authenticated human consent, not dispatch authority). It records WHICH two
// previously captured places form the shortlist, and binds them to the exact immutable captures they came from.
export const P06ShortlistReviewSchema = z.strictObject({ revision: z.literal("tastegate.p06.shortlist-review.v1"),
  decision: z.literal("ACCEPTED_FOR_P06_ONLY"), review_scope: z.literal("SHORTLIST_IDENTITY_BINDING_ONLY_NO_AFFINITY_OR_DISPATCH_AUTHORITY"),
  signal_review_sha256: sha, p01_raw_sha256: sha,
  reviewed_nyc_candidate: z.strictObject({ entity_id: id, source_probe: z.literal("P03R"), source_attempt_id: z.literal(SAVED_P03R_ATTEMPT),
    source_raw_sha256: sha, source_pointer: z.literal("$.results[0].entity_id") }),
  positive_control: z.strictObject({ entity_id: id, source_probe: z.literal("P05"), source_attempt_id: z.literal(SAVED_P05_ATTEMPT),
    source_raw_sha256: sha, source_pointer: z.literal("$.results.entities[0].entity_id") }) });
export type P06ShortlistReview = z.infer<typeof P06ShortlistReviewSchema>;
export type P06ShortlistBinding = Readonly<{ signalEntityId: string; signalReviewSha256: string; p01RawSha256: string;
  shortlistReviewSha256: string; nycEntityId: string; controlEntityId: string }>;
// Untrusted checkpoint/model objects cannot construct a trusted in-process binding.
const bindings = new WeakSet<object>();
export function matchesP06Shortlist(checkpoint: unknown, binding?: P06ShortlistBinding): binding is P06ShortlistBinding {
  const cp = P06CheckpointSchema.safeParse(checkpoint);
  return !!binding && bindings.has(binding) && cp.success && cp.data.signal_entity_id === binding.signalEntityId &&
    cp.data.signal_review_sha256 === binding.signalReviewSha256 && cp.data.p01_raw_sha256 === binding.p01RawSha256 &&
    cp.data.shortlist_review_sha256 === binding.shortlistReviewSha256 &&
    cp.data.shortlist_entity_ids[0] === binding.nycEntityId && cp.data.shortlist_entity_ids[1] === binding.controlEntityId;
}

export async function readPrivate(root: string, parts: readonly string[], cap: number): Promise<Buffer> {
  let path = root;
  for (const part of parts) {
    path = join(path, part); const info = await lstat(path);
    if (info.isSymbolicLink() || await realpath(path) !== path || (process.platform !== "win32" && (info.mode & 0o077))) throw new Error();
  }
  const info = await lstat(path); if (!info.isFile() || info.size > cap) throw new Error();
  const bytes = await readFile(path); if (bytes.length > cap) throw new Error(); return bytes;
}
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const json = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
const Manifest = z.array(z.strictObject({ path: z.string().min(1).max(300), sha256: sha })).max(200);
const SummaryFile = z.object({ summary: z.object({ probe: z.string(), attempt_id: z.string(), source_mode: z.literal("live_probe"),
  status: z.literal("UNKNOWN"), reason: z.literal("SCHEMA_REVIEW_REQUIRED"), dispatches: z.literal(1), http_status: z.literal(200),
  response_bytes: z.number().int().positive(), raw_saved_privately: z.literal(true), transport_settled: z.literal(true) }) });
const MANIFESTS = { historical: ["phase1b4-review-20261018T220843Z", "all-historical-integrity.private.json"],
  p05: ["phase1b4-p05-execution-review", "post-execution-integrity.private.json"] } as const;
const NycCapture = z.object({ results: z.array(z.object({ entity_id: id, types: z.array(z.string()),
  properties: z.object({ geocode: z.object({ city: z.literal("New York"), country_code: z.literal("US") }) }) })).length(1) });
const ControlCapture = z.object({ success: z.literal(true), results: z.object({ entities: z.array(z.object({ entity_id: id,
  type: z.literal("urn:entity"), subtype: z.literal("urn:entity:place") })).length(1) }) });

export type DerivedShortlist = Readonly<{ signal: P05SignalBinding; nyc: { entityId: string; rawSha256: string }; control: { entityId: string; rawSha256: string } }>;
// Derives the shortlist ONLY from manifest-verified, immutable captures (never from a caller-supplied ID): each raw
// file must match its private integrity manifest and its immutable summary. Local reads only; no HTTP.
export async function deriveP06Shortlist(projectRoot: string): Promise<DerivedShortlist> {
  try {
    const root = await realpath(projectRoot); const base = ["private", "qloo-probes"];
    const signal = await inspectAcceptedP05Signal(root); // re-verifies the artist identity chain against P01 and the public record
    const manifests = new Map<string, Map<string, string>>();
    for (const [name, parts] of Object.entries(MANIFESTS))
      manifests.set(name, new Map(Manifest.parse(json(await readPrivate(root, [...base, ...parts], 65_536))).map((e) => [e.path, e.sha256])));
    async function verifiedRaw(probeDir: string, probe: string, attempt: string, manifest: keyof typeof MANIFESTS) {
      const dir = [probeDir, "attempts", attempt]; const prefix = [...base, ...dir].join("/");
      const raw = await readPrivate(root, [...base, ...dir, "response.raw.json"], 262_144);
      const summaryBytes = await readPrivate(root, [...base, ...dir, "summary.json"], 8192);
      const summary = SummaryFile.parse(json(summaryBytes)).summary; const rawSha = hash(raw);
      if (manifests.get(manifest)?.get(`${prefix}/response.raw.json`) !== rawSha ||
          manifests.get(manifest)?.get(`${prefix}/summary.json`) !== hash(summaryBytes) ||
          summary.probe !== probe || summary.attempt_id !== attempt || summary.response_bytes !== raw.length) throw new Error();
      return { body: json(raw), rawSha };
    }
    const nycCapture = await verifiedRaw("p03r", "P03R", SAVED_P03R_ATTEMPT, "historical");
    const controlCapture = await verifiedRaw("p05", "P05", SAVED_P05_ATTEMPT, "p05");
    const nyc = NycCapture.parse(nycCapture.body).results[0]!;
    const control = ControlCapture.parse(controlCapture.body).results.entities[0]!;
    if (!nyc.types.includes("urn:entity:place") || nyc.entity_id === control.entity_id || [nyc.entity_id, control.entity_id].includes(signal.entityId)) throw new Error();
    return Object.freeze({ signal, nyc: { entityId: nyc.entity_id, rawSha256: nycCapture.rawSha }, control: { entityId: control.entity_id, rawSha256: controlCapture.rawSha } });
  } catch { throw new Error("P06_SHORTLIST_REVIEW_REQUIRED"); }
}
export function buildP06ShortlistReview(derived: DerivedShortlist): P06ShortlistReview {
  return P06ShortlistReviewSchema.parse({ revision: "tastegate.p06.shortlist-review.v1", decision: "ACCEPTED_FOR_P06_ONLY",
    review_scope: "SHORTLIST_IDENTITY_BINDING_ONLY_NO_AFFINITY_OR_DISPATCH_AUTHORITY",
    signal_review_sha256: derived.signal.reviewSha256, p01_raw_sha256: derived.signal.p01RawSha256,
    reviewed_nyc_candidate: { entity_id: derived.nyc.entityId, source_probe: "P03R", source_attempt_id: SAVED_P03R_ATTEMPT,
      source_raw_sha256: derived.nyc.rawSha256, source_pointer: "$.results[0].entity_id" },
    positive_control: { entity_id: derived.control.entityId, source_probe: "P05", source_attempt_id: SAVED_P05_ATTEMPT,
      source_raw_sha256: derived.control.rawSha256, source_pointer: "$.results.entities[0].entity_id" } });
}

// Local read/verification only: re-derives the IDs from verified captures and requires the private review file to
// agree exactly. Nothing is promoted into the product and no HTTP request is issued.
export async function inspectAcceptedP06Shortlist(projectRoot: string): Promise<P06ShortlistBinding> {
  try {
    const root = await realpath(projectRoot);
    const derived = await deriveP06Shortlist(root);
    const reviewBytes = await readPrivate(root, ["private", "qloo-probes", "p06-shortlist-review.private.json"], 8192);
    const review = P06ShortlistReviewSchema.parse(json(reviewBytes));
    const expected = buildP06ShortlistReview(derived);
    if (JSON.stringify(review) !== JSON.stringify(expected)) throw new Error();
    const binding: P06ShortlistBinding = Object.freeze({ signalEntityId: derived.signal.entityId, signalReviewSha256: derived.signal.reviewSha256,
      p01RawSha256: derived.signal.p01RawSha256, shortlistReviewSha256: hash(reviewBytes), nycEntityId: derived.nyc.entityId, controlEntityId: derived.control.entityId });
    bindings.add(binding); return binding;
  } catch { throw new Error("P06_SHORTLIST_REVIEW_REQUIRED"); }
}
