import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { CaptureSchema, digest, type Capture, type Entity, type Snapshot } from "../domain/contracts";
import { assertServer } from "./boundary-error";
import { HACKATHON_ORIGIN } from "./server-config";
import { projectInsightsPlaces, projectSearch, projectTags, type ProjectedTag } from "./projections";
import { providerRef } from "./provider-ref";
import type { RecordedObservation, RecordedQlooAdapter } from "./ports";

// Read-only replay of the immutable, owner-approved Phase 1B captures. Nothing here performs network I/O,
// writes a file, or accepts a path, ID or capture from a caller. Every capture must match its private
// integrity manifest, immutable summary and exact reviewed request profile, or the whole set is unavailable.
export const RECORDED_DATASET_ID = "qloo-recorded-2026-10";
export class RecordedEvidenceUnavailableError extends Error {
  constructor() { super("RECORDED_EVIDENCE_UNAVAILABLE"); this.name = "RecordedEvidenceUnavailableError"; }
}
const P05_MARKER = "<PRIVATE_ACCEPTED_RADIOHEAD_ENTITY_ID>";
const MANIFESTS = {
  historical: ["phase1b4-review-20261018T220843Z", "all-historical-integrity.private.json"],
  p05: ["phase1b4-p05-execution-review", "post-execution-integrity.private.json"],
} as const;
type Spec = { probe: "P01" | "P02" | "P03" | "P03R" | "P04" | "P05"; attempt: string; endpoint: Capture["endpoint"]; revision: string;
  params: Readonly<Record<string, string>>; manifest: keyof typeof MANIFESTS; cap: number; reason: "SCHEMA_REVIEW_REQUIRED" | "RESPONSE_TOO_LARGE" };
const search = (query: string, type: string, take: string) => ({ query, types: `urn:entity:${type}`, take, page: "1" });
export const RECORDED_SPECS: readonly Spec[] = Object.freeze<Spec[]>([
  { probe: "P01", attempt: "ed655afc-82d7-4efd-ba99-9f55bd031f27", endpoint: "/search", revision: "tastegate.p01.radiohead.v1",
    params: search("Radiohead", "artist", "5"), manifest: "historical", cap: 65_536, reason: "SCHEMA_REVIEW_REQUIRED" },
  { probe: "P02", attempt: "14d95fe4-126a-4941-a7a1-6dbdd8e26684", endpoint: "/search", revision: "tastegate.p02.film.v1",
    params: search("In the Mood for Love", "movie", "5"), manifest: "historical", cap: 65_536, reason: "SCHEMA_REVIEW_REQUIRED" },
  // The original P03 is retained as a real failure: its body exceeded the 64 KiB budget and was never saved.
  { probe: "P03", attempt: "0db5496e-4055-43da-9043-0c6591d7e5d9", endpoint: "/search", revision: "tastegate.p03.bluenote-nyc.v1",
    params: search("Blue Note New York", "place", "3"), manifest: "historical", cap: 0, reason: "RESPONSE_TOO_LARGE" },
  { probe: "P03R", attempt: "4a3bc272-29d7-4e29-aee5-1cef45caaff2", endpoint: "/search", revision: "tastegate.p03r.bluenote-nyc.capture-256k.v1",
    params: search("Blue Note New York", "place", "1"), manifest: "historical", cap: 262_144, reason: "SCHEMA_REVIEW_REQUIRED" },
  { probe: "P04", attempt: "67409a5c-ec05-4b36-8f29-ffaa7996812f", endpoint: "/v2/tags", revision: "tastegate.p04.jazz.v1",
    params: { "filter.query": "jazz", take: "5", page: "1" }, manifest: "historical", cap: 65_536, reason: "SCHEMA_REVIEW_REQUIRED" },
  { probe: "P05", attempt: "154bd4c0-ea64-49c5-ad95-cb57efd7647a", endpoint: "/v2/insights", revision: "tastegate.p05.radiohead-to-place.capture-256k.v1",
    params: { "filter.type": "urn:entity:place", "signal.interests.entities": P05_MARKER, take: "1" }, manifest: "p05", cap: 262_144, reason: "SCHEMA_REVIEW_REQUIRED" },
]);
const Manifest = z.array(z.strictObject({ path: z.string().min(1).max(300), sha256: z.string().regex(/^[a-f0-9]{64}$/) })).max(200);
const SummaryFile = z.object({ summary: z.object({ probe: z.string(), attempt_id: z.string(), source_mode: z.literal("live_probe"),
  status: z.literal("UNKNOWN"), reason: z.string(), dispatches: z.literal(1), http_status: z.literal(200),
  response_bytes: z.number().int().min(1), raw_saved_privately: z.boolean(), transport_settled: z.literal(true) }) });
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const AttemptFile = z.object({ profile: z.object({ revision: z.string(), method: z.literal("GET"), origin: z.literal(HACKATHON_ORIGIN),
  path: z.string(), params: z.record(z.string(), z.string()) }),
  checkpoint: z.object({ attempt_id: z.string(), signal_entity_id: z.string().optional(), signal_review_sha256: sha.optional(), p01_raw_sha256: sha.optional() }),
  reserved_utc: z.iso.datetime() });
const SignalReview = z.object({ decision: z.literal("ACCEPTED_FOR_P05_ONLY"), independent_review_completed: z.literal(true),
  selected_entity_id: z.string().min(1).max(256), entity_type: z.literal("urn:entity:artist"), p01_raw_sha256: sha });

// Runtime reads of the owner's ignored private directory. The ignore markers keep bundlers from
// tracing (and so packaging) the private evidence into any build output.
async function readPrivate(root: string, parts: readonly string[], cap: number): Promise<Buffer> {
  let path = root;
  for (const part of parts) {
    path = join(/*turbopackIgnore: true*/ path, part); const info = await lstat(/*turbopackIgnore: true*/ path);
    if (info.isSymbolicLink() || await realpath(/*turbopackIgnore: true*/ path) !== path || (process.platform !== "win32" && (info.mode & 0o077))) throw new RecordedEvidenceUnavailableError();
  }
  const info = await lstat(/*turbopackIgnore: true*/ path);
  if (!info.isFile() || info.size > cap) throw new RecordedEvidenceUnavailableError();
  const bytes = await readFile(/*turbopackIgnore: true*/ path);
  if (bytes.length > cap) throw new RecordedEvidenceUnavailableError();
  return bytes;
}
const json = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export type RecordedHistory = { probe: Spec["probe"]; attempt_id: string; endpoint: Capture["endpoint"]; recorded_at: string;
  http_status: 200; outcome: "REPLAYABLE" | "RESPONSE_TOO_LARGE_NOT_SAVED"; response_bytes: number };
export type VerifiedRecordings = Readonly<{
  datasetId: string;
  searches: ReadonlyMap<string, { capture: Capture; candidates: Entity[] }>;
  tags: ReadonlyMap<string, { capture: Capture; matches: ProjectedTag[] }>;
  discovery: { capture: Capture; signalRef: string; take: number; found: Array<{ entity: Entity; query_affinity: number | null }> };
  history: readonly RecordedHistory[];
}>;
const searchKey = (kind: string, query: string) => `${kind}\u0000${query}`;

// Verifies every capture before any use; one failure makes the whole recorded mode unavailable.
export async function loadRecordedEvidence(projectRoot: string): Promise<VerifiedRecordings> {
  assertServer();
  try {
    const root = await realpath(/*turbopackIgnore: true*/ projectRoot); const base = ["private", "qloo-probes"];
    const manifests = new Map<string, Map<string, string>>();
    for (const [name, parts] of Object.entries(MANIFESTS))
      manifests.set(name, new Map(Manifest.parse(json(await readPrivate(root, [...base, ...parts], 65_536))).map((e) => [e.path, e.sha256])));
    const reviewBytes = await readPrivate(root, [...base, "p05-radiohead-identity.private.json"], 8_192);
    const review = SignalReview.parse(json(reviewBytes));
    let p01Raw: { sha: string; candidates: Entity[] } | null = null;
    const searches = new Map<string, { capture: Capture; candidates: Entity[] }>();
    const tags = new Map<string, { capture: Capture; matches: ProjectedTag[] }>();
    let discovery: VerifiedRecordings["discovery"] | null = null; const history: RecordedHistory[] = [];
    for (const spec of RECORDED_SPECS) {
      const dir = [spec.probe.toLowerCase(), "attempts", spec.attempt];
      const verified = async (file: string, cap: number) => {
        const bytes = await readPrivate(root, [...base, ...dir, file], cap);
        const expected = manifests.get(spec.manifest)?.get(["private", "qloo-probes", ...dir, file].join("/"));
        if (!expected || sha256(bytes) !== expected) throw new RecordedEvidenceUnavailableError();
        return bytes;
      };
      const attempt = AttemptFile.parse(json(await verified("attempt.json", 32_768)));
      const summary = SummaryFile.parse(json(await verified("summary.json", 8_192))).summary;
      if (attempt.profile.revision !== spec.revision || attempt.profile.path !== spec.endpoint || digest(attempt.profile.params) !== digest(spec.params) ||
          attempt.checkpoint.attempt_id !== spec.attempt || summary.attempt_id !== spec.attempt || summary.probe !== spec.probe ||
          summary.reason !== spec.reason || summary.raw_saved_privately !== (spec.reason === "SCHEMA_REVIEW_REQUIRED")) throw new RecordedEvidenceUnavailableError();
      if (spec.reason === "RESPONSE_TOO_LARGE") {
        history.push({ probe: spec.probe, attempt_id: spec.attempt, endpoint: spec.endpoint, recorded_at: attempt.reserved_utc, http_status: 200,
          outcome: "RESPONSE_TOO_LARGE_NOT_SAVED", response_bytes: summary.response_bytes });
        continue;
      }
      const raw = await verified("response.raw.json", spec.cap);
      if (raw.length !== summary.response_bytes) throw new RecordedEvidenceUnavailableError();
      const body = json(raw);
      let params: Record<string, string> = { ...spec.params };
      if (spec.probe === "P05") {
        // The manifest-verified checkpoint binds the recorded signal to the reviewed identity record and
        // to the exact P01 capture; the reviewed artist must be one of that capture's artist candidates.
        const cp = attempt.checkpoint;
        if (!p01Raw || !cp.signal_entity_id || cp.signal_entity_id !== review.selected_entity_id || cp.signal_review_sha256 !== sha256(reviewBytes) ||
            cp.p01_raw_sha256 !== p01Raw.sha || review.p01_raw_sha256 !== p01Raw.sha ||
            !p01Raw.candidates.some((c) => c.id === providerRef("entity", review.selected_entity_id))) throw new RecordedEvidenceUnavailableError();
        params = { ...params, "signal.interests.entities": providerRef("entity", review.selected_entity_id) };
      }
      const capture = CaptureSchema.parse({ probe: spec.probe, attempt_id: spec.attempt, endpoint: spec.endpoint, profile_revision: spec.revision,
        recorded_at: attempt.reserved_utc, http_status: 200, response_bytes: raw.length, request_params: params, integrity: "SHA256_MATCHES_PRIVATE_MANIFEST" });
      const take = Number(spec.params.take);
      if (spec.endpoint === "/search") {
        const kind = spec.params.types!.slice("urn:entity:".length) as "artist" | "movie" | "place";
        const candidates = projectSearch(body, kind, take);
        if (spec.probe === "P01") p01Raw = { sha: sha256(raw), candidates };
        searches.set(searchKey(kind, spec.params.query!), { capture, candidates });
      } else if (spec.endpoint === "/v2/tags") tags.set(spec.params["filter.query"]!, { capture, matches: projectTags(body, take) });
      else discovery = { capture, signalRef: providerRef("entity", review.selected_entity_id), take, found: projectInsightsPlaces(body, take) };
      history.push({ probe: spec.probe, attempt_id: spec.attempt, endpoint: spec.endpoint, recorded_at: attempt.reserved_utc, http_status: 200,
        outcome: "REPLAYABLE", response_bytes: raw.length });
    }
    if (!discovery || searches.size !== 3 || tags.size !== 1) throw new RecordedEvidenceUnavailableError();
    return Object.freeze({ datasetId: RECORDED_DATASET_ID, searches, tags, discovery, history: Object.freeze(history) });
  } catch {
    // Fixed error only: no path, hash, provider field or exception text escapes.
    throw new RecordedEvidenceUnavailableError();
  }
}

export function createRecordedAdapter(set: VerifiedRecordings): RecordedQlooAdapter {
  assertServer();
  const observe = (capture: Capture | null, snapshot: Snapshot): RecordedObservation =>
    ({ source_mode: "recorded_live", dataset_id: set.datasetId, capture, snapshot: structuredClone(snapshot) });
  const unavailable = (request: Extract<Snapshot, { kind: "unavailable" }>["request"], reason: "NOT_CAPTURED" | "APPROVAL_REQUIRED", detail: string) =>
    observe(null, { kind: "unavailable", request, reason, detail });
  const adapter: RecordedQlooAdapter = {
    mode: "recorded_live", datasetId: set.datasetId,
    async searchEntity(request) {
      const hit = set.searches.get(searchKey(request.requested_kind, request.query));
      return hit ? observe(hit.capture, { kind: "entity_lookup", query: request.query, requested_kind: request.requested_kind, matches: hit.candidates }) :
        unavailable({ operation: "entity_lookup", ...request }, "NOT_CAPTURED", "No owner-approved recording exists for this exact lookup; a live search needs separate approval.");
    },
    async searchTags(query) {
      const hit = set.tags.get(query);
      return hit ? observe(hit.capture, { kind: "tag_lookup", query, matches: hit.matches }) :
        unavailable({ operation: "tag_lookup", query }, "NOT_CAPTURED", "No owner-approved recording exists for this exact tag search.");
    },
    async rankPlaces(request) {
      return unavailable({ operation: "rank_places", ...request }, "APPROVAL_REQUIRED",
        "Shortlist ranking with filter.results.entities (P06) is prepared but has never been executed; it needs explicit owner approval.");
    },
    async discoverPlaces(request) {
      const d = set.discovery;
      // Replay only the exact recorded context: one artist signal, no tags or geography, take=1, client-side exclusion.
      if (request.preference_tag_ids.length || digest(request.preference_entity_ids) !== digest([d.signalRef]) || request.take !== d.take ||
          request.exclusion !== "client" || request.signal_scope !== "first_confirmed_artist")
        return unavailable({ operation: "discover_places", ...request }, "NOT_CAPTURED",
          "No recording matches this exact discovery context; a geography-constrained discovery needs a new approved request.");
      const excluded = d.found.filter((f) => request.exclude_entity_ids.includes(f.entity.id));
      const kept = d.found.filter((f) => !request.exclude_entity_ids.includes(f.entity.id)).slice(0, request.take);
      return observe(d.capture, { kind: "discover_places", preference_entity_ids: request.preference_entity_ids, preference_tag_ids: request.preference_tag_ids,
        exclude_entity_ids: request.exclude_entity_ids, signal_scope: request.signal_scope, take: request.take, exclusion: request.exclusion,
        client_excluded_ids: excluded.map((f) => f.entity.id), scores: [...kept, ...excluded].map((f) => ({ entity_id: f.entity.id, query_affinity: f.query_affinity })),
        candidates: kept.map((f) => f.entity) });
    },
  };
  return Object.freeze(adapter);
}
