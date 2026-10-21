import https from "node:https";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAuthorizedLiveAudit, runRecordedAudit } from "../src/audit/workflow";
import type { Confirmation } from "../src/domain/contracts";
import { ProviderAuditReportSchema } from "../src/domain/report-schema";
import { openAuthorizedLiveSession, type LiveSession } from "../src/qloo/live-adapter-authorized";
import { LiveGrantSchema, loadLiveGrant, revokeLiveGrant, startLiveRun, validGrantWindow, type LiveGrant, type LiveOperation } from "../src/qloo/live-grant";
import { approvedGrant } from "./helpers/live-grant";
import { LIVE_ORIGIN, sendNative, type LiveSend } from "../src/qloo/live-transport";
import { providerRef } from "../src/qloo/provider-ref";
import { QlooServerConfig } from "../src/qloo/server-config";
import { RECORDED_INSIGHTS_POLICY, getRecordedScenarioInput } from "../src/scenarios/recorded-nyc";
import { KEY, world, type Seen } from "./helpers/live-world";
import { AUTHORED, authoredBodies } from "./helpers/recorded-root";

const roots: string[] = [];
const config = () => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: KEY });
const ref = (id: string) => providerRef("entity", id);
const ctx = (signal: AbortSignal = new AbortController().signal) => ({ runId: "authored", callId: "authored", signal });
async function freshRoot() { await mkdir(".artifacts", { recursive: true }); const root = await mkdtemp(resolve(".artifacts/live-test-")); roots.push(root); await mkdir(join(root, "private"), { mode: 0o700 }); return root; }
const grant = approvedGrant;
async function session(root: string, send: LiveSend, now?: () => number) { const s = await openAuthorizedLiveSession({ projectRoot: root, config, send, now }); if (s.status !== "AVAILABLE") throw new Error("session unavailable: " + s.reason); return s; }
const open: LiveSession[] = [];
beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite")); vi.spyOn(https, "request").mockImplementation(() => { throw new Error("Network is forbidden in this suite"); }); });
afterEach(() => { for (const s of open.splice(0)) s.close(); expect(globalThis.fetch).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(async () => { for (const r of roots) await rm(r, { recursive: true, force: true }); });
const track = async (root: string, send: LiveSend, now?: () => number) => { const s = await session(root, send, now); open.push(s); return s; };

describe("owner grant: the only authority for a live request", () => {
  it("an environment variable, a credential or opening the app is not authority: no grant means no session", async () => {
    const root = await freshRoot(); const send = vi.fn(world());
    expect(await openAuthorizedLiveSession({ projectRoot: root, config, send })).toEqual({ status: "DISABLED", reason: "GRANT_MISSING" });
    expect(send).not.toHaveBeenCalled();
  });
  it("a grant without a configured live credential cannot run, and the key is never read in fixture mode", async () => {
    const root = await freshRoot(); await grant(root);
    for (const cfg of [() => QlooServerConfig.load({}), () => QlooServerConfig.load({ QLOO_API_KEY: KEY }), () => { throw new Error("bad"); }])
      expect(await openAuthorizedLiveSession({ projectRoot: root, config: cfg as never, send: world() })).toEqual({ status: "DISABLED", reason: "CREDENTIAL_NOT_CONFIGURED" });
  });
  it("creates exactly one bounded grant from the owner's exact approval and never replaces a usable one", async () => {
    const root = await freshRoot(); const created = await grant(root, { maxRequests: 6, maxRuns: 2, operations: ["entity_lookup", "rank_places"] });
    expect(created).toMatchObject({ status: "CREATED", max_requests: 6, max_runs: 2, operations: ["entity_lookup", "rank_places"] });
    const loaded = await loadLiveGrant(root); expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(LiveGrantSchema.parse(loaded.grant)).toMatchObject({ per_request_timeout_ms: 4000, max_response_bytes: 262144, max_concurrency: 1, environment: "DEVELOPMENT", approval: "AUTHORIZE_BOUNDED_LIVE_SESSION" });
    await expect(grant(root)).rejects.toThrow("LIVE_PROPOSAL_FAILED");
    expect((await revokeLiveGrant(root)).status).toBe("REVOKED");
    expect(await loadLiveGrant(root)).toEqual({ ok: false, reason: "GRANT_REVOKED" });
    await grant(root); const files = await readdir(join(root, "private/qloo-live")); // the revoked grant is kept as history, never deleted
    expect(files.filter((f) => f.startsWith("grant-")).length).toBe(1); expect(files).toContain("grant.json");
  });
  it.each([{ minutes: 0 }, { minutes: 61 }, { minutes: 1.5 }, { maxRequests: 0 }, { maxRequests: 15 }, { maxRuns: 6 }, { operations: [] as LiveOperation[] }, { operations: ["entity_lookup", "entity_lookup"] as LiveOperation[] }, { environment: "PRODUCTION_LIVE" as const }])("rejects an out-of-bounds grant %j before anything is written", async (change) => {
    const root = await freshRoot();
    await expect(grant(root, change)).rejects.toThrow("LIVE_PROPOSAL_FAILED");
    await expect(readdir(join(root, "private/qloo-live"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("expires, is not valid before its start, and cannot be widened by editing the file", async () => {
    const root = await freshRoot(); const now = Date.now(); await grant(root, { now, minutes: 10 });
    expect((await loadLiveGrant(root, now + 11 * 60_000))).toEqual({ ok: false, reason: "GRANT_EXPIRED" });
    expect((await loadLiveGrant(root, now - 5 * 60_000))).toEqual({ ok: false, reason: "GRANT_NOT_YET_VALID" });
    const path = join(root, "private/qloo-live/grant.json"); const g = JSON.parse(await readFile(path, "utf8")) as LiveGrant;
    for (const widened of [{ max_requests: 99 }, { expires_at: new Date(now + 3 * 3600_000).toISOString() }, { allowed_operations: ["entity_lookup", "bogus"] }, { extra: 1 }]) {
      await writeFile(path, JSON.stringify({ ...g, ...widened })); expect((await loadLiveGrant(root, now + 1000)).ok).toBe(false);
    }
    expect(validGrantWindow({ ...g, expires_at: new Date(Date.parse(g.approved_at) + 3 * 3600_000).toISOString() }, now + 1000)).toBe("GRANT_INVALID");
  });
  it("bounds the number of runs, and a run cannot start after expiry or revocation", async () => {
    const root = await freshRoot(); await grant(root, { maxRuns: 2 });
    const a = await openAuthorizedLiveSession({ projectRoot: root, config, send: world() }); expect(a.status).toBe("AVAILABLE"); if (a.status === "AVAILABLE") a.close();
    const b = await openAuthorizedLiveSession({ projectRoot: root, config, send: world() }); expect(b.status).toBe("AVAILABLE"); if (b.status === "AVAILABLE") b.close();
    expect(await openAuthorizedLiveSession({ projectRoot: root, config, send: world() })).toEqual({ status: "DISABLED", reason: "LIVE_RUN_LIMIT_REACHED" });
    await revokeLiveGrant(root); expect(await openAuthorizedLiveSession({ projectRoot: root, config, send: world() })).toEqual({ status: "DISABLED", reason: "GRANT_REVOKED" });
    const stale = await loadLiveGrant(root, Date.now() - 10 * 60_000); expect(stale.ok).toBe(false);
  });
  it("a run cannot start under a grant that has already expired, whatever the file says", async () => {
    const root = await freshRoot(); const now = Date.now(); await grant(root, { now, minutes: 5 });
    const loaded = await loadLiveGrant(root, now + 1000); expect(loaded.ok).toBe(true); if (!loaded.ok) return;
    expect(await startLiveRun(root, loaded.grant, now + 6 * 60_000)).toEqual({ reason: "GRANT_EXPIRED" });
    expect(await startLiveRun(root, loaded.grant, now - 60_000)).toEqual({ reason: "GRANT_EXPIRED" });
  });
  it("allows one session at a time", async () => {
    const root = await freshRoot(); await grant(root); const first = await track(root, world());
    expect(await openAuthorizedLiveSession({ projectRoot: root, config, send: world() })).toEqual({ status: "DISABLED", reason: "LIVE_BUSY" });
    first.close(); const second = await openAuthorizedLiveSession({ projectRoot: root, config, send: world() }); expect(second.status).toBe("AVAILABLE"); if (second.status === "AVAILABLE") second.close();
  });
});

describe("fixed request builders (not a proxy)", () => {
  it("builds exactly the four reviewed GET requests on the single allowlisted origin, with the credential only in a header", async () => {
    const root = await freshRoot(); await grant(root); const seen: Seen = []; const s = await track(root, world(seen));
    const artist = await s.adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx());
    const venue = await s.adapter.searchEntity({ query: "Blue Note New York", requested_kind: "place" }, ctx());
    await s.adapter.searchTags("jazz", ctx());
    const found = await s.adapter.discoverPlaces({ preference_entity_ids: [ref(AUTHORED.artist)], preference_tag_ids: [], exclude_entity_ids: [ref(AUTHORED.venue)],
      signal_scope: "first_confirmed_artist", take: 1, exclusion: "client" }, ctx());
    await s.adapter.rankPlaces({ preference_entity_ids: [ref(AUTHORED.artist)], preference_tag_ids: [], candidate_entity_ids: [ref(AUTHORED.venue), ref(AUTHORED.far)] }, ctx());
    expect(artist.snapshot.kind).toBe("entity_lookup"); expect(venue.snapshot.kind).toBe("entity_lookup"); expect(found.snapshot.kind).toBe("discover_places");
    const urls = seen.map((r) => new URL(r.url));
    expect(urls.every((u) => u.origin === LIVE_ORIGIN && !u.username && !u.hash)).toBe(true);
    expect(urls.map((u) => u.pathname)).toEqual(["/search", "/search", "/v2/tags", "/v2/insights", "/v2/insights"]);
    expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({ query: "Radiohead", types: "urn:entity:artist", take: "5", page: "1" });
    expect(Object.fromEntries(urls[2]!.searchParams)).toEqual({ "filter.query": "jazz", take: "5", page: "1" });
    expect([...urls[3]!.searchParams]).toEqual([["filter.type", "urn:entity:place"], ["signal.interests.entities", AUTHORED.artist], ["take", "2"]]);
    expect([...urls[4]!.searchParams]).toEqual([["filter.type", "urn:entity:place"], ["signal.interests.entities", AUTHORED.artist], ["filter.results.entities", `${AUTHORED.venue},${AUTHORED.far}`], ["take", "2"]]);
    for (const r of seen) { expect(Object.keys(r).sort()).toEqual(["headers", "signal", "url"]); expect(r.headers).toEqual({ "X-Api-Key": KEY, Accept: "application/json" }); expect(r.url).not.toContain(KEY); }
  });
  it("refuses a lookup string that is empty, padded, over-long or contains control or bidi characters, without sending anything", async () => {
    const root = await freshRoot(); await grant(root); const seen: Seen = []; const s = await track(root, world(seen));
    for (const query of ["", " padded ", "x".repeat(201), "line\nbreak", "bell\u0007", "rtl" + String.fromCodePoint(0x202e) + "override", "zero" + String.fromCodePoint(0x200b) + "width"])
      expect((await s.adapter.searchEntity({ query, requested_kind: "place" }, ctx())).snapshot).toMatchObject({ kind: "unavailable", reason: "NOT_CAPTURED" });
    expect((await s.adapter.searchTags("", ctx())).snapshot.kind).toBe("unavailable");
    expect(seen).toEqual([]);
  });
  it("turns a reference into a provider ID only if THIS session received that ID from a validated response", async () => {
    const root = await freshRoot(); await grant(root); const seen: Seen = []; const s = await track(root, world(seen));
    const strangers = [ref(AUTHORED.artist), "qloo-ref:0000000000000000", ref("authored-never-returned")];
    for (const id of strangers) {
      expect((await s.adapter.discoverPlaces({ preference_entity_ids: [id], preference_tag_ids: [], exclude_entity_ids: [], signal_scope: "first_confirmed_artist", take: 1, exclusion: "client" }, ctx())).snapshot).toMatchObject({ kind: "unavailable", reason: "NOT_CAPTURED" });
      expect((await s.adapter.rankPlaces({ preference_entity_ids: [id], preference_tag_ids: [], candidate_entity_ids: [id] }, ctx())).snapshot.kind).toBe("unavailable");
    }
    expect(seen).toEqual([]);
    await s.adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx()); // now the artist ID is known to this session
    expect((await s.adapter.discoverPlaces({ preference_entity_ids: [ref(AUTHORED.artist)], preference_tag_ids: [], exclude_entity_ids: [], signal_scope: "first_confirmed_artist", take: 1, exclusion: "client" }, ctx())).snapshot.kind).toBe("discover_places");
  });
  it("a second session starts with an empty reference map: IDs learned by one session are never carried to the next", async () => {
    const root = await freshRoot(); await grant(root, { maxRuns: 3 }); const seen: Seen = []; const a = await track(root, world(seen));
    await a.adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx()); a.close();
    const b = await track(root, world(seen)); const before = seen.length;
    expect((await b.adapter.discoverPlaces({ preference_entity_ids: [ref(AUTHORED.artist)], preference_tag_ids: [], exclude_entity_ids: [], signal_scope: "first_confirmed_artist", take: 1, exclusion: "client" }, ctx())).snapshot).toMatchObject({ kind: "unavailable", reason: "NOT_CAPTURED" });
    expect(seen.length).toBe(before);
  });
  it("supports only the reviewed shapes: no tag signals, no geography, no server-side exclusion, bounded takes", async () => {
    const root = await freshRoot(); await grant(root); const seen: Seen = []; const s = await track(root, world(seen));
    await s.adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx()); const before = seen.length;
    const base = { preference_entity_ids: [ref(AUTHORED.artist)], preference_tag_ids: [], exclude_entity_ids: [], signal_scope: "first_confirmed_artist" as const, take: 1, exclusion: "client" as const };
    for (const bad of [{ preference_tag_ids: [providerRef("tag", AUTHORED.musicTag)] }, { exclusion: "server" as const }, { signal_scope: "all_confirmed" as const }, { take: 6 }, { take: 0 }, { preference_entity_ids: [] as string[] }])
      expect((await s.adapter.discoverPlaces({ ...base, ...bad }, ctx())).snapshot.kind).toBe("unavailable");
    expect((await s.adapter.rankPlaces({ preference_entity_ids: [ref(AUTHORED.artist)], preference_tag_ids: [providerRef("tag", AUTHORED.musicTag)], candidate_entity_ids: [ref(AUTHORED.artist)] }, ctx())).snapshot.kind).toBe("unavailable");
    expect((await s.adapter.rankPlaces({ preference_entity_ids: [ref(AUTHORED.artist)], preference_tag_ids: [], candidate_entity_ids: [] }, ctx())).snapshot.kind).toBe("unavailable");
    expect(seen.length).toBe(before);
  });
  it("the native sender refuses any URL that is not on the one allowlisted origin, before any connection", async () => {
    for (const url of ["https://evil.test/v2/insights", "http://hackathon.api.qloo.com/search", "https://hackathon.api.qloo.com.evil.test/", "https://user:pass@hackathon.api.qloo.com/search", "https://hackathon.api.qloo.com:8443/search"])
      await expect(sendNative({ url, headers: { "X-Api-Key": KEY }, signal: new AbortController().signal })).rejects.toThrow("NETWORK_ERROR");
    expect(https.request).not.toHaveBeenCalled();
  });
});

describe("budget, ledger and failure handling", () => {
  it("enforces the request budget durably: the budget is spent before dispatch and survives a new session", async () => {
    const root = await freshRoot(); await grant(root, { maxRequests: 2, maxRuns: 3 }); const seen: Seen = [];
    const a = await track(root, world(seen)); const lookup = (s: LiveSession, q: string) => s.adapter.searchEntity({ query: q, requested_kind: "place" }, ctx());
    expect((await lookup(a, "Blue Note New York")).snapshot.kind).toBe("entity_lookup"); expect((await lookup(a, "Anything Else")).snapshot.kind).toBe("entity_lookup");
    expect((await lookup(a, "One Too Many")).snapshot).toMatchObject({ kind: "unavailable", reason: "APPROVAL_REQUIRED", detail: expect.stringContaining("budget is exhausted") });
    expect(seen.length).toBe(2); a.close();
    const b = await track(root, world(seen)); expect((await lookup(b, "Fresh Session")).snapshot).toMatchObject({ kind: "unavailable", reason: "APPROVAL_REQUIRED" }); expect(seen.length).toBe(2);
    expect(await b.counts()).toEqual({ runs: 2, reserved: 2, settled: 2 });
  });
  it("only the operations the owner granted can be dispatched", async () => {
    const root = await freshRoot(); await grant(root, { operations: ["entity_lookup"] }); const seen: Seen = []; const s = await track(root, world(seen));
    expect((await s.adapter.searchTags("jazz", ctx())).snapshot).toMatchObject({ kind: "unavailable", reason: "APPROVAL_REQUIRED", detail: expect.stringContaining("not covered") });
    expect(seen).toEqual([]); expect((await s.adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx())).snapshot.kind).toBe("entity_lookup");
  });
  it("an expired grant stops dispatch mid-session", async () => {
    const root = await freshRoot(); let now = Date.now(); await grant(root, { now, minutes: 1 }); const seen: Seen = [];
    const s = await track(root, world(seen), () => now); await s.adapter.searchTags("jazz", ctx()); expect(seen.length).toBe(1);
    vi.useFakeTimers({ now: now + 2 * 60_000, toFake: ["Date"] }); now += 2 * 60_000;
    expect((await s.adapter.searchTags("jazz", ctx())).snapshot).toMatchObject({ kind: "unavailable", detail: expect.stringContaining("no longer valid") }); expect(seen.length).toBe(1);
  });
  it.each([[401, "AUTH_INVALID"], [403, "FORBIDDEN"], [429, "RATE_LIMITED"], [500, "UPSTREAM_ERROR"], [404, "HTTP_ERROR"]])("HTTP %i stops the run with explicit UNAVAILABLE evidence, never a retry (%s)", async (status, code) => {
    const root = await freshRoot(); await grant(root); const seen: Seen = []; const s = await track(root, world(seen, { status }));
    const first = await s.adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx());
    expect(first).toMatchObject({ capture: null, snapshot: { kind: "unavailable", reason: "RESPONSE_UNUSABLE", detail: expect.stringContaining(code) } });
    const second = await s.adapter.searchTags("jazz", ctx());
    expect(second.snapshot).toMatchObject({ kind: "unavailable", detail: expect.stringContaining("stopped") }); expect(seen.length).toBe(1); // breaker: nothing further sent
    const ledger = await readdir(join(root, "private/qloo-live/ledger", (await loadLiveGrant(root) as { ok: true; grant: LiveGrant }).grant.grant_id, "requests"));
    expect(ledger.sort()).toEqual(["0001.reserved.json", "0001.result.json"]);
  });
  it.each([["a non-JSON content type", { text: "{}", contentType: "text/html" }], ["malformed JSON", { text: "{" }], ["a reflected credential", { reflect: true }], ["an oversized body", { oversize: true }]])("%s is unusable evidence and stops the run", async (_, options) => {
    const root = await freshRoot(); await grant(root); const seen: Seen = []; const s = await track(root, world(seen, options as never));
    const out = await s.adapter.searchTags("jazz", ctx()); expect(out).toMatchObject({ capture: null, snapshot: { kind: "unavailable", reason: "RESPONSE_UNUSABLE" } });
    expect(JSON.stringify(out)).not.toContain(KEY); expect((await s.adapter.searchTags("again", ctx())).snapshot).toMatchObject({ detail: expect.stringContaining("stopped") }); expect(seen.length).toBe(1);
  });
  it("a body that is not valid UTF-8 is unusable evidence, recorded as a schema mismatch, and stops the run", async () => {
    const root = await freshRoot(); await grant(root); const seen: Seen = [];
    const send: LiveSend = async (r) => { seen.push(r); return new Response(new Uint8Array([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x3a, 0x31, 0x7d]), { headers: { "content-type": "application/json" } }); };
    const s = await track(root, send); const out = await s.adapter.searchTags("jazz", ctx());
    expect(out).toMatchObject({ capture: null, snapshot: { kind: "unavailable", reason: "RESPONSE_UNUSABLE", detail: expect.stringContaining("SCHEMA_MISMATCH") } });
    expect((await s.adapter.searchTags("again", ctx())).snapshot).toMatchObject({ detail: expect.stringContaining("stopped") }); expect(seen.length).toBe(1);
  });
  it("a response whose shape does not match the reviewed projection is not used and is not retried", async () => {
    const root = await freshRoot(); await grant(root); const seen: Seen = []; const s = await track(root, world(seen, { text: JSON.stringify({ results: [{ nope: 1 }] }) }));
    expect((await s.adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx())).snapshot).toMatchObject({ kind: "unavailable", reason: "RESPONSE_UNUSABLE" }); expect(seen.length).toBe(1);
  });
  // The ledger work before a dispatch is real file I/O, so a test must wait for the request to be handed to the transport
  // (the 4 s timer is created in the same turn) before moving the fake clock. Only timers are faked; setImmediate stays real.
  const untilSent = async (seen: Seen, count = 1) => { for (let i = 0; i < 5000 && seen.length < count; i++) await new Promise<void>((done) => setImmediate(done)); expect(seen.length).toBe(count); };
  it("times out at the hard deadline even when the transport ignores its abort signal, and never retries", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); const root = await freshRoot(); await grant(root); const seen: Seen = []; const s = await track(root, world(seen, { never: true }));
    const pending = s.adapter.searchTags("jazz", ctx()); await untilSent(seen);
    await vi.advanceTimersByTimeAsync(3900); expect(seen[0]!.signal.aborted).toBe(false); // not before the deadline
    await vi.advanceTimersByTimeAsync(200);
    expect(await pending).toMatchObject({ capture: null, snapshot: { kind: "unavailable", reason: "RESPONSE_UNUSABLE", detail: expect.stringContaining("TIMEOUT") } });
    expect(seen[0]!.signal.aborted).toBe(true); expect(seen.length).toBe(1);
    expect((await s.adapter.searchTags("again", ctx())).snapshot).toMatchObject({ detail: expect.stringContaining("stopped") }); expect(seen.length).toBe(1);
    expect(await s.counts()).toEqual({ runs: 1, reserved: 1, settled: 1 });
  });
  it("a caller that is already cancelled sends nothing and spends no budget", async () => {
    const root = await freshRoot(); await grant(root); const seen: Seen = []; const s = await track(root, world(seen)); const controller = new AbortController(); controller.abort();
    expect(await s.adapter.searchTags("jazz", ctx(controller.signal))).toMatchObject({ capture: null, snapshot: { kind: "unavailable", detail: expect.stringContaining("cancelled before it was sent") } });
    expect(seen).toEqual([]); expect(await s.counts()).toEqual({ runs: 1, reserved: 0, settled: 0 });
    expect((await s.adapter.searchTags("jazz", ctx())).snapshot.kind).toBe("tag_lookup"); // cancellation is not a provider failure: no circuit breaker
  });
  it("cancelling an in-flight request aborts it, records CANCELLED and stops the run", async () => {
    const root = await freshRoot(); await grant(root); const seen: Seen = []; const s = await track(root, world(seen, { never: true })); const controller = new AbortController();
    const pending = s.adapter.searchTags("jazz", ctx(controller.signal)); await untilSent(seen); controller.abort();
    expect(await pending).toMatchObject({ snapshot: { kind: "unavailable", detail: expect.stringContaining("CANCELLED") } }); expect(seen[0]!.signal.aborted).toBe(true);
    expect((await s.adapter.searchTags("again", ctx())).snapshot).toMatchObject({ detail: expect.stringContaining("stopped") }); expect(seen.length).toBe(1);
  });
  it("never has two requests in flight: a concurrent call is refused before it reserves or sends", async () => {
    const root = await freshRoot(); await grant(root); const seen: Seen = []; let release!: (response: Response) => void; const base = world(seen);
    const held: LiveSend = (request) => { if (seen.length === 0) { seen.push(request); return new Promise<Response>((resolve) => { release = resolve; }); } return base(request); };
    const s = await track(root, held);
    const first = s.adapter.searchTags("jazz", ctx()); const second = s.adapter.searchTags("blues", ctx());
    expect((await second).snapshot).toMatchObject({ kind: "unavailable", detail: expect.stringContaining("still in flight") });
    await untilSent(seen); release(Response.json((authoredBodies() as Record<string, unknown>).P04));
    expect((await first).snapshot.kind).toBe("tag_lookup"); expect(seen.length).toBe(1); expect(await s.counts()).toEqual({ runs: 1, reserved: 1, settled: 1 });
    expect((await s.adapter.searchTags("blues", ctx())).snapshot.kind).toBe("tag_lookup"); // the slot is released afterwards
  });
  it("a ranking that returns entities outside the shortlist or unusable scores is retained as unavailable, never as an ordering", async () => {
    const root = await freshRoot(); await grant(root); const bodies = authoredBodies() as Record<string, any>; const seen: Seen = [];
    const send: LiveSend = async (r) => { seen.push(r); const u = new URL(r.url); if (u.pathname === "/search") return Response.json(u.searchParams.get("types") === "urn:entity:artist" ? bodies.P01 : bodies.P03R);
      if (u.searchParams.get("filter.results.entities")) return Response.json({ success: true, results: { entities: [{ ...bodies.P05.results.entities[0], entity_id: "AUTHORED-INTRUDER-0001", query: { affinity: 0.9 } }] } });
      return Response.json(bodies.P05); };
    const s = await track(root, send); await s.adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx()); await s.adapter.searchEntity({ query: "Blue Note New York", requested_kind: "place" }, ctx());
    await s.adapter.discoverPlaces({ preference_entity_ids: [ref(AUTHORED.artist)], preference_tag_ids: [], exclude_entity_ids: [], signal_scope: "first_confirmed_artist", take: 1, exclusion: "client" }, ctx());
    expect((await s.adapter.rankPlaces({ preference_entity_ids: [ref(AUTHORED.artist)], preference_tag_ids: [], candidate_entity_ids: [ref(AUTHORED.venue), ref(AUTHORED.far)] }, ctx())).snapshot).toMatchObject({ kind: "unavailable", reason: "UNEXPECTED_ENTITY" });
  });
  it("the ledger and every output hold no provider ID, response body, name, score or credential", async () => {
    const root = await freshRoot(); await grant(root); const s = await track(root, world());
    const outputs = [await s.adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx()), await s.adapter.searchEntity({ query: "Blue Note New York", requested_kind: "place" }, ctx()), await s.adapter.searchTags("jazz", ctx())];
    const g = await loadLiveGrant(root) as { ok: true; grant: LiveGrant }; const dir = join(root, "private/qloo-live/ledger", g.grant.grant_id);
    const files = [...(await readdir(join(dir, "requests"))).map((n) => join(dir, "requests", n)), ...(await readdir(join(dir, "runs"))).map((n) => join(dir, "runs", n))];
    const text = (await Promise.all(files.map((f) => readFile(f, "utf8")))).join("\n");
    for (const secret of [KEY, ...Object.values(AUTHORED), "Authored Jazz Room", "0.8"]) expect(text).not.toContain(secret);
    const printed = JSON.stringify(outputs); for (const raw of [KEY, AUTHORED.artist, AUTHORED.venue]) expect(printed).not.toContain(raw);
    expect(outputs[0]!.capture).toMatchObject({ probe: "LIVE", integrity: "LIVE_LEDGER_RECORD", profile_revision: "tastegate.live.entity_lookup.v1" });
    expect(text).toContain("query_length"); // parameter SHAPE is recorded, never the value
  });
});

describe("authorized-live workflow: fresh requests, distinct from recordings", () => {
  const select = (target_id: string, id: string, kind: "entity" | "tag" = "entity"): Confirmation => ({ target_id, decision: "select", ref: providerRef(kind, id) });
  const confirmations = [select("p1", AUTHORED.artist), select("p2", AUTHORED.film), select("p3", AUTHORED.musicTag, "tag"), select("original-1", AUTHORED.venue)];
  const runLive = async (root: string, send: LiveSend, c?: Confirmation[]) => {
    const s = await session(root, send);
    try { return { report: await runAuthorizedLiveAudit(getRecordedScenarioInput(), s.adapter, { scenarioId: "live-nyc", insightsPolicy: RECORDED_INSIGHTS_POLICY, confirmations: c }), counts: await s.counts() }; }
    finally { s.close(); }
  };  it("round 1 stops for identity confirmation after five fresh lookups; round 2 completes within the budget", async () => {
    const root = await freshRoot(); await grant(root, { maxRequests: 14, maxRuns: 2 }); const seen: Seen = [];
    const one = await runLive(root, world(seen)); ProviderAuditReportSchema.parse(one.report);
    expect(one.report).toMatchObject({ source_mode: "authorized_live", stop_reason: "NEEDS_INPUT", usage: { qloo_dispatches: 5, recorded_replays: 0, unavailable_operations: 0 } });
    const two = await runLive(root, world(seen), confirmations); const r = ProviderAuditReportSchema.parse(two.report);
    expect(r).toMatchObject({ source_mode: "authorized_live", stop_reason: "COMPLETE", usage: { qloo_dispatches: 8, recorded_replays: 0, repair_rounds: 1 } });
    expect(seen.length).toBe(13); expect(two.counts).toEqual({ runs: 2, reserved: 13, settled: 13 });
    const captures = r.evidence.flatMap((e) => e.capture ? [e.capture] : []);
    expect(captures.every((c) => c.probe === "LIVE" && c.integrity === "LIVE_LEDGER_RECORD" && /^tastegate\.live\./.test(c.profile_revision))).toBe(true);
    expect(r.evidence.filter((e) => e.capture).every((e) => e.cache_hit === false && e.fetched_at === e.capture!.recorded_at)).toBe(true);
    expect(r.evidence.flatMap((e) => e.warnings).some((w) => w.includes("FRESH QLOO RESPONSE"))).toBe(true);
    // The same shortlist query now ranks the original and the proposal together, from a REAL (fake-world) response.
    expect(r.original_audits[0]).toMatchObject({ resolution: "resolved", hard_constraints: "pass", verdict: "REVIEW", cultural_relevance: { ordinal_rank: 1 } });
    expect(r.repairs[0]).toMatchObject({ accepted: false, revalidation: { verdict: "BLOCKED", cultural_relevance: { ordinal_rank: 2 } } });
    for (const raw of [...Object.values(AUTHORED), KEY]) expect(JSON.stringify(r)).not.toContain(raw);
  });
  it("a live report cannot be relabelled as a recording (or the reverse), and the two entry points reject each other's adapters", async () => {
    const root = await freshRoot(); await grant(root); const { report } = await runLive(root, world(), undefined);
    const relabel = structuredClone(report); Object.assign(relabel, { source_mode: "recorded_live" }); for (const e of relabel.evidence) Object.assign(e, { source_mode: "recorded_live" });
    expect(ProviderAuditReportSchema.safeParse(relabel).success).toBe(false);
    const mixed = structuredClone(report); Object.assign(mixed.evidence[1]!, { source_mode: "recorded_live" }); expect(ProviderAuditReportSchema.safeParse(mixed).success).toBe(false);
    const claimsReplay = structuredClone(report); claimsReplay.usage.recorded_replays = 3; claimsReplay.usage.qloo_dispatches = 0; expect(ProviderAuditReportSchema.safeParse(claimsReplay).success).toBe(false);
    const fakeLive = structuredClone(report); Object.assign(fakeLive.evidence[1]!, { cache_hit: true }); expect(ProviderAuditReportSchema.safeParse(fakeLive).success).toBe(false);
    const other = await freshRoot(); await grant(other); const s = await track(other, world());
    await expect(runRecordedAudit(getRecordedScenarioInput(), s.adapter as never, { scenarioId: "x", insightsPolicy: RECORDED_INSIGHTS_POLICY })).rejects.toThrow();
  });
  it("an operation the grant excludes becomes explicit UNKNOWN in the report, never a silent substitute", async () => {
    const root = await freshRoot(); await grant(root, { operations: ["entity_lookup", "tag_lookup"] });
    const { report } = await runLive(root, world(), confirmations);
    expect(report.stop_reason).toBe("COMPLETE"); expect(report.evidence.some((e) => e.snapshot.kind === "unavailable" && e.snapshot.request.operation === "discover_places" && e.snapshot.reason === "APPROVAL_REQUIRED")).toBe(true);
    expect(report.repair_outcomes[0]).toMatchObject({ status: "REPAIR_UNAVAILABLE", reason: "NO_DISCOVERY_EVIDENCE" }); expect(report.usage.qloo_dispatches).toBe(5);
  });
  it("a provider failure mid-run leaves the remaining operations unavailable and the run honest", async () => {
    const root = await freshRoot(); await grant(root); let n = 0; const base = world();
    const flaky: LiveSend = async (r) => (++n === 4 ? new Response("x", { status: 429 }) : base(r));
    const { report } = await runLive(root, flaky, confirmations);
    expect(report.usage.qloo_dispatches).toBe(3); expect(report.evidence.filter((e) => e.snapshot.kind === "unavailable").length).toBeGreaterThan(0);
    expect(["NEEDS_INPUT", "COMPLETE"]).toContain(report.stop_reason); expect(report.final_status).not.toBe("PASS");
  });
});
