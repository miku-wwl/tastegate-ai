import https from "node:https";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CUSTOM_SCENARIO_ID, CatalogSchema, LIVE_ACK, MAX_REQUEST_BYTES } from "../src/domain/catalog";
import type { Confirmation } from "../src/domain/contracts";
import { AuditReportSchema, ProviderAuditReportSchema } from "../src/domain/report-schema";
import { loadLiveGrant, readLiveBudget, revokeLiveGrant, startLiveRun, type LiveGrant } from "../src/qloo/live-grant";
import { approvedGrant } from "./helpers/live-grant";
import type { LiveSend } from "../src/qloo/live-transport";
import { providerRef } from "../src/qloo/provider-ref";
import { loadRecordedEvidence } from "../src/qloo/recorded-adapter";
import { QlooServerConfig } from "../src/qloo/server-config";
import { RECORDED_SCENARIO_ID } from "../src/scenarios/recorded-nyc";
import { createAuditService, type AuditServiceDeps } from "../src/server/audit-service";
import { KEY, world, type Seen } from "./helpers/live-world";
import { AUTHORED, seedRecordedRoot } from "./helpers/recorded-root";

const roots: string[] = [];
const ACK = LIVE_ACK;
const URL_ = "http://127.0.0.1/api/audit";
const liveConfig = () => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: KEY });
const noCredential = () => QlooServerConfig.load({});
const forbidden: LiveSend = async () => { throw new Error("A provider request must not be made here"); };
const select = (target_id: string, id: string, kind: "entity" | "tag" = "entity"): Confirmation => ({ target_id, decision: "select", ref: providerRef(kind, id) });
async function emptyRoot() { await mkdir(".artifacts", { recursive: true }); const root = await mkdtemp(resolve(".artifacts/svc-test-")); roots.push(root); await mkdir(join(root, "private"), { mode: 0o700 }); return root; }
async function seeded() { const root = await seedRecordedRoot(); roots.push(root); return root; }
const grant = approvedGrant;
function service(root: string, over: Partial<AuditServiceDeps> = {}) {
  return createAuditService({ projectRoot: root, recordings: () => loadRecordedEvidence(root), liveConfig: noCredential, send: forbidden, ...over });
}
function post(body: unknown, init: { headers?: Record<string, string>; raw?: BodyInit; contentType?: string } = {}) {
  return new Request(URL_, { method: "POST", headers: { "Content-Type": init.contentType ?? "application/json", ...init.headers }, body: init.raw ?? JSON.stringify(body) });
}
const CUSTOM = () => ({
  schema_revision: "tastegate.input.v0",
  preferences: [{ id: "pref-1", text: "Radiohead", kind: "artist", confirmed_anchor: "Radiohead" }],
  task: "Audit my evening plan", destination: "New York",
  constraints: [{ id: "c-city", kind: "city", value: "New York" }, { id: "c-country", kind: "country", value: "US" }, { id: "c-type", kind: "entity_type", value: "place" }, { id: "c-max", kind: "max_items", value: 3 }],
  recommendations: [
    { id: "rec-1", name: "Blue Note New York", address_hint: "131 W 3rd St", claims: [] },
    { id: "rec-2", name: "Some Uncovered Cafe", address_hint: null, claims: ["You will love it."] },
  ],
});
const json = async (response: Response) => await response.json() as Record<string, any>;
beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite")); vi.spyOn(https, "request").mockImplementation(() => { throw new Error("Network is forbidden in this suite"); }); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
afterAll(async () => { for (const r of roots) await rm(r, { recursive: true, force: true }); });
const untilSent = async (seen: Seen, count = 1) => {
  await vi.waitFor(() => expect(seen.length).toBe(count), { timeout: 2000, interval: 10 });
};

describe("catalog: public, validated, no-store", () => {
  it("publishes modes, authored inputs, public history and the exact recorded lookups, and nothing private", async () => {
    const root = await seeded(); const response = await service(root).catalog();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const catalog = CatalogSchema.parse(await response.json());
    expect(catalog.modes).toEqual({ synthetic: "AVAILABLE", recorded_live: "AVAILABLE", live: "LOCKED" });
    expect(catalog.scenarios.map((s) => s.mode)).toEqual(["recorded_live", ...Array(7).fill("fixture")]);
    expect(catalog.recorded_coverage).toEqual({ artist: ["Radiohead"], movie: ["In the Mood for Love"], place: ["Blue Note New York"], tag: ["jazz"] });
    expect(catalog.pending_request).toMatchObject({ id: "P06", state: "OWNER_APPROVAL_REQUIRED" });
    expect(catalog.live_gate).toMatchObject({ status: "LOCKED", reason: "CREDENTIAL_NOT_CONFIGURED", remaining_requests: null });
    expect(catalog.custom_input).toMatchObject({ max_preferences: 3, max_recommendations: 3, max_bytes: 16_384 });
    for (const h of catalog.recorded_history) expect(Object.keys(h).sort()).toEqual(expect.arrayContaining(["attempt_id", "endpoint", "http_status", "outcome", "probe", "recorded_at", "response_bytes"]));
    const text = JSON.stringify(catalog);
    for (const needle of ["qloo-ref:", "sha256", "entity_id", KEY, ...Object.values(AUTHORED)]) expect(text).not.toContain(needle);
  });
  it("degrades to UNAVAILABLE recorded mode with empty coverage when the private recordings are absent", async () => {
    const catalog = CatalogSchema.parse(await (await service(await emptyRoot()).catalog()).json());
    expect(catalog.modes).toMatchObject({ recorded_live: "UNAVAILABLE", synthetic: "AVAILABLE" }); expect(catalog.scenarios[0]).toMatchObject({ id: RECORDED_SCENARIO_ID, available: false });
    expect(catalog.recorded_history).toEqual([]); expect(catalog.recorded_coverage).toEqual({ artist: [], movie: [], place: [], tag: [] }); expect(catalog.pending_request).toBeNull();
  });
  it("reports the live gate truthfully at each step, never opens a session and never touches the ledger", async () => {
    const root = await emptyRoot(); const send = vi.fn(forbidden); const gate = async (over: Partial<AuditServiceDeps> = {}) => CatalogSchema.parse(await (await service(root, { send, ...over }).catalog()).json()).live_gate;
    expect(await gate({ liveConfig: noCredential })).toMatchObject({ status: "LOCKED", reason: "CREDENTIAL_NOT_CONFIGURED" });
    expect(await gate({ liveConfig: () => { throw new Error("bad"); } })).toMatchObject({ reason: "CREDENTIAL_NOT_CONFIGURED" });
    expect(await gate({ liveConfig: liveConfig })).toMatchObject({ status: "LOCKED", reason: "GRANT_MISSING" });
    await grant(root, { maxRequests: 5, maxRuns: 2 });
    const open = await gate({ liveConfig });
    expect(open).toMatchObject({ status: "AVAILABLE", reason: "READY", remaining_requests: 5, remaining_runs: 2 }); expect(Date.parse(open.expires_at!)).toBeGreaterThan(Date.now());
    const loaded = await loadLiveGrant(root) as { ok: true; grant: LiveGrant }; expect(await readLiveBudget(root, loaded.grant)).toEqual({ runs_used: 0, requests_reserved: 0 });
    expect(send).not.toHaveBeenCalled(); expect(JSON.stringify(open)).not.toContain(KEY);
    const run = await startLiveRun(root, loaded.grant); if (!("reserve" in run)) throw new Error("run"); await run.reserve("entity_lookup", { query_length: 1 });
    expect(await gate({ liveConfig })).toMatchObject({ status: "AVAILABLE", remaining_requests: 4, remaining_runs: 1 });
    for (let n = 0; n < 4; n++) await run.reserve("entity_lookup", { query_length: 1 });
    expect(await gate({ liveConfig })).toMatchObject({ status: "LOCKED", reason: "LIVE_BUDGET_EXHAUSTED", remaining_requests: null });
    await revokeLiveGrant(root); expect(await gate({ liveConfig })).toMatchObject({ status: "LOCKED", reason: "GRANT_REVOKED" });
  });
  it("shows an expired grant as locked", async () => {
    const root = await emptyRoot(); await grant(root, { now: Date.now() - 3 * 3600_000, minutes: 5 });
    expect(CatalogSchema.parse(await (await service(root, { liveConfig }).catalog()).json()).live_gate).toMatchObject({ status: "LOCKED", reason: "GRANT_EXPIRED" });
  });
  it("fails closed with a fixed error if the catalog it built is not valid", async () => {
    const root = await seeded(); const good = await loadRecordedEvidence(root);
    const drifted = { ...good, history: [{ ...good.history[0]!, outcome: "NOT_A_REVIEWED_OUTCOME" }] } as unknown as Awaited<ReturnType<typeof loadRecordedEvidence>>;
    const response = await service(root, { recordings: async () => drifted }).catalog();
    expect(response.status).toBe(500); expect(await json(response)).toEqual({ error: "CATALOG_UNAVAILABLE" });
  });
});

describe("request validation and bounds", () => {
  it("runs an authored synthetic scenario and returns a validated no-store report", async () => {
    const response = await service(await emptyRoot()).audit(post({ scenario: "wrong-city-repair" }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(AuditReportSchema.parse(await response.json())).toMatchObject({ source_mode: "fixture", final_status: "PASS" });
  });
  it.each<[string, unknown]>([
    ["empty object", {}], ["unknown scenario", { scenario: "unknown" }], ["scenario and input together", { scenario: "nyc-evening", input: CUSTOM() }],
    ["untrusted mode", { scenario: "nyc-evening", mode: "live" }], ["untrusted budget", { scenario: "nyc-evening", maxCalls: 1000 }], ["untrusted evidence", { scenario: "nyc-evening", evidence: [] }],
    ["fixture with recorded source", { scenario: "nyc-evening", source: "recorded" }], ["fixture with live source", { scenario: "nyc-evening", source: "live", live_ack: ACK }],
    ["fixture with an acknowledgement", { scenario: "nyc-evening", live_ack: ACK }], ["fixture with confirmations", { scenario: "nyc-evening", confirmations: [] }],
    ["recorded scenario forced to fixture", { scenario: RECORDED_SCENARIO_ID, source: "fixture" }], ["custom input forced to fixture", { input: CUSTOM(), source: "fixture" }],
    ["unknown source", { scenario: RECORDED_SCENARIO_ID, source: "bogus" }], ["recorded with an acknowledgement", { scenario: RECORDED_SCENARIO_ID, live_ack: ACK }],
    ["wrong acknowledgement string", { scenario: RECORDED_SCENARIO_ID, source: "live", live_ack: "yes" }], ["custom recorded with an acknowledgement", { input: CUSTOM(), live_ack: ACK }],
    ["insights policy supplied", { scenario: RECORDED_SCENARIO_ID, insights_policy: { signal_scope: "all_confirmed" } }],
    ["unknown confirmation target", { scenario: RECORDED_SCENARIO_ID, confirmations: [{ target_id: "unknown-slot", decision: "skip" }] }],
    ["raw provider ID as a reference", { scenario: RECORDED_SCENARIO_ID, confirmations: [{ target_id: "p1", decision: "select", ref: "raw-provider-id" }] }],
    ["duplicate decisions", { scenario: RECORDED_SCENARIO_ID, confirmations: [{ target_id: "p1", decision: "skip" }, { target_id: "p1", decision: "skip" }] }],
    ["array body", []], ["null body", null], ["string body", "text"],
  ])("rejects %s with a fixed 400", async (_, body) => {
    const send = vi.fn(forbidden); const response = await service(await emptyRoot(), { send, liveConfig }).audit(post(body));
    expect(response.status).toBe(400); expect(await json(response)).toEqual({ error: "INVALID_REQUEST" }); expect(send).not.toHaveBeenCalled();
  });
  it("bounds the body even without a Content-Length header, and stops reading at the limit", async () => {
    const svc = service(await emptyRoot());
    const over = await svc.audit(post({ scenario: "nyc-evening", padding: "x".repeat(MAX_REQUEST_BYTES + 100) }));
    expect(over.status).toBe(413); expect(await json(over)).toEqual({ error: "REQUEST_TOO_LARGE" });
    const chunk = new TextEncoder().encode("x".repeat(8192)); let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { pulled++; if (pulled > 100) controller.close(); else controller.enqueue(chunk); } });
    const streamed = await svc.audit(new Request(URL_, { method: "POST", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit));
    expect(streamed.status).toBe(413); expect(pulled).toBeLessThan(10); // it did not keep consuming an unbounded stream
  });
  it("rejects malformed JSON, invalid UTF-8 and the wrong content type", async () => {
    const svc = service(await emptyRoot());
    expect((await svc.audit(post(null, { raw: "{" }))).status).toBe(400);
    expect((await svc.audit(post(null, { raw: new Uint8Array([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x3a, 0x31, 0x7d]) }))).status).toBe(400);
    expect((await svc.audit(new Request(URL_, { method: "POST", body: "hello" }))).status).toBe(415);
    for (const contentType of ["application/jsonp", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) expect((await svc.audit(post({ scenario: "valid-only" }, { contentType }))).status).toBe(415);
    expect((await svc.audit(post({ scenario: "valid-only" }, { contentType: "Application/JSON; charset=utf-8" }))).status).toBe(200);
  });
});

describe("recorded evidence: authored scenario and custom input", () => {
  it("runs the recorded scenario from verified recordings only and never contacts Qloo", async () => {
    const root = await seeded(); const send = vi.fn(forbidden); const response = await service(root, { send, liveConfig }).audit(post({ scenario: RECORDED_SCENARIO_ID }));
    expect(response.status).toBe(200); const report = ProviderAuditReportSchema.parse(await response.json());
    expect(report).toMatchObject({ source_mode: "recorded_live", stop_reason: "NEEDS_INPUT", usage: { qloo_dispatches: 0, recorded_replays: 4 } }); expect(send).not.toHaveBeenCalled();
  });
  it("answers 503 with a fixed error and substitutes nothing when the curated recorded scenario's recordings are missing", async () => {
    const response = await service(await emptyRoot()).audit(post({ scenario: RECORDED_SCENARIO_ID }));
    expect(response.status).toBe(503); expect(await json(response)).toEqual({ error: "RECORDED_EVIDENCE_UNAVAILABLE" });
  });
  it("audits a custom plan with NO provider evidence when the server has no recordings: honest UNKNOWN, nothing replayed or requested", async () => {
    const send = vi.fn(forbidden); const response = await service(await emptyRoot(), { send, liveConfig }).audit(post({ input: CUSTOM() }));
    expect(response.status).toBe(200); const report = ProviderAuditReportSchema.parse(await response.json());
    expect(report).toMatchObject({ source_mode: "recorded_live", scenario_id: CUSTOM_SCENARIO_ID, final_status: "UNKNOWN", usage: { qloo_dispatches: 0, recorded_replays: 0 } });
    expect(report.original_audits.every((a) => a.resolution === "unresolved" && a.verdict === "UNKNOWN")).toBe(true);
    expect(report.evidence.filter((e) => e.provider === "qloo")).toEqual([]);
    expect(report.evidence.filter((e) => e.snapshot.kind === "unavailable").every((e) => e.snapshot.kind === "unavailable" && e.snapshot.reason === "NOT_CAPTURED")).toBe(true);
    expect(report.evidence.every((e) => e.dataset_id === "qloo-recorded-none")).toBe(true); expect(report.repairs).toEqual([]); expect(send).not.toHaveBeenCalled();
  });
  it("still enforces what needs no provider evidence when there is none: an oversized plan is blocked", async () => {
    const input = CUSTOM(); (input.constraints[3] as { value: number }).value = 1;
    const report = ProviderAuditReportSchema.parse(await (await service(await emptyRoot()).audit(post({ input }))).json());
    expect(report.original_audits.every((a) => a.findings.some((f) => f.code === "MAX_ITEMS_EXCEEDED" && f.state === "fail"))).toBe(true); expect(report.final_status).toBe("BLOCKED");
  });
  it("audits a custom input against the recordings: covered lookups use evidence, anything else is explicit UNKNOWN", async () => {
    const root = await seeded(); const response = await service(root).audit(post({ input: CUSTOM() }));
    expect(response.status).toBe(200); const report = ProviderAuditReportSchema.parse(await response.json());
    expect(report).toMatchObject({ source_mode: "recorded_live", scenario_id: CUSTOM_SCENARIO_ID, usage: { qloo_dispatches: 0 } });
    expect(report.input.recommendations.map((r) => r.name)).toEqual(["Blue Note New York", "Some Uncovered Cafe"]);
    // The covered venue has a recorded lookup (candidate awaiting the user's identity decision); the uncovered one has none.
    expect(report.pending_confirmations.map((p) => p.target_id)).toEqual(expect.arrayContaining(["pref-1", "rec-1"]));
    const uncovered = report.original_audits.find((a) => a.candidate_id === "rec-2")!;
    expect(uncovered.resolution).toBe("unresolved"); expect(["UNKNOWN", "BLOCKED"]).toContain(uncovered.verdict); expect(uncovered.verdict).not.toBe("PASS");
    expect(report.evidence.some((e) => e.snapshot.kind === "unavailable" && e.snapshot.reason === "NOT_CAPTURED")).toBe(true);
    expect(report.usage.unavailable_operations).toBeGreaterThan(0); expect(report.final_status).not.toBe("PASS");
  });
  it("a custom input with no recorded coverage is never presented as verified", async () => {
    const input = CUSTOM(); input.preferences[0]!.text = "Nonexistent Band"; input.preferences[0]!.confirmed_anchor = "Nonexistent Band";
    input.recommendations = [{ id: "rec-1", name: "Imaginary Venue", address_hint: null, claims: [] }];
    const report = ProviderAuditReportSchema.parse(await (await service(await seeded()).audit(post({ input }))).json());
    expect(report.final_status).toBe("UNKNOWN"); expect(report.original_audits.every((a) => a.verdict === "UNKNOWN")).toBe(true);
    expect(report.evidence.filter((e) => e.provider === "qloo")).toEqual([]); expect(report.usage).toMatchObject({ qloo_dispatches: 0, recorded_replays: 0 });
    expect(report.repairs).toEqual([]);
  });
  it("accepts identity decisions for custom IDs and replacement slots, and refuses any other target", async () => {
    const root = await seeded(); const svc = service(root); const ok = [select("pref-1", AUTHORED.artist), select("rec-1", AUTHORED.venue)];
    expect((await svc.audit(post({ input: CUSTOM(), confirmations: ok }))).status).toBe(200);
    expect((await svc.audit(post({ input: CUSTOM(), confirmations: [{ target_id: "repair:rec-1", decision: "skip" }] }))).status).toBe(200);
    for (const target of ["p1", "original-1", "repair:other", "rec-9"]) expect((await svc.audit(post({ input: CUSTOM(), confirmations: [{ target_id: target, decision: "skip" }] }))).status).toBe(400);
  });
  it("rejects an unsafe or malformed custom input with field paths and fixed reasons only", async () => {
    const svc = service(await seeded()); const secret = "authored-needle-5521";
    const unsafe = CUSTOM(); unsafe.recommendations[0]!.name = secret + String.fromCodePoint(0x202e) + "x";
    const a = await svc.audit(post({ input: unsafe })); expect(a.status).toBe(400);
    expect(await json(a)).toEqual({ error: "INVALID_INPUT", issues: [{ path: "recommendations.0.name", reason: "UNSAFE_CHARACTERS" }] });
    const reserved = CUSTOM(); reserved.recommendations[1]!.id = "repair:x"; reserved.task = secret;
    const b = await svc.audit(post({ input: reserved })); expect(b.status).toBe(400); expect(await json(b)).toEqual({ error: "INVALID_INPUT", issues: [{ path: "recommendations.1.id", reason: "RESERVED_ID" }] });
    const extra = { ...CUSTOM(), source_mode: "authorized_live", api_key: secret }; const c = await svc.audit(post({ input: extra })); expect(c.status).toBe(400);
    expect(JSON.stringify(await json(c))).not.toContain(secret);
    const big = CUSTOM(); big.recommendations[0]!.claims = Array.from({ length: 5 }, () => "x".repeat(300)); (big as Record<string, unknown>).filler = "f".repeat(20_000);
    const d = await svc.audit(post({ input: big })); expect([400, 413]).toContain(d.status);
  });
});

describe("AUTHORIZED_LIVE: every gate before any provider request", () => {
  const live = (extra: Record<string, unknown> = {}) => ({ scenario: RECORDED_SCENARIO_ID, source: "live", live_ack: ACK, ...extra });
  it("requires the exact acknowledgement: without it nothing is reserved or sent, even with a credential and a grant", async () => {
    const root = await emptyRoot(); await grant(root); const seen: Seen = []; const svc = service(root, { liveConfig, send: world(seen) });
    for (const body of [{ scenario: RECORDED_SCENARIO_ID, source: "live" }, { input: CUSTOM(), source: "live" }]) {
      const response = await svc.audit(post(body)); expect(response.status).toBe(403); expect(await json(response)).toEqual({ error: "LIVE_ACK_REQUIRED" });
    }
    const loaded = await loadLiveGrant(root) as { ok: true; grant: LiveGrant }; expect(await readLiveBudget(root, loaded.grant)).toEqual({ runs_used: 0, requests_reserved: 0 }); expect(seen).toEqual([]);
  });
  it("the operator kill switch refuses live before every other gate, even with a credential, a grant and the acknowledgement", async () => {
    const root = await seeded(); await grant(root); const seen: Seen = []; const svc = service(root, { liveConfig, send: world(seen), liveDisabled: () => true });
    for (const body of [live(), { scenario: RECORDED_SCENARIO_ID, source: "live" }, { input: CUSTOM(), source: "live", live_ack: ACK }]) {
      const response = await svc.audit(post(body, { headers: { Origin: "http://evil.example" } })); expect(response.status).toBe(403);
      expect(await json(response)).toEqual({ error: "LIVE_UNAVAILABLE", reason: "LIVE_DISABLED" });
    }
    const gate = CatalogSchema.parse(await (await svc.catalog()).json()); expect(gate.modes.live).toBe("LOCKED"); expect(gate.live_gate).toMatchObject({ status: "LOCKED", reason: "LIVE_DISABLED", remaining_requests: null });
    const loaded = await loadLiveGrant(root) as { ok: true; grant: LiveGrant }; expect(await readLiveBudget(root, loaded.grant)).toEqual({ runs_used: 0, requests_reserved: 0 }); expect(seen).toEqual([]);
    // Recorded and synthetic runs are unaffected by the switch.
    expect((await svc.audit(post({ scenario: RECORDED_SCENARIO_ID }))).status).toBe(200); expect((await svc.audit(post({ scenario: "valid-only" }))).status).toBe(200);
  });
  it("refuses a cross-origin caller before any gate that costs anything", async () => {
    const root = await emptyRoot(); await grant(root); const seen: Seen = []; const svc = service(root, { liveConfig, send: world(seen) });
    const hostile: Array<Record<string, string>> = [{ Origin: "http://evil.example" }, { Origin: "http://127.0.0.1:9999" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }, { Origin: "not a url" }];
    for (const headers of hostile) {
      const response = await svc.audit(post(live(), { headers })); expect(response.status).toBe(403); expect(await json(response)).toEqual({ error: "CROSS_ORIGIN_REFUSED" });
    }
    expect(seen).toEqual([]);
    const same = await svc.audit(post(live(), { headers: { Origin: "http://127.0.0.1", "Sec-Fetch-Site": "same-origin" } })); expect(same.status).toBe(200);
  });
  it.each([
    ["no credential on the server", async (root: string) => { await grant(root); }, noCredential, "CREDENTIAL_NOT_CONFIGURED", 403],
    ["no owner grant", async () => {}, liveConfig, "GRANT_MISSING", 403],
    ["an expired grant", async (root: string) => { await grant(root, { now: Date.now() - 3 * 3600_000, minutes: 5 }); }, liveConfig, "GRANT_EXPIRED", 403],
    ["a revoked grant", async (root: string) => { await grant(root); await revokeLiveGrant(root); }, liveConfig, "GRANT_REVOKED", 403],
    ["a spent run budget", async (root: string) => { await grant(root, { maxRuns: 1 }); const g = await loadLiveGrant(root) as { ok: true; grant: LiveGrant }; await startLiveRun(root, g.grant); }, liveConfig, "LIVE_RUN_LIMIT_REACHED", 403],
  ])("%s: 403, nothing sent, and no fallback to recordings or fixtures", async (_, prepare, config, reason, status) => {
    const root = await seeded(); await prepare(root); const seen: Seen = []; const recordings = vi.fn(async () => { throw new Error("recordings must not be consulted for a live request"); });
    const response = await service(root, { liveConfig: config, send: world(seen), recordings }).audit(post(live()));
    expect(response.status).toBe(status); expect(await json(response)).toEqual({ error: "LIVE_UNAVAILABLE", reason }); expect(seen).toEqual([]); expect(recordings).not.toHaveBeenCalled();
  });
  it("runs a fresh authorized-live audit in two rounds and reports exactly the dispatches that happened", async () => {
    const root = await emptyRoot(); await grant(root); const seen: Seen = []; const svc = service(root, { liveConfig, send: world(seen) });
    const first = await svc.audit(post(live())); expect(first.status).toBe(200); const one = ProviderAuditReportSchema.parse(await first.json());
    expect(one).toMatchObject({ source_mode: "authorized_live", stop_reason: "NEEDS_INPUT", usage: { qloo_dispatches: 5, recorded_replays: 0 } }); expect(seen.length).toBe(5);
    const confirmations = [select("p1", AUTHORED.artist), select("p2", AUTHORED.film), select("p3", AUTHORED.musicTag, "tag"), select("original-1", AUTHORED.venue)];
    const second = await svc.audit(post(live({ confirmations }))); expect(second.status).toBe(200); const two = ProviderAuditReportSchema.parse(await second.json());
    expect(two).toMatchObject({ source_mode: "authorized_live", stop_reason: "COMPLETE", usage: { qloo_dispatches: 8, recorded_replays: 0 } }); expect(seen.length).toBe(13);
    const loaded = await loadLiveGrant(root) as { ok: true; grant: LiveGrant }; expect(await readLiveBudget(root, loaded.grant)).toEqual({ runs_used: 2, requests_reserved: 13 });
    for (const text of [JSON.stringify(one), JSON.stringify(two)]) for (const raw of [KEY, ...Object.values(AUTHORED)]) expect(text).not.toContain(raw);
    // The catalog now shows the spent budget.
    const gate = CatalogSchema.parse(await (await svc.catalog()).json()).live_gate; expect(gate).toMatchObject({ status: "AVAILABLE", remaining_requests: 1, remaining_runs: 1 });
  });
  it("runs a custom input live with the same gates", async () => {
    const root = await emptyRoot(); await grant(root); const seen: Seen = []; const svc = service(root, { liveConfig, send: world(seen) });
    const response = await svc.audit(post({ input: CUSTOM(), source: "live", live_ack: ACK })); expect(response.status).toBe(200);
    const report = ProviderAuditReportSchema.parse(await response.json());
    expect(report).toMatchObject({ source_mode: "authorized_live", scenario_id: CUSTOM_SCENARIO_ID }); expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((r) => new URL(r.url).origin === "https://hackathon.api.qloo.com" && r.headers["X-Api-Key"] === KEY)).toBe(true);
    // Only lookups TasteGate itself derived from the validated input were sent: the browser cannot add or alter one.
    expect(seen.map((r) => new URL(r.url).searchParams.get("query")).filter(Boolean).sort()).toEqual(["Blue Note New York", "Radiohead", "Some Uncovered Cafe"].sort());
  });
  it("a provider failure becomes a valid, honest report (UNKNOWN), not a 500 and not a fallback", async () => {
    const root = await emptyRoot(); await grant(root); const seen: Seen = []; const recordings = vi.fn(async () => { throw new Error("must not be used"); });
    const response = await service(root, { liveConfig, send: world(seen, { status: 429 }), recordings }).audit(post(live()));
    expect(response.status).toBe(200); const report = ProviderAuditReportSchema.parse(await response.json());
    expect(report.source_mode).toBe("authorized_live"); expect(report.final_status).not.toBe("PASS"); expect(report.usage.qloo_dispatches).toBe(0);
    expect(report.evidence.some((e) => e.snapshot.kind === "unavailable")).toBe(true); expect(seen.length).toBe(1); expect(recordings).not.toHaveBeenCalled();
  });
  it("rate-limits live attempts per process, independent of the grant", async () => {
    let t = 1_000_000; const svc = service(await emptyRoot(), { liveConfig, now: () => t }); const statuses: number[] = [];
    for (let n = 0; n < 7; n++) statuses.push((await svc.audit(post(live()))).status);
    expect(statuses).toEqual([403, 403, 403, 403, 403, 403, 429]); // six reach the grant gate (no grant), the seventh is limited
    t += 61_000; expect((await svc.audit(post(live()))).status).toBe(403);
    t += 1000; const limited = await svc.audit(post(live())); expect(limited.status).toBe(403);
  });
  it("allows one live run at a time: a concurrent call is refused with 429 and does not touch the ledger", async () => {
    const root = await emptyRoot(); await grant(root); const seen: Seen = []; let release!: (response: Response) => void; const base = world(seen);
    const held: LiveSend = (request) => { if (seen.length === 0) { seen.push(request); return new Promise<Response>((resolve) => { release = resolve; }); } return base(request); };
    const svc = service(root, { liveConfig, send: held }); const first = svc.audit(post(live())); await untilSent(seen);
    const second = await svc.audit(post(live())); expect(second.status).toBe(429); expect(await json(second)).toEqual({ error: "LIVE_UNAVAILABLE", reason: "LIVE_BUSY" });
    release(Response.json({ results: [] })); expect((await first).status).toBe(200);
    const loaded = await loadLiveGrant(root) as { ok: true; grant: LiveGrant }; expect((await readLiveBudget(root, loaded.grant)).runs_used).toBe(1);
  });
  it("recorded and fixture requests never reach the provider transport, whatever the server is configured with", async () => {
    const root = await seeded(); await grant(root); const send = vi.fn(forbidden); const svc = service(root, { liveConfig, send });
    expect((await svc.audit(post({ scenario: RECORDED_SCENARIO_ID }))).status).toBe(200); expect((await svc.audit(post({ input: CUSTOM() }))).status).toBe(200);
    expect((await svc.audit(post({ scenario: "nyc-evening" }))).status).toBe(200); expect((await svc.catalog()).status).toBe(200); expect(send).not.toHaveBeenCalled();
    const loaded = await loadLiveGrant(root) as { ok: true; grant: LiveGrant }; expect(await readLiveBudget(root, loaded.grant)).toEqual({ runs_used: 0, requests_reserved: 0 });
  });
  it("never echoes the credential in any success or error response", async () => {
    const root = await emptyRoot(); await grant(root); const svc = service(root, { liveConfig, send: world([], { reflect: true }) });
    const bodies = [await svc.audit(post(live())), await svc.audit(post(live({ live_ack: undefined }))), await svc.audit(post({ input: CUSTOM(), source: "live" })), await svc.catalog()];
    for (const response of bodies) expect(await response.text()).not.toContain(KEY);
  });
});
