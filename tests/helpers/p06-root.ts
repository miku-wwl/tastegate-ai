import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { P01_PROFILE, P01CheckpointSchema, blockedP01 } from "../../src/qloo/p01-profile";
import { P02_PROFILE, SAVED_P01_ATTEMPT, blockedP02 } from "../../src/qloo/p02-profile";
import { P03_PROFILE, blockedP03 } from "../../src/qloo/p03-profile";
import { P04_PROFILE, blockedP04 } from "../../src/qloo/p04-profile";
import { P03R_PROFILE, HISTORICAL_P03_ATTEMPT, blockedP03R } from "../../src/qloo/p03r-profile";
import { P05_PROFILE, P05CheckpointSchema, blockedP05 } from "../../src/qloo/p05-profile";
import { SAVED_P03R_ATTEMPT, SAVED_P05_ATTEMPT, P06CheckpointSchema, P06_PROFILE } from "../../src/qloo/p06-profile";
import { inspectAcceptedP05Signal } from "../../src/qloo/p05-signal";
import { inspectAcceptedP06Shortlist } from "../../src/qloo/p06-shortlist";

// ENTIRELY AUTHORED data: these files simulate archival contracts, never a live provider run. Every ID, name and
// value is invented; no captured provider body, ID or hash is copied here.
export const AUTH = { key: "authored-p06-key-never-issued", artist: "authored-radiohead-opaque-id", nyc: "authored-nyc-venue-opaque-id",
  control: "authored-control-place-opaque-id", spotify: "authored-spotify-id", mbid: "11111111-1111-4111-8111-111111111111" };
export const sha = (v: Uint8Array | string) => createHash("sha256").update(v).digest("hex");
function common() {
  const now = Date.now();
  return P01CheckpointSchema.parse({ revision: "tastegate.p01.checkpoint.v2", profile_revision: P01_PROFILE.revision,
    attempt_id: randomUUID(), previous_attempt_id: null, prior_reserved_attempts: 0, prior_attempts_reviewed: true,
    credential_exposure_risk_acknowledged: true, credential_basis: "ORIGINALLY_ISSUED_EVENT_KEY", unknown_entitlements_acknowledged: true,
    host_and_header_reviewed: true, request_shape_reviewed: true, usage_rights_confirmed: true, private_capture_permitted: true,
    private_directory_access_reviewed: true, quota: { remaining_calls: "UNKNOWN", rate_limit_per_minute: "UNKNOWN", concurrency_limit: "UNKNOWN", key_expires_at: "UNKNOWN" },
    approval: "APPROVE_P01_ONLY", max_dispatches: 1, approved_at: new Date(now).toISOString(), approval_expires_at: new Date(now + 60_000).toISOString() });
}
export const nycBody = () => ({ results: [{ entity_id: AUTH.nyc, name: "Authored Jazz Room", types: ["urn:entity:place"],
  properties: { geocode: { city: "New York", country_code: "US", name: "Authored Village" } } }] });
export const controlBody = () => ({ success: true, results: { entities: [{ entity_id: AUTH.control, name: "Authored Far Pavilion", type: "urn:entity", subtype: "urn:entity:place",
  properties: { geocode: { city: "Authored City", country_code: "ES" } }, query: { affinity: 0.5 } }] } });

export type SeedOptions = { nycBody?: unknown; controlBody?: unknown; skipManifestFor?: string };
export async function seedP06(options: SeedOptions = {}) {
  await mkdir(".artifacts", { recursive: true });
  const root = await mkdtemp(resolve(".artifacts/p06-test-")); const base = join(root, "private/qloo-probes");
  await mkdir(base, { recursive: true, mode: 0o700 });
  const p01Raw = Buffer.from(JSON.stringify({ results: [{ entity_id: "authored-unrelated", name: "Other", types: ["urn:entity:artist"] },
    { entity_id: AUTH.artist, name: "Radiohead", types: ["urn:entity:artist"], properties: { external: { musicbrainz: { id: AUTH.mbid }, spotify: { id: AUTH.spotify } } } }] }));
  const publicRecord = Buffer.from(JSON.stringify({ id: AUTH.mbid, name: "Radiohead", type: "Group", relations: [
    { type: "official homepage", url: { resource: "https://www.radiohead.com/" } }, { type: "free streaming", url: { resource: "https://open.spotify.com/artist/" + AUTH.spotify } }] }));
  const p05Review = Buffer.from(JSON.stringify({ revision: "tastegate.p05.radiohead-review.v1", decision: "ACCEPTED_FOR_P05_ONLY", independent_review_completed: true,
    source_attempt_id: SAVED_P01_ATTEMPT, p01_raw_sha256: sha(p01Raw), selected_entity_id: AUTH.artist, entity_name: "Radiohead", entity_type: "urn:entity:artist",
    musicbrainz_id: AUTH.mbid, spotify_id: AUTH.spotify, public_musicbrainz_sha256: sha(publicRecord), review_scope: "ARTIST_IDENTITY_ONLY_NO_AFFINITY_OR_DISPATCH_AUTHORITY" }));
  await writeFile(join(base, "p05-radiohead-identity.private.json"), p05Review);
  await writeFile(join(base, "p05-radiohead-musicbrainz.public.json"), publicRecord);
  const nycRaw = Buffer.from(JSON.stringify(options.nycBody ?? nycBody())); const controlRaw = Buffer.from(JSON.stringify(options.controlBody ?? controlBody()));
  const signalHash = sha(p05Review);
  const p05Checkpoint = P05CheckpointSchema.parse({ ...common(), attempt_id: SAVED_P05_ATTEMPT, revision: "tastegate.p05.checkpoint.v1", profile_revision: P05_PROFILE.revision,
    approval: "APPROVE_P05_RADIOHEAD_TO_PLACE_ONLY", max_response_bytes: 262144, request_timeout_ms: 4000, signal_entity_id: AUTH.artist, signal_entity_type: "urn:entity:artist",
    signal_review_sha256: signalHash, p01_raw_sha256: sha(p01Raw), p01_source_attempt_id: SAVED_P01_ATTEMPT, signal_identity_reviewed: true,
    no_geographic_or_explanation_parameters: true, unreviewed_semantics_acknowledged: true, prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P03: 1, P04: 1, P03R: 1 } });
  const histories = {
    P01: { profile: P01_PROFILE, checkpoint: { ...common(), attempt_id: SAVED_P01_ATTEMPT }, summary: blockedP01(), raw: p01Raw, extra: { "raw-integrity.private.json": JSON.stringify({ raw_sha256: sha(p01Raw), response_bytes: p01Raw.length }) } },
    P02: { profile: P02_PROFILE, checkpoint: { ...common(), revision: "tastegate.p02.checkpoint.v1", profile_revision: P02_PROFILE.revision, approval: "APPROVE_P02_ONLY", film_selection_confirmed: true,
      p01_reuse_reviewed: true, p01_source_attempt_id: SAVED_P01_ATTEMPT, p01_raw_sha256: sha(p01Raw), p01_total_dispatches_reviewed: 1 }, summary: blockedP02(), raw: null, extra: {} },
    P03: { profile: P03_PROFILE, checkpoint: { ...common(), attempt_id: HISTORICAL_P03_ATTEMPT, revision: "tastegate.p03.checkpoint.v1", profile_revision: P03_PROFILE.revision,
      approval: "APPROVE_P03_NYC_ONLY", public_venue_confirmed: true, independent_location_reviewed: true, prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P04: 1 } }, summary: blockedP03(), raw: null, extra: {} },
    P04: { profile: P04_PROFILE, checkpoint: { ...common(), revision: "tastegate.p04.checkpoint.v1", profile_revision: P04_PROFILE.revision, approval: "APPROVE_P04_ONLY",
      public_jazz_query_confirmed: true, prior_probe_dispatches_reviewed: { P01: 1, P02: 1 } }, summary: blockedP04(), raw: null, extra: {} },
    P03R: { profile: P03R_PROFILE, checkpoint: { ...common(), attempt_id: SAVED_P03R_ATTEMPT, revision: "tastegate.p03r.checkpoint.v1", profile_revision: P03R_PROFILE.revision, approval: "APPROVE_P03R_NYC_ONLY",
      max_response_bytes: 262144, public_venue_confirmed: true, independent_location_reviewed: true, expanded_capture_budget_acknowledged: true, recovery_is_new_attempt: true,
      historical_p03_reviewed: { attempt_id: HISTORICAL_P03_ATTEMPT, profile_revision: P03_PROFILE.revision, reason: "RESPONSE_TOO_LARGE", dispatches: 1 },
      prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P03: 1, P04: 1 } }, summary: blockedP03R(), raw: nycRaw, extra: {} },
    P05: { profile: P05_PROFILE, checkpoint: p05Checkpoint, summary: blockedP05(), raw: controlRaw, extra: {} },
  };
  const historicalFiles: string[] = []; const manifestEntries = { historical: [] as Array<{ path: string; sha256: string }>, p05: [] as Array<{ path: string; sha256: string }> };
  for (const [probe, item] of Object.entries(histories)) {
    const attempt = item.checkpoint.attempt_id; const rel = `private/qloo-probes/${probe.toLowerCase()}/attempts/${attempt}`;
    const dir = join(root, rel); await mkdir(dir, { recursive: true, mode: 0o700 });
    const versions = probe === "P03R" ? { record_revision: "tastegate.probe-attempt.v3", profile_revision: P03R_PROFILE.revision, max_response_bytes: 262144 } :
      probe === "P05" ? { record_revision: "tastegate.probe-attempt.v4", profile_revision: P05_PROFILE.revision, max_response_bytes: 262144 } : {};
    const files: Record<string, Buffer | string> = { "attempt.json": JSON.stringify({ ...versions, profile: item.profile, checkpoint: item.checkpoint }),
      "summary.json": JSON.stringify({ summary: { ...item.summary, attempt_id: attempt, status: "UNKNOWN", source_mode: "live_probe", dispatches: 1, http_status: 200,
        response_bytes: item.raw ? item.raw.length : probe === "P03" ? 65537 : 2, elapsed_ms: 1, raw_saved_privately: !!item.raw,
        reason: probe === "P03" ? "RESPONSE_TOO_LARGE" : "SCHEMA_REVIEW_REQUIRED" } }), ...item.extra };
    if (item.raw) files["response.raw.json"] = item.raw;
    for (const [name, bytes] of Object.entries(files)) {
      const file = join(dir, name); await writeFile(file, bytes); historicalFiles.push(file);
      if (probe === "P03R") manifestEntries.historical.push({ path: `${rel}/${name}`, sha256: sha(bytes) });
      if (probe === "P05" && `${rel}/${name}` !== options.skipManifestFor) manifestEntries.p05.push({ path: `${rel}/${name}`, sha256: sha(bytes) });
    }
  }
  const hist = join(base, "phase1b4-review-20261018T220843Z"); const p05m = join(base, "phase1b4-p05-execution-review");
  await mkdir(hist, { recursive: true }); await mkdir(p05m, { recursive: true });
  const manifestFiles = [join(hist, "all-historical-integrity.private.json"), join(p05m, "post-execution-integrity.private.json")];
  await writeFile(manifestFiles[0]!, JSON.stringify(manifestEntries.historical)); await writeFile(manifestFiles[1]!, JSON.stringify(manifestEntries.p05));
  historicalFiles.push(...manifestFiles, join(base, "p05-radiohead-identity.private.json"), join(base, "p05-radiohead-musicbrainz.public.json"));
  const signal = await inspectAcceptedP05Signal(root);
  // The fresh, in-memory P06 checkpoint a registration would write (needs the private review, created by prepare).
  // `change` is applied AFTER schema validation so tests can present deliberately invalid checkpoints to the code under test.
  const checkpoint = async (change: Record<string, unknown> = {}) => {
    const binding = await inspectAcceptedP06Shortlist(root); const now = Date.now();
    const base = P06CheckpointSchema.parse({ ...common(), revision: "tastegate.p06.checkpoint.v1", profile_revision: P06_PROFILE.revision, approval: "APPROVE_P06_SHORTLIST_RANK_ONLY",
      max_response_bytes: 262144, request_timeout_ms: 4000, signal_entity_id: binding.signalEntityId, signal_entity_type: "urn:entity:artist", signal_review_sha256: binding.signalReviewSha256,
      p01_raw_sha256: binding.p01RawSha256, p01_source_attempt_id: SAVED_P01_ATTEMPT, shortlist_review_sha256: binding.shortlistReviewSha256,
      shortlist_entity_ids: [binding.nycEntityId, binding.controlEntityId], shortlist_source_attempts: { reviewed_nyc_candidate: SAVED_P03R_ATTEMPT, positive_control: SAVED_P05_ATTEMPT },
      signal_identity_reviewed: true, shortlist_identity_reviewed: true, no_geographic_tag_or_explanation_parameters: true, unreviewed_semantics_acknowledged: true,
      shortlist_semantics_unverified_acknowledged: true, prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P03: 1, P04: 1, P03R: 1, P05: 1 },
      approved_at: new Date(now).toISOString(), approval_expires_at: new Date(now + 60_000).toISOString() });
    return { ...base, ...change } as typeof base;
  };
  return { root, base, signal, p05Review, nycRaw, controlRaw, historicalFiles, checkpoint, manifestFiles };
}
