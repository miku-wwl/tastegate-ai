import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { CaptureSchema, digest, type Capture, type Entity, type PublicReference, type Snapshot, type UnavailableReason } from "../domain/contracts";
import { assertServer } from "./boundary-error";
import { HACKATHON_ORIGIN } from "./server-config";
import { projectInsightsPlaces, projectSearch, projectTags, type ProjectedTag } from "./projections";
import { providerRef } from "./provider-ref";
import { UNAVAILABLE_REASON_FOR, interpretShortlistRanking, type ShortlistClass } from "./shortlist-ranking";
import type { RecordedObservation, RecordedQlooAdapter } from "./ports";

// Read-only replay of the immutable, owner-approved captures. Nothing here performs network I/O,
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
// Written by the local seal step (scripts/seal-recorded-probe.mjs) AFTER an executed P06 was reviewed. Without it an
// executed P06 is "review required" and is never replayed.
export const P06_SEAL_MANIFEST = ["phase2b-p06-execution-review", "post-execution-integrity.private.json"] as const;
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
export const P06_REVISION = "tastegate.p06.shortlist-rank.capture-256k.v1";
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
// An executed P06 may have FAILED (a non-200, oversized or otherwise unusable response); that outcome is itself recorded evidence.
const P06Attempt = z.object({ profile: z.object({ revision: z.literal(P06_REVISION), method: z.literal("GET"), origin: z.literal(HACKATHON_ORIGIN), path: z.literal("/v2/insights") }),
  checkpoint: z.object({ attempt_id: z.uuid(), approval: z.literal("APPROVE_P06_SHORTLIST_RANK_ONLY"), signal_entity_id: z.string().min(1).max(256),
    signal_review_sha256: sha, p01_raw_sha256: sha, shortlist_entity_ids: z.tuple([z.string().min(1).max(256), z.string().min(1).max(256)]) }),
  reserved_utc: z.iso.datetime() });
const P06Summary = z.object({ summary: z.object({ probe: z.literal("P06"), attempt_id: z.uuid(), source_mode: z.literal("live_probe"), status: z.enum(["UNKNOWN", "FAIL"]),
  reason: z.string().max(60), dispatches: z.literal(1), http_status: z.number().int().min(100).max(599).nullable(), response_bytes: z.number().int().min(0).max(262_145).nullable(),
  raw_saved_privately: z.boolean(), transport_settled: z.boolean() }) });

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
// Lists attempt directories; a missing directory means "nothing recorded", anything odd fails closed.
async function listAttempts(root: string, parts: readonly string[]): Promise<string[]> {
  let path = root;
  for (const part of parts) {
    path = join(/*turbopackIgnore: true*/ path, part);
    let info; try { info = await lstat(/*turbopackIgnore: true*/ path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw new RecordedEvidenceUnavailableError(); }
    if (info.isSymbolicLink() || !info.isDirectory() || await realpath(/*turbopackIgnore: true*/ path) !== path) throw new RecordedEvidenceUnavailableError();
  }
  const children = await readdir(/*turbopackIgnore: true*/ path, { withFileTypes: true });
  if (children.length > 8 || children.some((c) => !c.isDirectory() || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(c.name))) throw new RecordedEvidenceUnavailableError();
  return children.map((c) => c.name);
}
const json = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export type RecordedOutcome = "REPLAYABLE" | "RESPONSE_TOO_LARGE_NOT_SAVED" | "REVIEW_REQUIRED" | "RESPONSE_UNUSABLE" | "UNEXPECTED_ENTITY" | "INCOMPATIBLE_SCORES";
// Public metadata only (never bodies, IDs or hashes). `recorded_at`/`http_status`/`response_bytes` are null only for an
// executed-but-unreviewed P06, whose files are deliberately not read before review.
export type RecordedHistory = { probe: Spec["probe"] | "P06"; attempt_id: string; endpoint: Capture["endpoint"]; recorded_at: string | null;
  http_status: number | null; outcome: RecordedOutcome; response_bytes: number | null; shortlist_class?: ShortlistClass };
export type ShortlistRecording =
  | { state: "NOT_EXECUTED" } | { state: "REVIEW_REQUIRED" }
  | { state: "UNUSABLE"; reason: UnavailableReason; detail: string }
  | { state: "READY"; capture: Capture; signalRef: string; shortlistRefs: readonly [string, string]; class: "ALL_RETURNED" | "PARTIAL";
      ordered: Entity[]; scores: Array<{ entity_id: string; query_affinity: number }> };
export type VerifiedRecordings = Readonly<{
  datasetId: string;
  searches: ReadonlyMap<string, { capture: Capture; candidates: Entity[] }>;
  tags: ReadonlyMap<string, { capture: Capture; matches: ProjectedTag[] }>;
  discovery: { capture: Capture; signalRef: string; take: number; found: Array<{ entity: Entity; query_affinity: number | null }> };
  shortlist: ShortlistRecording;
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
    const nyc = searches.get(searchKey("place", "Blue Note New York"))?.candidates[0];
    if (!discovery || searches.size !== 3 || tags.size !== 1 || !nyc || !discovery.found[0]) throw new RecordedEvidenceUnavailableError();
    const shortlist = await loadShortlist(root, base, { signalRef: discovery.signalRef, signalReviewSha: sha256(reviewBytes), p01RawSha: p01Raw!.sha,
      reviewedId: review.selected_entity_id, shortlistRefs: [nyc.id, discovery.found[0].entity.id] }, history);
    return Object.freeze({ datasetId: RECORDED_DATASET_ID, searches, tags, discovery, shortlist, history: Object.freeze(history) });
  } catch {
    // Fixed error only: no path, hash, provider field or exception text escapes.
    throw new RecordedEvidenceUnavailableError();
  }
}

// P06 is optional: absent -> "approval required"; executed but not sealed after review -> "review required" (nothing is
// read or shown); sealed -> every file must match its manifest hash and its request must bind to the recorded entities.
async function loadShortlist(root: string, base: string[], ctx: { signalRef: string; signalReviewSha: string; p01RawSha: string; reviewedId: string; shortlistRefs: [string, string] },
  history: RecordedHistory[]): Promise<ShortlistRecording> {
  const attempts = await listAttempts(root, [...base, "p06", "attempts"]);
  if (attempts.length === 0) return { state: "NOT_EXECUTED" };
  if (attempts.length !== 1) throw new RecordedEvidenceUnavailableError(); // exactly one approval ever exists
  const attemptId = attempts[0]!; const dir = [...base, "p06", "attempts", attemptId];
  // No seal manifest yet means "executed, not reviewed": degrade this one operation, never the whole recorded mode.
  let sealed = true;
  try { await lstat(join(/*turbopackIgnore: true*/ root, ...base, ...P06_SEAL_MANIFEST)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") sealed = false; else throw new RecordedEvidenceUnavailableError(); }
  if (!sealed) {
    history.push({ probe: "P06", attempt_id: attemptId, endpoint: "/v2/insights", recorded_at: null, http_status: null, outcome: "REVIEW_REQUIRED", response_bytes: null });
    return { state: "REVIEW_REQUIRED" };
  }
  const manifest = new Map(Manifest.parse(json(await readPrivate(root, [...base, ...P06_SEAL_MANIFEST], 65_536))).map((e) => [e.path, e.sha256]));
  const verified = async (file: string, cap: number) => {
    const bytes = await readPrivate(root, [...dir, file], cap);
    if (manifest.get([...dir, file].join("/")) !== sha256(bytes)) throw new RecordedEvidenceUnavailableError();
    return bytes;
  };
  const attempt = P06Attempt.parse(json(await verified("attempt.json", 32_768)));
  const summary = P06Summary.parse(json(await verified("summary.json", 8_192))).summary;
  const cp = attempt.checkpoint;
  // The sealed request must be exactly the reviewed one: the approved artist signal and the two recorded entities.
  if (cp.attempt_id !== attemptId || summary.attempt_id !== attemptId || cp.signal_entity_id !== ctx.reviewedId || cp.signal_review_sha256 !== ctx.signalReviewSha ||
      cp.p01_raw_sha256 !== ctx.p01RawSha || providerRef("entity", cp.shortlist_entity_ids[0]) !== ctx.shortlistRefs[0] ||
      providerRef("entity", cp.shortlist_entity_ids[1]) !== ctx.shortlistRefs[1]) throw new RecordedEvidenceUnavailableError();
  const row = (outcome: RecordedOutcome, shortlistClass?: ShortlistClass): RecordedHistory => ({ probe: "P06", attempt_id: attemptId, endpoint: "/v2/insights",
    recorded_at: attempt.reserved_utc, http_status: summary.http_status, outcome, response_bytes: summary.response_bytes, ...(shortlistClass ? { shortlist_class: shortlistClass } : {}) });
  if (summary.http_status !== 200 || !summary.raw_saved_privately || summary.reason !== "SCHEMA_REVIEW_REQUIRED") {
    history.push(row("RESPONSE_UNUSABLE", "RESPONSE_UNUSABLE"));
    return { state: "UNUSABLE", reason: "RESPONSE_UNUSABLE", detail: `The approved shortlist request did not return a usable response (${summary.reason}${summary.http_status ? `, HTTP ${summary.http_status}` : ""}). No ranking exists.` };
  }
  const raw = await verified("response.raw.json", 262_144);
  if (raw.length !== summary.response_bytes) throw new RecordedEvidenceUnavailableError();
  const result = interpretShortlistRanking(json(raw), ctx.shortlistRefs);
  if (result.class !== "ALL_RETURNED" && result.class !== "PARTIAL") {
    history.push(row(result.class, result.class));
    const detail = { UNEXPECTED_ENTITY: "Qloo returned an entity outside the requested shortlist, so the shortlist parameter was not honored as documented. The response is not used.",
      INCOMPATIBLE_SCORES: "Qloo's scores are missing or contradict the returned order, so no ordering can be trusted. The response is not used.",
      RESPONSE_UNUSABLE: "The response shape is not supported. The response is not used." }[result.class];
    return { state: "UNUSABLE", reason: UNAVAILABLE_REASON_FOR[result.class], detail };
  }
  history.push(row("REPLAYABLE", result.class));
  const capture = CaptureSchema.parse({ probe: "P06", attempt_id: attemptId, endpoint: "/v2/insights", profile_revision: P06_REVISION, recorded_at: attempt.reserved_utc,
    http_status: 200, response_bytes: raw.length, integrity: "SHA256_MATCHES_PRIVATE_MANIFEST",
    request_params: { "filter.type": "urn:entity:place", "signal.interests.entities": ctx.signalRef, "filter.results.entities": ctx.shortlistRefs.join(","), take: "2" } });
  return { state: "READY", capture, signalRef: ctx.signalRef, shortlistRefs: ctx.shortlistRefs, class: result.class, ordered: result.ordered, scores: result.scores };
}

// The plain-text lookups the recordings answer: public, authored strings only (never a provider ID or body).
export function recordedCoverage(set: VerifiedRecordings): { artist: string[]; movie: string[]; place: string[]; tag: string[] } {
  const out = { artist: [] as string[], movie: [] as string[], place: [] as string[], tag: [...set.tags.keys()].sort() };
  for (const { capture } of set.searches.values()) { const kind = capture.request_params.types?.replace("urn:entity:", ""); const query = capture.request_params.query; if (query && (kind === "artist" || kind === "movie" || kind === "place")) out[kind].push(query); }
  for (const list of Object.values(out)) list.sort();
  return out;
}
// For a server that holds NO recordings: every request is explicitly "not captured". It exists so a custom plan can still be
// validated and audited for what needs no provider evidence (its size limit, its claims, the absence of proof) instead of being
// refused outright. It never invents a fact: no entity, tag, ranking or discovery is ever returned.
export const EMPTY_RECORDED_DATASET_ID = "qloo-recorded-none";
export function createEmptyRecordedAdapter(): RecordedQlooAdapter {
  const miss = (request: Extract<Snapshot, { kind: "unavailable" }>["request"]): RecordedObservation => ({ source_mode: "recorded_live", dataset_id: EMPTY_RECORDED_DATASET_ID, capture: null,
    snapshot: { kind: "unavailable", request, reason: "NOT_CAPTURED", detail: "This server holds no recorded Qloo responses, so nothing can be checked against provider data." } });
  const adapter: RecordedQlooAdapter = { mode: "recorded_live", datasetId: EMPTY_RECORDED_DATASET_ID,
    async searchEntity(request) { return miss({ operation: "entity_lookup", ...request }); }, async searchTags(query) { return miss({ operation: "tag_lookup", query }); },
    async rankPlaces(request) { return miss({ operation: "rank_places", ...request }); }, async discoverPlaces(request) { return miss({ operation: "discover_places", ...request }); } };
  return Object.freeze(adapter);
}
// `references` maps a provider reference (the per-process pseudonym of a provider identity) to the owner-registered official public
// page for it. It is trusted host input like the recordings themselves; nothing from a request, a browser or a model can add to it.
export type RecordedAdapterOptions = { references?: ReadonlyMap<string, PublicReference> };
export function createRecordedAdapter(set: VerifiedRecordings, options: RecordedAdapterOptions = {}): RecordedQlooAdapter {
  assertServer();
  const observe = (capture: Capture | null, snapshot: Snapshot): RecordedObservation =>
    ({ source_mode: "recorded_live", dataset_id: set.datasetId, capture, snapshot: structuredClone(snapshot) });
  const unavailable = (request: Extract<Snapshot, { kind: "unavailable" }>["request"], reason: UnavailableReason, detail: string) =>
    observe(null, { kind: "unavailable", request, reason, detail });
  const adapter: RecordedQlooAdapter = {
    mode: "recorded_live", datasetId: set.datasetId,
    publicReference(entityId) { return options.references?.get(entityId) ?? null; },
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
      const s = set.shortlist; const miss = (reason: UnavailableReason, detail: string) => unavailable({ operation: "rank_places", ...request }, reason, detail);
      if (s.state === "NOT_EXECUTED") return miss("APPROVAL_REQUIRED", "Shortlist ranking with filter.results.entities (P06) is prepared but has never been executed; it needs explicit owner approval.");
      if (s.state === "REVIEW_REQUIRED") return miss("REVIEW_REQUIRED", "The approved shortlist request was executed, but its response has not been reviewed and sealed for replay.");
      if (s.state === "UNUSABLE") return miss(s.reason, s.detail);
      // Replay only the exact recorded context: the approved artist signal alone, and exactly the recorded shortlist.
      // A ranking of any other set is a different query: scores from separate queries are not comparable.
      const sameSignals = request.preference_tag_ids.length === 0 && digest(request.preference_entity_ids) === digest([s.signalRef]);
      const sameSet = request.candidate_entity_ids.length === s.shortlistRefs.length && s.shortlistRefs.every((ref) => request.candidate_entity_ids.includes(ref));
      if (!sameSignals || !sameSet) return miss("NOT_CAPTURED", "The recorded shortlist ranking covers a different candidate set or signal context. Ranking this exact set needs a new approved request.");
      return observe(s.capture, { kind: "rank_places", preference_entity_ids: request.preference_entity_ids, preference_tag_ids: request.preference_tag_ids,
        candidate_entity_ids: request.candidate_entity_ids, ordered_entity_ids: s.ordered.map((e) => e.id), explainability: "missing",
        scores: s.scores, shortlist_class: s.class });
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
