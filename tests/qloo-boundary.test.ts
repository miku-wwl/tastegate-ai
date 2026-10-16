import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QlooBoundaryError, classifyHttp, type BoundaryLog } from "../src/qloo/boundary-error";
import { HACKATHON_ORIGIN, QlooServerConfig } from "../src/qloo/server-config";
import { createDisabledLiveAdapter } from "../src/qloo/live-adapter";
import { createOfflineTransportBoundary, type LocalTestTransport, type OfflineHttpRequest } from "../src/qloo/offline-transport";
import { runAudit } from "../src/audit/workflow";
import { getScenario } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";
import { AuditReportSchema } from "../src/domain/report-schema";
import { POST } from "../app/api/audit/route";

const credential = "local-test-only-not-a-provider-key";
const config = (overrides: Record<string, string> = {}) => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: credential, ...overrides });
const tags = { operation: "tags", query: "jazz" };
const json = (body: unknown = { deliberately_unverified: true }) => Response.json(body);
const local = (send: LocalTestTransport["send"] = async () => json()): LocalTestTransport => ({ kind: "local-test-double", send });
beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite")); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("server configuration and disabled live adapter", () => {
  it("defaults to fixture mode and never loads a supplied credential in that mode", () => {
    const value = QlooServerConfig.load({ QLOO_API_KEY: credential });
    expect(value.mode).toBe("fixture"); expect(value.baseUrl).toBe(HACKATHON_ORIGIN);
    expect(() => value.credentialHeaders()).toThrow("AUTH_REQUIRED");
    expect(JSON.stringify(value)).not.toContain(credential);
  });
  it.each([undefined, "", "   "])("fails closed with missing key %j", (key) => {
    expect(() => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: key })).toThrow("AUTH_REQUIRED");
  });
  it.each(["https://api.qloo.com", "https://staging.api.qloo.com", "http://hackathon.api.qloo.com", "https://hackathon.api.qloo.com.evil.test", "https://hackathon.api.qloo.com/v2", "https://hackathon.api.qloo.com/", "https://user:password@hackathon.api.qloo.com", "https://hackathon.api.qloo.com:443"])("rejects non-allowlisted origin %s", (url) => {
    expect(() => config({ QLOO_BASE_URL: url })).toThrow("INVALID_BASE_URL");
  });
  it.each(["0", "4001", "NaN", "5.5", " 5", "true"])("rejects invalid request timeout %s", (timeout) => {
    expect(() => config({ QLOO_REQUEST_TIMEOUT_MS: timeout })).toThrow("INVALID_CONFIG");
  });
  it("does not expose credentials through config serialization or error text", () => {
    const value = config();
    expect(JSON.stringify(value)).not.toContain(credential);
    expect(Object.values(value)).not.toContain(credential);
    expect(value.credentialHeaders()).toEqual({ "X-Api-Key": credential });
    try { config({ QLOO_API_KEY: credential + "\r\nInjected: header" }); throw new Error("expected rejection"); }
    catch (error) { expect(String(error)).toContain("INVALID_CONFIG"); expect(String(error)).not.toContain(credential); }
  });
  it("loads only server environment values and keeps credentials in private state", () => {
    vi.stubEnv("QLOO_MODE", "live"); vi.stubEnv("QLOO_API_KEY", credential);
    vi.stubEnv("QLOO_BASE_URL", HACKATHON_ORIGIN); vi.stubEnv("QLOO_REQUEST_TIMEOUT_MS", "1000");
    const loaded = QlooServerConfig.load();
    expect(loaded.requestTimeoutMs).toBe(1000); expect(loaded.credentialHeaders()["X-Api-Key"]).toBe(credential);
    expect(JSON.stringify(loaded)).not.toContain(credential);
  });
  it("refuses browser-side configuration and unknown host modes", () => {
    expect(() => config({ QLOO_MODE: "anything" })).toThrow("INVALID_CONFIG");
    vi.stubGlobal("window", {}); expect(() => config()).toThrow("SERVER_ONLY");
  });
  it("has no environment flag that enables live calls, even with credentials", async () => {
    const adapter = createDisabledLiveAdapter(config({ QLOO_LIVE_VERIFIED: "true" }));
    const s = getScenario("valid-only");
    await expect(runAudit(s.input, adapter)).rejects.toThrow("Live Qloo execution is blocked");
    const context = { runId: "local-test", callId: "local-test", signal: new AbortController().signal };
    await expect(adapter.searchTags("jazz", context)).rejects.toThrow("LIVE_NOT_VERIFIED");
    await expect(adapter.searchEntity({ query: "public artist", requested_kind: "artist" }, context)).rejects.toThrow("LIVE_NOT_VERIFIED");
    await expect(adapter.rankPlaces({ candidate_entity_ids: [], preference_entity_ids: [], preference_tag_ids: [] }, context)).rejects.toThrow("LIVE_NOT_VERIFIED");
    await expect(adapter.discoverPlaces({ exclude_entity_ids: [], preference_entity_ids: [], preference_tag_ids: [] }, context)).rejects.toThrow("LIVE_NOT_VERIFIED");
    expect(() => createDisabledLiveAdapter(QlooServerConfig.load({}))).toThrow("MODE_MISMATCH");
  });
});

describe("local transport isolation, request limits and unverified JSON", () => {
  it("serializes documented lookup requests with a fixed origin, header, GET and no redirects", async () => {
    const requests: OfflineHttpRequest[] = [];
    const session = createOfflineTransportBoundary(config(), local(async (r) => { requests.push(r); return json(); })).createSession();
    const result = await session.request({ operation: "search", query: "public artist & film", entityType: "artist" });
    await session.request(tags);
    const search = new URL(requests[0]!.url); const tag = new URL(requests[1]!.url);
    expect(search.origin).toBe(HACKATHON_ORIGIN); expect(search.pathname).toBe("/search");
    expect(Object.fromEntries(search.searchParams)).toEqual({ query: "public artist & film", types: "urn:entity:artist", take: "5", page: "1" });
    expect(tag.pathname).toBe("/v2/tags"); expect(Object.fromEntries(tag.searchParams)).toEqual({ "filter.query": "jazz", take: "5", page: "1" });
    expect(requests[0]).toMatchObject({ method: "GET", redirect: "error", cache: "no-store", headers: { "X-Api-Key": credential } });
    expect(search.search).not.toContain(credential); expect(session.usage()).toEqual({ dispatches: 2, maxCalls: 14, automaticRetries: 0 });
    expect(result).toMatchObject({ status: "UNVERIFIED_RESPONSE", source_mode: "offline_test" });
  });
  it("requires an explicit local double and never defaults to fetch", () => {
    expect(() => createOfflineTransportBoundary(config(), { kind: "live" } as unknown as LocalTestTransport)).toThrow("LIVE_NOT_VERIFIED");
  });
  it("rejects arbitrary authority fields and unsupported request profiles before counting", async () => {
    const send = vi.fn(async () => json()); const session = createOfflineTransportBoundary(config(), local(send)).createSession();
    for (const request of [{ ...tags, url: "https://evil.test" }, { ...tags, api_key: credential }, { ...tags, maxCalls: 99 }, { operation: "insights", entityIds: ["synthetic:forged"] }, { operation: "search", query: "a", entityType: "music" }])
      await expect(session.request(request)).rejects.toThrow("INVALID_REQUEST");
    expect(send).not.toHaveBeenCalled(); expect(session.usage().dispatches).toBe(0);
  });
  it("fixture config cannot dispatch, even through a test transport", async () => {
    const send = vi.fn(async () => json()); const s = createOfflineTransportBoundary(QlooServerConfig.load({}), local(send)).createSession();
    await expect(s.request(tags)).rejects.toThrow("AUTH_REQUIRED"); expect(send).not.toHaveBeenCalled();
  });
  it.each([null, [], 42, { success: true }, { source_mode: "fixture", results: [] }])("keeps syntactically valid unexpected JSON unverified: %j", async (body) => {
    const result = await createOfflineTransportBoundary(config(), local(async () => json(body))).createSession().request(tags);
    expect(result.status).toBe("UNVERIFIED_RESPONSE"); expect(result.raw).toEqual(body);
    expect(AuditReportSchema.safeParse(result).success).toBe(false);
  });
  it.each(["malformed", "html", "invalid-utf8", "oversized"])("rejects %s response without trusting an empty-success default", async (kind) => {
    const response = kind === "html" ? new Response("<h1>bad</h1>", { headers: { "content-type": "text/html" } }) :
      new Response(kind === "malformed" ? "{" : kind === "invalid-utf8" ? new Uint8Array([0xff]) : '"' + "x".repeat(65_536) + '"', { headers: { "content-type": "application/json" } });
    const session = createOfflineTransportBoundary(config(), local(async () => response)).createSession();
    await expect(session.request(tags)).rejects.toThrow(kind === "oversized" ? "RESPONSE_TOO_LARGE" : "SCHEMA_MISMATCH");
    expect(session.usage().dispatches).toBe(1);
  });
});

describe("failures, budgets, deadlines and concurrency", () => {
  it.each([[401, "AUTH_INVALID"], [403, "FORBIDDEN"], [429, "RATE_LIMITED"], [500, "UPSTREAM_ERROR"], [503, "UPSTREAM_ERROR"], [302, "HTTP_ERROR"], [404, "HTTP_ERROR"], [400, "HTTP_ERROR"]] as const)("classifies HTTP %i as %s and never retries", async (status, code) => {
    const events: BoundaryLog[] = []; const send = vi.fn(async () => new Response(credential, { status, headers: { "Retry-After": "1", "X-Secret": credential } }));
    const session = createOfflineTransportBoundary(config(), local(send), (e) => events.push(e)).createSession();
    await expect(session.request(tags)).rejects.toMatchObject({ code }); expect(send).toHaveBeenCalledTimes(1);
    expect(classifyHttp(status)).toBe(code); expect(events).toEqual([{ event: "qloo_offline_boundary", attempt: 1, outcome: code, http_status: status }]);
    expect(JSON.stringify(events)).not.toContain(credential);
  });
  it("sanitizes transport exception messages and does not let a broken logger retry", async () => {
    const events: BoundaryLog[] = []; const send = vi.fn(async (): Promise<Response> => { throw new Error(credential); });
    const session = createOfflineTransportBoundary(config(), local(send), (event) => { events.push(event); throw new Error(credential); }).createSession();
    await expect(session.request(tags)).rejects.toMatchObject({ message: "NETWORK_ERROR", code: "NETWORK_ERROR" });
    expect(JSON.stringify(events)).not.toContain(credential); expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not let an injected error code smuggle a secret into logs", async () => {
    const events: BoundaryLog[] = [];
    const session = createOfflineTransportBoundary(config(), local(async () => {
      throw new QlooBoundaryError(credential as QlooBoundaryError["code"]);
    }), (event) => events.push(event)).createSession();
    await expect(session.request(tags)).rejects.toThrow("NETWORK_ERROR");
    expect(JSON.stringify(events)).not.toContain(credential);
  });
  it("counts failures against the shared 14-dispatch audit budget", async () => {
    const send = vi.fn(async () => json()); const session = createOfflineTransportBoundary(config(), local(send)).createSession();
    for (let i = 0; i < 13; i++) await session.request(tags);
    send.mockImplementationOnce(async () => new Response("", { status: 429 }));
    await expect(session.request(tags)).rejects.toThrow("RATE_LIMITED");
    await expect(session.request(tags)).rejects.toThrow("CALL_BUDGET_EXHAUSTED");
    expect(send).toHaveBeenCalledTimes(14); expect(session.usage().dispatches).toBe(14);
  });
  it("rejects raised, invalid or unknown host policy and permits zero dispatch", async () => {
    const client = createOfflineTransportBoundary(config(), local());
    for (const policy of [{ maxCalls: 15 }, { maxCalls: NaN }, { timeoutMs: 60_001 }, { retries: 1 }])
      expect(() => client.createSession(policy)).toThrow("INVALID_CONFIG");
    await expect(client.createSession({ maxCalls: 0 }).request(tags)).rejects.toThrow("CALL_BUDGET_EXHAUSTED");
  });
  it("allows only one in-flight request across sessions of the same client", async () => {
    let resolve!: (r: Response) => void;
    const send = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    const client = createOfflineTransportBoundary(config(), local(send)); const first = client.createSession(); const second = client.createSession();
    const pending = first.request(tags); await Promise.resolve();
    await expect(second.request(tags)).rejects.toThrow("CONCURRENCY_LIMIT"); expect(second.usage().dispatches).toBe(0);
    resolve(json()); await pending;
    send.mockImplementation(async () => json()); await second.request(tags); expect(send).toHaveBeenCalledTimes(2);
  });
  it("times out, aborts and holds the concurrency lease until an ignoring transport settles", async () => {
    let resolve!: (r: Response) => void; let signal: AbortSignal | undefined;
    const client = createOfflineTransportBoundary(config({ QLOO_REQUEST_TIMEOUT_MS: "5" }), local(async (request) => {
      signal = request.signal; return new Promise<Response>((r) => { resolve = r; });
    }));
    const session = client.createSession();
    await expect(session.request(tags)).rejects.toThrow("TIMEOUT"); expect(signal?.aborted).toBe(true);
    await expect(session.request(tags)).rejects.toThrow("SESSION_CLOSED");
    await expect(client.createSession().request(tags)).rejects.toThrow("CONCURRENCY_LIMIT");
    resolve(json()); await new Promise((r) => setTimeout(r, 5)); expect(session.usage().dispatches).toBe(1);
  });
  it("shortens request timeout by the total deadline, including response-body reading", async () => {
    let aborted = false;
    const session = createOfflineTransportBoundary(config(), local(async (r) => {
      r.signal.addEventListener("abort", () => { aborted = true; });
      return new Response(new ReadableStream({ start() { /* Deliberately stalled body. */ } }), { headers: { "content-type": "application/json" } });
    })).createSession({ timeoutMs: 5 });
    await expect(session.request(tags)).rejects.toThrow("TIMEOUT"); expect(aborted).toBe(true); expect(session.usage().dispatches).toBe(1);
  });
  it("cancels before dispatch or while waiting and does not retry", async () => {
    const parent = new AbortController(); parent.abort(); const send = vi.fn(async () => json());
    const client = createOfflineTransportBoundary(config(), local(send)); const session = client.createSession();
    await expect(session.request(tags, parent.signal)).rejects.toThrow("CANCELLED"); expect(send).not.toHaveBeenCalled();
    const controller = new AbortController();
    send.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 15)); return json(); });
    const pending = session.request(tags, controller.signal); await Promise.resolve(); controller.abort();
    await expect(pending).rejects.toThrow("CANCELLED"); expect(send).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 20)); await expect(session.request(tags)).rejects.toThrow("SESSION_CLOSED");
  });
});

describe("existing workflow remains fixture-only", () => {
  it("ignores live environment selection at the HTTP route and never relabels fixture evidence", async () => {
    vi.stubEnv("QLOO_MODE", "live"); vi.stubEnv("QLOO_API_KEY", credential);
    const response = await POST(new Request("http://127.0.0.1/api/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario: "valid-only" }) }));
    const report = AuditReportSchema.parse(await response.json());
    expect(report.source_mode).toBe("fixture"); expect(report.evidence.every((e) => e.provider === "synthetic" && e.source_mode === "fixture")).toBe(true);
    expect(report.usage.qloo_dispatches).toBe(0); expect(JSON.stringify(report)).not.toContain(credential);
    const s = getScenario("valid-only"); const second = await runAudit(s.input, createFixtureAdapter(s.world));
    Object.assign(second.evidence[0]!, { source_mode: "live" }); expect(AuditReportSchema.safeParse(second).success).toBe(false);
  });
});
