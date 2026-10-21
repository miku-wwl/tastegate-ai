import https from "node:https";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { P06_PROFILE, P06CheckpointSchema, P06ProfileSchema, P06SummarySchema, SAVED_P03R_ATTEMPT, SAVED_P05_ATTEMPT, validP06Checkpoint } from "../src/qloo/p06-profile";
import { SAVED_P01_ATTEMPT } from "../src/qloo/p02-profile";
import { buildP06ShortlistReview, deriveP06Shortlist, inspectAcceptedP06Shortlist, matchesP06Shortlist } from "../src/qloo/p06-shortlist";
import { prepareP06ShortlistReview, registerP06Approval } from "../src/qloo/p06-approval";
import { probeDefinition } from "../src/qloo/probe-definitions";
import { createLocalRawProbeRunner, type ProbeRequest, type ProbeStore } from "../src/qloo/raw-probe-runner";
import { createPrivateProbeStore, inspectPrivateProbeLedger } from "../src/qloo/raw-probe-store";
import { QlooServerConfig } from "../src/qloo/server-config";
import { AUTH, controlBody, nycBody, seedP06 } from "./helpers/p06-root";

// Entirely authored data and local test doubles: no Qloo request, no real credential, no captured provider data.
const roots: string[] = [];
const memory = () => ({ reserve: vi.fn(async () => {}), saveRaw: vi.fn(async (_: Uint8Array) => {}), saveSummary: vi.fn(async (_: unknown) => {}) } satisfies ProbeStore);
const config = (ms = "4000") => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: AUTH.key, QLOO_REQUEST_TIMEOUT_MS: ms });
const local = (send: (r: ProbeRequest) => Promise<Response>) => ({ kind: "local-test-double" as const, send });
async function ready(options?: Parameters<typeof seedP06>[0]) {
  const s = await seedP06(options); roots.push(s.root);
  await prepareP06ShortlistReview(s.root);
  return { ...s, binding: await inspectAcceptedP06Shortlist(s.root) };
}
let previousArgs: string[];
beforeEach(() => { previousArgs = process.execArgv; process.execArgv = [];
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network")); vi.spyOn(https, "request").mockImplementation(() => { throw new Error("No network"); }); });
afterEach(() => { process.execArgv = previousArgs; expect(globalThis.fetch).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
afterAll(async () => { for (const root of roots) await rm(root, { recursive: true, force: true }); });

it("is a closed registry entry: P06 is executable, P08-P10 and arbitrary hosts are not", () => {
  expect(probeDefinition("P06").profile.revision).toBe(P06_PROFILE.revision);
  for (const id of ["P08", "P09", "P10", "https://example.test"]) expect(() => probeDefinition(id as never)).toThrow("PROBE_NOT_EXECUTABLE");
});
it("derives the shortlist only from manifest-verified immutable captures and needs the private review", async () => {
  const s = await seedP06(); roots.push(s.root);
  await expect(inspectAcceptedP06Shortlist(s.root)).rejects.toThrow("P06_SHORTLIST_REVIEW_REQUIRED");
  const derived = await deriveP06Shortlist(s.root);
  expect(derived.nyc.entityId).toBe(AUTH.nyc); expect(derived.control.entityId).toBe(AUTH.control); expect(derived.signal.entityId).toBe(AUTH.artist);
  await expect(prepareP06ShortlistReview(s.root)).resolves.toEqual({ status: "CREATED" });
  await expect(prepareP06ShortlistReview(s.root)).rejects.toThrow("P06_REVIEW_PREPARATION_FAILED"); // exclusive: never overwritten
  const binding = await inspectAcceptedP06Shortlist(s.root);
  expect(binding).toMatchObject({ signalEntityId: AUTH.artist, nycEntityId: AUTH.nyc, controlEntityId: AUTH.control });
  expect(matchesP06Shortlist(await s.checkpoint(), { ...binding })).toBe(false); // a copied object is not a trusted binding
  expect(matchesP06Shortlist(await s.checkpoint(), binding)).toBe(true);
});
it.each([
  ["a body the manifest does not cover (not NYC)", { nycBody: { results: [{ ...nycBody().results[0], properties: { geocode: { city: "Authored City", country_code: "US" } } }] } }],
  ["a non-US geocode on the NYC candidate", { nycBody: { results: [{ ...nycBody().results[0], properties: { geocode: { city: "New York", country_code: "GB" } } }] } }],
  ["a non-place NYC candidate", { nycBody: { results: [{ ...nycBody().results[0], types: ["urn:entity:brand"] }] } }],
  ["two NYC candidates", { nycBody: { results: [nycBody().results[0], nycBody().results[0]] } }],
  ["a control with the wrong subtype", { controlBody: { ...controlBody(), results: { entities: [{ ...controlBody().results.entities[0], subtype: "urn:entity:brand" }] } } }],
  ["a control whose type was relabelled", { controlBody: { ...controlBody(), results: { entities: [{ ...controlBody().results.entities[0], type: "urn:entity:place" }] } } }],
  ["a control equal to the NYC candidate", { controlBody: { ...controlBody(), results: { entities: [{ ...controlBody().results.entities[0], entity_id: AUTH.nyc }] } } }],
  ["a control equal to the signal", { controlBody: { ...controlBody(), results: { entities: [{ ...controlBody().results.entities[0], entity_id: AUTH.artist }] } } }],
  ["an ID containing a comma", { controlBody: { ...controlBody(), results: { entities: [{ ...controlBody().results.entities[0], entity_id: "a,b" }] } } }],
  ["a P05 capture missing from its manifest", { skipManifestFor: `private/qloo-probes/p05/attempts/${SAVED_P05_ATTEMPT}/response.raw.json` }],
])("refuses to derive a shortlist from %s", async (_, options) => {
  const s = await seedP06(options); roots.push(s.root);
  await expect(deriveP06Shortlist(s.root)).rejects.toThrow("P06_SHORTLIST_REVIEW_REQUIRED");
  await expect(prepareP06ShortlistReview(s.root)).rejects.toThrow("P06_REVIEW_PREPARATION_FAILED");
});
it("detects any change to a verified capture after review, even a single byte", async () => {
  const s = await ready(); const file = join(s.base, "p03r/attempts", SAVED_P03R_ATTEMPT, "response.raw.json");
  await writeFile(file, Buffer.from(JSON.stringify({ ...nycBody(), extra: true })));
  await expect(inspectAcceptedP06Shortlist(s.root)).rejects.toThrow("P06_SHORTLIST_REVIEW_REQUIRED");
});
it.each(["swap", "wrong-hash", "extra-key", "wrong-scope", "unknown-decision"])("rejects a private review that differs from its derivation (%s)", async (mode) => {
  const s = await ready(); const path = join(s.base, "p06-shortlist-review.private.json"); const review = JSON.parse(await readFile(path, "utf8"));
  if (mode === "swap") [review.reviewed_nyc_candidate.entity_id, review.positive_control.entity_id] = [review.positive_control.entity_id, review.reviewed_nyc_candidate.entity_id];
  if (mode === "wrong-hash") review.reviewed_nyc_candidate.source_raw_sha256 = "a".repeat(64);
  if (mode === "extra-key") review.unreviewed = true;
  if (mode === "wrong-scope") review.review_scope = "ANYTHING";
  if (mode === "unknown-decision") review.decision = "UNKNOWN";
  await writeFile(path, JSON.stringify(review));
  await expect(inspectAcceptedP06Shortlist(s.root)).rejects.toThrow("P06_SHORTLIST_REVIEW_REQUIRED");
});
it("binds consent to the exact fixed profile and a short window", async () => {
  const s = await ready(); const cp = await s.checkpoint(); expect(validP06Checkpoint(cp)).toBe(true);
  for (const change of [{ origin: "https://example.test" }, { path: "/search" }, { max_response_bytes: 999999 }, { method: "POST" },
    { params: { ...P06_PROFILE.params, "filter.type": "urn:entity:movie" } }, { params: { ...P06_PROFILE.params, take: "3" } },
    { params: { ...P06_PROFILE.params, "filter.results.entities": "authored-a,authored-b" } }, { params: { ...P06_PROFILE.params, "filter.location.query": "New York" } }])
    expect(P06ProfileSchema.safeParse({ ...P06_PROFILE, ...change }).success).toBe(false);
  expect(validP06Checkpoint({ ...cp, approval_expires_at: new Date(Date.now() + 60 * 60_000).toISOString() })).toBe(false);
  expect(validP06Checkpoint({ ...cp, approved_at: "2000-01-01T00:00:00.000Z", approval_expires_at: "2000-01-01T00:01:00.000Z" })).toBe(false);
  expect(validP06Checkpoint({ ...cp, prior_reserved_attempts: 1 })).toBe(false);
  expect(validP06Checkpoint({ ...cp, approval: "APPROVE_P05_RADIOHEAD_TO_PLACE_ONLY" })).toBe(false);
  expect(validP06Checkpoint({ ...cp, shortlist_entity_ids: [AUTH.nyc, AUTH.nyc] })).toBe(false);
  expect(validP06Checkpoint({ ...cp, shortlist_entity_ids: [AUTH.nyc, AUTH.artist] })).toBe(false);
  expect(P06CheckpointSchema.safeParse({ ...cp, shortlist_entity_ids: [AUTH.nyc, AUTH.control, "third"] }).success).toBe(false);
  expect(P06CheckpointSchema.safeParse({ ...cp, injected: true }).success).toBe(false);
});
it.each([undefined, { signal_entity_id: "authored-wrong" }, { signal_review_sha256: "a".repeat(64) }, { shortlist_review_sha256: "b".repeat(64) },
  { approval: "APPROVE_P01_ONLY" }, { prior_reserved_attempts: 1 }, { max_response_bytes: 65536 }, { shortlist_entity_ids: ["authored-x", AUTH.control] },
  { shortlist_entity_ids: [AUTH.control, AUTH.nyc] }, { shortlist_semantics_unverified_acknowledged: false }])("rejects missing/wrong consent %# before reservation", async (change) => {
  const s = await ready(), store = memory(), send = vi.fn(async () => Response.json({ authored: true }));
  const result = await createLocalRawProbeRunner("P06", config(), local(send), store, s.binding).run({ checkpoint: change === undefined ? undefined : await s.checkpoint(change) });
  expect(result.dispatches).toBe(0); expect(send).not.toHaveBeenCalled(); expect(store.reserve).not.toHaveBeenCalled();
});
it("blocks a valid-looking checkpoint when its trusted binding is absent, copied or belongs to another probe", async () => {
  const s = await ready(), send = vi.fn(async () => Response.json({}));
  for (const binding of [undefined, { ...s.binding }, s.signal]) {
    const result = await createLocalRawProbeRunner("P06", config(), local(send), memory(), binding as never).run({ checkpoint: await s.checkpoint() });
    expect(result.dispatches).toBe(0);
  }
  expect(send).not.toHaveBeenCalled();
});
it.each(["filter.location.query", "filter.geocode.name", "feature.explainability", "signal.interests.tags", "filter.tags", "page", "offset", "sort_by", "take2"])("denies unapproved parameter %s", async (name) => {
  const s = await ready(), send = vi.fn(async () => Response.json({}));
  const result = await createLocalRawProbeRunner("P06", config(), local(send), memory(), s.binding)
    .run({ checkpoint: await s.checkpoint(), profile: { ...P06_PROFILE, params: { ...P06_PROFILE.params, [name]: "authored" } } });
  expect(result.reason).toBe("INVALID_PROFILE"); expect(send).not.toHaveBeenCalled();
});
it("sends only the exact reviewed request once, preserves UNKNOWN and keeps private IDs out of every output", async () => {
  const s = await ready(), send = vi.fn(async (_: ProbeRequest) => Response.json({ authored: true })), store = memory();
  const runner = createLocalRawProbeRunner("P06", config(), local(send), store, s.binding), cp = await s.checkpoint();
  const result = await runner.run({ checkpoint: cp }); const request = send.mock.calls[0]![0]; const url = new URL(request.url);
  expect(url.origin + url.pathname).toBe("https://hackathon.api.qloo.com/v2/insights");
  expect([...url.searchParams]).toEqual([["filter.type", "urn:entity:place"], ["signal.interests.entities", AUTH.artist],
    ["filter.results.entities", `${AUTH.nyc},${AUTH.control}`], ["take", "2"]]);
  expect(request).toMatchObject({ method: "GET", redirect: "error" }); expect(request.url).not.toContain(AUTH.key);
  expect(result).toMatchObject({ status: "UNKNOWN", reason: "SCHEMA_REVIEW_REQUIRED", semantic_review: "NOT_REVIEWED", dispatches: 1, schema_revision: "tastegate.raw-probe.v5" });
  const printed = JSON.stringify(result); for (const secret of [AUTH.artist, AUTH.nyc, AUTH.control, AUTH.key]) expect(printed).not.toContain(secret);
  expect(P06SummarySchema.safeParse({ ...result, status: "PASS" }).success).toBe(false);
  expect((await runner.run({ checkpoint: cp })).reason).toBe("CALL_BUDGET_EXHAUSTED"); expect(send).toHaveBeenCalledTimes(1);
  expect(store.saveRaw).toHaveBeenCalledTimes(1);
});
it.each([262144, 262145])("caps the P06 capture at its own bound (%i bytes)", async (size) => {
  const s = await ready(), store = memory(), raw = JSON.stringify({ authored: "x".repeat(size - 15) });
  const result = await createLocalRawProbeRunner("P06", config(), local(async () => new Response(raw, { headers: { "content-type": "application/json" } })), store, s.binding).run({ checkpoint: await s.checkpoint() });
  expect(result.response_bytes).toBe(size); expect(result.raw_saved_privately).toBe(size === 262144); expect(store.saveRaw).toHaveBeenCalledTimes(size === 262144 ? 1 : 0);
});
it.each([301, 403, 429, 500, "network"])("stops on %s without retry or unsafe exception logging", async (kind) => {
  const s = await ready(), store = memory();
  const send = vi.fn(async () => { if (typeof kind !== "number") throw new Error(AUTH.key + AUTH.nyc); return new Response(AUTH.key + AUTH.nyc, { status: kind }); });
  const result = await createLocalRawProbeRunner("P06", config(), local(send), store, s.binding).run({ checkpoint: await s.checkpoint() });
  expect(send).toHaveBeenCalledTimes(1); expect(store.saveRaw).not.toHaveBeenCalled();
  for (const secret of [AUTH.key, AUTH.nyc]) expect(JSON.stringify(result)).not.toContain(secret);
});
it.each([AUTH.key, encodeURIComponent(AUTH.key), Buffer.from(AUTH.key).toString("base64")])("blocks reflected credentials %#", async (value) => {
  const s = await ready(), store = memory();
  const result = await createLocalRawProbeRunner("P06", config(), local(async () => Response.json({ authored: value })), store, s.binding).run({ checkpoint: await s.checkpoint() });
  expect(result.reason).toBe("CREDENTIAL_REFLECTION"); expect(store.saveRaw).not.toHaveBeenCalled();
});
it("keeps timeout, cancellation and the one-in-flight fence", async () => {
  const s = await ready(), send = vi.fn(() => new Promise<Response>(() => {})), store = memory();
  const runner = createLocalRawProbeRunner("P06", config("15"), local(send), store, s.binding);
  expect((await runner.run({ checkpoint: await s.checkpoint(), signal: AbortSignal.abort() })).dispatches).toBe(0); expect(store.reserve).not.toHaveBeenCalled();
  const first = runner.run({ checkpoint: await s.checkpoint() }); await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect((await runner.run({ checkpoint: await s.checkpoint() })).reason).toBe("CONCURRENCY_LIMIT"); expect((await first).reason).toBe("TIMEOUT"); expect(send).toHaveBeenCalledTimes(1);
  const controller = new AbortController(), send2 = vi.fn(() => new Promise<Response>(() => {}));
  const cancelled = createLocalRawProbeRunner("P06", config(), local(send2), memory(), s.binding).run({ checkpoint: await s.checkpoint(), signal: controller.signal });
  await vi.waitFor(() => expect(send2).toHaveBeenCalled()); controller.abort(); expect((await cancelled).reason).toBe("CANCELLED");
});
it("retains every historical ledger byte, rejects reused IDs and fences a second dispatch", async () => {
  const s = await ready(), before = await Promise.all(s.historicalFiles.map((f) => readFile(f)));
  for (const probe of ["P01", "P02", "P03", "P04", "P03R", "P05"] as const) {
    const old = await inspectPrivateProbeLedger(s.root, probe);
    await expect(createPrivateProbeStore(s.root, "P06", await s.checkpoint({ attempt_id: old.last_attempt_id! }), null, s.binding).reserve()).rejects.toThrow();
  }
  const cp = await s.checkpoint(), store = createPrivateProbeStore(s.root, "P06", cp, null, s.binding);
  await store.reserve();
  const record = JSON.parse(await readFile(join(s.base, "p06/attempts", cp.attempt_id, "attempt.json"), "utf8"));
  expect(record).toMatchObject({ record_revision: "tastegate.probe-attempt.v5", profile_revision: P06_PROFILE.revision, max_response_bytes: 262144 });
  await expect(store.saveRaw(new Uint8Array(262145))).rejects.toThrow();
  const summary = await createLocalRawProbeRunner("P06", config(), local(async () => Response.json({ authored: true })), memory(), s.binding).run({ checkpoint: cp });
  await store.saveSummary(summary); expect((await inspectPrivateProbeLedger(s.root, "P06")).recorded_dispatches).toBe(1);
  await expect(createPrivateProbeStore(s.root, "P06", cp, null, s.binding).reserve()).rejects.toThrow();
  expect(await Promise.all(s.historicalFiles.map((f) => readFile(f)))).toEqual(before);
});
it("rechecks the private review at durable reservation and rejects version relabeling", async () => {
  const s = await ready(), cp = await s.checkpoint(), path = join(s.base, "p06-shortlist-review.private.json"), good = await readFile(path, "utf8");
  await writeFile(path, JSON.stringify({ ...JSON.parse(good), decision: "UNKNOWN" }));
  await expect(createPrivateProbeStore(s.root, "P06", cp, null, s.binding).reserve()).rejects.toThrow();
  expect((await inspectPrivateProbeLedger(s.root, "P06")).reserved_attempts).toBe(0);
  await writeFile(path, good); const store = createPrivateProbeStore(s.root, "P06", cp, null, s.binding); await store.reserve();
  await store.saveSummary(await createLocalRawProbeRunner("P06", config(), local(async () => Response.json({ authored: true })), memory(), s.binding).run({ checkpoint: cp }));
  const file = join(s.base, "p06/attempts", cp.attempt_id, "attempt.json"), record = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...record, record_revision: "tastegate.probe-attempt.v4" }));
  await expect(inspectPrivateProbeLedger(s.root, "P06")).rejects.toThrow("LEDGER_PROFILE_VERSION_MISMATCH");
});
it("refuses to reserve when any earlier probe is unsettled or its review count is wrong", async () => {
  const s = await ready(), cp = await s.checkpoint();
  await expect(createPrivateProbeStore(s.root, "P06", await s.checkpoint({ prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P03: 1, P04: 1, P03R: 1, P05: 0 } }), null, s.binding).reserve()).rejects.toThrow();
  // Removing the immutable P05 summary breaks BOTH the shortlist derivation and the P05 ledger: reservation must fail closed.
  await rm(join(s.base, "p05/attempts", SAVED_P05_ATTEMPT, "summary.json"));
  await expect(createPrivateProbeStore(s.root, "P06", cp, null, s.binding).reserve()).rejects.toThrow();
  // Failing closed before the ledger directory exists is the stricter outcome; either way no attempt was reserved.
  expect(await readdir(join(s.base, "p06/attempts")).catch(() => [] as string[])).toEqual([]);
});

it("the P06 registration path is retired: no reply, however phrased, can register an approval", async () => {
  const s = await ready(), before = await Promise.all(s.historicalFiles.map((f) => readFile(f)));
  await expect(registerP06Approval()).rejects.toThrow("P06_APPROVAL_RETIRED");
  expect((await readdir(s.base)).some((n) => n.startsWith("p06-checkpoint") || n.startsWith("p06-approval-receipt"))).toBe(false);
  expect(await Promise.all(s.historicalFiles.map((f) => readFile(f)))).toEqual(before);
});
it("a checkpoint is still validated, bound to the verified shortlist, and its identities cannot be swapped", async () => {
  const s = await ready(), cp = await s.checkpoint(), now = Date.now();
  expect(validP06Checkpoint(cp, now)).toBe(true); expect(matchesP06Shortlist(cp, s.binding)).toBe(true);
  expect(validP06Checkpoint({ ...cp, max_dispatches: 2 }, now)).toBe(false);
  expect(validP06Checkpoint({ ...cp, shortlist_entity_ids: [cp.shortlist_entity_ids[0], cp.shortlist_entity_ids[0]] }, now)).toBe(false);
  expect(validP06Checkpoint({ ...cp, approval_expires_at: new Date(now - 1000).toISOString() }, now)).toBe(false);
  expect(matchesP06Shortlist({ ...cp, shortlist_entity_ids: [cp.shortlist_entity_ids[1], cp.shortlist_entity_ids[0]] }, s.binding)).toBe(false);
  expect(matchesP06Shortlist({ ...cp, signal_entity_id: AUTH.control }, s.binding)).toBe(false);
});
it("a used P06 ledger is never reopened: a second reservation of the same attempt is refused", async () => {
  const used = await ready(), cp = await used.checkpoint(), store = createPrivateProbeStore(used.root, "P06", cp, null, used.binding); await store.reserve();
  await store.saveSummary(await createLocalRawProbeRunner("P06", config(), local(async () => Response.json({ authored: true })), memory(), used.binding).run({ checkpoint: cp }));
  await expect(createPrivateProbeStore(used.root, "P06", cp, null, used.binding).reserve()).rejects.toThrow();
  await expect(createPrivateProbeStore(used.root, "P06", await used.checkpoint(), null, used.binding).reserve()).rejects.toThrow(); // a fresh attempt id: its approval would have to be re-registered, which is retired
});
it("review content is fully determined by the verified captures", async () => {
  const s = await seedP06(); roots.push(s.root); const review = buildP06ShortlistReview(await deriveP06Shortlist(s.root));
  expect(review).toMatchObject({ decision: "ACCEPTED_FOR_P06_ONLY", reviewed_nyc_candidate: { source_attempt_id: SAVED_P03R_ATTEMPT }, positive_control: { source_attempt_id: SAVED_P05_ATTEMPT } });
  expect(SAVED_P01_ATTEMPT).not.toBe(SAVED_P05_ATTEMPT);
});

async function isolatedCliRoot() {
  const s = await ready();
  execFileSync("git", ["init", "--quiet", s.root], { windowsHide: true }); await writeFile(join(s.root, ".gitignore"), ".env*\nprivate/\n.cache/\n");
  await writeFile(join(s.root, ".env.local"), "QLOO_MODE=live\nQLOO_API_KEY=" + AUTH.key + "\n", { mode: 0o600 });
  await mkdir(join(s.root, "scripts")); for (const name of ["probe-cli.mjs", "qloo-probe-p06.mjs", "qloo-probe-p06-admin.mjs"]) await copyFile(resolve("scripts", name), join(s.root, "scripts", name));
  for (const name of await readdir(resolve("src/qloo"))) if (name.endsWith(".ts")) { const file = join(s.root, "src/qloo", name); await mkdir(dirname(file), { recursive: true }); await copyFile(resolve("src/qloo", name), file); }
  await writeFile(join(s.root, "package.json"), '{"type":"module"}'); await symlink(resolve("node_modules"), join(s.root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const env = { ...process.env }; for (const k of Object.keys(env)) if (/^(?:QLOO_|NEXT_PUBLIC_QLOO|NODE_DEBUG|NODE_OPTIONS|SSLKEYLOGFILE|NODE_TLS_REJECT_UNAUTHORIZED)/.test(k)) delete env[k];
  return { ...s, env };
}
it("keeps CLI preview/preflight sanitized and refuses execution without a P06 checkpoint", async () => {
  const s = await isolatedCliRoot();
  for (const args of [[], ["--preflight-p06"], ["--execute-p06"]]) {
    const child = spawnSync(process.execPath, [join(s.root, "scripts/qloo-probe-p06.mjs"), ...args], { cwd: s.root, env: s.env, encoding: "utf8", windowsHide: true });
    expect(child.status).toBe(args[0] === "--execute-p06" ? 2 : 0); const out = child.stdout + child.stderr; expect(() => JSON.parse(child.stdout)).not.toThrow();
    for (const secret of [AUTH.key, AUTH.artist, AUTH.nyc, AUTH.control, s.binding.shortlistReviewSha256, s.binding.signalReviewSha256]) expect(out).not.toContain(secret);
    if (args[0] === "--preflight-p06") expect(JSON.parse(child.stdout).preflight).toMatchObject({ status: "READY_FOR_HUMAN_APPROVAL", approval: "NOT_GRANTED_BY_PREFLIGHT", dispatches: 0, shortlist_identity: "REVIEWED_FOR_P06_ONLY" });
  }
  expect((await inspectPrivateProbeLedger(s.root, "P06")).reserved_attempts).toBe(0);
}, 60_000);
it("the admin CLI refuses the retired registration mode and malformed arguments, and prints no private value", async () => {
  const s = await isolatedCliRoot(); const admin = join(s.root, "scripts/qloo-probe-p06-admin.mjs");
  const run = (...args: string[]) => spawnSync(process.execPath, [admin, ...args], { cwd: s.root, env: s.env, encoding: "utf8", windowsHide: true });
  for (const args of [[], ["--register-approval"], ["--register-approval", "--owner-reply=approve P06", "--gate-id=g1"], ["--register-approval", "--owner-reply=批准 P06 一次", "--gate-id=g1"], ["--prepare-review", "x"], ["--bogus"]]) {
    const bad = run(...args); expect(bad.status).toBe(2); expect(bad.stdout).toBe("");
    for (const secret of [AUTH.key, AUTH.artist, AUTH.nyc, AUTH.control]) expect(bad.stdout + bad.stderr).not.toContain(secret);
  }
  expect(JSON.parse(run("--register-approval", "--owner-reply=批准 P06 一次", "--gate-id=g1").stderr)).toEqual({ status: "BLOCKED", reason: "P06_APPROVAL_RETIRED" });
  expect((await readdir(s.base)).some((n) => n.startsWith("p06-checkpoint") || n.startsWith("p06-approval-receipt"))).toBe(false);
}, 60_000);
