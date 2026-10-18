import https from "node:https";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { P01_PROFILE, P01CheckpointSchema, blockedP01 } from "../src/qloo/p01-profile";
import { P02_PROFILE, SAVED_P01_ATTEMPT, blockedP02 } from "../src/qloo/p02-profile";
import { P03_PROFILE, blockedP03 } from "../src/qloo/p03-profile";
import { P04_PROFILE, blockedP04 } from "../src/qloo/p04-profile";
import { P03R_PROFILE, HISTORICAL_P03_ATTEMPT, blockedP03R } from "../src/qloo/p03r-profile";
import { P05_PROFILE, P05CheckpointSchema, P05ProfileSchema, P05SummarySchema, validP05Checkpoint } from "../src/qloo/p05-profile";
import { inspectAcceptedP05Signal, matchesP05Signal, type P05SignalBinding } from "../src/qloo/p05-signal";
import { createLocalRawProbeRunner, type ProbeStore, type ProbeRequest } from "../src/qloo/raw-probe-runner";
import { createPrivateProbeStore, inspectPrivateProbeLedger } from "../src/qloo/raw-probe-store";
import { QlooServerConfig } from "../src/qloo/server-config";
import { observeSearch } from "../src/qloo/search-observation";

// Entirely authored data: these files simulate archival contracts, never a live provider run.
const key = "authored-p05-key-never-issued", entity = "authored-radiohead-opaque-id", spotify = "authored-spotify-id";
const mbid = "11111111-1111-4111-8111-111111111111";
const sha = (v: Uint8Array | string) => createHash("sha256").update(v).digest("hex");
const memory = () => ({ reserve: vi.fn(async () => {}), saveRaw: vi.fn(async (_: Uint8Array) => {}), saveSummary: vi.fn(async (_: unknown) => {}) } satisfies ProbeStore);
const config = (ms = "4000") => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: key, QLOO_REQUEST_TIMEOUT_MS: ms });
function common() {
  const now = Date.now();
  return P01CheckpointSchema.parse({ revision: "tastegate.p01.checkpoint.v2", profile_revision: P01_PROFILE.revision,
    attempt_id: randomUUID(), previous_attempt_id: null, prior_reserved_attempts: 0, prior_attempts_reviewed: true,
    credential_exposure_risk_acknowledged: true, credential_basis: "ORIGINALLY_ISSUED_EVENT_KEY", unknown_entitlements_acknowledged: true,
    host_and_header_reviewed: true, request_shape_reviewed: true, usage_rights_confirmed: true, private_capture_permitted: true,
    private_directory_access_reviewed: true, quota: { remaining_calls: "UNKNOWN", rate_limit_per_minute: "UNKNOWN", concurrency_limit: "UNKNOWN", key_expires_at: "UNKNOWN" },
    approval: "APPROVE_P01_ONLY", max_dispatches: 1, approved_at: new Date(now).toISOString(), approval_expires_at: new Date(now + 60_000).toISOString() });
}
async function seed() {
  await mkdir(".artifacts", { recursive: true }); const root = await mkdtemp(resolve(".artifacts/p05-test-"));
  const base = join(root, "private/qloo-probes"); await mkdir(base, { recursive: true, mode: 0o700 });
  const raw = Buffer.from(JSON.stringify({ results: [{ entity_id: "authored-unrelated", name: "Other", types: ["urn:entity:artist"] },
    { entity_id: entity, name: "Radiohead", types: ["urn:entity:artist"], properties: { external: { musicbrainz: { id: mbid }, spotify: { id: spotify } } } }] }));
  const publicRecord = Buffer.from(JSON.stringify({ id: mbid, name: "Radiohead", type: "Group", relations: [
    { type: "official homepage", url: { resource: "https://www.radiohead.com/" } }, { type: "free streaming", url: { resource: "https://open.spotify.com/artist/" + spotify } }] }));
  const review = { revision: "tastegate.p05.radiohead-review.v1", decision: "ACCEPTED_FOR_P05_ONLY", independent_review_completed: true,
    source_attempt_id: SAVED_P01_ATTEMPT, p01_raw_sha256: sha(raw), selected_entity_id: entity, entity_name: "Radiohead", entity_type: "urn:entity:artist",
    musicbrainz_id: mbid, spotify_id: spotify, public_musicbrainz_sha256: sha(publicRecord), review_scope: "ARTIST_IDENTITY_ONLY_NO_AFFINITY_OR_DISPATCH_AUTHORITY" };
  await writeFile(join(base, "p05-radiohead-identity.private.json"), JSON.stringify(review));
  await writeFile(join(base, "p05-radiohead-musicbrainz.public.json"), publicRecord);
  const first = { ...common(), attempt_id: SAVED_P01_ATTEMPT };
  const histories = {
    P01: { profile: P01_PROFILE, checkpoint: first, summary: blockedP01() },
    P02: { profile: P02_PROFILE, checkpoint: { ...common(), revision: "tastegate.p02.checkpoint.v1", profile_revision: P02_PROFILE.revision,
      approval: "APPROVE_P02_ONLY", film_selection_confirmed: true, p01_reuse_reviewed: true, p01_source_attempt_id: SAVED_P01_ATTEMPT,
      p01_raw_sha256: sha(raw), p01_total_dispatches_reviewed: 1 }, summary: blockedP02() },
    P03: { profile: P03_PROFILE, checkpoint: { ...common(), attempt_id: HISTORICAL_P03_ATTEMPT,
      revision: "tastegate.p03.checkpoint.v1", profile_revision: P03_PROFILE.revision, approval: "APPROVE_P03_NYC_ONLY",
      public_venue_confirmed: true, independent_location_reviewed: true, prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P04: 1 } }, summary: blockedP03() },
    P04: { profile: P04_PROFILE, checkpoint: { ...common(), revision: "tastegate.p04.checkpoint.v1", profile_revision: P04_PROFILE.revision,
      approval: "APPROVE_P04_ONLY", public_jazz_query_confirmed: true, prior_probe_dispatches_reviewed: { P01: 1, P02: 1 } }, summary: blockedP04() },
    P03R: { profile: P03R_PROFILE, checkpoint: { ...common(), revision: "tastegate.p03r.checkpoint.v1", profile_revision: P03R_PROFILE.revision,
      approval: "APPROVE_P03R_NYC_ONLY", max_response_bytes: 262144, public_venue_confirmed: true, independent_location_reviewed: true,
      expanded_capture_budget_acknowledged: true, recovery_is_new_attempt: true, historical_p03_reviewed: { attempt_id: HISTORICAL_P03_ATTEMPT,
        profile_revision: P03_PROFILE.revision, reason: "RESPONSE_TOO_LARGE", dispatches: 1 },
      prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P03: 1, P04: 1 } }, summary: blockedP03R() },
  };
  const historicalFiles: string[] = [];
  for (const [probe, item] of Object.entries(histories)) {
    const dir = join(base, probe.toLowerCase(), "attempts", item.checkpoint.attempt_id); await mkdir(dir, { recursive: true, mode: 0o700 });
    const files = { "attempt.json": JSON.stringify({ ...(probe === "P03R" ? { record_revision: "tastegate.probe-attempt.v3", profile_revision: P03R_PROFILE.revision, max_response_bytes: 262144 } : {}), profile: item.profile, checkpoint: item.checkpoint }),
      "summary.json": JSON.stringify({ summary: { ...item.summary, attempt_id: item.checkpoint.attempt_id, status: "UNKNOWN", source_mode: "live_probe", dispatches: 1,
        http_status: 200, response_bytes: probe === "P01" ? raw.length : probe === "P03" ? 65537 : 2, elapsed_ms: 1,
        raw_saved_privately: probe === "P01", reason: probe === "P03" ? "RESPONSE_TOO_LARGE" : "SCHEMA_REVIEW_REQUIRED" } }),
      ...(probe === "P01" ? { "response.raw.json": raw, "raw-integrity.private.json": JSON.stringify({ raw_sha256: sha(raw), response_bytes: raw.length }) } : {}) };
    for (const [name, bytes] of Object.entries(files)) { const file = join(dir, name); await writeFile(file, bytes); historicalFiles.push(file); }
  }
  const binding = await inspectAcceptedP05Signal(root);
  const checkpoint = () => P05CheckpointSchema.parse({ ...common(), revision: "tastegate.p05.checkpoint.v1", profile_revision: P05_PROFILE.revision,
    approval: "APPROVE_P05_RADIOHEAD_TO_PLACE_ONLY", max_response_bytes: 262144, request_timeout_ms: 4000, signal_entity_id: entity,
    signal_entity_type: "urn:entity:artist", signal_review_sha256: binding.reviewSha256, p01_raw_sha256: sha(raw), p01_source_attempt_id: SAVED_P01_ATTEMPT,
    signal_identity_reviewed: true, no_geographic_or_explanation_parameters: true, unreviewed_semantics_acknowledged: true,
    prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P03: 1, P04: 1, P03R: 1 } });
  return { root, base, review, raw, binding, checkpoint, historicalFiles };
}
let previousArgs: string[];
beforeEach(() => { previousArgs = process.execArgv; process.execArgv = [];
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network")); vi.spyOn(https, "request").mockImplementation(() => { throw new Error("No network"); }); });
afterEach(() => { process.execArgv = previousArgs; expect(globalThis.fetch).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled(); vi.restoreAllMocks(); });

it("requires a private explicit review; it never promotes a search result by rank", async () => {
  const s = await seed(); expect(observeSearch(JSON.parse(s.raw.toString()), "urn:entity:artist", "Radiohead").selected_entity_id).toBeNull();
  expect(matchesP05Signal(s.checkpoint(), { ...s.binding })).toBe(false);
  await writeFile(join(s.base, "p05-radiohead-identity.private.json"), JSON.stringify({ ...s.review, decision: "UNKNOWN" }));
  await expect(inspectAcceptedP05Signal(s.root)).rejects.toThrow("P05_SIGNAL_IDENTITY_REVIEW_REQUIRED");
});
it("blocks a missing review file and uncorroborated public artist metadata", async () => {
  const s = await seed(), file = join(s.base, "p05-radiohead-identity.private.json"); await unlink(file);
  await expect(inspectAcceptedP05Signal(s.root)).rejects.toThrow("P05_SIGNAL_IDENTITY_REVIEW_REQUIRED");
  await writeFile(file, JSON.stringify(s.review));
  await writeFile(join(s.base, "p05-radiohead-musicbrainz.public.json"), JSON.stringify({ id: mbid, name: "Different artist" }));
  await expect(inspectAcceptedP05Signal(s.root)).rejects.toThrow("P05_SIGNAL_IDENTITY_REVIEW_REQUIRED");
});
it("binds the new consent to the exact fixed profile and short validity window", async () => {
  const s = await seed(); expect(validP05Checkpoint(s.checkpoint())).toBe(true);
  for (const change of [{ origin: "https://example.test" }, { path: "/search" }, { max_response_bytes: 999999 },
    { params: { ...P05_PROFILE.params, "filter.type": "urn:entity:movie" } },
    { params: { ...P05_PROFILE.params, "signal.interests.entities": "wrong" } }]) expect(P05ProfileSchema.safeParse({ ...P05_PROFILE, ...change }).success).toBe(false);
  expect(validP05Checkpoint({ ...s.checkpoint(), approval_expires_at: new Date(Date.now() + 60 * 60_000).toISOString() })).toBe(false);
});
it.each(["selected_entity_id", "entity_type", "p01_raw_sha256", "public_musicbrainz_sha256", "musicbrainz_id", "spotify_id"])("rejects changed review field %s", async field => {
  const s = await seed(); await writeFile(join(s.base, "p05-radiohead-identity.private.json"), JSON.stringify({ ...s.review, [field]: "authored-wrong" }));
  await expect(inspectAcceptedP05Signal(s.root)).rejects.toThrow("P05_SIGNAL_IDENTITY_REVIEW_REQUIRED");
});
it.each(["missing", "wrong-type", "duplicate"])("rejects %s identity in original evidence without changing review authority", async mode => {
  const s = await seed(); const raw = JSON.parse(s.raw.toString());
  if (mode === "missing") raw.results.pop(); else if (mode === "wrong-type") raw.results[1].types = ["urn:entity:place"]; else raw.results.push(raw.results[1]);
  const bytes = Buffer.from(JSON.stringify(raw)); const dir = join(s.base, "p01/attempts", SAVED_P01_ATTEMPT);
  await writeFile(join(dir, "response.raw.json"), bytes); await writeFile(join(dir, "raw-integrity.private.json"), JSON.stringify({ raw_sha256: sha(bytes), response_bytes: bytes.length }));
  await expect(inspectAcceptedP05Signal(s.root)).rejects.toThrow();
});
it.each([undefined, { signal_entity_id: "authored-wrong" }, { signal_entity_type: "urn:entity:movie" }, { signal_review_sha256: "a".repeat(64) },
  { approval: "APPROVE_P01_ONLY" }, { approved_at: "2000-01-01T00:00:00.000Z", approval_expires_at: "2000-01-01T00:01:00.000Z" }, { prior_reserved_attempts: 1 }, { max_response_bytes: 65536 }])("rejects missing/wrong signal or fresh consent %# before reservation", async change => {
  const s = await seed(), store = memory(), send = vi.fn(async () => Response.json({ authored: true }));
  const result = await createLocalRawProbeRunner("P05", config(), { kind: "local-test-double", send }, store, s.binding)
    .run({ checkpoint: change === undefined ? undefined : { ...s.checkpoint(), ...change } });
  expect(result.dispatches).toBe(0); expect(send).not.toHaveBeenCalled(); expect(store.reserve).not.toHaveBeenCalled();
});
it("blocks an accepted-looking checkpoint when its trusted binding is absent", async () => {
  const s = await seed(), send = vi.fn(async () => Response.json({}));
  expect((await createLocalRawProbeRunner("P05", config(), { kind: "local-test-double", send }, memory()).run({ checkpoint: s.checkpoint() })).dispatches).toBe(0); expect(send).not.toHaveBeenCalled();
});
it.each(["filter.location.query", "feature.explainability", "signal.interests.tags", "page", "filter.results.entities"])("denies unapproved parameter %s", async name => {
  const s = await seed(), send = vi.fn(async () => Response.json({}));
  const result = await createLocalRawProbeRunner("P05", config(), { kind: "local-test-double", send }, memory(), s.binding)
    .run({ checkpoint: s.checkpoint(), profile: { ...P05_PROFILE, params: { ...P05_PROFILE.params, [name]: "authored" } } });
  expect(result.reason).toBe("INVALID_PROFILE"); expect(send).not.toHaveBeenCalled();
});
it("sends only the exact accepted signal once, preserves UNKNOWN and keeps private binding out of JSON", async () => {
  const s = await seed(), send = vi.fn(async (_: ProbeRequest) => Response.json({ authored: true })), store = memory();
  const runner = createLocalRawProbeRunner("P05", config(), { kind: "local-test-double", send }, store, s.binding), cp = s.checkpoint();
  const result = await runner.run({ checkpoint: cp }); const url = new URL(send.mock.calls[0]![0].url);
  expect(url.origin + url.pathname).toBe("https://hackathon.api.qloo.com/v2/insights");
  expect([...url.searchParams]).toEqual([["filter.type", "urn:entity:place"], ["signal.interests.entities", entity], ["take", "1"]]);
  expect(send.mock.calls[0]![0].redirect).toBe("error"); expect(result).toMatchObject({ status: "UNKNOWN", reason: "SCHEMA_REVIEW_REQUIRED", semantic_review: "NOT_REVIEWED", dispatches: 1 });
  expect(JSON.stringify(result)).not.toContain(entity); expect(JSON.stringify(result)).not.toContain(key); expect(P05SummarySchema.safeParse({ ...result, status: "PASS" }).success).toBe(false);
  expect((await runner.run({ checkpoint: cp })).reason).toBe("CALL_BUDGET_EXHAUSTED"); expect(send).toHaveBeenCalledTimes(1);
});
it.each([262144, 262145])("caps P05 capture at its own bound (%i bytes)", async size => {
  const s = await seed(), store = memory(), raw = JSON.stringify({ authored: "x".repeat(size - 15) });
  const result = await createLocalRawProbeRunner("P05", config(), { kind: "local-test-double", send: async () => new Response(raw, { headers: { "content-type": "application/json" } }) }, store, s.binding).run({ checkpoint: s.checkpoint() });
  expect(result.response_bytes).toBe(size); expect(result.raw_saved_privately).toBe(size === 262144); expect(store.saveRaw).toHaveBeenCalledTimes(size === 262144 ? 1 : 0);
});
it.each([301, 403, 429, 500, "network"])("stops on %s without retry or unsafe exception logging", async kind => {
  const s = await seed(), store = memory(), send = vi.fn(async () => { if (typeof kind !== "number") throw new Error(key + entity); return new Response(key + entity, { status: kind }); });
  const result = await createLocalRawProbeRunner("P05", config(), { kind: "local-test-double", send }, store, s.binding).run({ checkpoint: s.checkpoint() });
  expect(send).toHaveBeenCalledTimes(1); expect(store.saveRaw).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain(key); expect(JSON.stringify(result)).not.toContain(entity);
});
it.each([key, encodeURIComponent(key), Buffer.from(key).toString("base64")])("blocks reflected credentials %#", async value => {
  const s = await seed(), store = memory(); const result = await createLocalRawProbeRunner("P05", config(), { kind: "local-test-double", send: async () => Response.json({ authored: value }) }, store, s.binding).run({ checkpoint: s.checkpoint() });
  expect(result.reason).toBe("CREDENTIAL_REFLECTION"); expect(store.saveRaw).not.toHaveBeenCalled();
});
it("keeps timeout/cancellation and the one-in-flight fence", async () => {
  const s = await seed(), send = vi.fn(() => new Promise<Response>(() => {})), store = memory();
  const runner = createLocalRawProbeRunner("P05", config("15"), { kind: "local-test-double", send }, store, s.binding);
  expect((await runner.run({ checkpoint: s.checkpoint(), signal: AbortSignal.abort() })).dispatches).toBe(0); expect(store.reserve).not.toHaveBeenCalled();
  const first = runner.run({ checkpoint: s.checkpoint() }); await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect((await runner.run({ checkpoint: s.checkpoint() })).reason).toBe("CONCURRENCY_LIMIT"); expect((await first).reason).toBe("TIMEOUT"); expect(send).toHaveBeenCalledTimes(1);
  const controller = new AbortController(), send2 = vi.fn(() => new Promise<Response>(() => {}));
  const cancelled = createLocalRawProbeRunner("P05", config(), { kind: "local-test-double", send: send2 }, memory(), s.binding).run({ checkpoint: s.checkpoint(), signal: controller.signal });
  await vi.waitFor(() => expect(send2).toHaveBeenCalled()); controller.abort(); expect((await cancelled).reason).toBe("CANCELLED");
});
it("retains all historical ledger bytes, rejects reused IDs and fences a second dispatch", async () => {
  const s = await seed(), before = await Promise.all(s.historicalFiles.map(f => readFile(f)));
  for (const probe of ["P01", "P02", "P03", "P04", "P03R"] as const) {
    const old = await inspectPrivateProbeLedger(s.root, probe);
    await expect(createPrivateProbeStore(s.root, "P05", { ...s.checkpoint(), attempt_id: old.last_attempt_id! }, null, s.binding).reserve()).rejects.toThrow();
  }
  const cp = s.checkpoint(), store = createPrivateProbeStore(s.root, "P05", cp, null, s.binding);
  await store.reserve(); const record = JSON.parse(await readFile(join(s.base, "p05/attempts", cp.attempt_id, "attempt.json"), "utf8"));
  expect(record).toMatchObject({ record_revision: "tastegate.probe-attempt.v4", profile_revision: P05_PROFILE.revision, max_response_bytes: 262144 });
  await expect(store.saveRaw(new Uint8Array(262145))).rejects.toThrow();
  // Finish through the runner's actual summary contract, not a mirrored implementation expectation.
  const synthetic = memory(); const summary = await createLocalRawProbeRunner("P05", config(), { kind: "local-test-double", send: async () => Response.json({ authored: true }) }, synthetic, s.binding).run({ checkpoint: cp });
  await store.saveSummary(summary); expect((await inspectPrivateProbeLedger(s.root, "P05")).recorded_dispatches).toBe(1);
  await expect(createPrivateProbeStore(s.root, "P05", cp, null, s.binding).reserve()).rejects.toThrow(); expect(await Promise.all(s.historicalFiles.map(f => readFile(f)))).toEqual(before);
});
it("rechecks the private review at durable reservation and rejects version relabeling", async () => {
  const s = await seed(), cp = s.checkpoint(); await writeFile(join(s.base, "p05-radiohead-identity.private.json"), JSON.stringify({ ...s.review, decision: "UNKNOWN" }));
  await expect(createPrivateProbeStore(s.root, "P05", cp, null, s.binding).reserve()).rejects.toThrow(); expect((await inspectPrivateProbeLedger(s.root, "P05")).reserved_attempts).toBe(0);
  await writeFile(join(s.base, "p05-radiohead-identity.private.json"), JSON.stringify(s.review)); const store = createPrivateProbeStore(s.root, "P05", cp, null, s.binding); await store.reserve();
  const summary = await createLocalRawProbeRunner("P05", config(), { kind: "local-test-double", send: async () => Response.json({ authored: true }) }, memory(), s.binding).run({ checkpoint: cp }); await store.saveSummary(summary);
  const file = join(s.base, "p05/attempts", cp.attempt_id, "attempt.json"), record = JSON.parse(await readFile(file, "utf8")); await writeFile(file, JSON.stringify({ ...record, record_revision: "tastegate.probe-attempt.v3" }));
  await expect(inspectPrivateProbeLedger(s.root, "P05")).rejects.toThrow("LEDGER_PROFILE_VERSION_MISMATCH");
});
it("keeps CLI preview/preflight sanitized and refuses execution without a new P05 checkpoint", async () => {
  const s = await seed(); execFileSync("git", ["init", "--quiet", s.root], { windowsHide: true }); await writeFile(join(s.root, ".gitignore"), ".env*\nprivate/\n.cache/\n");
  await writeFile(join(s.root, ".env.local"), "QLOO_MODE=live\nQLOO_API_KEY=" + key + "\n", { mode: 0o600 });
  await mkdir(join(s.root, "scripts")); for (const name of ["probe-cli.mjs", "qloo-probe-p05.mjs"]) await copyFile(resolve("scripts", name), join(s.root, "scripts", name));
  for (const name of await readdir(resolve("src/qloo"))) if (name.endsWith(".ts")) { const file = join(s.root, "src/qloo", name); await mkdir(dirname(file), { recursive: true }); await copyFile(resolve("src/qloo", name), file); }
  await writeFile(join(s.root, "package.json"), '{"type":"module"}'); await symlink(resolve("node_modules"), join(s.root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const env = { ...process.env }; for (const k of Object.keys(env)) if (/^(?:QLOO_|NEXT_PUBLIC_QLOO|NODE_DEBUG|NODE_OPTIONS|SSLKEYLOGFILE|NODE_TLS_REJECT_UNAUTHORIZED)/.test(k)) delete env[k];
  for (const args of [[], ["--preflight-p05"], ["--execute-p05"]]) {
    const child = spawnSync(process.execPath, [join(s.root, "scripts/qloo-probe-p05.mjs"), ...args], { cwd: s.root, env, encoding: "utf8", windowsHide: true });
    expect(child.status).toBe(args[0] === "--execute-p05" ? 2 : 0); const out = child.stdout + child.stderr;
    expect(() => JSON.parse(child.stdout)).not.toThrow(); expect(out).not.toContain(key); expect(out).not.toContain(entity); expect(out).not.toContain(s.binding.reviewSha256);
  }
  expect((await inspectPrivateProbeLedger(s.root, "P05")).reserved_attempts).toBe(0);
}, 25_000);
