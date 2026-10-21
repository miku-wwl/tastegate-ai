import https from "node:https";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P01_PROFILE, P01CheckpointSchema, blockedP01, validP01Checkpoint } from "../src/qloo/p01-profile";
import { P02_PROFILE, P02CheckpointSchema, P02SummarySchema, SAVED_P01_ATTEMPT, blockedP02, validP02Checkpoint } from "../src/qloo/p02-profile";
import { createLocalRawProbeRunner, executeLiveRawProbe, type ProbeStore, type ProbeRequest } from "../src/qloo/raw-probe-runner";
import { probeDefinition } from "../src/qloo/probe-definitions";
import { createPrivateP01Store, inspectPrivateP01Ledger } from "../src/qloo/p01-private-store";
import { createPrivateP02Store, inspectPrivateP02Ledger, liveP02FromPrivateCheckpoint } from "../src/qloo/p02-private-store";
import { inspectSavedP01 } from "../src/qloo/p01-reuse";
import { observeSearch } from "../src/qloo/search-observation";
import { QlooServerConfig } from "../src/qloo/server-config";

// Every provider-shaped value and historical record in this file is authored synthetic data.
const syntheticKey = "synthetic-p02-test-key-never-issued";
const config = (timeout = "4000") => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: syntheticKey, QLOO_REQUEST_TIMEOUT_MS: timeout });
function p01() {
  const now = Date.now();
  return P01CheckpointSchema.parse({ revision: "tastegate.p01.checkpoint.v2", profile_revision: P01_PROFILE.revision,
    attempt_id: randomUUID(), previous_attempt_id: null, prior_reserved_attempts: 0, prior_attempts_reviewed: true,
    credential_exposure_risk_acknowledged: true, credential_basis: "ORIGINALLY_ISSUED_EVENT_KEY", unknown_entitlements_acknowledged: true,
    host_and_header_reviewed: true, request_shape_reviewed: true, usage_rights_confirmed: true, private_capture_permitted: true,
    private_directory_access_reviewed: true, quota: { remaining_calls: "UNKNOWN", rate_limit_per_minute: "UNKNOWN",
      concurrency_limit: "UNKNOWN", key_expires_at: "UNKNOWN" }, approval: "APPROVE_P01_ONLY", max_dispatches: 1,
    approved_at: new Date(now).toISOString(), approval_expires_at: new Date(now + 60_000).toISOString() });
}
function p02(hash = "a".repeat(64)) {
  return P02CheckpointSchema.parse({ ...p01(), revision: "tastegate.p02.checkpoint.v1", profile_revision: P02_PROFILE.revision,
    approval: "APPROVE_P02_ONLY", film_selection_confirmed: true, p01_reuse_reviewed: true, p01_source_attempt_id: SAVED_P01_ATTEMPT,
    p01_raw_sha256: hash, p01_total_dispatches_reviewed: 1 });
}
const memory = () => ({ reserve: vi.fn(async () => {}), saveRaw: vi.fn(async (_bytes: Uint8Array) => {}),
  saveSummary: vi.fn(async (_summary: unknown) => {}) } satisfies ProbeStore);
const candidate = (change: Record<string, unknown> = {}) => ({ entity_id: "authored-film-a", name: "In the Mood for Love",
  types: ["urn:entity:movie"], ...change });
async function temp() {
  await mkdir(".artifacts", { recursive: true });
  return mkdtemp(resolve(".artifacts/p02-test-"));
}
async function savedP01(root: string) {
  const checkpoint = { ...p01(), attempt_id: SAVED_P01_ATTEMPT };
  const folder = join(root, "private/qloo-probes/p01/attempts", SAVED_P01_ATTEMPT);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(JSON.stringify({ results: [{ entity_id: "authored-artist-a", name: "Radiohead",
    types: ["urn:entity:artist"], popularity: 0.8 }], fixture_notice: "AUTHORED_SYNTHETIC_TEST_ONLY" }));
  const hash = createHash("sha256").update(bytes).digest("hex");
  await writeFile(join(folder, "attempt.json"), JSON.stringify({ profile: P01_PROFILE, checkpoint }));
  await writeFile(join(folder, "summary.json"), JSON.stringify({ summary: { ...blockedP01("SCHEMA_REVIEW_REQUIRED", SAVED_P01_ATTEMPT),
    source_mode: "live_probe", status: "UNKNOWN", dispatches: 1, http_status: 200, elapsed_ms: 1,
    response_bytes: bytes.length, raw_saved_privately: true } }));
  await writeFile(join(folder, "response.raw.json"), bytes);
  await writeFile(join(folder, "raw-integrity.private.json"), JSON.stringify({ raw_sha256: hash, response_bytes: bytes.length }));
  return { folder, hash };
}
let bootstrap: string[];
beforeEach(() => {
  bootstrap = process.execArgv; process.execArgv = [];
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External network forbidden"));
  vi.spyOn(https, "request").mockImplementation(() => { throw new Error("External network forbidden"); });
});
afterEach(() => {
  process.execArgv = bootstrap;
  expect(globalThis.fetch).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
describe("P02 is a separately confirmed fixed film probe", () => {
  it("blocks default dispatch, cross-probe consent, and selection without confirmation", async () => {
    const send = vi.fn(async () => Response.json({ results: [] })); const store = memory();
    const runner = createLocalRawProbeRunner("P02", config(), { kind: "local-test-double", send }, store);
    for (const checkpoint of [undefined, p01(), { ...p02(), film_selection_confirmed: false }, { ...p02(), p01_reuse_reviewed: false }])
      expect((await runner.run({ checkpoint })).dispatches).toBe(0);
    expect(send).not.toHaveBeenCalled(); expect(store.reserve).not.toHaveBeenCalled();
    expect(validP01Checkpoint(p02())).toBe(false);
    expect(await executeLiveRawProbe("P02", { checkpoint: p01() }, store)).toEqual(blockedP02());
  });
  it.each([
    { approval: "APPROVE_P01_ONLY" }, { approval: "APPROVE_ALL" }, { p01_total_dispatches_reviewed: 0 },
    { p01_source_attempt_id: randomUUID() }, { p01_raw_sha256: "not-a-hash" }, { attempt_id: SAVED_P01_ATTEMPT },
    { approved_at: "2000-01-01T00:00:00.000Z", approval_expires_at: "2000-01-01T00:01:00.000Z" },
    { api_key: syntheticKey },
  ])("rejects incomplete, stale or widened approval: %j", (change) => expect(validP02Checkpoint({ ...p02(), ...change })).toBe(false));
  it.each([
    { origin: "https://api.qloo.com" }, { path: "/v2/tags" }, { method: "POST" },
    { params: { ...P02_PROFILE.params, query: "Other film" } }, { params: { ...P02_PROFILE.params, page: "2" } },
    { params: { ...P02_PROFILE.params, take: "6" } }, { params: { ...P02_PROFILE.params, types: "urn:entity:artist" } },
    { params: { ...P02_PROFILE.params, "filter.location": "NYC" } }, { headers: { extra: "untrusted" } },
  ])("rejects caller-controlled request changes: %j", async (change) => {
    const send = vi.fn(); const store = memory();
    const runner = createLocalRawProbeRunner("P02", config(), { kind: "local-test-double", send }, store);
    expect((await runner.run({ checkpoint: p02(), profile: { ...P02_PROFILE, ...change } })).reason).toBe("INVALID_PROFILE");
    expect(send).not.toHaveBeenCalled(); expect(store.reserve).not.toHaveBeenCalled();
  });
  it("uses the exact movie URL once and never promotes captured JSON to semantic PASS", async () => {
    const send = vi.fn(async (_request: ProbeRequest) => Response.json({ authored_synthetic_body: true }));
    const runner = createLocalRawProbeRunner("P02", config(), { kind: "local-test-double", send }, memory());
    const checkpoint = p02(); const result = await runner.run({ checkpoint });
    expect(send.mock.calls[0]![0].url).toBe("https://hackathon.api.qloo.com/search?query=In+the+Mood+for+Love&types=urn%3Aentity%3Amovie&take=5&page=1");
    expect(send.mock.calls[0]![0]).toMatchObject({ method: "GET", redirect: "error" });
    expect(result).toMatchObject({ probe: "P02", source_mode: "offline_test", dispatches: 1, automatic_retries: 0, status: "UNKNOWN" });
    expect((await runner.run({ checkpoint })).reason).toBe("CALL_BUDGET_EXHAUSTED"); expect(send).toHaveBeenCalledTimes(1);
    expect(P02SummarySchema.safeParse({ ...result, status: "PASS" }).success).toBe(false);
  });
  it.each([301, 401, 403, 429, 500])("does not follow or retry status %i", async (status) => {
    const send = vi.fn(async () => new Response("synthetic", { status }));
    const runner = createLocalRawProbeRunner("P02", config(), { kind: "local-test-double", send }, memory());
    expect((await runner.run({ checkpoint: p02() })).dispatches).toBe(1); expect(send).toHaveBeenCalledTimes(1);
  });
  it.each(["reflection", "oversize", "invalid-json"])("fails closed on %s", async (kind) => {
    const body = kind === "reflection" ? JSON.stringify({ echo: syntheticKey }) : kind === "oversize" ? "x".repeat(65537) : "{";
    const send = vi.fn(async () => new Response(body, { headers: { "content-type": "application/json" } }));
    const store = memory(); const runner = createLocalRawProbeRunner("P02", config(), { kind: "local-test-double", send }, store);
    expect((await runner.run({ checkpoint: p02() })).raw_saved_privately).toBe(false);
    expect(send).toHaveBeenCalledTimes(1); expect(store.saveRaw).not.toHaveBeenCalled();
  });
  it("times out without retry and keeps the unresolved runner occupied", async () => {
    const send = vi.fn(() => new Promise<Response>(() => {}));
    const runner = createLocalRawProbeRunner("P02", config("15"), { kind: "local-test-double", send }, memory());
    const checkpoint = p02(); const result = await runner.run({ checkpoint });
    expect(result).toMatchObject({ reason: "TIMEOUT", transport_settled: false, dispatches: 1 });
    expect((await runner.run({ checkpoint })).reason).toBe("CONCURRENCY_LIMIT"); expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not register P08-P10 or arbitrary HTTP profiles", () => {
    for (const id of ["P08", "P10", "https://example.test"]) expect(() => probeDefinition(id as never)).toThrow("PROBE_NOT_EXECUTABLE");
  });
});
describe("strict observed fields and independent entity review", () => {
  const observe = (results: unknown[]) => observeSearch({ results }, "urn:entity:movie", "In the Mood for Love");
  it("accepts absent tags, reports ambiguity, and never chooses search rank", () => {
    const single = observe([candidate()]);
    expect(single).toMatchObject({ tags_missing_count: 1, selected_entity_id: null, identity: "INDEPENDENT_REVIEW_REQUIRED", pagination: "NOT_INTERPRETED" });
    const ambiguous = observe([candidate(), candidate({ entity_id: "authored-film-b" })]);
    expect(ambiguous.exact_label_ambiguity).toBe(true); expect(ambiguous.selected_entity_id).toBeNull();
    expect(observe([]).identity).toBe("INDEPENDENT_REVIEW_REQUIRED");
  });
  it("does not let popularity, unknown properties or pagination create affinity or identity", () => {
    expect(observe([candidate({ popularity: 0.1 })])).toEqual(observe([candidate({ popularity: 999 })]));
    const result = observeSearch({ results: [candidate({ properties: { invented_release_year: 2000 } })],
      total: 999, next: "unreviewed" }, "urn:entity:movie", "In the Mood for Love");
    expect(result).toMatchObject({ pagination: "NOT_INTERPRETED", selected_entity_id: null, cultural_affinity: "NOT_ESTABLISHED" });
    expect(result.top_level_keys).toEqual(["next", "results", "total"]);
  });
  it.each([
    [candidate({ entity_id: "" })], [candidate({ entity_id: " authored-film-a " })], [candidate({ name: " " })],
    [candidate({ name: "" })], [candidate({ types: ["urn:entity:artist"] })],
    [candidate({ tags: null })], [candidate({ tags: [{ name: "jazz" }] })], [candidate({ popularity: "high" })],
    [candidate(), candidate()], Array.from({ length: 6 }, (_, n) => candidate({ entity_id: "authored-" + n })),
  ].map((items) => ({ items })))("rejects malformed or conflicting observed projections", ({ items }) => expect(() => observe(items)).toThrow());
});
describe("private P01 reuse and independent durable P02 budget", () => {
  it("reuses saved bytes without a new artist request and detects altered evidence", async () => {
    const root = await temp(); const saved = await savedP01(root);
    const reused = await inspectSavedP01(root); expect(reused.rawSha256).toBe(saved.hash);
    expect(reused.observation).toMatchObject({ result_count: 1, tags_missing_count: 1, selected_entity_id: null });
    await writeFile(join(saved.folder, "response.raw.json"), "{}");
    await expect(inspectSavedP01(root)).rejects.toThrow("P01_REUSE_REVIEW_REQUIRED");
  });
  it("requires saved P01 evidence, and blocks wrong hash before reserving P02", async () => {
    const root = await temp(); await expect(createPrivateP02Store(root, p02()).reserve()).rejects.toThrow();
    await savedP01(root);
    await expect(createPrivateP02Store(root, p02()).reserve()).rejects.toThrow("P01_REUSE_REVIEW_REQUIRED");
    expect((await inspectPrivateP02Ledger(root)).reserved_attempts).toBe(0);
    expect((await liveP02FromPrivateCheckpoint(root)).dispatches).toBe(0);
  });
  it("keeps distinct ledgers, immutable attempts and a shared cross-process lock", async () => {
    const root = await temp(); const saved = await savedP01(root); const checkpoint = p02(saved.hash);
    const store = createPrivateP02Store(root, checkpoint); await store.reserve();
    await expect(createPrivateP01Store(root, { ...p01(), prior_reserved_attempts: 1, previous_attempt_id: SAVED_P01_ATTEMPT }).reserve()).rejects.toThrow();
    await expect(inspectPrivateP01Ledger(root)).rejects.toThrow("LEDGER_BUSY_OR_REVIEW_REQUIRED");
    await store.saveSummary(blockedP02("CANCELLED", checkpoint.attempt_id));
    expect((await inspectPrivateP01Ledger(root)).recorded_dispatches).toBe(1);
    expect(await inspectPrivateP02Ledger(root)).toMatchObject({ reserved_attempts: 1, recorded_dispatches: 0, unresolved_attempts: 0 });
    await expect(createPrivateP02Store(root, checkpoint).reserve()).rejects.toThrow();
    expect(await readdir(join(root, "private/qloo-probes/p02/attempts"))).toEqual([checkpoint.attempt_id]);
    expect(await readFile(join(saved.folder, "response.raw.json"), "utf8")).toContain("AUTHORED_SYNTHETIC_TEST_ONLY");
  });
  it("does not spend an unreviewed prior P01 reservation or legacy lock", async () => {
    const root = await temp(); const saved = await savedP01(root);
    await writeFile(join(root, "private/qloo-probes/p01/active.lock"), JSON.stringify({ attempt_id: randomUUID() }));
    await expect(createPrivateP02Store(root, p02(saved.hash)).reserve()).rejects.toThrow();
    // Legacy lock remains untouched; no P02 record exists.
    expect(await readdir(join(root, "private/qloo-probes/p02/attempts"))).toEqual([]);
  });
  it("rejects P01 summary substitution and retains lock for unsettled P02", async () => {
    const root = await temp(); const saved = await savedP01(root); const cp = p02(saved.hash);
    const store = createPrivateP02Store(root, cp); await store.reserve();
    await expect(store.saveSummary(blockedP01("CANCELLED", cp.attempt_id))).rejects.toThrow();
    await store.saveSummary({ ...blockedP02("TIMEOUT", cp.attempt_id), source_mode: "offline_test", status: "UNKNOWN",
      dispatches: 1, elapsed_ms: 15, transport_settled: false });
    await expect(inspectPrivateP02Ledger(root)).rejects.toThrow("LEDGER_BUSY_OR_REVIEW_REQUIRED");
  });
  it("provides only a default blocked CLI preview and rejects cross-probe switches", () => {
    const env = { ...process.env, QLOO_MODE: "live", QLOO_API_KEY: syntheticKey };
    const preview = spawnSync(process.execPath, ["scripts/qloo-probe-p02.mjs"], { env, encoding: "utf8", windowsHide: true });
    expect(preview.status).toBe(0); expect(JSON.parse(preview.stdout)).toEqual({ profile: P02_PROFILE, summary: blockedP02() });
    for (const arg of ["--execute-p03", "--execute-p04", "--execute-p01", "--force"]) {
      const denied = spawnSync(process.execPath, ["scripts/qloo-probe-p02.mjs", arg], { env, encoding: "utf8", windowsHide: true });
      expect(denied.status).toBe(2); expect(denied.stdout + denied.stderr).not.toContain(syntheticKey);
    }
    expect(preview.stdout + preview.stderr).not.toContain(syntheticKey);
  }, 15_000);
});
