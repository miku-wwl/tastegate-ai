import https from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QlooServerConfig } from "../src/qloo/server-config";
import { blockedP01, P01_PROFILE, P01CheckpointSchema, P01SummarySchema, validP01Checkpoint } from "../src/qloo/p01-profile";
import { createLocalP01Runner, executeLiveP01, type LocalProbeTransport, type ProbeStore, type ProbeRequest } from "../src/qloo/p01-runner";
import { createPrivateP01Store, inspectPrivateP01Ledger, liveP01FromPrivateCheckpoint } from "../src/qloo/p01-private-store";
import { AuditReportSchema } from "../src/domain/report-schema";

const credential = "test-only-probe-credential-never-issued";
let testBootstrapArgs: string[];
function checkpoint() {
  const now = Date.now();
  return P01CheckpointSchema.parse({ revision: "tastegate.p01.checkpoint.v2", profile_revision: P01_PROFILE.revision,
    attempt_id: randomUUID(), previous_attempt_id: null, prior_reserved_attempts: 0, prior_attempts_reviewed: true,
    credential_exposure_risk_acknowledged: true, credential_basis: "ORIGINALLY_ISSUED_EVENT_KEY", unknown_entitlements_acknowledged: true,
    host_and_header_reviewed: true, request_shape_reviewed: true,
    usage_rights_confirmed: true, private_capture_permitted: true, private_directory_access_reviewed: true,
    quota: { remaining_calls: "UNKNOWN", rate_limit_per_minute: "UNKNOWN", concurrency_limit: "UNKNOWN", key_expires_at: "UNKNOWN" },
    approval: "APPROVE_P01_ONLY", max_dispatches: 1, approved_at: new Date(now).toISOString(), approval_expires_at: new Date(now + 60_000).toISOString() });
}
const config = (timeout = "4000") => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: credential, QLOO_REQUEST_TIMEOUT_MS: timeout });
function memoryStore() {
  return { reserve: vi.fn(async () => {}), saveRaw: vi.fn(async (_bytes: Uint8Array) => {}), saveSummary: vi.fn(async (_summary: unknown) => {}) } satisfies ProbeStore;
}
function local(send: LocalProbeTransport["send"] = async () => Response.json({ authored_test_body: true }), timeout = "4000", store: ProbeStore = memoryStore()) {
  const request = vi.fn(send);
  return { runner: createLocalP01Runner(config(timeout), { kind: "local-test-double", send: request }, store), request, store };
}
beforeEach(() => {
  // Unit doubles do not execute Vitest's trusted --require bootstrap as a live CLI.
  testBootstrapArgs = process.execArgv; process.execArgv = [];
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External network forbidden"));
  vi.spyOn(https, "request").mockImplementation(() => { throw new Error("External network forbidden"); });
});
afterEach(() => {
  process.execArgv = testBootstrapArgs;
  expect(globalThis.fetch).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

describe("P01 explicit checkpoint and exact public-cultural profile", () => {
  it("does not execute by default even with a configured credential", async () => {
    const t = local(); expect(await t.runner.run()).toEqual(blockedP01());
    expect(t.request).not.toHaveBeenCalled(); expect(t.store.reserve).not.toHaveBeenCalled();
  });
  it.each(["credential_exposure_risk_acknowledged", "unknown_entitlements_acknowledged", "prior_attempts_reviewed", "host_and_header_reviewed", "request_shape_reviewed", "usage_rights_confirmed", "private_capture_permitted", "private_directory_access_reviewed"])("blocks unacknowledged prerequisite %s", async (field) => {
    const t = local(); const c = { ...checkpoint(), [field]: false };
    expect((await t.runner.run({ checkpoint: c })).status).toBe("BLOCKED"); expect(t.request).not.toHaveBeenCalled();
  });
  it.each([undefined, {}, { approval: "APPROVE_P01_ONLY" }, { QLOO_LIVE_VERIFIED: true }, { credential_status: "exposed" }])("a partial checkpoint/flag cannot enable dispatch", async (c) => {
    const t = local(); expect((await t.runner.run({ checkpoint: c })).dispatches).toBe(0); expect(t.request).not.toHaveBeenCalled();
  });
  it("accepts explicit UNKNOWN entitlements, rejects invented/invalid values and requires fresh bounded approval", async () => {
    const now = Date.now();
    for (const c of [
      { ...checkpoint(), quota: { ...checkpoint().quota, remaining_calls: 0 } },
      { ...checkpoint(), quota: { ...checkpoint().quota, rate_limit_per_minute: "unlimited" } },
      { ...checkpoint(), quota: { ...checkpoint().quota, key_expires_at: new Date(now - 1000).toISOString() } },
      { ...checkpoint(), approval_expires_at: new Date(now - 1000).toISOString() },
      { ...checkpoint(), approved_at: new Date(now + 10000).toISOString() },
      { ...checkpoint(), approval_expires_at: new Date(now + 16 * 60_000).toISOString() },
      { ...checkpoint(), max_dispatches: 8 }, { ...checkpoint(), approval: "APPROVE_ALL" }, { ...checkpoint(), api_key: credential },
      { ...checkpoint(), revision: "tastegate.p01.checkpoint.v1" }, { ...checkpoint(), exposed_key_revoked: true },
      { ...checkpoint(), prior_reserved_attempts: 1 }, { ...checkpoint(), attempt_id: "arbitrary-path" },
    ]) expect(validP01Checkpoint(c)).toBe(false);
    expect(validP01Checkpoint(checkpoint())).toBe(true);
    expect(checkpoint()).not.toHaveProperty("exposed_key_revoked");
    expect(validP01Checkpoint({ ...checkpoint(), quota: { remaining_calls: 1, rate_limit_per_minute: 1, concurrency_limit: 1,
      key_expires_at: new Date(now + 60_000).toISOString() } })).toBe(true);
  });
  it.each([
    { origin: "https://api.qloo.com" }, { origin: "https://hackathon.api.qloo.com.evil.test" },
    { path: "/v2/insights" }, { path: "/v2/tags" }, { method: "POST" },
    { params: { ...P01_PROFILE.params, api_key: credential } },
    { params: { ...P01_PROFILE.params, query: "a-person@example.test" } },
    { params: { ...P01_PROFILE.params, take: "100" } }, { headers: { "X-Api-Key": credential } },
  ])("rejects unauthorized host, endpoint, query or personal-data input", async (change) => {
    const t = local(); const result = await t.runner.run({ checkpoint: checkpoint(), profile: { ...P01_PROFILE, ...change } });
    expect(result.reason).toBe("INVALID_PROFILE"); expect(result.dispatches).toBe(0); expect(t.request).not.toHaveBeenCalled();
  });
  it("rejects unknown runner options and any transport pretending to be live", async () => {
    const t = local();
    expect((await t.runner.run({ checkpoint: checkpoint(), mode: "live" } as never)).reason).toBe("INVALID_PROFILE");
    expect(() => createLocalP01Runner(config(), { kind: "live" } as unknown as LocalProbeTransport, memoryStore())).toThrow("LOCAL_TEST_DOUBLE_REQUIRED");
  });
  it("does not load server credentials before a valid checkpoint", async () => {
    const load = vi.spyOn(QlooServerConfig, "load");
    vi.stubEnv("QLOO_API_KEY", credential);
    expect((await executeLiveP01({ checkpoint: { ...checkpoint(), credential_exposure_risk_acknowledged: false } }, memoryStore())).status).toBe("BLOCKED");
    expect(load).not.toHaveBeenCalled();
  });
  it("fails closed when the private server key is absent or only NEXT_PUBLIC exists", async () => {
    vi.stubEnv("QLOO_MODE", "live"); vi.stubEnv("QLOO_API_KEY", ""); vi.stubEnv("QLOO_BASE_URL", P01_PROFILE.origin);
    const store = memoryStore();
    expect((await executeLiveP01({ checkpoint: checkpoint() }, store)).reason).toBe("CONFIG_BLOCKED");
    expect(store.reserve).not.toHaveBeenCalled();
    expect(() => QlooServerConfig.load({ QLOO_MODE: "live", NEXT_PUBLIC_QLOO_API_KEY: credential })).toThrow("INVALID_CONFIG");
  });
  it.each([["NODE_DEBUG", "http"], ["NODE_DEBUG_NATIVE", "tls"], ["SSLKEYLOGFILE", "private-debug.log"], ["NODE_TLS_REJECT_UNAUTHORIZED", "0"], ["NODE_OPTIONS", "--tls-keylog=private-debug.log"]])("blocks unsafe diagnostics %s before loading credentials", async (name, value) => {
    vi.stubEnv(name, value); const load = vi.spyOn(QlooServerConfig, "load");
    expect((await executeLiveP01({ checkpoint: checkpoint() }, memoryStore())).reason).toBe("UNSAFE_DIAGNOSTICS");
    expect(load).not.toHaveBeenCalled();
  });
});

describe("single-dispatch transport, unverified JSON and safe evidence", () => {
  it("uses exactly the reviewed GET and never treats 200 as semantic PASS", async () => {
    const t = local(); const result = await t.runner.run({ checkpoint: checkpoint() });
    expect(t.request).toHaveBeenCalledTimes(1);
    const request: ProbeRequest = t.request.mock.calls[0]![0]; const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe(P01_PROFILE.origin + "/search");
    expect(Object.fromEntries(url.searchParams)).toEqual(P01_PROFILE.params);
    expect(request).toMatchObject({ method: "GET", redirect: "error", headers: { "X-Api-Key": credential, Accept: "application/json" } });
    expect(result).toMatchObject({ source_mode: "offline_test", status: "UNKNOWN", reason: "SCHEMA_REVIEW_REQUIRED", dispatches: 1, automatic_retries: 0, raw_saved_privately: true });
    expect(JSON.stringify(result)).not.toContain(credential); expect(AuditReportSchema.safeParse(result).success).toBe(false);
    expect(P01SummarySchema.safeParse({ ...result, status: "PASS" }).success).toBe(false);
    expect((await t.runner.run({ checkpoint: checkpoint() })).reason).toBe("CALL_BUDGET_EXHAUSTED"); expect(t.request).toHaveBeenCalledTimes(1);
  });
  it.each([null, 42, [], { success: true }, { source_mode: "fixture", results: [] }])("preserves unexpected valid JSON as unknown without a mapper", async (raw) => {
    const t = local(async () => Response.json(raw)); const result = await t.runner.run({ checkpoint: checkpoint() });
    expect(result.status).toBe("UNKNOWN"); expect(result.source_mode).toBe("offline_test"); expect(result).not.toHaveProperty("raw");
  });
  it.each([[401, "AUTH_INVALID", "FAIL"], [403, "FORBIDDEN", "FAIL"], [429, "RATE_LIMITED", "UNKNOWN"], [500, "UPSTREAM_ERROR", "UNKNOWN"], [503, "UPSTREAM_ERROR", "UNKNOWN"], [302, "REDIRECT_REJECTED", "FAIL"], [307, "REDIRECT_REJECTED", "FAIL"], [404, "HTTP_ERROR", "FAIL"]])("stops HTTP %i with no retry or redirect follow", async (status, reason, outcome) => {
    const t = local(async () => new Response(credential, { status: Number(status), headers: { Location: "https://evil.test", "X-Api-Key": credential } }));
    const result = await t.runner.run({ checkpoint: checkpoint() });
    expect(result).toMatchObject({ status: outcome, reason, dispatches: 1, http_status: status, raw_saved_privately: false });
    expect(t.request).toHaveBeenCalledTimes(1); expect(t.store.saveRaw).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain(credential);
    expect((await t.runner.run({ checkpoint: checkpoint() })).dispatches).toBe(0);
  });
  it.each(["malformed", "wrong-media", "invalid-utf8", "oversized"])("stops %s without a fabricated success", async (kind) => {
    const body = kind === "malformed" ? "{" : kind === "invalid-utf8" ? new Uint8Array([255]) : kind === "oversized" ? "x".repeat(65_537) : "{}";
    const t = local(async () => new Response(body, { headers: { "content-type": kind === "wrong-media" ? "text/html" : "application/json" } }));
    const result = await t.runner.run({ checkpoint: checkpoint() });
    expect(result.reason).toBe(kind === "oversized" ? "RESPONSE_TOO_LARGE" : "SCHEMA_MISMATCH"); expect(result.status).toBe("UNKNOWN");
    expect(t.store.saveRaw).not.toHaveBeenCalled();
  });
  it.each(["plain", "unicode-json", "base64"])("discards reflected credential %s before any evidence write", async (encoding) => {
    const body = encoding === "unicode-json" ? '{"echo":"' + [...credential].map((c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4,"0")).join("") + '"}' : JSON.stringify({ echo: encoding === "base64" ? Buffer.from(credential).toString("base64") : credential });
    const t = local(async () => new Response(body, { headers: { "content-type": "application/json" } }));
    const result = await t.runner.run({ checkpoint: checkpoint() });
    expect(result.reason).toBe("CREDENTIAL_REFLECTION"); expect(t.store.saveRaw).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(t.store.saveSummary).mock.calls)).not.toContain(credential);
  });
  it("sanitizes exceptions and evidence-write failures without retrying", async () => {
    const t = local(async () => { throw new Error(credential); }); const result = await t.runner.run({ checkpoint: checkpoint() });
    expect(result.reason).toBe("NETWORK_ERROR"); expect(JSON.stringify(result)).not.toContain(credential); expect(t.request).toHaveBeenCalledTimes(1);
    const s = memoryStore(); s.saveRaw.mockRejectedValue(new Error(credential));
    const next = local(undefined, "4000", s); const failed = await next.runner.run({ checkpoint: checkpoint() });
    expect(failed.reason).toBe("EVIDENCE_UNAVAILABLE"); expect(failed.dispatches).toBe(1); expect(failed.raw_saved_privately).toBe(false);
    expect(JSON.stringify(failed)).not.toContain(credential);
  });
  it("holds one in-flight slot during reservation and dispatch", async () => {
    let release!: () => void; const store = memoryStore(); store.reserve.mockImplementation(() => new Promise<void>((r) => { release = r; }));
    const t = local(undefined, "4000", store); const pending = t.runner.run({ checkpoint: checkpoint() });
    const rejected = await t.runner.run({ checkpoint: checkpoint() });
    expect(rejected.reason).toBe("CONCURRENCY_LIMIT"); expect(t.request).not.toHaveBeenCalled(); release(); await pending;
    expect(t.request).toHaveBeenCalledTimes(1);
  });
  it("aborts a timeout, discards late bodies and cannot issue a second call", async () => {
    let finish!: (value: Response) => void; let aborted = false;
    const t = local(async (request) => { request.signal.addEventListener("abort", () => { aborted = true; }); return new Promise<Response>((r) => { finish = r; }); }, "5");
    const result = await t.runner.run({ checkpoint: checkpoint() }); expect(result.reason).toBe("TIMEOUT"); expect(aborted).toBe(true);
    expect((await t.runner.run({ checkpoint: checkpoint() })).reason).toBe("CONCURRENCY_LIMIT");
    finish(Response.json({ authored_late_body: true })); await new Promise((r) => setTimeout(r, 5));
    expect(t.store.saveRaw).not.toHaveBeenCalled(); expect((await t.runner.run({ checkpoint: checkpoint() })).reason).toBe("CALL_BUDGET_EXHAUSTED");
  });
  it("bounds response-body stalls and propagates cancellation", async () => {
    const stalled = local(async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } }), "5");
    expect((await stalled.runner.run({ checkpoint: checkpoint() })).reason).toBe("TIMEOUT");
    const controller = new AbortController(); controller.abort(); const pre = local();
    expect((await pre.runner.run({ checkpoint: checkpoint(), signal: controller.signal })).dispatches).toBe(0); expect(pre.request).not.toHaveBeenCalled();
    const abort = new AbortController(); const during = local(async (request) => new Promise<Response>((_r, reject) => { request.signal.addEventListener("abort", () => reject(new Error("abort"))); }));
    const pending = during.runner.run({ checkpoint: checkpoint(), signal: abort.signal });
    await vi.waitFor(() => expect(during.request).toHaveBeenCalledTimes(1)); abort.abort();
    expect((await pending).reason).toBe("CANCELLED"); expect(during.store.saveRaw).not.toHaveBeenCalled();
  });
  it("retains the in-flight slot when cancellation of an error body has not settled", async () => {
    let finish!: () => void;
    const t = local(async () => new Response(new ReadableStream({ cancel() { return new Promise<void>((r) => { finish = r; }); } }), { status: 401 }), "5");
    const result = await t.runner.run({ checkpoint: checkpoint() });
    expect(result).toMatchObject({ reason: "TIMEOUT", http_status: 401, transport_settled: false, response_bytes: null });
    expect((await t.runner.run({ checkpoint: checkpoint() })).reason).toBe("CONCURRENCY_LIMIT");
    finish(); await new Promise((r) => setTimeout(r, 5));
    expect((await t.runner.run({ checkpoint: checkpoint() })).reason).toBe("CALL_BUDGET_EXHAUSTED");
  });
});

describe("private storage and safe default CLI", () => {
  async function temp() { await mkdir(".artifacts", { recursive: true }); return mkdtemp(resolve(".artifacts/p01-store-test-")); }
  it("retains each exclusive approved attempt across store instances, with no authentication header", async () => {
    const root = await temp(); const c = checkpoint(); const first = createPrivateP01Store(root, c); await first.reserve();
    await expect(createPrivateP01Store(root, c).reserve()).rejects.toThrow();
    const text = await readFile(join(root,`private/qloo-probes/p01/attempts/${c.attempt_id}/attempt.json`),"utf8");
    expect(text).not.toContain("X-Api-Key"); expect(text).not.toContain(credential);
    await first.saveRaw(Buffer.from('{"synthetic_storage_test_only":true}'));
    await first.saveSummary({ ...blockedP01(), attempt_id: c.attempt_id, elapsed_ms: 1, source_mode: "offline_test", status: "UNKNOWN", dispatches: 1, reason: "SCHEMA_REVIEW_REQUIRED", raw_saved_privately: true });
    await expect(first.saveRaw(Buffer.from("{}"))).rejects.toThrow();
    await expect(createPrivateP01Store(root, c).reserve()).rejects.toThrow();
    expect(await inspectPrivateP01Ledger(root)).toMatchObject({ reserved_attempts: 1, recorded_dispatches: 1, unresolved_attempts: 0 });
  });
  it("allows a fresh separately approved ID after a recorded failure while preserving prior accounting", async () => {
    const root = await temp(); const first = checkpoint(); const store = createPrivateP01Store(root, first);
    const t = local(async () => new Response(null, { status: 401 }), "4000", store);
    expect((await t.runner.run({ checkpoint: first })).reason).toBe("AUTH_INVALID");
    await expect(createPrivateP01Store(root, checkpoint()).reserve()).rejects.toThrow();
    const next = { ...checkpoint(), previous_attempt_id: first.attempt_id, prior_reserved_attempts: 1 };
    const second = createPrivateP01Store(root, next); await second.reserve();
    await second.saveSummary(blockedP01("CANCELLED", next.attempt_id));
    const count = await inspectPrivateP01Ledger(root);
    expect(count).toMatchObject({ reserved_attempts: 2, recorded_dispatches: 1, conservative_dispatch_upper_bound: 1, last_attempt_id: next.attempt_id });
    expect(await readFile(join(root, `private/qloo-probes/p01/attempts/${first.attempt_id}/summary.json`), "utf8")).toContain("AUTH_INVALID");
  });
  it("keeps incomplete or unsettled attempts locked and never offers a force/reset bypass", async () => {
    const root = await temp(); const c = checkpoint(); const store = createPrivateP01Store(root, c); await store.reserve();
    await expect(inspectPrivateP01Ledger(root)).rejects.toThrow();
    await store.saveSummary({ ...blockedP01(), attempt_id: c.attempt_id, elapsed_ms: 5, transport_settled: false,
      dispatches: 1, source_mode: "offline_test", status: "UNKNOWN", reason: "TIMEOUT" });
    await expect(createPrivateP01Store(root, { ...checkpoint(), previous_attempt_id: c.attempt_id, prior_reserved_attempts: 1 }).reserve()).rejects.toThrow();
    await expect(inspectPrivateP01Ledger(root)).rejects.toThrow();
    expect(await readFile(join(root, "private/qloo-probes/p01/active.lock"), "utf8")).toContain(c.attempt_id);
  });
  it("preserves a legacy fixed attempt and blocks automatic migration or deletion", async () => {
    const root = await temp(); await mkdir(join(root, "private/qloo-probes/p01"), { recursive: true });
    const path = join(root, "private/qloo-probes/p01/attempt.json"); await writeFile(path, '{"legacy_test_only":true}');
    await expect(createPrivateP01Store(root, checkpoint()).reserve()).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe('{"legacy_test_only":true}');
  });
  it("rejects a linked private directory and missing/oversized checkpoint files", async () => {
    const root = await temp(); const destination = await temp();
    await symlink(destination,join(root,"private"),process.platform === "win32" ? "junction" : "dir");
    await expect(createPrivateP01Store(root, checkpoint()).reserve()).rejects.toThrow();
    expect((await liveP01FromPrivateCheckpoint(root)).status).toBe("BLOCKED");
    const next = await temp(); expect((await liveP01FromPrivateCheckpoint(next)).status).toBe("BLOCKED");
    await mkdir(join(next,"private/qloo-probes"),{ recursive: true }); await writeFile(join(next,"private/qloo-probes/p01-checkpoint.json"),"x".repeat(8193));
    expect((await liveP01FromPrivateCheckpoint(next)).status).toBe("BLOCKED");
  });
  it("prints only a blocked preview without reading credentials or executing by default", () => {
    const env = { ...process.env, QLOO_API_KEY: credential, QLOO_MODE: "live" };
    const output = execFileSync(process.execPath,["scripts/qloo-probe.mjs"],{ encoding:"utf8", env });
    const result = JSON.parse(output); expect(result.profile).toEqual(P01_PROFILE); expect(result.summary).toEqual(blockedP01());
    expect(output).not.toContain(credential); expect(output).not.toContain("X-Api-Key");
  });
});
