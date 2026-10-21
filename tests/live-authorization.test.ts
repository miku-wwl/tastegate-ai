import https from "node:https";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAuthorizedLiveSession } from "../src/qloo/live-adapter-authorized";
import { GRANT_ORIGIN, LIVE_ENDPOINT, LIVE_OPERATIONS, LIVE_PARAMETERS, PROPOSAL_WINDOW_MINUTES, createLiveGrant, loadLiveGrant, parametersAllowed, proposeLiveGrant,
  revokeLiveGrant, startLiveRun, type LiveGrant } from "../src/qloo/live-grant";
import { LIVE_ORIGIN } from "../src/qloo/live-transport";
import { providerRef } from "../src/qloo/provider-ref";
import { canonicalApproval, canonicalJson, isConsentSubjectId, replyIsCanonicalApproval, termsDigest, type ConsentTerms } from "../src/qloo/owner-consent";
import { QlooServerConfig } from "../src/qloo/server-config";
import { KEY, world, type Seen } from "./helpers/live-world";
import { AUTHORED } from "./helpers/recorded-root";
import { approvedGrant } from "./helpers/live-grant";

// Workstream A regression: owner consent is an exact, structured, single-use statement bound to the terms. No test here sends a request.
const roots: string[] = [];
const config = () => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: KEY });
async function freshRoot() { await mkdir(".artifacts", { recursive: true }); const root = await mkdtemp(resolve(".artifacts/live-auth-")); roots.push(root); await mkdir(join(root, "private"), { mode: 0o700 }); return root; }
const liveDir = (root: string) => join(root, "private/qloo-live");
const grantFile = (root: string) => join(liveDir(root), "grant.json");
const proposalFile = (root: string, id: string, suffix = "json") => join(liveDir(root), "proposals", `${id}.${suffix}`);
const read = async (path: string) => JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
const OPS = ["entity_lookup", "rank_places"] as const;
const propose = (root: string, change: Partial<Parameters<typeof proposeLiveGrant>[1]> = {}) => proposeLiveGrant(root, { minutes: 10, maxRequests: 6, maxRuns: 2, operations: OPS, ...change });
const approve = (root: string, proposalId: string, ownerReply: string, now?: number) => createLiveGrant(root, { proposalId, ownerReply, now });
const REFUSED = "LIVE_GRANT_CREATION_FAILED";
const LF = String.fromCodePoint(10); const CR = String.fromCodePoint(13); const TAB = String.fromCodePoint(9);

beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite")); vi.spyOn(https, "request").mockImplementation(() => { throw new Error("Network is forbidden in this suite"); }); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
afterAll(async () => { for (const r of roots) await rm(r, { recursive: true, force: true }); });

describe("owner consent primitives", () => {
  const ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
  it("canonical JSON is deterministic and refuses anything JSON cannot represent exactly", () => {
    expect(canonicalJson({ b: 1, a: [true, null, "x"], c: { z: 1, y: 2 } })).toBe(canonicalJson({ c: { y: 2, z: 1 }, a: [true, null, "x"], b: 1 }));
    expect(canonicalJson({ a: 1 })).toBe('{"a":1}');
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, undefined, () => 1, new Date(), new Map(), Symbol("x"), 10n, { a: undefined }])
      expect(() => canonicalJson(bad as unknown as ConsentTerms)).toThrow("CONSENT_TERMS_INVALID");
  });
  it("the digest changes with the kind, the identity and every term", () => {
    const terms = { max_requests: 6, operations: ["entity_lookup"], nested: { a: 1 } };
    const base = termsDigest("LIVE_GRANT", ID, terms);
    expect(base).toMatch(/^[a-f0-9]{64}$/);
    expect(termsDigest("LIVE_GRANT", ID, { ...terms })).toBe(base);
    expect(termsDigest("PROBE_P07", ID, terms)).not.toBe(base);
    expect(termsDigest("LIVE_GRANT", randomUUID(), terms)).not.toBe(base);
    for (const changed of [{ ...terms, max_requests: 7 }, { ...terms, operations: ["tag_lookup"] }, { ...terms, nested: { a: 2 } }, { ...terms, extra: false }])
      expect(termsDigest("LIVE_GRANT", ID, changed)).not.toBe(base);
    expect(() => termsDigest("LIVE_GRANT", "not-a-uuid", terms)).toThrow();
    expect(() => termsDigest("OTHER" as never, ID, terms)).toThrow();
  });
  it("only a version-4 identity and a full digest can form the sentence", () => {
    const digest = termsDigest("LIVE_GRANT", ID, { a: 1 });
    expect(canonicalApproval("LIVE_GRANT", ID, digest)).toBe(`APPROVE LIVE-GRANT ${ID} SHA256:${digest.slice(0, 32)}`);
    expect(canonicalApproval("PROBE_P07", ID, digest)).toBe(`APPROVE P07-NYC-DISCOVERY ${ID} SHA256:${digest.slice(0, 32)}`);
    for (const id of ["", "x", ID.toUpperCase(), ID.replace("4f60", "1f60"), ID + "0"]) expect(() => canonicalApproval("LIVE_GRANT", id, digest)).toThrow();
    for (const d of ["", "abc", digest.toUpperCase(), digest + "0"]) expect(() => canonicalApproval("LIVE_GRANT", ID, d)).toThrow();
    expect(isConsentSubjectId(ID)).toBe(true); expect(isConsentSubjectId(randomUUID())).toBe(true); expect(isConsentSubjectId(null)).toBe(false);
  });
  it("accepts the exact sentence (outer whitespace aside) and nothing that merely contains or resembles it", () => {
    const digest = termsDigest("LIVE_GRANT", ID, { a: 1 }); const ok = canonicalApproval("LIVE_GRANT", ID, digest);
    for (const accepted of [ok, ` ${ok}`, `${ok}${LF}`, `${TAB}${ok}${CR}${LF}`]) expect(replyIsCanonicalApproval(accepted, ok)).toBe(true);
    const rejected: unknown[] = [
      // the brief's counter-examples and their obvious relatives
      "I do not approve LIVE access.", "I refuse LIVE requests.", "Maybe turn on LIVE later.", "Do not enable LIVE.", "LIVE", "live", "Authorize one LIVE session", "yes", "ok", "no", "approve", "APPROVE",
      "APPROVE LIVE", "APPROVE LIVE-GRANT", `APPROVE LIVE-GRANT ${ID}`, "批准", "同意开启 LIVE", "",
      // the real sentence made ambiguous, negated, truncated, decorated or re-cased
      `${ok}.`, `${ok} but not yet`, `${ok}${LF}Do not proceed.`, `Do not ${ok}`, `NOT ${ok}`, `I ${ok}`, ok.replace("APPROVE", "DENY"), ok.replace("APPROVE", "REVOKE"), ok.toLowerCase(),
      ok.slice(0, -1), `${ok}0`, ok.replace("SHA256:", "SHA256: "), ok.replace(" ", "  "), ok.replace("LIVE-GRANT", "LIVE_GRANT"), JSON.stringify(ok), `"${ok}"`, `'${ok}'`, JSON.stringify({ reply: ok }),
      // look-alikes and invisible characters
      ok.replace("A", String.fromCodePoint(0x410)), `${String.fromCodePoint(0x200b)}${ok}`, `${ok}${String.fromCodePoint(0x200b)}`, ok.replace(" ", String.fromCodePoint(0xa0)), `${ok}${String.fromCodePoint(0)}`,
      `${String.fromCodePoint(0x202e)}${ok}`, ok.replace("SHA256", "SHA25" + String.fromCodePoint(0x4b)),
      // a sentence for other terms, another identity or another kind
      canonicalApproval("LIVE_GRANT", ID, termsDigest("LIVE_GRANT", ID, { a: 2 })), canonicalApproval("LIVE_GRANT", randomUUID(), digest), canonicalApproval("PROBE_P07", ID, digest),
      // not text at all
      null, undefined, 0, 1, true, {}, [], [ok], { toString: () => ok }, "x".repeat(10_000), ok.repeat(2),
    ];
    for (const reply of rejected) expect(replyIsCanonicalApproval(reply, ok), String(reply).slice(0, 60)).toBe(false);
  });
});

describe("live grant: ambiguous, negative and mismatched replies create nothing", () => {
  const REPLIES = ["I do not approve LIVE access.", "I refuse LIVE requests.", "Maybe turn on LIVE later.", "Do not enable LIVE.", "LIVE", "Authorize one LIVE session", "approve LIVE", "yes", "批准", "", "x".repeat(600)];
  it.each(REPLIES.map((r) => [r.slice(0, 40), r]))("refuses %j, writes no grant, and leaves the proposal approvable by its exact sentence", async (_, reply) => {
    const root = await freshRoot(); const p = await propose(root);
    await expect(approve(root, p.proposal_id, reply)).rejects.toThrow(REFUSED);
    expect(await loadLiveGrant(root)).toEqual({ ok: false, reason: "GRANT_MISSING" });
    await expect(readdir(join(liveDir(root), "proposals"))).resolves.toEqual([`${p.proposal_id}.json`]); // not consumed, no marker
    await expect(approve(root, p.proposal_id, p.approval_statement)).resolves.toMatchObject({ status: "CREATED" });
  });
  it("derives every mutation of the real sentence and refuses them all", async () => {
    const root = await freshRoot(); const p = await propose(root); const s = p.approval_statement;
    for (const reply of [`${s}.`, `${s} but not yet`, `Do not ${s}`, s.replace("APPROVE", "DENY"), s.toLowerCase(), s.slice(1), s.replace(p.terms_sha256.slice(0, 4), "0000"), `${s}${LF}Do not proceed.`])
      await expect(approve(root, p.proposal_id, reply)).rejects.toThrow(REFUSED);
    expect((await loadLiveGrant(root)).ok).toBe(false);
  });
  it("a non-string reply or a malformed identity is refused", async () => {
    const root = await freshRoot(); const p = await propose(root);
    for (const reply of [null, undefined, 1, {}, [p.approval_statement]]) await expect(approve(root, p.proposal_id, reply as never)).rejects.toThrow(REFUSED);
    for (const id of ["", "x", p.proposal_id.toUpperCase(), `${p.proposal_id}/../x`, `${p.proposal_id}.json`]) await expect(approve(root, id, p.approval_statement)).rejects.toThrow(REFUSED);
  });
});

describe("live grant: replay, substitution and expiry of the approval", () => {
  it("a sentence is single-use: replay fails while the grant is usable, after revocation and after expiry", async () => {
    const root = await freshRoot(); const now = Date.now(); const p = await propose(root, { now });
    await approve(root, p.proposal_id, p.approval_statement, now);
    await expect(approve(root, p.proposal_id, p.approval_statement, now)).rejects.toThrow(REFUSED);
    await revokeLiveGrant(root, now);
    await expect(approve(root, p.proposal_id, p.approval_statement, now)).rejects.toThrow(REFUSED);
    await expect(approve(root, p.proposal_id, p.approval_statement, now + 20 * 60_000)).rejects.toThrow(REFUSED);
    expect(await loadLiveGrant(root, now + 20 * 60_000)).toEqual({ ok: false, reason: "GRANT_REVOKED" });
    expect((await readdir(liveDir(root))).filter((n) => n.startsWith("grant"))).toEqual(["grant.json"]); // no second grant ever appeared
  });
  it("a sentence approves exactly one proposal: another proposal's sentence or identity does not work", async () => {
    const root = await freshRoot(); const a = await propose(root); const b = await propose(root, { operations: ["tag_lookup"], maxRequests: 2 });
    expect(a.proposal_id).not.toBe(b.proposal_id); expect(a.approval_statement).not.toBe(b.approval_statement);
    await expect(approve(root, b.proposal_id, a.approval_statement)).rejects.toThrow(REFUSED);
    await expect(approve(root, a.proposal_id, b.approval_statement)).rejects.toThrow(REFUSED);
    await expect(approve(root, randomUUID(), a.approval_statement)).rejects.toThrow(REFUSED);
    expect((await loadLiveGrant(root)).ok).toBe(false);
    await approve(root, b.proposal_id, b.approval_statement);
    const loaded = await loadLiveGrant(root); expect(loaded.ok && loaded.grant.allowed_operations).toEqual(["tag_lookup"]);
    await expect(approve(root, a.proposal_id, a.approval_statement)).rejects.toThrow(REFUSED); // a usable grant exists
  });
  it("the terms come from the stored proposal: widening any term after the sentence was printed invalidates it", async () => {
    const root = await freshRoot(); const now = Date.now(); const p = await propose(root, { now, minutes: 5, maxRequests: 2, maxRuns: 1, operations: ["entity_lookup"] });
    const file = proposalFile(root, p.proposal_id); const stored = await read(file);
    const later = new Date(now + 5 * 3600_000).toISOString();
    for (const widened of [{ max_requests: 14 }, { max_runs: 5 }, { duration_minutes: 60 }, { allowed_operations: ["entity_lookup", "rank_places"] }, { allowed_operations: ["discover_places"] },
      { environment: "PRODUCTION_LIVE" }, { approve_before: later }, { terms_sha256: "0".repeat(64) }, { proposal_id: randomUUID() }, { extra: true }]) {
      await writeFile(file, JSON.stringify({ ...stored, ...widened }));
      await expect(approve(root, p.proposal_id, p.approval_statement, now)).rejects.toThrow(REFUSED);
      expect((await loadLiveGrant(root, now)).ok).toBe(false);
    }
    await writeFile(file, JSON.stringify(stored)); // putting the terms back makes the same sentence valid again
    await expect(approve(root, p.proposal_id, p.approval_statement, now)).resolves.toMatchObject({ status: "CREATED", max_requests: 2, max_runs: 1, operations: ["entity_lookup"] });
  });
  it("the offer lapses: not before it was made, and not after its window", async () => {
    const root = await freshRoot(); const now = Date.now(); const p = await propose(root, { now });
    expect(Date.parse(p.approve_before) - now).toBe(PROPOSAL_WINDOW_MINUTES * 60_000);
    await expect(approve(root, p.proposal_id, p.approval_statement, now - 60_000)).rejects.toThrow(REFUSED);
    await expect(approve(root, p.proposal_id, p.approval_statement, Date.parse(p.approve_before))).rejects.toThrow(REFUSED);
    await expect(approve(root, p.proposal_id, p.approval_statement, Date.parse(p.approve_before) + 1)).rejects.toThrow(REFUSED);
    await expect(approve(root, p.proposal_id, p.approval_statement, Date.parse(p.approve_before) - 1)).resolves.toMatchObject({ status: "CREATED" });
  });
  it("revoking withdraws an unused offer, so it cannot be approved later", async () => {
    const root = await freshRoot(); const p = await propose(root);
    expect(await revokeLiveGrant(root)).toEqual({ status: "NO_ACTIVE_GRANT", withdrawn_proposals: 1 });
    await expect(approve(root, p.proposal_id, p.approval_statement)).rejects.toThrow(REFUSED);
    expect(await revokeLiveGrant(root)).toEqual({ status: "NO_ACTIVE_GRANT", withdrawn_proposals: 0 });
  });
  it("PRODUCTION_LIVE grants cannot be proposed in this phase, and a refused proposal leaves no trace", async () => {
    const root = await freshRoot();
    await expect(propose(root, { environment: "PRODUCTION_LIVE" })).rejects.toThrow("LIVE_PROPOSAL_FAILED");
    for (const change of [{ minutes: 0 }, { minutes: 61 }, { maxRequests: 15 }, { maxRuns: 0 }, { operations: [] as never }, { operations: ["bogus"] as never }]) await expect(propose(root, change)).rejects.toThrow("LIVE_PROPOSAL_FAILED");
    await expect(readdir(liveDir(root))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("live grant: a stored grant is only valid if it is exactly what was approved", () => {
  async function granted(change: Parameters<typeof approvedGrant>[1] = {}) { const root = await freshRoot(); const now = change.now ?? Date.now(); await approvedGrant(root, { ...change, now }); return { root, now, file: grantFile(root), grant: await read(grantFile(root)) as unknown as LiveGrant }; }
  it("loads the grant it just created, bound to its identity, environment and digest", async () => {
    const { root, now, grant } = await granted({ minutes: 10, maxRequests: 6, maxRuns: 2, operations: [...OPS] });
    expect(grant).toMatchObject({ revision: "tastegate.live-grant.v2", environment: "DEVELOPMENT", max_concurrency: 1, per_request_timeout_ms: 4000, max_response_bytes: 262144, duration_minutes: 10 });
    expect(grant.consent.proposal_id).toBe(grant.grant_id); expect(grant.owner_reply).toBe(canonicalApproval("LIVE_GRANT", grant.grant_id, grant.consent.terms_sha256));
    expect(Date.parse(grant.expires_at) - Date.parse(grant.approved_at)).toBe(10 * 60_000);
    expect((await loadLiveGrant(root, now + 1000)).ok).toBe(true);
  });
  it("scope mismatch: an operation added, removed or swapped after approval invalidates the grant", async () => {
    const { root, now, file, grant } = await granted({ operations: [...OPS] });
    for (const allowed_operations of [[...OPS, "discover_places"], ["entity_lookup"], ["tag_lookup", "rank_places"], ["discover_places"]]) {
      await writeFile(file, JSON.stringify({ ...grant, allowed_operations })); expect(await loadLiveGrant(root, now + 1000)).toEqual({ ok: false, reason: "GRANT_INVALID" });
    }
    await writeFile(file, JSON.stringify(grant)); expect((await loadLiveGrant(root, now + 1000)).ok).toBe(true);
  });
  it("budget mismatch: a larger request, run, time or concurrency budget invalidates the grant", async () => {
    const { root, now, file, grant } = await granted({ maxRequests: 6, maxRuns: 2, minutes: 10 });
    const expires = new Date(Date.parse(grant.approved_at) + 60 * 60_000).toISOString();
    for (const change of [{ max_requests: 7 }, { max_requests: 14 }, { max_runs: 3 }, { max_runs: 5 }, { duration_minutes: 60 }, { duration_minutes: 60, expires_at: expires }, { expires_at: expires }, { max_concurrency: 2 }, { per_request_timeout_ms: 15000 }, { max_response_bytes: 1048576 }]) {
      await writeFile(file, JSON.stringify({ ...grant, ...change })); expect((await loadLiveGrant(root, now + 1000)).ok, JSON.stringify(change)).toBe(false);
    }
  });
  it("identity, digest and sentence cannot be swapped or forged", async () => {
    const { root, now, file, grant } = await granted();
    const other = randomUUID();
    for (const change of [{ grant_id: other }, { consent: { ...grant.consent, proposal_id: other } }, { consent: { ...grant.consent, terms_sha256: "0".repeat(64) } }, { consent: { ...grant.consent, approve_before: new Date(now + 24 * 3600_000).toISOString() } },
      { owner_reply: "LIVE" }, { owner_reply: "I do not approve LIVE access." }, { owner_reply: `${grant.owner_reply} ` + "x" }, { environment: "PRODUCTION_LIVE" }, { approved_at: new Date(now + 2 * 3600_000).toISOString() }]) {
      await writeFile(file, JSON.stringify({ ...grant, ...change })); expect((await loadLiveGrant(root, now + 1000)).ok, JSON.stringify(change).slice(0, 80)).toBe(false);
    }
  });
  it("a grant that did not come through a consumed proposal is invalid, even if every field is self-consistent", async () => {
    const { root, now, grant } = await granted();
    await unlink(proposalFile(root, grant.grant_id, "consumed.json")); expect(await loadLiveGrant(root, now + 1000)).toEqual({ ok: false, reason: "GRANT_INVALID" });
    await rm(join(liveDir(root), "proposals"), { recursive: true }); expect(await loadLiveGrant(root, now + 1000)).toEqual({ ok: false, reason: "GRANT_INVALID" });
  });
  it("a grant is only valid in the environment it was approved for", async () => {
    const { root, now } = await granted();
    expect((await loadLiveGrant(root, now + 1000, "DEVELOPMENT")).ok).toBe(true);
    expect(await loadLiveGrant(root, now + 1000, "PRODUCTION_LIVE")).toEqual({ ok: false, reason: "GRANT_INVALID" });
    expect(await openAuthorizedLiveSession({ projectRoot: root, config, send: world(), environment: "PRODUCTION_LIVE" })).toEqual({ status: "DISABLED", reason: "GRANT_INVALID" });
  });
  it("the retired v1 format, whatever its reply says, is not a grant", async () => {
    const root = await freshRoot(); const now = Date.now(); await mkdir(liveDir(root), { mode: 0o700 });
    const v1 = { revision: "tastegate.live-grant.v1", grant_id: randomUUID(), approval: "AUTHORIZE_BOUNDED_LIVE_SESSION", approved_at: new Date(now).toISOString(), expires_at: new Date(now + 600_000).toISOString(),
      max_requests: 5, max_runs: 1, allowed_operations: ["entity_lookup"], per_request_timeout_ms: 4000, max_response_bytes: 262144,
      acknowledgements: { credential_exposure_risk: true, unknown_entitlements_and_quota: true, display_and_caching_terms_reviewed: true, no_retries_no_redirects: true },
      owner_reply: "I do not approve LIVE access.", gate_id: "g1" };
    await writeFile(grantFile(root), JSON.stringify(v1));
    expect(await loadLiveGrant(root, now + 1000)).toEqual({ ok: false, reason: "GRANT_INVALID" });
    expect(await openAuthorizedLiveSession({ projectRoot: root, config, send: world() })).toEqual({ status: "DISABLED", reason: "GRANT_INVALID" });
    expect(await startLiveRun(root, v1 as never, now + 1000)).toEqual({ reason: "GRANT_INVALID" });
    // ... and it does not block a proper proposal: the old file is kept as history, never overwritten.
    const p = await propose(root, { now }); await approve(root, p.proposal_id, p.approval_statement, now);
    expect((await readdir(liveDir(root))).filter((n) => n.startsWith("grant-")).length).toBe(1); expect((await loadLiveGrant(root, now + 1000)).ok).toBe(true);
  });
  it("revocation: loading, starting a run and the very next reservation all stop", async () => {
    const { root, now } = await granted({ operations: ["entity_lookup"], maxRequests: 3 });
    const loaded = await loadLiveGrant(root, now + 1000); if (!loaded.ok) throw new Error("grant"); const run = await startLiveRun(root, loaded.grant, now + 1000);
    if (!("reserve" in run)) throw new Error("run"); await run.reserve("entity_lookup", { query_length: 1 });
    expect((await revokeLiveGrant(root, now + 2000)).status).toBe("REVOKED");
    await expect(run.reserve("entity_lookup", { query_length: 1 })).rejects.toThrow("LIVE_GRANT_REVOKED"); // mid-run, not only at the next load
    expect(await loadLiveGrant(root, now + 3000)).toEqual({ ok: false, reason: "GRANT_REVOKED" });
    expect(await startLiveRun(root, loaded.grant, now + 3000)).toEqual({ reason: "GRANT_REVOKED" });
    expect((await run.counts()).reserved).toBe(1); // the refused reservation spent nothing
  });
  it("a run cannot start from a stale or hand-built grant object", async () => {
    const { root, now } = await granted({ maxRequests: 3, maxRuns: 1, operations: ["entity_lookup"] });
    const loaded = await loadLiveGrant(root, now + 1000); if (!loaded.ok) throw new Error("grant");
    for (const forged of [{ ...loaded.grant, max_requests: 14 }, { ...loaded.grant, max_runs: 5 }, { ...loaded.grant, allowed_operations: [...LIVE_OPERATIONS] }, { ...loaded.grant, grant_id: randomUUID() }])
      expect(await startLiveRun(root, forged as LiveGrant, now + 1000)).toMatchObject({ reason: expect.stringMatching(/^GRANT_/) });
    expect(await readdir(join(liveDir(root), "ledger")).catch(() => [])).toEqual([]); // a refused start created no run or ledger
    expect("reserve" in (await startLiveRun(root, loaded.grant, now + 1000))).toBe(true);
  });
});

describe("live grant: the approved parameter profile is what the adapter sends", () => {
  it("every request a builder sends uses exactly the parameters listed for its operation", async () => {
    const root = await freshRoot(); await approvedGrant(root); const seen: Seen = [];
    const s = await openAuthorizedLiveSession({ projectRoot: root, config, send: world(seen) }); if (s.status !== "AVAILABLE") throw new Error("session");
    const ctx = { runId: "r", callId: "c", signal: new AbortController().signal };
    try {
      await s.adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx); await s.adapter.searchTags("jazz", ctx);
      const ref = providerRef("entity", AUTHORED.artist);
      await s.adapter.discoverPlaces({ preference_entity_ids: [ref], preference_tag_ids: [], exclude_entity_ids: [], signal_scope: "first_confirmed_artist", take: 1, exclusion: "client" }, ctx);
    } finally { s.close(); }
    const byPath = new Map(seen.map((r) => [new URL(r.url).pathname, [...new URL(r.url).searchParams.keys()].sort()]));
    expect(byPath.get("/search")).toEqual([...LIVE_PARAMETERS.entity_lookup]); expect(byPath.get("/v2/tags")).toEqual([...LIVE_PARAMETERS.tag_lookup]);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    for (const name of byPath.get("/v2/insights") ?? []) expect(LIVE_PARAMETERS.discover_places).toContain(name);
  });
  it("any other parameter, a duplicate or an unknown operation is not covered", () => {
    expect(parametersAllowed("rank_places", ["filter.type", "take"])).toBe(true);
    expect(parametersAllowed("rank_places", ["filter.location.query"])).toBe(false);
    expect(parametersAllowed("discover_places", ["filter.type", "filter.type"])).toBe(false);
    expect(parametersAllowed("entity_lookup", ["query", "types", "take", "page", "explain"])).toBe(false);
    expect(parametersAllowed("tag_lookup", [])).toBe(true);
    for (const op of LIVE_OPERATIONS) { expect(LIVE_ENDPOINT[op].startsWith("/")).toBe(true); expect([...LIVE_PARAMETERS[op]].sort()).toEqual([...LIVE_PARAMETERS[op]]); }
  });
  it("the grant origin mirrors the transport's single allowlisted origin", () => { expect(GRANT_ORIGIN).toBe(LIVE_ORIGIN); });
});

describe("compatibility and containment", () => {
  it("owner grant operations never read, rewrite or add to historical probe approvals and receipts", async () => {
    const root = await freshRoot(); const probes = join(root, "private/qloo-probes"); await mkdir(join(probes, "p06/attempts"), { recursive: true, mode: 0o700 });
    const files = { [join(probes, "p06-checkpoint.json")]: '{"authored":"historical single-use approval"}\n', [join(probes, "p06-approval-receipt-authored.json")]: '{"owner_reply":"authored historical reply"}\n' };
    for (const [path, text] of Object.entries(files)) await writeFile(path, text);
    const now = Date.now(); const p = await propose(root, { now }); await approve(root, p.proposal_id, p.approval_statement, now); await revokeLiveGrant(root, now);
    for (const [path, text] of Object.entries(files)) expect(await readFile(path, "utf8")).toBe(text);
    expect((await readdir(probes)).sort()).toEqual(["p06", "p06-approval-receipt-authored.json", "p06-checkpoint.json"]);
  });
  it("no free-text interpretation of an owner reply remains in the source", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const sources = [...readdirSync("src/qloo").filter((n) => n.endsWith(".ts")).map((n) => `src/qloo/${n}`), ...readdirSync("scripts").filter((n) => n.endsWith(".mjs")).map((n) => `scripts/${n}`), "src/server/audit-service.ts"];
    const suspicious = ["ownerReplyAuthorizesLive", "ownerReplyNamesOnlyP06"];
    const offending: string[] = [];
    for (const path of sources) for (const [index, line] of readFileSync(path, "utf8").split(LF).entries()) {
      if (suspicious.some((name) => line.includes(name))) offending.push(`${path}:${index + 1} (retired matcher)`);
      if (/owner_?reply/i.test(line) && [".test(", ".match(", ".search(", ".includes(", ".startsWith(", ".endsWith("].some((call) => line.includes(call))) offending.push(`${path}:${index + 1} (pattern on a reply)`);
    }
    expect(offending).toEqual([]);
  });
});
