import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RECORDED_SPECS } from "../../src/qloo/recorded-adapter";

// ENTIRELY AUTHORED test data. Shapes mimic the observed envelopes (search `types[]`, tags `id`/`parents`,
// Insights `type`/`subtype`); every name, ID and value is invented. Never copy captured provider bodies here.
export const AUTHORED = {
  artist: "AUTHORED-ARTIST-0001", otherArtist: "AUTHORED-ARTIST-0002", film: "AUTHORED-FILM-0001", otherFilm: "AUTHORED-FILM-0002",
  venue: "AUTHORED-VENUE-0001", far: "AUTHORED-FAR-PLACE-0001", musicTag: "urn:tag:genre:music:authored_jazz", mediaTag: "urn:tag:genre:media:authored_jazz",
};
const sha = (v: Uint8Array | string) => createHash("sha256").update(v).digest("hex");
export function authoredBodies(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    P01: { results: [
      { entity_id: AUTHORED.artist, name: "Authored Band", types: ["urn:entity:artist"], disambiguation: "Authored Band", properties: { external: { authored: { id: "x" } } } },
      { entity_id: AUTHORED.otherArtist, name: "Authored Band Tribute", types: ["urn:entity:artist"] }] },
    P02: { results: [
      { entity_id: AUTHORED.film, name: "Authored Film", types: ["urn:entity:movie"], disambiguation: "2000", tags: [{ name: "Authored drama", tag_id: "urn:tag:genre:media:authored", type: "urn:tag:genre:media" }] },
      { entity_id: AUTHORED.otherFilm, name: "Authored Film Remake", types: ["urn:entity:movie"], disambiguation: "2019" }] },
    P03R: { results: [{ entity_id: AUTHORED.venue, name: "Authored Jazz Room", types: ["urn:entity:place"], disambiguation: "1 Authored St, New York",
      properties: { geocode: { city: "New York", country_code: "US", name: "Authored Village", metro: "ignored" }, hours: { ignored: true } },
      tags: [{ name: "Jazz club", tag_id: "urn:tag:category:place:authored_club", type: "urn:tag:category:place", value: "urn:tag:category:place:authored_club" },
        { name: "Cozy", tag_id: "urn:tag:ambience:qloo:authored_mood", type: "urn:tag:ambience:qloo", value: "urn:tag:ambience:qloo:authored_mood" }] }] },
    P04: { duration: 3, success: true, results: { tags: [
      { id: AUTHORED.musicTag, name: "Jazz", type: "urn:tag:genre:music", parents: [{ type: "urn:entity:artist" }, { type: "urn:entity:album" }], popularity: 0.5, properties: {} },
      { id: AUTHORED.mediaTag, name: "Jazz", type: "urn:tag:genre:media", parents: [{ type: "urn:entity:book" }], properties: {} }] } },
    P05: { success: true, results: { entities: [{ entity_id: AUTHORED.far, name: "Authored Far Pavilion", type: "urn:entity", subtype: "urn:entity:place",
      disambiguation: "9 Authored Way, Authored City", properties: { geocode: { city: "Authored City", country_code: "ES", name: "Authored Quarter" } },
      tags: [{ id: "urn:tag:category:place:authored_landmark", name: "Historical landmark", type: "urn:tag:category:place", weight: null }],
      query: { affinity: 0.5, measurements: { audience_growth: -0.1 } }, popularity: 0.4 }] } },
    ...overrides,
  };
}
// Authored P06 (fixed-shortlist ranking) responses, one per classification outcome. All values are invented.
export type P06Variant = "all" | "partial" | "unexpected" | "unscored" | "disordered" | "non-place" | "unusable";
export const P06_ATTEMPT = "0a0b0c0d-1111-4222-8333-444455556666";
const nycEntity = (affinity: number | null) => ({ entity_id: AUTHORED.venue, name: "Authored Jazz Room", type: "urn:entity", subtype: "urn:entity:place",
  properties: { geocode: { city: "New York", country_code: "US", name: "Authored Village" } }, ...(affinity === null ? {} : { query: { affinity } }) });
const farEntity = (affinity: number | null) => ({ entity_id: AUTHORED.far, name: "Authored Far Pavilion", type: "urn:entity", subtype: "urn:entity:place",
  properties: { geocode: { city: "Authored City", country_code: "ES", name: "Authored Quarter" } }, ...(affinity === null ? {} : { query: { affinity } }) });
export function p06Body(variant: P06Variant): unknown {
  const wrap = (entities: unknown[]) => ({ success: true, results: { entities } });
  switch (variant) {
    case "all": return wrap([nycEntity(0.82), farEntity(0.41)]);
    case "partial": return wrap([farEntity(0.41)]);
    case "unexpected": return wrap([nycEntity(0.82), farEntity(0.41), { ...farEntity(0.2), entity_id: "AUTHORED-INTRUDER-0001" }]);
    case "unscored": return wrap([nycEntity(null), farEntity(null)]);
    case "disordered": return wrap([nycEntity(0.3), farEntity(0.9)]);
    case "non-place": return wrap([nycEntity(0.8), { ...farEntity(0.4), subtype: "urn:entity:brand" }]);
    case "unusable": return { success: false };
  }
}
export type P06SeedOptions = { variant?: P06Variant; body?: unknown; sealed?: boolean; summary?: Record<string, unknown>; omitRaw?: boolean; extraAttempt?: boolean };
export type SeedOptions = { bodies?: Record<string, unknown>; mutate?: (files: Map<string, Buffer>) => void; skipManifestEntry?: string; p06?: P06SeedOptions };
// Writes a private/qloo-probes tree with manifests whose hashes match the files (unless a test mutates them).
export async function seedRecordedRoot(options: SeedOptions = {}): Promise<string> {
  await mkdir(".artifacts", { recursive: true });
  const root = await mkdtemp(resolve(".artifacts/recorded-test-"));
  const bodies = options.bodies ?? authoredBodies();
  const files = new Map<string, Buffer>();
  const p01Raw = Buffer.from(JSON.stringify(bodies.P01));
  const review = Buffer.from(JSON.stringify({ revision: "tastegate.p05.radiohead-review.v1", decision: "ACCEPTED_FOR_P05_ONLY", independent_review_completed: true,
    source_attempt_id: RECORDED_SPECS[0]!.attempt, p01_raw_sha256: sha(p01Raw), selected_entity_id: AUTHORED.artist, entity_name: "Radiohead",
    entity_type: "urn:entity:artist", musicbrainz_id: "11111111-1111-4111-8111-111111111111", spotify_id: "authored", public_musicbrainz_sha256: "0".repeat(64),
    review_scope: "ARTIST_IDENTITY_ONLY_NO_AFFINITY_OR_DISPATCH_AUTHORITY" }));
  files.set("private/qloo-probes/p05-radiohead-identity.private.json", review);
  for (const spec of RECORDED_SPECS) {
    const dir = `private/qloo-probes/${spec.probe.toLowerCase()}/attempts/${spec.attempt}`;
    const raw = spec.reason === "SCHEMA_REVIEW_REQUIRED" ? Buffer.from(JSON.stringify(bodies[spec.probe])) : null;
    files.set(`${dir}/attempt.json`, Buffer.from(JSON.stringify({ profile: { revision: spec.revision, method: "GET", origin: "https://hackathon.api.qloo.com",
      path: spec.endpoint, params: spec.params }, checkpoint: { attempt_id: spec.attempt, ...(spec.probe === "P05" ? { signal_entity_id: AUTHORED.artist,
        signal_review_sha256: sha(review), p01_raw_sha256: sha(p01Raw) } : {}) }, reserved_utc: "2026-10-18T00:00:00.000Z", state: "RESERVED_NO_AUTOMATIC_REPLAY" })));
    files.set(`${dir}/summary.json`, Buffer.from(JSON.stringify({ summary: { probe: spec.probe, attempt_id: spec.attempt, source_mode: "live_probe", status: "UNKNOWN",
      reason: spec.reason, dispatches: 1, http_status: 200, response_bytes: raw ? raw.length : 65_537, raw_saved_privately: !!raw, transport_settled: true } })));
    if (raw) files.set(`${dir}/response.raw.json`, raw);
  }
  if (options.p06) {
    const p06 = options.p06; const dir = `private/qloo-probes/p06/attempts/${P06_ATTEMPT}`;
    const raw = p06.omitRaw ? null : Buffer.from(JSON.stringify(p06.body ?? p06Body(p06.variant ?? "all")));
    files.set(`${dir}/attempt.json`, Buffer.from(JSON.stringify({ record_revision: "tastegate.probe-attempt.v5", profile_revision: "tastegate.p06.shortlist-rank.capture-256k.v1",
      profile: { revision: "tastegate.p06.shortlist-rank.capture-256k.v1", method: "GET", origin: "https://hackathon.api.qloo.com", path: "/v2/insights" },
      checkpoint: { attempt_id: P06_ATTEMPT, approval: "APPROVE_P06_SHORTLIST_RANK_ONLY", signal_entity_id: AUTHORED.artist, signal_review_sha256: sha(review),
        p01_raw_sha256: sha(p01Raw), shortlist_entity_ids: [AUTHORED.venue, AUTHORED.far] }, reserved_utc: "2026-10-20T00:00:00.000Z" })));
    files.set(`${dir}/summary.json`, Buffer.from(JSON.stringify({ summary: { probe: "P06", attempt_id: P06_ATTEMPT, source_mode: "live_probe", status: "UNKNOWN",
      reason: "SCHEMA_REVIEW_REQUIRED", dispatches: 1, http_status: 200, response_bytes: raw ? raw.length : 0, raw_saved_privately: !!raw, transport_settled: true, ...p06.summary } })));
    if (raw) files.set(`${dir}/response.raw.json`, raw);
    if (p06.extraAttempt) files.set("private/qloo-probes/p06/attempts/1b1c1d1e-2222-4333-9444-555566667777/attempt.json", Buffer.from("{}"));
    if (p06.sealed !== false) files.set("private/qloo-probes/phase2b-p06-execution-review/post-execution-integrity.private.json", Buffer.from(JSON.stringify(
      [...files.entries()].filter(([path]) => path.startsWith(dir + "/")).map(([path, bytes]) => ({ path, sha256: sha(bytes) })))));
  }
  const manifest = (filter: (path: string) => boolean) => Buffer.from(JSON.stringify([...files.entries()]
    .filter(([path]) => filter(path) && path !== options.skipManifestEntry && path.includes("/attempts/")).map(([path, bytes]) => ({ path, sha256: sha(bytes) }))));
  files.set("private/qloo-probes/phase1b4-review-20261018T220843Z/all-historical-integrity.private.json", manifest((p) => !p.includes("/p05/") && !p.includes("/p06/")));
  files.set("private/qloo-probes/phase1b4-p05-execution-review/post-execution-integrity.private.json", manifest((p) => p.includes("/p05/")));
  // Tampering is applied only after the manifests were computed from the authentic authored bytes.
  options.mutate?.(files);
  for (const [path, bytes] of files) {
    const full = join(root, path); await mkdir(join(full, ".."), { recursive: true, mode: 0o700 });
    await writeFile(full, bytes, { mode: 0o600 });
  }
  return root;
}
