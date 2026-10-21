import https from "node:https";
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { P01_PROFILE, P01CheckpointSchema, blockedP01, validP01Checkpoint } from "../src/qloo/p01-profile";
import { P02_PROFILE, P02CheckpointSchema, SAVED_P01_ATTEMPT, blockedP02, validP02Checkpoint } from "../src/qloo/p02-profile";
import { P03_PROFILE, P03CheckpointSchema, P03SummarySchema, blockedP03, validP03Checkpoint } from "../src/qloo/p03-profile";
import { P04_PROFILE, P04CheckpointSchema, blockedP04, validP04Checkpoint } from "../src/qloo/p04-profile";
import { createPrivateP03Store, inspectPrivateP03Ledger, liveP03FromPrivateCheckpoint } from "../src/qloo/p03-private-store";
import { createPrivateP04Store, inspectPrivateP04Ledger } from "../src/qloo/p04-private-store";
import { createLocalRawProbeRunner, executeLiveRawProbe, type ProbeRequest, type ProbeStore } from "../src/qloo/raw-probe-runner";
import { QlooServerConfig } from "../src/qloo/server-config";
import { probeDefinition } from "../src/qloo/probe-definitions";

// Author-written synthetic histories, keys and bodies; no captured provider data.
const key = "synthetic-p03-key-never-issued";
function common() {
  const now = Date.now();
  return P01CheckpointSchema.parse({ revision: "tastegate.p01.checkpoint.v2", profile_revision: P01_PROFILE.revision,
    attempt_id: randomUUID(), previous_attempt_id: null, prior_reserved_attempts: 0, prior_attempts_reviewed: true,
    credential_exposure_risk_acknowledged: true, credential_basis: "ORIGINALLY_ISSUED_EVENT_KEY", unknown_entitlements_acknowledged: true,
    host_and_header_reviewed: true, request_shape_reviewed: true, usage_rights_confirmed: true, private_capture_permitted: true,
    private_directory_access_reviewed: true, quota: { remaining_calls: "UNKNOWN", rate_limit_per_minute: "UNKNOWN",
      concurrency_limit: "UNKNOWN", key_expires_at: "UNKNOWN" }, approval: "APPROVE_P01_ONLY", max_dispatches: 1,
    approved_at: new Date(now).toISOString(), approval_expires_at: new Date(now + 60_000).toISOString() });
}
function film() { return P02CheckpointSchema.parse({ ...common(), revision: "tastegate.p02.checkpoint.v1",
  profile_revision: P02_PROFILE.revision, approval: "APPROVE_P02_ONLY", film_selection_confirmed: true,
  p01_reuse_reviewed: true, p01_source_attempt_id: SAVED_P01_ATTEMPT, p01_raw_sha256: "a".repeat(64), p01_total_dispatches_reviewed: 1 }); }
function tags() { return P04CheckpointSchema.parse({ ...common(), revision: "tastegate.p04.checkpoint.v1",
  profile_revision: P04_PROFILE.revision, approval: "APPROVE_P04_ONLY", public_jazz_query_confirmed: true,
  prior_probe_dispatches_reviewed: { P01: 1, P02: 1 } }); }
function checkpoint() { return P03CheckpointSchema.parse({ ...common(), revision: "tastegate.p03.checkpoint.v1",
  profile_revision: P03_PROFILE.revision, approval: "APPROVE_P03_NYC_ONLY", public_venue_confirmed: true,
  independent_location_reviewed: true, prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P04: 1 } }); }
const config = (timeout = "4000") => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: key, QLOO_REQUEST_TIMEOUT_MS: timeout });
const memory = () => ({ reserve: vi.fn(async () => {}), saveRaw: vi.fn(async (_bytes: Uint8Array) => {}),
  saveSummary: vi.fn(async (_summary: unknown) => {}) } satisfies ProbeStore);
async function temp() { await mkdir(".artifacts", { recursive: true }); return mkdtemp(resolve(".artifacts/p03-test-")); }
async function prior(root: string, p04State: "settled" | "missing" | "unsettled" | "undispatched" = "settled") {
  const p01 = { ...common(), attempt_id: SAVED_P01_ATTEMPT }; const p02 = film(); const p04 = tags();
  for (const [probe, cp, initial] of [["p01", p01, blockedP01()], ["p02", p02, blockedP02()], ["p04", p04, blockedP04()]] as const) {
    if (probe === "p04" && p04State === "missing") continue;
    const folder = join(root, "private/qloo-probes", probe, "attempts", cp.attempt_id); await mkdir(folder, { recursive: true, mode: 0o700 });
    await writeFile(join(folder, "attempt.json"), JSON.stringify({ checkpoint: cp }));
    const noDispatch = probe === "p04" && p04State === "undispatched";
    await writeFile(join(folder, "summary.json"), JSON.stringify({ summary: { ...initial, attempt_id: cp.attempt_id,
      ...(noDispatch ? {} : { status: "UNKNOWN", source_mode: "offline_test", dispatches: 1, elapsed_ms: 1 }),
      transport_settled: !(probe === "p04" && p04State === "unsettled") } }));
  }
  return { p01, p02, p04 };
}
let bootstrap: string[];
beforeEach(() => { bootstrap = process.execArgv; process.execArgv = [];
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External network forbidden"));
  vi.spyOn(https, "request").mockImplementation(() => { throw new Error("External network forbidden"); }); });
afterEach(() => { process.execArgv = bootstrap; expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(https.request).not.toHaveBeenCalled(); vi.restoreAllMocks(); });

it("does not inherit any prior probe consent or confirmation", async () => {
  const send = vi.fn(); const store = memory(); const runner = createLocalRawProbeRunner("P03", config(), { kind: "local-test-double", send }, store);
  for (const cp of [undefined, common(), film(), tags(), { ...checkpoint(), public_venue_confirmed: false },
    { ...checkpoint(), independent_location_reviewed: false }]) expect((await runner.run({ checkpoint: cp })).dispatches).toBe(0);
  for (const valid of [validP01Checkpoint, validP02Checkpoint, validP04Checkpoint]) expect(valid(checkpoint())).toBe(false);
  expect(await executeLiveRawProbe("P03", { checkpoint: tags() }, store)).toEqual(blockedP03());
  expect(send).not.toHaveBeenCalled(); expect(store.reserve).not.toHaveBeenCalled();
});
it.each([{ approval: "APPROVE_ALL" }, { approval: "APPROVE_P03_ONLY" }, { max_dispatches: 2 }, { api_key: key },
  { prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P04: 0 } }, { prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P04: 1, P05: 1 } },
  { attempt_id: "not-uuid" }, { previous_attempt_id: randomUUID() },
  { approved_at: "2000-01-01T00:00:00Z", approval_expires_at: "2000-01-01T00:01:00Z" }])(
  "rejects forged or widened checkpoints (%j)", (change) => expect(validP03Checkpoint({ ...checkpoint(), ...change })).toBe(false));
it.each([{ method: "POST" }, { origin: "https://api.qloo.com" }, { path: "/v2/tags" },
  { params: { ...P03_PROFILE.params, query: "Blue Note Tokyo" } }, { params: { ...P03_PROFILE.params, query: "Blue Note" } },
  { params: { ...P03_PROFILE.params, take: "5" } }, { params: { ...P03_PROFILE.params, page: "2" } },
  { params: { ...P03_PROFILE.params, types: "urn:entity:artist" } }, { params: { ...P03_PROFILE.params, "filter.location": "NYC" } },
  { headers: { "X-Api-Key": key } }])("denies different queries, geography filters and other request changes (%j)", async (change) => {
  const send = vi.fn(); const runner = createLocalRawProbeRunner("P03", config(), { kind: "local-test-double", send }, memory());
  expect((await runner.run({ checkpoint: checkpoint(), profile: { ...P03_PROFILE, ...change } })).reason).toBe("INVALID_PROFILE");
  expect(send).not.toHaveBeenCalled();
});
it("dispatches only the exact bounded request in a local double; no semantic promotion", async () => {
  const send = vi.fn(async (_r: ProbeRequest) => Response.json({ authored_synthetic: true })); const store = memory();
  const runner = createLocalRawProbeRunner("P03", config(), { kind: "local-test-double", send }, store); const cp = checkpoint();
  const result = await runner.run({ checkpoint: cp }); expect(send.mock.calls[0]![0]).toMatchObject({
    url: "https://hackathon.api.qloo.com/search?query=Blue+Note+New+York&types=urn%3Aentity%3Aplace&take=3&page=1", method: "GET", redirect: "error" });
  expect(result).toMatchObject({ probe: "P03", status: "UNKNOWN", semantic_review: "NOT_REVIEWED", source_mode: "offline_test", dispatches: 1 });
  expect(P03SummarySchema.safeParse({ ...result, status: "PASS" }).success).toBe(false);
  expect((await runner.run({ checkpoint: cp })).reason).toBe("CALL_BUDGET_EXHAUSTED"); expect(send).toHaveBeenCalledTimes(1);
});
it.each([301, 401, 403, 429, 500])("does not retry or redirect HTTP %i", async (status) => {
  const send = vi.fn(async () => new Response("authored body", { status }));
  await createLocalRawProbeRunner("P03", config(), { kind: "local-test-double", send }, memory()).run({ checkpoint: checkpoint() });
  expect(send).toHaveBeenCalledTimes(1);
});
it.each(["reflection", "oversize", "invalid-json", "wrong-media"])("preserves %s capture protection", async (kind) => {
  const body = kind === "reflection" ? JSON.stringify({ echo: key }) : kind === "oversize" ? "x".repeat(65537) : kind === "invalid-json" ? "{" : "{}";
  const send = vi.fn(async () => new Response(body, { headers: { "content-type": kind === "wrong-media" ? "text/plain" : "application/json" } }));
  const store = memory(); const result = await createLocalRawProbeRunner("P03", config(), { kind: "local-test-double", send }, store).run({ checkpoint: checkpoint() });
  expect(result.raw_saved_privately).toBe(false); expect(store.saveRaw).not.toHaveBeenCalled(); expect(send).toHaveBeenCalledTimes(1);
});
it("bounds deadline, pre-cancellation and uncertain in-flight concurrency", async () => {
  expect(() => config("4001")).toThrow(); const send = vi.fn(() => new Promise<Response>(() => {}));
  const runner = createLocalRawProbeRunner("P03", config("15"), { kind: "local-test-double", send }, memory()); const cp = checkpoint();
  expect((await runner.run({ checkpoint: cp, signal: AbortSignal.abort() })).dispatches).toBe(0);
  expect(await runner.run({ checkpoint: cp })).toMatchObject({ reason: "TIMEOUT", transport_settled: false });
  expect((await runner.run({ checkpoint: checkpoint() })).reason).toBe("CONCURRENCY_LIMIT"); expect(send).toHaveBeenCalledTimes(1);
});
it.each(["missing", "unsettled", "undispatched"] as const)("blocks reservation with %s P04 history", async (state) => {
  const root = await temp(); await prior(root, state); await expect(createPrivateP03Store(root, checkpoint()).reserve()).rejects.toThrow();
  expect((await inspectPrivateP03Ledger(root)).reserved_attempts).toBe(0); expect((await liveP03FromPrivateCheckpoint(root)).dispatches).toBe(0);
});
it("preserves prior evidence, fences concurrent probes and consumes the reservation durably", async () => {
  const root = await temp(); const history = await prior(root); const oldPath = join(root, "private/qloo-probes/p04/attempts", history.p04.attempt_id, "attempt.json");
  const oldBytes = await readFile(oldPath); const cp = checkpoint(); const store = createPrivateP03Store(root, cp); await store.reserve();
  await expect(createPrivateP03Store(root, checkpoint()).reserve()).rejects.toThrow();
  await expect(createPrivateP04Store(root, { ...tags(), prior_reserved_attempts: 1, previous_attempt_id: history.p04.attempt_id }).reserve()).rejects.toThrow();
  await expect(inspectPrivateP04Ledger(root)).rejects.toThrow("LEDGER_BUSY_OR_REVIEW_REQUIRED");
  await expect(store.saveSummary(blockedP04("CANCELLED", cp.attempt_id))).rejects.toThrow();
  await store.saveSummary(blockedP03("CANCELLED", cp.attempt_id));
  expect(await readFile(oldPath)).toEqual(oldBytes); expect((await inspectPrivateP04Ledger(root)).recorded_dispatches).toBe(1);
  expect(await inspectPrivateP03Ledger(root)).toMatchObject({ reserved_attempts: 1, recorded_dispatches: 0, unresolved_attempts: 0 });
  await expect(createPrivateP03Store(root, cp).reserve()).rejects.toThrow();
});
it("rejects reuse of every prior attempt ID and retains locks after an uncertain dispatch", async () => {
  const root = await temp(); const history = await prior(root);
  for (const cp of [history.p01, history.p02, history.p04]) await expect(createPrivateP03Store(root, { ...checkpoint(), attempt_id: cp.attempt_id }).reserve()).rejects.toThrow();
  const cp = checkpoint(); const store = createPrivateP03Store(root, cp); await store.reserve();
  await store.saveSummary({ ...blockedP03("TIMEOUT", cp.attempt_id), status: "UNKNOWN", source_mode: "offline_test", dispatches: 1, elapsed_ms: 15, transport_settled: false });
  await expect(inspectPrivateP03Ledger(root)).rejects.toThrow("LEDGER_BUSY_OR_REVIEW_REQUIRED");
  await expect(store.saveSummary(blockedP03("CANCELLED", cp.attempt_id))).rejects.toThrow();
});
it("does not admit P08-P10 or unrestricted HTTP", () => {
  for (const p of ["P08", "P09", "P10", "https://example.test"]) expect(() => probeDefinition(p as never)).toThrow();
});
it("previews and preflights only synthetic local state without creating consent or a reservation", async () => {
  const root = await temp(); await prior(root); execFileSync("git", ["init", "--quiet", root], { windowsHide: true });
  await writeFile(join(root, ".gitignore"), ".env*\nprivate/\n.cache/\n"); await writeFile(join(root, ".env.local"), "QLOO_MODE=live\nQLOO_API_KEY=" + key + "\n", { mode: 0o600 });
  for (const name of ["boundary-error", "server-config", "p01-profile", "p01-local-env", "p01-runner", "p01-private-store", "p02-profile", "p02-private-store",
    "p03-profile", "p03-private-store", "p04-profile", "p04-private-store", "p03r-profile", "p03r-private-store", "p05-profile", "p05-signal", "p06-profile", "p06-shortlist", "p07-profile", "p07-signal", "p07-consent", "owner-consent", "probe-cli-contract",
    "probe-definitions", "raw-probe-runner", "raw-probe-store", "p01-reuse", "search-observation"]) {
    const target = join(root, "src/qloo", name + ".ts"); await mkdir(dirname(target), { recursive: true }); await copyFile(resolve("src/qloo", name + ".ts"), target);
  }
  await mkdir(join(root, "scripts")); for (const name of ["probe-cli.mjs", "qloo-probe-p03.mjs"]) await copyFile(resolve("scripts", name), join(root, "scripts", name));
  await writeFile(join(root, "package.json"), '{"type":"module"}'); await symlink(resolve("node_modules"), join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const env = { ...process.env }; for (const n of Object.keys(env)) if (/^(?:QLOO_|NEXT_PUBLIC_QLOO|NODE_DEBUG|NODE_DEBUG_NATIVE|NODE_OPTIONS|SSLKEYLOGFILE|NODE_TLS_REJECT_UNAUTHORIZED)/.test(n)) delete env[n];
  const run = (args: string[]) => spawnSync(process.execPath, [join(root, "scripts/qloo-probe-p03.mjs"), ...args], { env, cwd: root, encoding: "utf8", windowsHide: true });
  const preview = run([]); const check = run(["--preflight-p03"]); expect(preview.status).toBe(0); expect(check.status).toBe(0);
  expect(JSON.parse(preview.stdout)).toEqual({ profile: P03_PROFILE, summary: blockedP03() });
  expect(JSON.parse(check.stdout).preflight).toMatchObject({ dispatches: 0, approval: "NOT_GRANTED_BY_PREFLIGHT",
    prior_probe_ledgers: { P01: { recorded_dispatches: 1 }, P02: { recorded_dispatches: 1 }, P04: { recorded_dispatches: 1 } } });
  for (const arg of ["--execute-p04", "--execute-p05", "--force", "https://example.test"]) expect(run([arg]).status).toBe(2);
  expect(preview.stdout + preview.stderr + check.stdout + check.stderr).not.toContain(key);
  expect(await readdir(join(root, "private/qloo-probes/p03/attempts"))).toEqual([]);
  await expect(readFile(join(root, "private/qloo-probes/p03-checkpoint.json"))).rejects.toThrow();
}, 20_000);
