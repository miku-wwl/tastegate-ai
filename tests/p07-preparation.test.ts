import https from "node:https";
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalApproval } from "../src/qloo/owner-consent";
import { inspectAcceptedP05Signal } from "../src/qloo/p05-signal";
import { SAVED_P01_ATTEMPT } from "../src/qloo/p02-profile";
import { inspectAcceptedP06Shortlist } from "../src/qloo/p06-shortlist";
import { P07_PARAMETER_SUPPORT, P07_KNOWN_UNCERTAINTIES, inspectP07State, prepareP07Gate, registerP07Approval, withdrawP07Gate } from "../src/qloo/p07-approval";
import { P07_OFFER_WINDOW_HOURS, P07ProposalSchema, P07ReceiptSchema, verifyP07Consent } from "../src/qloo/p07-consent";
import { P07_PROFILE, P07CheckpointSchema, P07ProfileSchema, P07SummarySchema, p07RequestSha256, p07RequestUrl, validP07Checkpoint } from "../src/qloo/p07-profile";
import { matchesP07Signal } from "../src/qloo/p07-signal";
import { probeDefinition } from "../src/qloo/probe-definitions";
import { createLocalRawProbeRunner, type ProbeRequest, type ProbeStore } from "../src/qloo/raw-probe-runner";
import { createPrivateProbeStore, inspectPrivateProbeLedger, liveProbeFromPrivateCheckpoint } from "../src/qloo/raw-probe-store";
import { AUTH } from "./helpers/p06-root";
import { p07Config as config, seedP07 } from "./helpers/p07-root";

// Entirely authored data and local test doubles: no Qloo request, no real credential, no captured provider data. The browser-less
// network entry points are spied to throw, so even a bug could not reach the network from this file.
const roots: string[] = [];
const memory = () => ({ reserve: vi.fn(async () => {}), saveRaw: vi.fn(async (_: Uint8Array) => {}), saveSummary: vi.fn(async (_: unknown) => {}) } satisfies ProbeStore);
const local = (send: (r: ProbeRequest) => Promise<Response>) => ({ kind: "local-test-double" as const, send });
const HOUR = 3_600_000;
async function ready() { const s = await seedP07(); roots.push(s.root); return { ...s, signal: await inspectAcceptedP05Signal(s.root) }; }
async function approved() {
  const s = await ready(); const gate = await prepareP07Gate(s.root);
  const registration = await registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: gate.approval_statement });
  const checkpoint = P07CheckpointSchema.parse(JSON.parse(await readFile(join(s.base, "p07-checkpoint.json"), "utf8")));
  return { ...s, gate, registration, checkpoint };
}
const proposalPath = (s: { base: string }, id: string, kind = "json") => join(s.base, "p07-proposals", `${id}.${kind}`);
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
const noP07Files = async (base: string) => (await readdir(base)).filter((n) => n.startsWith("p07-checkpoint") || n.startsWith("p07-approval-receipt"));
const HEX64 = /[a-f0-9]{64}/;
let previousArgs: string[];
beforeEach(() => { previousArgs = process.execArgv; process.execArgv = [];
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network")); vi.spyOn(https, "request").mockImplementation(() => { throw new Error("No network"); }); });
afterEach(() => { process.execArgv = previousArgs; expect(globalThis.fetch).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
afterAll(async () => { for (const root of roots) await rm(root, { recursive: true, force: true }); });

describe("P07 registry, profile and request", () => {
  it("is a closed registry entry: P07 is executable, P08-P10 and arbitrary hosts are not", () => {
    expect(probeDefinition("P07").profile.revision).toBe(P07_PROFILE.revision);
    for (const id of ["P08", "P09", "P10", "https://example.test"]) expect(() => probeDefinition(id as never)).toThrow("PROBE_NOT_EXECUTABLE");
  });
  it("the display profile carries a marker, never an identifier, and states the exact reviewed parameters", () => {
    expect(P07_PROFILE.params).toEqual({ "filter.type": "urn:entity:place", "signal.interests.entities": "<PRIVATE_REVIEWED_RADIOHEAD_ID>", "filter.location.query": "New York City", "filter.location.radius": "0", take: "3" });
    expect(P07_PROFILE).toMatchObject({ method: "GET", origin: "https://hackathon.api.qloo.com", path: "/v2/insights", max_response_bytes: 262144 });
    expect(P07ProfileSchema.safeParse(P07_PROFILE).success).toBe(true);
  });
  it.each([
    ["an extra geography filter", { "filter.location.geohash": "dr5r" }], ["an exact-match geocode filter", { "filter.geocode.name": "New York" }], ["a WKT location", { "filter.location": "POINT(-73.99 40.72)" }],
    ["a second locality parameter", { "signal.location.query": "New York City" }], ["explainability", { "feature.explainability": "true" }], ["a shortlist", { "filter.results.entities": "authored-a,authored-b" }],
    ["tags", { "filter.tags": "authored" }], ["paging", { page: "2" }], ["an offset", { offset: "3" }], ["sorting", { sort_by: "quality" }],
    ["a different radius", { "filter.location.radius": "1" }], ["a different locality", { "filter.location.query": "Brooklyn" }], ["a larger take", { take: "4" }], ["the maximum take", { take: "50" }],
    ["another entity type", { "filter.type": "urn:entity:movie" }], ["a real identifier instead of the marker", { "signal.interests.entities": AUTH.artist }],
  ])("denies %s: the profile is exact", (_, change) => {
    expect(P07ProfileSchema.safeParse({ ...P07_PROFILE, params: { ...P07_PROFILE.params, ...change } }).success).toBe(false);
  });
  it.each([{ origin: "https://example.test" }, { path: "/search" }, { max_response_bytes: 999999 }, { method: "POST" }, { revision: "tastegate.p07.other.v1" }])("denies a changed %j", (change) => {
    expect(P07ProfileSchema.safeParse({ ...P07_PROFILE, ...change }).success).toBe(false);
  });
  it("omitting a parameter is also a change", () => {
    for (const name of Object.keys(P07_PROFILE.params)) { const params: Record<string, string> = { ...P07_PROFILE.params }; delete params[name]; expect(P07ProfileSchema.safeParse({ ...P07_PROFILE, params }).success).toBe(false); }
  });
  it("builds one URL: reviewed order, URL-encoded locality, the artist only in the signal parameter, a stable hash per artist", () => {
    const url = new URL(p07RequestUrl(AUTH.artist));
    expect(url.origin + url.pathname).toBe("https://hackathon.api.qloo.com/v2/insights");
    expect([...url.searchParams]).toEqual([["filter.type", "urn:entity:place"], ["signal.interests.entities", AUTH.artist], ["filter.location.query", "New York City"], ["filter.location.radius", "0"], ["take", "3"]]);
    expect(url.username + url.password + url.hash).toBe("");
    expect(p07RequestSha256(AUTH.artist)).toBe(p07RequestSha256(AUTH.artist)); expect(p07RequestSha256(AUTH.artist)).not.toBe(p07RequestSha256(AUTH.nyc));
    expect(p07RequestSha256(AUTH.artist)).toMatch(/^[a-f0-9]{64}$/);
  });
  it("documents exactly one parameter conflict and states the known uncertainties", () => {
    expect(P07_PARAMETER_SUPPORT.filter((p) => p.conflict).map((p) => p.parameter)).toEqual(["filter.location.query"]);
    expect(P07_PARAMETER_SUPPORT.map((p) => p.parameter).sort()).toEqual(Object.keys(P07_PROFILE.params).sort());
    expect(P07_KNOWN_UNCERTAINTIES.join(" ")).toMatch(/SILENTLY_IGNORED/); expect(P07_KNOWN_UNCERTAINTIES.length).toBeGreaterThanOrEqual(6);
  });
});

describe("P07 gate: preparation sends nothing, approves nothing and prints nothing private", () => {
  it("prepares a public-safe gate and writes only a private proposal", async () => {
    const s = await ready(); const before = await Promise.all(s.historical.map((f) => readFile(f))); const baseBefore = (await readdir(s.base)).sort();
    const gate = await prepareP07Gate(s.root);
    expect(gate).toMatchObject({ status: "GATE_PREPARED_NO_REQUEST_SENT", probe: "P07", bindings: { artist_identity: "ACCEPTED_FOR_P05_ONLY_REVERIFIED", own_ledger: "0 attempts" },
      limits: { max_dispatches: 1, concurrency: 1, retries: 0, redirects: 0, timeout_ms: 4000, max_response_bytes: 262144, execution_window_minutes: 5 }, destination: `private/qloo-probes/p07/attempts/${gate.attempt_id}/` });
    expect(Object.keys(gate.bindings.prior_probes)).toEqual(["P01", "P02", "P03", "P04", "P03R", "P05", "P06"]);
    expect(gate.approval_statement).toMatch(/^APPROVE P07-NYC-DISCOVERY [0-9a-f-]{36} SHA256:[0-9a-f]{32}$/); expect(gate.approval_statement).toContain(gate.attempt_id);
    expect(Date.parse(gate.approve_before) - Date.now()).toBeGreaterThan((P07_OFFER_WINDOW_HOURS - 1) * HOUR);
    const printed = JSON.stringify(gate);
    for (const secret of [AUTH.artist, AUTH.nyc, AUTH.control, AUTH.key, AUTH.spotify, AUTH.mbid, "https://hackathon.api.qloo.com/v2/insights?"]) expect(printed).not.toContain(secret);
    expect(HEX64.test(printed)).toBe(false); expect(printed).toContain("<PRIVATE_REVIEWED_RADIOHEAD_ID>");
    const proposal = P07ProposalSchema.parse(await readJson(proposalPath(s, gate.attempt_id)));
    expect(JSON.stringify(proposal)).not.toContain(AUTH.artist); expect(proposal.request_sha256).toBe(p07RequestSha256(AUTH.artist));
    expect((await readdir(s.base)).sort()).toEqual([...baseBefore, "p07", "p07-proposals"].sort()); // additions only; no checkpoint, receipt or attempt
    expect(await noP07Files(s.base)).toEqual([]); expect(await readdir(join(s.base, "p07/attempts"))).toEqual([]);
    expect(await inspectPrivateProbeLedger(s.root, "P07")).toMatchObject({ reserved_attempts: 0, recorded_dispatches: 0, unresolved_attempts: 0 });
    expect(await inspectP07State(s.root)).toMatchObject({ state: "GATE_OPEN_AWAITING_APPROVAL", attempt_id: gate.attempt_id });
    expect(await Promise.all(s.historical.map((f) => readFile(f)))).toEqual(before);
  });
  it.each([
    ["an earlier probe is unsettled", async (s: Awaited<ReturnType<typeof ready>>) => { await rm(join(s.base, "p04/attempts"), { recursive: true, force: true }); }],
    ["the P06 attempt is missing", async (s: Awaited<ReturnType<typeof ready>>) => { await rm(join(s.base, "p06/attempts"), { recursive: true, force: true }); }],
    ["the P01 capture the artist identity rests on no longer matches", async (s: Awaited<ReturnType<typeof ready>>) => { await writeFile(join(s.base, "p01/attempts", SAVED_P01_ATTEMPT, "response.raw.json"), "{}"); }],
    ["the artist identity review is gone", async (s: Awaited<ReturnType<typeof ready>>) => { await unlink(join(s.base, "p05-radiohead-identity.private.json")); }],
  ])("refuses to prepare a gate when %s", async (_, damage) => {
    const s = await ready(); await damage(s);
    await expect(prepareP07Gate(s.root)).rejects.toThrow("P07_GATE_PREPARATION_FAILED");
    await expect(readdir(join(s.base, "p07-proposals"))).rejects.toMatchObject({ code: "ENOENT" }); // a refused gate leaves no proposal
  });
  it("only one offer can be open; a withdrawn or expired one does not block the next", async () => {
    const s = await ready();
    const stale = await prepareP07Gate(s.root, { now: Date.now() - (P07_OFFER_WINDOW_HOURS + 1) * HOUR }); // an offer made long ago has lapsed
    expect(await inspectP07State(s.root)).toMatchObject({ state: "GATE_EXPIRED", attempt_id: stale.attempt_id });
    await expect(registerP07Approval(s.root, { proposalId: stale.attempt_id, ownerReply: stale.approval_statement })).rejects.toThrow("P07_APPROVAL_REGISTRATION_FAILED");
    const first = await prepareP07Gate(s.root); expect(first.attempt_id).not.toBe(stale.attempt_id); // ... and does not block the next offer
    await expect(prepareP07Gate(s.root)).rejects.toThrow("P07_GATE_PREPARATION_FAILED"); // but two current offers cannot coexist
    expect(await withdrawP07Gate(s.root, { proposalId: first.attempt_id })).toEqual({ status: "WITHDRAWN" });
    expect(await inspectP07State(s.root)).toMatchObject({ state: "GATE_WITHDRAWN", attempt_id: first.attempt_id });
    const second = await prepareP07Gate(s.root); expect(second.attempt_id).not.toBe(first.attempt_id); expect(second.approval_statement).not.toBe(first.approval_statement);
    expect(await inspectP07State(s.root)).toMatchObject({ state: "GATE_OPEN_AWAITING_APPROVAL", attempt_id: second.attempt_id });
  });
  it("refuses to prepare once an approval exists or P07 has been attempted", async () => {
    const a = await approved(); await expect(prepareP07Gate(a.root)).rejects.toThrow("P07_GATE_PREPARATION_FAILED");
    const store = createPrivateProbeStore(a.root, "P07", a.checkpoint, null, a.signal);
    await createLocalRawProbeRunner("P07", config(), local(async () => Response.json({ authored: true })), store, a.signal).run({ checkpoint: a.checkpoint });
    await unlink(join(a.base, "p07-checkpoint.json")); await expect(prepareP07Gate(a.root)).rejects.toThrow("P07_GATE_PREPARATION_FAILED"); // the ledger alone is enough
  });
});

describe("P07 approval: only the exact sentence, once, for exactly this request", () => {
  it("registers one single-use approval from the exact sentence and writes the receipt and checkpoint in order", async () => {
    const s = await ready(); const gate = await prepareP07Gate(s.root); const before = await Promise.all(s.historical.map((f) => readFile(f)));
    const now = Date.now(); const result = await registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: ` ${gate.approval_statement}\n`, now });
    expect(result).toEqual({ status: "REGISTERED", attempt_id: gate.attempt_id, approved_at: new Date(now).toISOString(), approval_expires_at: new Date(now + 300_000).toISOString(), window_minutes: 5 });
    for (const secret of [AUTH.artist, AUTH.nyc, AUTH.key]) expect(JSON.stringify(result)).not.toContain(secret);
    const checkpoint = await readJson(join(s.base, "p07-checkpoint.json"));
    expect(validP07Checkpoint(checkpoint, now)).toBe(true); expect(matchesP07Signal(checkpoint, s.signal)).toBe(true); expect(matchesP07Signal(checkpoint, { ...s.signal })).toBe(false);
    expect(checkpoint).toMatchObject({ attempt_id: gate.attempt_id, consent_proposal_id: gate.attempt_id, previous_attempt_id: null, prior_reserved_attempts: 0, approval: "APPROVE_P07_NYC_DISCOVERY_ONLY", max_dispatches: 1, request_sha256: p07RequestSha256(AUTH.artist) });
    const receipt = P07ReceiptSchema.parse(await readJson(join(s.base, `p07-approval-receipt-${gate.attempt_id}.json`)));
    expect(receipt).toMatchObject({ owner_reply: gate.approval_statement, max_dispatches: 1, retries: 0, redirects: 0, timeout_ms: 4000, max_response_bytes: 262144, timestamp_is: "LOCAL_REGISTRATION_NOT_ASSERTED_HUMAN_CLICK_TIME" });
    expect(receipt.request.url).toBe(p07RequestUrl(AUTH.artist)); expect(receipt.does_not_authorize).toEqual(expect.arrayContaining(["SECOND_P07", "P08_P10", "EXTRA_OR_ALTERED_PARAMETERS", "PRODUCT_LIVE_MODE"]));
    await readJson(proposalPath(s, gate.attempt_id, "consumed.json"));
    expect(await inspectP07State(s.root, { now })).toMatchObject({ state: "APPROVAL_REGISTERED_NOT_EXECUTED", attempt_id: gate.attempt_id });
    expect(await Promise.all(s.historical.map((f) => readFile(f)))).toEqual(before);
    expect(await verifyP07Consent(s.root, P07CheckpointSchema.parse(checkpoint), s.signal)).toBe(true);
  });
  it("refuses every reply that is not the exact sentence, writes nothing, and leaves the gate approvable", async () => {
    const s = await ready(); const gate = await prepareP07Gate(s.root); const proposal = P07ProposalSchema.parse(await readJson(proposalPath(s, gate.attempt_id)));
    const statement = gate.approval_statement;
    const wrong: unknown[] = ["I do not approve P07.", "I refuse the P07 request.", "Maybe run P07 later.", "Do not run P07.", "P07", "approve P07 once", "Approve P07", "批准 P07 一次", "APPROVE", "APPROVE P07", "",
      `${statement} but not yet`, `Do not ${statement}`, `${statement}.`, statement.toLowerCase(), statement.replace("APPROVE", "DENY"), statement.slice(0, -1), `${statement}${statement}`,
      statement.replace("P07-NYC-DISCOVERY", "P06"), statement.replace(gate.attempt_id, randomUUID()),
      canonicalApproval("LIVE_GRANT", gate.attempt_id, proposal.terms_sha256), canonicalApproval("PROBE_P07", randomUUID(), proposal.terms_sha256), canonicalApproval("PROBE_P07", gate.attempt_id, "0".repeat(64)),
      null, undefined, 1, {}, [statement]];
    for (const reply of wrong) {
      await expect(registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: reply as string })).rejects.toThrow("P07_APPROVAL_REGISTRATION_FAILED");
      expect(await noP07Files(s.base)).toEqual([]); expect(await readdir(join(s.base, "p07-proposals"))).toEqual([`${gate.attempt_id}.json`]);
    }
    await expect(registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: statement })).resolves.toMatchObject({ status: "REGISTERED" });
  });
  it("is single-use: replay fails, even after the approval files are removed by hand", async () => {
    const a = await approved();
    await expect(registerP07Approval(a.root, { proposalId: a.gate.attempt_id, ownerReply: a.gate.approval_statement })).rejects.toThrow("P07_APPROVAL_REGISTRATION_FAILED");
    await unlink(join(a.base, "p07-checkpoint.json")); await unlink(join(a.base, `p07-approval-receipt-${a.gate.attempt_id}.json`));
    await expect(registerP07Approval(a.root, { proposalId: a.gate.attempt_id, ownerReply: a.gate.approval_statement })).rejects.toThrow("P07_APPROVAL_REGISTRATION_FAILED");
    expect(await noP07Files(a.base)).toEqual([]);
  });
  it("a sentence approves only its own gate: another gate's sentence and a swapped identity are refused", async () => {
    const s = await ready(); const first = await prepareP07Gate(s.root); await withdrawP07Gate(s.root, { proposalId: first.attempt_id });
    const second = await prepareP07Gate(s.root);
    await expect(registerP07Approval(s.root, { proposalId: second.attempt_id, ownerReply: first.approval_statement })).rejects.toThrow();
    await expect(registerP07Approval(s.root, { proposalId: first.attempt_id, ownerReply: first.approval_statement })).rejects.toThrow(); // withdrawn
    await expect(registerP07Approval(s.root, { proposalId: randomUUID(), ownerReply: second.approval_statement })).rejects.toThrow();
    for (const id of ["", "x", second.attempt_id.toUpperCase(), `${second.attempt_id}.json`, `${second.attempt_id}/../x`]) await expect(registerP07Approval(s.root, { proposalId: id, ownerReply: second.approval_statement })).rejects.toThrow();
    expect(await noP07Files(s.base)).toEqual([]);
  });
  it("the offer lapses: not before it was made and not after its window", async () => {
    const s = await ready(); const now = Date.now(); const gate = await prepareP07Gate(s.root, { now }); const until = Date.parse(gate.approve_before);
    for (const at of [now - 1000, until, until + 1]) await expect(registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: gate.approval_statement, now: at })).rejects.toThrow();
    expect(await noP07Files(s.base)).toEqual([]);
    // The last instant of the offer is still inside it; the approval it creates is dated then, so it cannot run now (its window has not begun).
    await expect(registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: gate.approval_statement, now: until - 1 })).resolves.toMatchObject({ status: "REGISTERED" });
    expect(validP07Checkpoint(await readJson(join(s.base, "p07-checkpoint.json")))).toBe(false);
  });
  it.each([
    ["the stored request hash", { request_sha256: "a".repeat(64) }], ["the stored terms digest", { terms_sha256: "b".repeat(64) }], ["the stored identity review hash", { signal_review_sha256: "c".repeat(64) }],
    ["the offer's deadline", { approve_before: new Date(Date.now() + 400 * HOUR).toISOString() }], ["its own identity", { attempt_id: randomUUID() }], ["an extra field", { extra: true }],
  ])("a proposal edited after printing (%s) can no longer be approved", async (_, change) => {
    const s = await ready(); const gate = await prepareP07Gate(s.root); const file = proposalPath(s, gate.attempt_id); const stored = await readJson(file);
    await writeFile(file, JSON.stringify({ ...stored, ...change }));
    await expect(registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: gate.approval_statement })).rejects.toThrow("P07_APPROVAL_REGISTRATION_FAILED");
    expect(await noP07Files(s.base)).toEqual([]);
    await writeFile(file, JSON.stringify(stored)); // putting the proposal back makes the same sentence valid again
    await expect(registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: gate.approval_statement })).resolves.toMatchObject({ status: "REGISTERED" });
  });
  it("evidence that drifts after the gate was printed voids the sentence, even by one byte", async () => {
    const s = await ready(); const gate = await prepareP07Gate(s.root); const review = join(s.base, "p05-radiohead-identity.private.json");
    const good = await readFile(review); await writeFile(review, Buffer.concat([good, Buffer.from("\n")]));
    await expect(registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: gate.approval_statement })).rejects.toThrow("P07_APPROVAL_REGISTRATION_FAILED");
    expect(await noP07Files(s.base)).toEqual([]);
    await writeFile(review, good); await expect(registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: gate.approval_statement })).resolves.toMatchObject({ status: "REGISTERED" });
  });
  it("an earlier probe becoming unsettled between the gate and the approval voids the sentence", async () => {
    const s = await ready(); const gate = await prepareP07Gate(s.root); await rm(join(s.base, "p03r/attempts"), { recursive: true, force: true });
    await expect(registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: gate.approval_statement })).rejects.toThrow(); expect(await noP07Files(s.base)).toEqual([]);
  });
  it("tracks the whole lifecycle with a public-safe state", async () => {
    const s = await ready(); expect(await inspectP07State(s.root)).toMatchObject({ state: "NO_GATE", attempt_id: null, ledger: { reserved_attempts: 0 } });
    const gate = await prepareP07Gate(s.root); expect((await inspectP07State(s.root)).state).toBe("GATE_OPEN_AWAITING_APPROVAL");
    await registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: gate.approval_statement }); expect((await inspectP07State(s.root)).state).toBe("APPROVAL_REGISTERED_NOT_EXECUTED");
    const checkpoint = P07CheckpointSchema.parse(await readJson(join(s.base, "p07-checkpoint.json")));
    await createLocalRawProbeRunner("P07", config(), local(async () => Response.json({ authored: true })), createPrivateProbeStore(s.root, "P07", checkpoint, null, s.signal), s.signal).run({ checkpoint });
    const state = await inspectP07State(s.root); expect(state).toMatchObject({ state: "EXECUTED_ONCE_OR_INTERRUPTED", attempt_id: gate.attempt_id, ledger: { reserved_attempts: 1, recorded_dispatches: 1, unresolved_attempts: 0 } });
    const printed = JSON.stringify(state); expect(HEX64.test(printed)).toBe(false); expect(printed).not.toContain(AUTH.artist);
  });
});

describe("P07 consent is re-verified at execution (fail closed)", () => {
  it.each([
    ["the receipt is missing", async (a: Awaited<ReturnType<typeof approved>>) => { await unlink(join(a.base, `p07-approval-receipt-${a.gate.attempt_id}.json`)); }],
    ["the receipt's reply is not the sentence", async (a: Awaited<ReturnType<typeof approved>>) => { const p = join(a.base, `p07-approval-receipt-${a.gate.attempt_id}.json`); await writeFile(p, JSON.stringify({ ...await readJson(p), owner_reply: "I do not approve P07." })); }],
    ["the receipt names another request", async (a: Awaited<ReturnType<typeof approved>>) => { const p = join(a.base, `p07-approval-receipt-${a.gate.attempt_id}.json`); await writeFile(p, JSON.stringify({ ...await readJson(p), request_sha256: "d".repeat(64) })); }],
    ["the offer was never consumed", async (a: Awaited<ReturnType<typeof approved>>) => { await unlink(proposalPath(a, a.gate.attempt_id, "consumed.json")); }],
    ["the proposal is gone", async (a: Awaited<ReturnType<typeof approved>>) => { await unlink(proposalPath(a, a.gate.attempt_id)); }],
    ["the proposal's terms were edited", async (a: Awaited<ReturnType<typeof approved>>) => { const p = proposalPath(a, a.gate.attempt_id); await writeFile(p, JSON.stringify({ ...await readJson(p), request_sha256: "e".repeat(64) })); }],
    ["the owner withdrew the approval", async (a: Awaited<ReturnType<typeof approved>>) => { await withdrawP07Gate(a.root, { proposalId: a.gate.attempt_id }); }],
  ])("blocks the reservation and the CLI path when %s, and no attempt is created", async (_, damage) => {
    const a = await approved(); await damage(a);
    expect(await verifyP07Consent(a.root, a.checkpoint, a.signal)).toBe(false);
    await expect(createPrivateProbeStore(a.root, "P07", a.checkpoint, null, a.signal).reserve()).rejects.toThrow();
    const summary = await liveProbeFromPrivateCheckpoint(a.root, "P07"); expect(summary).toMatchObject({ status: "BLOCKED", dispatches: 0 });
    expect(await readdir(join(a.base, "p07/attempts"))).toEqual([]);
  });
  it("a hand-written checkpoint with no consent behind it cannot run", async () => {
    const s = await ready(); const gate = await prepareP07Gate(s.root);
    const donor = await approved(); const forged = { ...donor.checkpoint, attempt_id: gate.attempt_id, consent_proposal_id: gate.attempt_id };
    expect(await verifyP07Consent(s.root, forged, s.signal)).toBe(false);
    await expect(createPrivateProbeStore(s.root, "P07", forged, null, s.signal).reserve()).rejects.toThrow();
  });
});

describe("P07 execution against a local test double", () => {
  it("sends only the exact reviewed request once, preserves UNKNOWN and keeps private IDs out of every output", async () => {
    const a = await approved(); const send = vi.fn(async (_: ProbeRequest) => Response.json({ authored: true })), store = memory();
    const runner = createLocalRawProbeRunner("P07", config(), local(send), store, a.signal);
    const result = await runner.run({ checkpoint: a.checkpoint }); const request = send.mock.calls[0]![0]; const url = new URL(request.url);
    expect(request.url).toBe(p07RequestUrl(AUTH.artist));
    expect(url.origin + url.pathname).toBe("https://hackathon.api.qloo.com/v2/insights");
    expect([...url.searchParams]).toEqual([["filter.type", "urn:entity:place"], ["signal.interests.entities", AUTH.artist], ["filter.location.query", "New York City"], ["filter.location.radius", "0"], ["take", "3"]]);
    expect(request).toMatchObject({ method: "GET", redirect: "error" }); expect(request.url).not.toContain(AUTH.key);
    expect(request.headers["X-Api-Key"]).toBe(AUTH.key); expect(Object.keys(request.headers).sort()).toEqual(["Accept", "X-Api-Key"]);
    expect(result).toMatchObject({ status: "UNKNOWN", reason: "SCHEMA_REVIEW_REQUIRED", semantic_review: "NOT_REVIEWED", dispatches: 1, probe: "P07", schema_revision: "tastegate.raw-probe.v6", transport_settled: true });
    const printed = JSON.stringify(result); for (const secret of [AUTH.artist, AUTH.nyc, AUTH.control, AUTH.key]) expect(printed).not.toContain(secret);
    expect(P07SummarySchema.safeParse({ ...result, status: "PASS" }).success).toBe(false);
    expect((await runner.run({ checkpoint: a.checkpoint })).reason).toBe("CALL_BUDGET_EXHAUSTED"); expect(send).toHaveBeenCalledTimes(1); expect(store.saveRaw).toHaveBeenCalledTimes(1);
  });
  it("reserves in the immutable ledger with its own record version, preserves every historical byte and fences a second dispatch", async () => {
    const a = await approved(); const before = await Promise.all(a.historical.map((f) => readFile(f)));
    const store = createPrivateProbeStore(a.root, "P07", a.checkpoint, null, a.signal);
    const summary = await createLocalRawProbeRunner("P07", config(), local(async () => Response.json({ authored: true })), store, a.signal).run({ checkpoint: a.checkpoint });
    expect(summary).toMatchObject({ dispatches: 1, raw_saved_privately: true });
    const dir = join(a.base, "p07/attempts", a.checkpoint.attempt_id);
    expect((await readdir(dir)).sort()).toEqual(["attempt.json", "response.raw.json", "summary.json"]);
    expect(await readJson(join(dir, "attempt.json"))).toMatchObject({ record_revision: "tastegate.probe-attempt.v6", profile_revision: P07_PROFILE.revision, max_response_bytes: 262144, maximum_dispatches: 1, state: "RESERVED_NO_AUTOMATIC_REPLAY" });
    expect(await inspectPrivateProbeLedger(a.root, "P07")).toMatchObject({ reserved_attempts: 1, recorded_dispatches: 1, unresolved_attempts: 0, last_attempt_id: a.checkpoint.attempt_id });
    await expect(createPrivateProbeStore(a.root, "P07", a.checkpoint, null, a.signal).reserve()).rejects.toThrow();
    await expect(createPrivateProbeStore(a.root, "P07", { ...a.checkpoint, attempt_id: randomUUID(), consent_proposal_id: a.checkpoint.consent_proposal_id }, null, a.signal).reserve()).rejects.toThrow();
    expect(await Promise.all(a.historical.map((f) => readFile(f)))).toEqual(before);
    for (const probe of ["P01", "P02", "P03", "P04", "P03R", "P05", "P06"] as const) {
      const old = await inspectPrivateProbeLedger(a.root, probe);
      await expect(createPrivateProbeStore(a.root, "P07", { ...a.checkpoint, attempt_id: old.last_attempt_id!, consent_proposal_id: old.last_attempt_id! }, null, a.signal).reserve()).rejects.toThrow();
    }
  });
  it.each([
    ["no checkpoint", undefined], ["another artist", { signal_entity_id: "authored-wrong" }], ["another identity review", { signal_review_sha256: "a".repeat(64) }],
    ["another P01 capture", { p01_raw_sha256: "a".repeat(64) }], ["another probe's approval", { approval: "APPROVE_P06_SHORTLIST_RANK_ONLY" }], ["a used attempt count", { prior_reserved_attempts: 1 }],
    ["a larger response budget", { max_response_bytes: 65536 }], ["a longer timeout", { request_timeout_ms: 15000 }], ["an unacknowledged silent ignore", { silent_parameter_ignore_acknowledged: false }],
    ["an unreviewed locality filter", { locality_filter_unverified_acknowledged: false }], ["a consent that is not this attempt's", { consent_proposal_id: randomUUID() }],
    ["P06 not reviewed", { prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P03: 1, P04: 1, P03R: 1, P05: 1, P06: 0 } }], ["an injected field", { injected: true }],
    ["an expired window", { approved_at: "2000-01-01T00:00:00.000Z", approval_expires_at: "2000-01-01T00:01:00.000Z" }],
    ["a window longer than allowed", { approval_expires_at: new Date(Date.now() + 3 * HOUR).toISOString() }],
  ])("rejects %s before reservation", async (_, change) => {
    const a = await approved(); const store = memory(), send = vi.fn(async () => Response.json({ authored: true }));
    const result = await createLocalRawProbeRunner("P07", config(), local(send), store, a.signal).run({ checkpoint: change === undefined ? undefined : { ...a.checkpoint, ...change } });
    expect(result.dispatches).toBe(0); expect(send).not.toHaveBeenCalled(); expect(store.reserve).not.toHaveBeenCalled();
  });
  it("an altered request is refused: a checkpoint whose request hash is not the one rebuilt from the verified artist never sends", async () => {
    const a = await approved(); const store = memory(), send = vi.fn(async () => Response.json({}));
    const altered = { ...a.checkpoint, request_sha256: p07RequestSha256("authored-another-artist") };
    const result = await createLocalRawProbeRunner("P07", config(), local(send), store, a.signal).run({ checkpoint: altered });
    expect(result).toMatchObject({ status: "BLOCKED", reason: "INVALID_PROFILE", dispatches: 0 }); expect(send).not.toHaveBeenCalled(); expect(store.reserve).not.toHaveBeenCalled();
  });
  it("blocks a valid-looking checkpoint when its trusted binding is absent, copied or minted for another probe", async () => {
    const a = await approved(), send = vi.fn(async () => Response.json({})); const other = await inspectAcceptedP06Shortlist(a.root);
    for (const binding of [undefined, { ...a.signal }, other]) {
      const result = await createLocalRawProbeRunner("P07", config(), local(send), memory(), binding as never).run({ checkpoint: a.checkpoint }); expect(result.dispatches).toBe(0);
    }
    expect(send).not.toHaveBeenCalled();
  });
  it.each(["filter.location.geohash", "filter.geocode.name", "filter.location", "signal.location.query", "feature.explainability", "page", "offset", "take2"])("denies unapproved parameter %s", async (name) => {
    const a = await approved(), send = vi.fn(async () => Response.json({}));
    const result = await createLocalRawProbeRunner("P07", config(), local(send), memory(), a.signal).run({ checkpoint: a.checkpoint, profile: { ...P07_PROFILE, params: { ...P07_PROFILE.params, [name]: "authored" } } });
    expect(result.reason).toBe("INVALID_PROFILE"); expect(send).not.toHaveBeenCalled();
  });
  it.each([262144, 262145])("caps the P07 capture at its own bound (%i bytes)", async (size) => {
    const a = await approved(), store = memory(), raw = JSON.stringify({ authored: "x".repeat(size - 15) });
    const result = await createLocalRawProbeRunner("P07", config(), local(async () => new Response(raw, { headers: { "content-type": "application/json" } })), store, a.signal).run({ checkpoint: a.checkpoint });
    expect(result.response_bytes).toBe(size); expect(result.raw_saved_privately).toBe(size === 262144); expect(store.saveRaw).toHaveBeenCalledTimes(size === 262144 ? 1 : 0);
    if (size === 262145) expect(result.reason).toBe("RESPONSE_TOO_LARGE");
  });
  it.each([301, 400, 401, 403, 404, 429, 500, "network"])("stops on %s without retry or unsafe exception logging", async (kind) => {
    const a = await approved(), store = memory();
    const send = vi.fn(async () => { if (typeof kind !== "number") throw new Error(AUTH.key + AUTH.artist); return new Response(AUTH.key + AUTH.artist, { status: kind }); });
    const result = await createLocalRawProbeRunner("P07", config(), local(send), store, a.signal).run({ checkpoint: a.checkpoint });
    expect(send).toHaveBeenCalledTimes(1); expect(store.saveRaw).not.toHaveBeenCalled(); expect(result.status === "BLOCKED").toBe(false);
    for (const secret of [AUTH.key, AUTH.artist]) expect(JSON.stringify(result)).not.toContain(secret);
  });
  it.each([AUTH.key, encodeURIComponent(AUTH.key), Buffer.from(AUTH.key).toString("base64")])("blocks reflected credentials %#", async (value) => {
    const a = await approved(), store = memory();
    const result = await createLocalRawProbeRunner("P07", config(), local(async () => Response.json({ authored: value })), store, a.signal).run({ checkpoint: a.checkpoint });
    expect(result.reason).toBe("CREDENTIAL_REFLECTION"); expect(store.saveRaw).not.toHaveBeenCalled();
  });
  it("rejects a response that is not JSON, not UTF-8 or not labelled as JSON", async () => {
    const a = await approved();
    for (const make of [() => new Response("not json", { headers: { "content-type": "application/json" } }), () => new Response(new Uint8Array([0xff, 0xfe, 0x7b]), { headers: { "content-type": "application/json" } }),
      () => new Response("{}", { headers: { "content-type": "text/html" } })]) {
      const store = memory();
      const result = await createLocalRawProbeRunner("P07", config(), local(async () => make()), store, a.signal).run({ checkpoint: a.checkpoint });
      expect(result.reason).toBe("SCHEMA_MISMATCH"); expect(store.saveRaw).not.toHaveBeenCalled();
    }
  });
  it("keeps timeout, cancellation and the one-in-flight fence", async () => {
    const a = await approved(), send = vi.fn(() => new Promise<Response>(() => {})), store = memory();
    const runner = createLocalRawProbeRunner("P07", config("15"), local(send), store, a.signal);
    expect((await runner.run({ checkpoint: a.checkpoint, signal: AbortSignal.abort() })).dispatches).toBe(0); expect(store.reserve).not.toHaveBeenCalled();
    const first = runner.run({ checkpoint: a.checkpoint }); await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect((await runner.run({ checkpoint: a.checkpoint })).reason).toBe("CONCURRENCY_LIMIT"); expect((await first).reason).toBe("TIMEOUT"); expect(send).toHaveBeenCalledTimes(1);
    const controller = new AbortController(), send2 = vi.fn(() => new Promise<Response>(() => {}));
    const cancelled = createLocalRawProbeRunner("P07", config(), local(send2), memory(), a.signal).run({ checkpoint: a.checkpoint, signal: controller.signal });
    await vi.waitFor(() => expect(send2).toHaveBeenCalled()); controller.abort(); expect((await cancelled).reason).toBe("CANCELLED");
  });
  it("a timed-out attempt still consumes the ledger slot and can never be replayed", async () => {
    const a = await approved(); const store = createPrivateProbeStore(a.root, "P07", a.checkpoint, null, a.signal);
    const result = await createLocalRawProbeRunner("P07", config("15"), local(() => new Promise<Response>(() => {})), store, a.signal).run({ checkpoint: a.checkpoint });
    expect(result).toMatchObject({ status: "UNKNOWN", reason: "TIMEOUT", dispatches: 1, transport_settled: false });
    // The request never settled, so the durable lock stays: the ledger itself refuses to be read as clean until a human reviews it.
    await expect(inspectPrivateProbeLedger(a.root, "P07")).rejects.toThrow("LEDGER_BUSY_OR_REVIEW_REQUIRED");
    await expect(createPrivateProbeStore(a.root, "P07", a.checkpoint, null, a.signal).reserve()).rejects.toThrow();
    await expect(prepareP07Gate(a.root)).rejects.toThrow("P07_GATE_PREPARATION_FAILED");
    expect((await readdir(join(a.base, "p07/attempts", a.checkpoint.attempt_id))).sort()).toEqual(["attempt.json", "summary.json"]);
  });
});

async function cliRoot(options: { withProbeCli: boolean }) {
  const s = await ready();
  execFileSync("git", ["init", "--quiet", s.root], { windowsHide: true }); await writeFile(join(s.root, ".gitignore"), ".env*\nprivate/\n.cache/\n");
  await mkdir(join(s.root, "scripts"));
  const scripts = ["qloo-probe-p07-admin.mjs", ...(options.withProbeCli ? ["probe-cli.mjs", "qloo-probe-p07.mjs"] : [])];
  // The admin CLI can never execute anything, and the probe CLI is only ever given a root with NO approval and NO credential-bearing path to run.
  if (options.withProbeCli) await writeFile(join(s.root, ".env.local"), "QLOO_MODE=live\nQLOO_API_KEY=" + AUTH.key + "\n", { mode: 0o600 });
  for (const name of scripts) await copyFile(resolve("scripts", name), join(s.root, "scripts", name));
  for (const name of await readdir(resolve("src/qloo"))) if (name.endsWith(".ts")) { const file = join(s.root, "src/qloo", name); await mkdir(dirname(file), { recursive: true }); await copyFile(resolve("src/qloo", name), file); }
  await writeFile(join(s.root, "package.json"), '{"type":"module"}'); await symlink(resolve("node_modules"), join(s.root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const env = { ...process.env }; for (const k of Object.keys(env)) if (/^(?:QLOO_|NEXT_PUBLIC_QLOO|NODE_DEBUG|NODE_OPTIONS|SSLKEYLOGFILE|NODE_TLS_REJECT_UNAUTHORIZED|TASTEGATE_ADMIN_ROOT)/.test(k)) delete env[k];
  return { ...s, env };
}
describe("P07 command-line entry points", () => {
  it("keeps CLI preview/preflight sanitized and refuses execution without an approval", async () => {
    const s = await cliRoot({ withProbeCli: true });
    for (const args of [[], ["--preflight-p07"], ["--execute-p07"]]) {
      const child = spawnSync(process.execPath, [join(s.root, "scripts/qloo-probe-p07.mjs"), ...args], { cwd: s.root, env: s.env, encoding: "utf8", windowsHide: true });
      expect(child.status).toBe(args[0] === "--execute-p07" ? 2 : 0); const out = child.stdout + child.stderr; expect(() => JSON.parse(child.stdout)).not.toThrow();
      for (const secret of [AUTH.key, AUTH.artist, AUTH.nyc, AUTH.control, s.signal.reviewSha256, s.signal.p01RawSha256]) expect(out).not.toContain(secret);
      if (args[0] === "--preflight-p07") expect(JSON.parse(child.stdout).preflight).toMatchObject({ status: "READY_FOR_HUMAN_APPROVAL", approval: "NOT_GRANTED_BY_PREFLIGHT", dispatches: 0, signal_identity: "ACCEPTED_FOR_P05_ONLY_REVERIFIED" });
      if (args.length === 0) expect(JSON.parse(child.stdout).profile.params["signal.interests.entities"]).toBe("<PRIVATE_REVIEWED_RADIOHEAD_ID>");
    }
    expect((await inspectPrivateProbeLedger(s.root, "P07")).reserved_attempts).toBe(0);
  }, 90_000);
  it("the admin CLI prepares, refuses every reply but the exact sentence, registers once and prints no private value", async () => {
    const s = await cliRoot({ withProbeCli: false }); const admin = join(s.root, "scripts/qloo-probe-p07-admin.mjs");
    const run = (...args: string[]) => spawnSync(process.execPath, [admin, ...args], { cwd: s.root, env: s.env, encoding: "utf8", windowsHide: true });
    for (const args of [[], ["--bogus"], ["--status", "x"], ["--prepare-gate", "--x=1"], ["--register-approval"], [`--register-approval`, "--proposal=x"], ["--withdraw"], ["--register-approval", "--proposal=a", "--owner-reply=b", "--extra=1"]]) {
      const bad = run(...args); expect(bad.status).toBe(2); expect(bad.stdout).toBe(""); expect(JSON.parse(bad.stderr)).toEqual({ status: "BLOCKED", reason: "INVALID_ARGUMENTS" });
    }
    expect(JSON.parse(run("--status").stdout)).toMatchObject({ state: "NO_GATE" });
    const prepared = run("--prepare-gate"); expect(prepared.status).toBe(0); const gate = JSON.parse(prepared.stdout) as { attempt_id: string; approval_statement: string };
    for (const secret of [AUTH.key, AUTH.artist, AUTH.nyc, AUTH.control]) expect(prepared.stdout + prepared.stderr).not.toContain(secret);
    expect(run("--prepare-gate").status).toBe(2); // one open offer at a time
    for (const reply of ["I do not approve P07.", "approve P07", "Maybe run P07 later.", "", `${gate.approval_statement} but not yet`]) {
      const refused = run("--register-approval", `--proposal=${gate.attempt_id}`, `--owner-reply=${reply}`);
      expect(refused.status).toBe(2); expect(refused.stdout).toBe(""); expect(JSON.parse(refused.stderr)).toEqual({ status: "BLOCKED", reason: expect.stringMatching(/^(P07_APPROVAL_REGISTRATION_FAILED|INVALID_ARGUMENTS)$/) });
    }
    expect(await noP07Files(s.base)).toEqual([]);
    const ok = run("--register-approval", `--proposal=${gate.attempt_id}`, `--owner-reply=${gate.approval_statement}`); expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ status: "REGISTERED", attempt_id: gate.attempt_id, window_minutes: 5 });
    for (const secret of [AUTH.key, AUTH.artist, AUTH.nyc, AUTH.control]) expect(ok.stdout + ok.stderr).not.toContain(secret);
    expect(ok.stdout).not.toContain("APPROVE"); // the owner's sentence is stored in the private receipt, never echoed
    expect(run("--register-approval", `--proposal=${gate.attempt_id}`, `--owner-reply=${gate.approval_statement}`).status).toBe(2); // single use
    expect(JSON.parse(run("--status").stdout)).toMatchObject({ state: "APPROVAL_REGISTERED_NOT_EXECUTED", attempt_id: gate.attempt_id });
    expect(JSON.parse(run("--withdraw", `--proposal=${gate.attempt_id}`).stdout)).toEqual({ status: "WITHDRAWN" });
    const checkpoint = P07CheckpointSchema.parse(await readJson(join(s.base, "p07-checkpoint.json")));
    expect(await verifyP07Consent(s.root, checkpoint, s.signal)).toBe(false); // revoked before it ran
    const leftovers = (await readdir(join(s.root, ".cache/qloo-probe")).catch(() => [] as string[])).filter((n) => n.startsWith("p07-admin-")); expect(leftovers).toEqual([]);
  }, 120_000);
});
