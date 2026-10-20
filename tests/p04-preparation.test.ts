import https from "node:https";
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { P01_PROFILE, P01CheckpointSchema, blockedP01, validP01Checkpoint } from "../src/qloo/p01-profile";
import { P02_PROFILE, P02CheckpointSchema, SAVED_P01_ATTEMPT, blockedP02, validP02Checkpoint } from "../src/qloo/p02-profile";
import { P04_PROFILE, P04CheckpointSchema, P04SummarySchema, validP04Checkpoint, blockedP04 } from "../src/qloo/p04-profile";
import { createLocalRawProbeRunner, executeLiveRawProbe, type ProbeRequest, type ProbeStore } from "../src/qloo/raw-probe-runner";
import { createPrivateP04Store, inspectPrivateP04Ledger, liveP04FromPrivateCheckpoint } from "../src/qloo/p04-private-store";
import { inspectPrivateP01Ledger, createPrivateP01Store } from "../src/qloo/p01-private-store";
import { inspectPrivateP02Ledger } from "../src/qloo/p02-private-store";
import { QlooServerConfig } from "../src/qloo/server-config";
import { probeDefinition } from "../src/qloo/probe-definitions";

// All keys, response objects and historical ledgers here are AUTHORED SYNTHETIC TEST DATA.
const key = "synthetic-p04-key-never-issued";
function common() {
  const now = Date.now();
  return P01CheckpointSchema.parse({ revision: "tastegate.p01.checkpoint.v2", profile_revision: P01_PROFILE.revision,
    attempt_id: randomUUID(), previous_attempt_id: null, prior_reserved_attempts: 0, prior_attempts_reviewed: true,
    credential_exposure_risk_acknowledged: true, credential_basis: "ORIGINALLY_ISSUED_EVENT_KEY",
    unknown_entitlements_acknowledged: true, host_and_header_reviewed: true, request_shape_reviewed: true,
    usage_rights_confirmed: true, private_capture_permitted: true, private_directory_access_reviewed: true,
    quota: { remaining_calls: "UNKNOWN", rate_limit_per_minute: "UNKNOWN", concurrency_limit: "UNKNOWN", key_expires_at: "UNKNOWN" },
    approval: "APPROVE_P01_ONLY", max_dispatches: 1, approved_at: new Date(now).toISOString(),
    approval_expires_at: new Date(now + 60_000).toISOString() });
}
function checkpoint() {
  return P04CheckpointSchema.parse({ ...common(), revision: "tastegate.p04.checkpoint.v1", profile_revision: P04_PROFILE.revision,
    approval: "APPROVE_P04_ONLY", public_jazz_query_confirmed: true, prior_probe_dispatches_reviewed: { P01: 1, P02: 1 } });
}
function p02() {
  return P02CheckpointSchema.parse({ ...common(), revision: "tastegate.p02.checkpoint.v1", profile_revision: P02_PROFILE.revision,
    approval: "APPROVE_P02_ONLY", film_selection_confirmed: true, p01_reuse_reviewed: true, p01_source_attempt_id: SAVED_P01_ATTEMPT,
    p01_raw_sha256: "a".repeat(64), p01_total_dispatches_reviewed: 1 });
}
const config = (timeout = "4000") => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: key, QLOO_REQUEST_TIMEOUT_MS: timeout });
const memory = () => ({ reserve: vi.fn(async () => {}), saveRaw: vi.fn(async (_bytes: Uint8Array) => {}),
  saveSummary: vi.fn(async (_summary: unknown) => {}) } satisfies ProbeStore);
async function temp() {
  await mkdir(".artifacts", { recursive: true }); return mkdtemp(resolve(".artifacts/p04-test-"));
}
async function prior(root: string, unsettled = false) {
  const first = { ...common(), attempt_id: SAVED_P01_ATTEMPT }; const second = p02();
  for (const [probe, cp, summary] of [["p01", first, blockedP01("SCHEMA_REVIEW_REQUIRED", first.attempt_id)],
    ["p02", second, blockedP02("SCHEMA_REVIEW_REQUIRED", second.attempt_id)]] as const) {
    const folder = join(root, "private/qloo-probes", probe, "attempts", cp.attempt_id);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await writeFile(join(folder, "attempt.json"), JSON.stringify({ checkpoint: cp }));
    await writeFile(join(folder, "summary.json"), JSON.stringify({ summary: { ...summary,
      status: "UNKNOWN", source_mode: "offline_test", dispatches: 1, elapsed_ms: 1,
      transport_settled: !(unsettled && probe === "p02") } }));
  }
  return { first, second };
}
let bootstrap: string[];
beforeEach(() => {
  bootstrap = process.execArgv; process.execArgv = [];
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External network forbidden"));
  vi.spyOn(https, "request").mockImplementation(() => { throw new Error("External network forbidden"); });
});
afterEach(() => {
  process.execArgv = bootstrap;
  expect(globalThis.fetch).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled(); vi.restoreAllMocks();
});
it("requires fresh P04 consent and does not inherit P01/P02 approval", async () => {
  const send = vi.fn(); const store = memory();
  const runner = createLocalRawProbeRunner("P04", config(), { kind: "local-test-double", send }, store);
  for (const cp of [undefined, {}, common(), p02(), { ...checkpoint(), public_jazz_query_confirmed: false }])
    expect((await runner.run({ checkpoint: cp })).dispatches).toBe(0);
  expect(send).not.toHaveBeenCalled(); expect(store.reserve).not.toHaveBeenCalled();
  expect(validP01Checkpoint(checkpoint())).toBe(false); expect(validP02Checkpoint(checkpoint())).toBe(false);
  expect(await executeLiveRawProbe("P04", { checkpoint: p02() }, store)).toEqual(blockedP04());
});
it.each([
  { approval: "APPROVE_ALL" }, { approval: "APPROVE_P02_ONLY" }, { prior_probe_dispatches_reviewed: { P01: 1, P02: 0 } },
  { prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P03: 1 } }, { max_dispatches: 2 }, { api_key: key },
  { attempt_id: "not-a-uuid" }, { approved_at: "2000-01-01T00:00:00Z", approval_expires_at: "2000-01-01T00:01:00Z" },
])("rejects widened, stale or forged checkpoint (%j)", (change) => expect(validP04Checkpoint({ ...checkpoint(), ...change })).toBe(false));
it.each([
  { method: "POST" }, { origin: "https://api.qloo.com" }, { origin: "https://hackathon.api.qloo.com.evil.test" },
  { path: "/search" }, { path: "/v2/insights" }, { params: { ...P04_PROFILE.params, "filter.query": "other" } },
  { params: { ...P04_PROFILE.params, query: "jazz" } }, { params: { ...P04_PROFILE.params, take: "50" } },
  { params: { ...P04_PROFILE.params, page: "2" } }, { params: { ...P04_PROFILE.params, "filter.tag.types": "invented" } },
  { headers: { "X-Api-Key": key } },
])("rejects request widening (%j)", async (change) => {
  const send = vi.fn(); const runner = createLocalRawProbeRunner("P04", config(), { kind: "local-test-double", send }, memory());
  expect((await runner.run({ checkpoint: checkpoint(), profile: { ...P04_PROFILE, ...change } })).reason).toBe("INVALID_PROFILE");
  expect(send).not.toHaveBeenCalled();
});
it("dispatches exactly the fixed tag URL once in a local double and preserves unknown semantics", async () => {
  const send = vi.fn(async (_request: ProbeRequest) => Response.json({ authored_synthetic: true })); const store = memory();
  const runner = createLocalRawProbeRunner("P04", config(), { kind: "local-test-double", send }, store); const cp = checkpoint();
  const result = await runner.run({ checkpoint: cp });
  expect(send.mock.calls[0]![0]).toMatchObject({ url: "https://hackathon.api.qloo.com/v2/tags?filter.query=jazz&take=5&page=1",
    method: "GET", redirect: "error" });
  expect(result).toMatchObject({ probe: "P04", status: "UNKNOWN", source_mode: "offline_test", dispatches: 1, automatic_retries: 0 });
  expect(P04SummarySchema.safeParse({ ...result, status: "PASS" }).success).toBe(false);
  expect((await runner.run({ checkpoint: cp })).reason).toBe("CALL_BUDGET_EXHAUSTED"); expect(send).toHaveBeenCalledTimes(1);
});
it.each([301, 401, 403, 429, 500])("does not redirect or retry HTTP %i", async (status) => {
  const send = vi.fn(async () => new Response("authored body", { status }));
  const runner = createLocalRawProbeRunner("P04", config(), { kind: "local-test-double", send }, memory());
  expect((await runner.run({ checkpoint: checkpoint() })).dispatches).toBe(1); expect(send).toHaveBeenCalledTimes(1);
});
it.each(["reflection", "oversize", "invalid-json", "wrong-media"])("retains capture protection for %s", async (kind) => {
  const body = kind === "reflection" ? JSON.stringify({ echo: key }) : kind === "oversize" ? "x".repeat(65537) : kind === "invalid-json" ? "{" : "{}";
  const send = vi.fn(async () => new Response(body, { headers: { "content-type": kind === "wrong-media" ? "text/plain" : "application/json" } }));
  const store = memory(); const runner = createLocalRawProbeRunner("P04", config(), { kind: "local-test-double", send }, store);
  expect((await runner.run({ checkpoint: checkpoint() })).raw_saved_privately).toBe(false);
  expect(send).toHaveBeenCalledTimes(1); expect(store.saveRaw).not.toHaveBeenCalled();
});
it("enforces timeout, cancellation and no overlapping unresolved operation", async () => {
  expect(() => config("4001")).toThrow();
  const send = vi.fn(() => new Promise<Response>(() => {}));
  const runner = createLocalRawProbeRunner("P04", config("15"), { kind: "local-test-double", send }, memory());
  const signal = AbortSignal.abort(); expect((await runner.run({ checkpoint: checkpoint(), signal })).dispatches).toBe(0);
  const cp = checkpoint(); expect(await runner.run({ checkpoint: cp })).toMatchObject({ reason: "TIMEOUT", transport_settled: false });
  expect((await runner.run({ checkpoint: cp })).reason).toBe("CONCURRENCY_LIMIT"); expect(send).toHaveBeenCalledTimes(1);
});
it("requires reviewed historical accounting before reserving P04", async () => {
  const missing = await temp(); await expect(createPrivateP04Store(missing, checkpoint()).reserve()).rejects.toThrow();
  const root = await temp(); await prior(root, true);
  await expect(createPrivateP04Store(root, checkpoint()).reserve()).rejects.toThrow();
  expect((await inspectPrivateP04Ledger(root)).reserved_attempts).toBe(0);
  expect((await liveP04FromPrivateCheckpoint(root)).dispatches).toBe(0);
});
it("reserves an immutable separate ledger, preserves P01/P02 and serializes all probes", async () => {
  const root = await temp(); const history = await prior(root); const cp = checkpoint(); const store = createPrivateP04Store(root, cp);
  const before = await inspectPrivateP02Ledger(root); await store.reserve();
  await expect(createPrivateP04Store(root, checkpoint()).reserve()).rejects.toThrow();
  await expect(createPrivateP01Store(root, { ...common(), prior_reserved_attempts: 1, previous_attempt_id: history.first.attempt_id }).reserve()).rejects.toThrow();
  await expect(inspectPrivateP01Ledger(root)).rejects.toThrow("LEDGER_BUSY_OR_REVIEW_REQUIRED");
  await store.saveSummary(blockedP04("CANCELLED", cp.attempt_id));
  expect(await inspectPrivateP02Ledger(root)).toEqual(before);
  expect((await inspectPrivateP01Ledger(root)).recorded_dispatches).toBe(1);
  expect(await inspectPrivateP04Ledger(root)).toMatchObject({ reserved_attempts: 1, recorded_dispatches: 0, unresolved_attempts: 0 });
  await expect(createPrivateP04Store(root, cp).reserve()).rejects.toThrow();
  expect(await readdir(join(root, "private/qloo-probes/p04/attempts"))).toEqual([cp.attempt_id]);
});
it("rejects prior probe attempt ID reuse and legacy cross-probe locks", async () => {
  const root = await temp(); const old = await prior(root);
  for (const attempt_id of [old.first.attempt_id, old.second.attempt_id])
    await expect(createPrivateP04Store(root, { ...checkpoint(), attempt_id }).reserve()).rejects.toThrow();
  await writeFile(join(root, "private/qloo-probes/p02/active.lock"), JSON.stringify({ attempt_id: old.second.attempt_id }));
  await expect(createPrivateP04Store(root, checkpoint()).reserve()).rejects.toThrow();
  expect(await readdir(join(root, "private/qloo-probes/p04/attempts"))).toEqual([]);
});
it("rejects cross-probe summary substitution and retains durable locks after uncertain completion", async () => {
  const root = await temp(); await prior(root); const cp = checkpoint(); const store = createPrivateP04Store(root, cp);
  await store.reserve(); await expect(store.saveSummary(blockedP02("CANCELLED", cp.attempt_id))).rejects.toThrow();
  await store.saveSummary({ ...blockedP04("TIMEOUT", cp.attempt_id), status: "UNKNOWN", source_mode: "offline_test",
    dispatches: 1, elapsed_ms: 15, transport_settled: false });
  await expect(inspectPrivateP04Ledger(root)).rejects.toThrow("LEDGER_BUSY_OR_REVIEW_REQUIRED");
  await expect(store.saveSummary(blockedP04("CANCELLED", cp.attempt_id))).rejects.toThrow();
});
it("keeps other probes and arbitrary URLs outside the registry", () => {
  for (const id of ["P07", "P10", "https://example.test"]) expect(() => probeDefinition(id as never)).toThrow();
});
it("provides default preview and zero-reservation preflight using only synthetic local configuration", async () => {
  const root = await temp(); await prior(root); execFileSync("git", ["init", "--quiet", root], { windowsHide: true });
  await writeFile(join(root, ".gitignore"), ".env*\nprivate/\n.cache/\n");
  await writeFile(join(root, ".env.local"), "QLOO_MODE=live\nQLOO_API_KEY=" + key + "\n", { mode: 0o600 });
  for (const name of ["boundary-error", "server-config", "p01-profile", "p01-local-env", "p01-runner", "p01-private-store",
    "p02-profile", "p02-private-store", "p03-profile", "p03-private-store", "p04-profile", "p04-private-store",
    "p03r-profile", "p03r-private-store", "p05-profile", "p05-signal", "p06-profile", "p06-shortlist", "probe-cli-contract", "probe-definitions",
    "raw-probe-runner", "raw-probe-store", "p01-reuse", "search-observation"]) {
    const target = join(root, "src/qloo", name + ".ts"); await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve("src/qloo", name + ".ts"), target);
  }
  await mkdir(join(root, "scripts")); for (const name of ["probe-cli.mjs", "qloo-probe-p04.mjs"])
    await copyFile(resolve("scripts", name), join(root, "scripts", name));
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  await symlink(resolve("node_modules"), join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/^(?:QLOO_|NEXT_PUBLIC_QLOO|NODE_DEBUG|NODE_DEBUG_NATIVE|NODE_OPTIONS|SSLKEYLOGFILE|NODE_TLS_REJECT_UNAUTHORIZED)/.test(name)) delete env[name];
  const run = (args: string[]) => spawnSync(process.execPath, [join(root, "scripts/qloo-probe-p04.mjs"), ...args],
    { env, cwd: root, encoding: "utf8", windowsHide: true });
  const preview = run([]); expect(preview.status).toBe(0); expect(JSON.parse(preview.stdout)).toEqual({ profile: P04_PROFILE, summary: blockedP04() });
  const preflight = run(["--preflight-p04"]); expect(preflight.status).toBe(0);
  expect(JSON.parse(preflight.stdout).preflight).toMatchObject({ status: "READY_FOR_HUMAN_APPROVAL", dispatches: 0,
    approval: "NOT_GRANTED_BY_PREFLIGHT", ledger: { reserved_attempts: 0, recorded_dispatches: 0 },
    prior_probe_ledgers: { P01: { recorded_dispatches: 1 }, P02: { recorded_dispatches: 1 } } });
  expect(await readdir(join(root, "private/qloo-probes/p04/attempts"))).toEqual([]);
  for (const arg of ["--execute-p01", "--execute-p02", "--execute-p03", "--execute-p05", "--force"]) {
    const denied = run([arg]); expect(denied.status).toBe(2); expect(denied.stdout + denied.stderr).not.toContain(key);
  }
  expect(preview.stdout + preview.stderr + preflight.stdout + preflight.stderr).not.toContain(key);
  expect(await readFile(join(root, ".env.local"), "utf8")).toContain(key);
}, 20_000);
