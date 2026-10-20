import { rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runRecordedAudit } from "../src/audit/workflow";
import type { Confirmation, ProviderAuditReport } from "../src/domain/contracts";
import { ProviderAuditReportSchema } from "../src/domain/report-schema";
import { providerRef } from "../src/qloo/provider-ref";
import { createRecordedAdapter, loadRecordedEvidence, RecordedEvidenceUnavailableError, type VerifiedRecordings } from "../src/qloo/recorded-adapter";
import { RECORDED_INSIGHTS_POLICY, RECORDED_SCENARIO_ID, getRecordedScenarioInput } from "../src/scenarios/recorded-nyc";
import { AUTHORED, P06_ATTEMPT, seedRecordedRoot, type P06SeedOptions, type P06Variant } from "./helpers/recorded-root";

// Authored data only. P06 is a fixed-shortlist ranking: the one request that, once executed and sealed after
// review, lets recorded evidence rank an original recommendation against a discovered candidate in ONE query.
const roots: string[] = [];
const seed = async (p06?: P06SeedOptions, extra: Parameters<typeof seedRecordedRoot>[0] = {}) => { const root = await seedRecordedRoot({ ...extra, p06 }); roots.push(root); return root; };
const ctx = { runId: "authored", callId: "authored", signal: new AbortController().signal };
const ref = (id: string) => providerRef("entity", id);
const select = (target_id: string, id: string, kind: "entity" | "tag" = "entity"): Confirmation => ({ target_id, decision: "select", ref: providerRef(kind, id) });
const confirmed = [select("p1", AUTHORED.artist), select("p2", AUTHORED.film), select("p3", AUTHORED.musicTag, "tag"), select("original-1", AUTHORED.venue)];
beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite")); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
afterAll(async () => { for (const root of roots) await rm(root, { recursive: true, force: true }); });
const rank = (set: VerifiedRecordings, ids = [ref(AUTHORED.venue), ref(AUTHORED.far)], signals = [ref(AUTHORED.artist)], tags: string[] = []) =>
  createRecordedAdapter(set).rankPlaces({ preference_entity_ids: signals, preference_tag_ids: tags, candidate_entity_ids: ids }, ctx);
const audit = async (set: VerifiedRecordings, confirmations: Confirmation[] = confirmed) => runRecordedAudit(getRecordedScenarioInput(), createRecordedAdapter(set),
  { scenarioId: RECORDED_SCENARIO_ID, insightsPolicy: RECORDED_INSIGHTS_POLICY, confirmations });

describe("P06 loading states", () => {
  it("not executed: ranking is unavailable pending approval; everything else is unaffected", async () => {
    const set = await loadRecordedEvidence(await seed());
    expect(set.shortlist).toEqual({ state: "NOT_EXECUTED" }); expect(set.history.some((h) => h.probe === "P06")).toBe(false);
    expect((await rank(set)).snapshot).toMatchObject({ kind: "unavailable", reason: "APPROVAL_REQUIRED" });
  });
  it("executed but not yet reviewed and sealed: degrades ONLY the ranking, and reads nothing from the attempt", async () => {
    const set = await loadRecordedEvidence(await seed({ sealed: false }));
    expect(set.shortlist).toEqual({ state: "REVIEW_REQUIRED" });
    expect(set.history.find((h) => h.probe === "P06")).toEqual({ probe: "P06", attempt_id: P06_ATTEMPT, endpoint: "/v2/insights", recorded_at: null, http_status: null, outcome: "REVIEW_REQUIRED", response_bytes: null });
    expect((await rank(set)).snapshot).toMatchObject({ kind: "unavailable", reason: "REVIEW_REQUIRED" });
    expect(set.searches.size).toBe(3); expect(set.discovery.found).toHaveLength(1);
  });
  it.each<[P06Variant, "ALL_RETURNED" | "PARTIAL"]>([["all", "ALL_RETURNED"], ["partial", "PARTIAL"]])("sealed %s response is replayable as %s", async (variant, klass) => {
    const set = await loadRecordedEvidence(await seed({ variant }));
    expect(set.shortlist).toMatchObject({ state: "READY", class: klass });
    expect(set.history.find((h) => h.probe === "P06")).toMatchObject({ outcome: "REPLAYABLE", http_status: 200, shortlist_class: klass });
    const observed = await rank(set);
    expect(observed.capture).toMatchObject({ probe: "P06", endpoint: "/v2/insights", integrity: "SHA256_MATCHES_PRIVATE_MANIFEST" });
    expect(observed.capture!.request_params["filter.results.entities"]).toBe(`${ref(AUTHORED.venue)},${ref(AUTHORED.far)}`);
    expect(observed.snapshot).toMatchObject({ kind: "rank_places", shortlist_class: klass, explainability: "missing" });
  });
  it.each<[P06Variant, string]>([["unexpected", "UNEXPECTED_ENTITY"], ["non-place", "UNEXPECTED_ENTITY"], ["unscored", "INCOMPATIBLE_SCORES"],
    ["disordered", "INCOMPATIBLE_SCORES"], ["unusable", "RESPONSE_UNUSABLE"]])("sealed %s response is retained as history but never used (%s)", async (variant, reason) => {
    const set = await loadRecordedEvidence(await seed({ variant }));
    expect(set.shortlist).toMatchObject({ state: "UNUSABLE", reason });
    expect(set.history.find((h) => h.probe === "P06")).toMatchObject({ outcome: reason, shortlist_class: reason });
    expect((await rank(set)).snapshot).toMatchObject({ kind: "unavailable", reason });
  });
  it.each([[500, "UPSTREAM_ERROR"], [403, "FORBIDDEN"], [200, "RESPONSE_TOO_LARGE"]])("a failed or oversized P06 (HTTP %i, %s) is recorded as unusable, not as a missing request", async (status, reason) => {
    const set = await loadRecordedEvidence(await seed({ omitRaw: true, summary: { status: "UNKNOWN", reason, http_status: status, raw_saved_privately: false, response_bytes: reason === "RESPONSE_TOO_LARGE" ? 262145 : 0 } }));
    expect(set.shortlist).toMatchObject({ state: "UNUSABLE", reason: "RESPONSE_UNUSABLE" });
    expect(set.history.find((h) => h.probe === "P06")).toMatchObject({ outcome: "RESPONSE_UNUSABLE", http_status: status });
  });
  it("replays a ranking only for the exact recorded signal and shortlist, in any order", async () => {
    const set = await loadRecordedEvidence(await seed({ variant: "all" })); const [a, b] = [ref(AUTHORED.venue), ref(AUTHORED.far)];
    expect((await rank(set, [b, a])).snapshot).toMatchObject({ kind: "rank_places", candidate_entity_ids: [b, a], ordered_entity_ids: [a, b] });
    for (const miss of [await rank(set, [a]), await rank(set, [a, b, ref("authored-extra")]), await rank(set, [a, b], [ref(AUTHORED.otherArtist)]),
      await rank(set, [a, b], [ref(AUTHORED.artist)], [providerRef("tag", AUTHORED.musicTag)]), await rank(set, [a, ref("authored-other")])])
      expect(miss.snapshot).toMatchObject({ kind: "unavailable", reason: "NOT_CAPTURED" });
  });
  it("returns copies, so callers cannot alter the verified recording", async () => {
    const set = await loadRecordedEvidence(await seed({ variant: "all" }));
    const first = await rank(set); if (first.snapshot.kind === "rank_places") first.snapshot.scores![0]!.query_affinity = 0.01;
    const second = await rank(set); expect(second.snapshot.kind === "rank_places" && second.snapshot.scores![0]!.query_affinity).toBe(0.82);
  });
});

describe("P06 sealing and binding fail closed for the whole recorded mode", () => {
  const tamper = (path: string, edit: (text: string) => string) => (files: Map<string, Buffer>) => { files.set(path, Buffer.from(edit(files.get(path)!.toString("utf8")))); };
  const dir = `private/qloo-probes/p06/attempts/${P06_ATTEMPT}`;
  it.each([
    ["a changed raw byte after sealing", { mutate: tamper(`${dir}/response.raw.json`, (t) => t.replace("0.82", "0.99")) }],
    ["a changed summary after sealing", { mutate: tamper(`${dir}/summary.json`, (t) => t.replace('"http_status":200', '"http_status":201')) }],
    ["a changed attempt record after sealing", { mutate: tamper(`${dir}/attempt.json`, (t) => t.replace("tastegate.p06.shortlist-rank.capture-256k.v1", "tastegate.p06.other.v1")) }],
    ["a request bound to different shortlist IDs", { mutate: tamper(`${dir}/attempt.json`, (t) => t.replace(`"shortlist_entity_ids":["${AUTHORED.venue}"`, `"shortlist_entity_ids":["authored-someone-else"`)) }],
    ["a request bound to a different artist signal", { mutate: tamper(`${dir}/attempt.json`, (t) => t.replace(`"signal_entity_id":"${AUTHORED.artist}"`, `"signal_entity_id":"${AUTHORED.otherArtist}"`)) }],
    ["a seal manifest that omits the raw response", { mutate: (files: Map<string, Buffer>) => { const path = "private/qloo-probes/phase2b-p06-execution-review/post-execution-integrity.private.json";
      files.set(path, Buffer.from(JSON.stringify(JSON.parse(files.get(path)!.toString()).filter((e: { path: string }) => !e.path.endsWith("response.raw.json"))))); } }],
  ])("is unavailable on %s, with a fixed error", async (_, extra) => {
    const root = await seedRecordedRoot({ p06: { variant: "all" }, ...extra }); roots.push(root);
    const error = await loadRecordedEvidence(root).catch((e) => e);
    expect(error).toBeInstanceOf(RecordedEvidenceUnavailableError); expect(error.message).toBe("RECORDED_EVIDENCE_UNAVAILABLE");
  });
  it("is unavailable when more than one P06 attempt exists (exactly one approval ever)", async () => {
    await expect(loadRecordedEvidence(await seed({ variant: "all", extraAttempt: true }))).rejects.toBeInstanceOf(RecordedEvidenceUnavailableError);
  });
  it("is unavailable when the response bytes disagree with the immutable summary, even if re-sealed", async () => {
    const root = await seed({ variant: "all", summary: { response_bytes: 9 } });
    await expect(loadRecordedEvidence(root)).rejects.toBeInstanceOf(RecordedEvidenceUnavailableError);
  });
  it("never leaks provider IDs through history or the loaded recording", async () => {
    const set = await loadRecordedEvidence(await seed({ variant: "all" }));
    const text = JSON.stringify({ history: set.history, shortlist: set.shortlist });
    for (const raw of Object.values(AUTHORED)) expect(text).not.toContain(raw);
  });
});

describe("real shortlist evidence changes an audit decision (distinguishable from fixture logic)", () => {
  const venueAudit = (r: ProviderAuditReport) => r.original_audits[0]!;
  it("without P06 the verified venue's taste evidence is unavailable and it stays UNKNOWN", async () => {
    const r = await audit(await loadRecordedEvidence(await seed()));
    expect(venueAudit(r)).toMatchObject({ resolution: "resolved", hard_constraints: "pass", evidence_coverage: "missing", cultural_relevance: null, verdict: "UNKNOWN" });
  });
  it("with a sealed all-returned P06 the same venue gains a real relative rank from one common query: UNKNOWN -> REVIEW", async () => {
    const r = ProviderAuditReportSchema.parse(await audit(await loadRecordedEvidence(await seed({ variant: "all" }))));
    expect(venueAudit(r)).toMatchObject({ resolution: "resolved", hard_constraints: "pass", evidence_coverage: "partial", verdict: "REVIEW", cultural_relevance: { ordinal_rank: 1 } });
    const rankEvidence = r.evidence.find((e) => e.snapshot.kind === "rank_places")!;
    expect(rankEvidence.capture).toMatchObject({ probe: "P06" }); expect(venueAudit(r).cultural_relevance!.query_ref).toBe(rankEvidence.evidence_id);
    // The discovered place sits in the SAME query, so its rank is comparable (it is 2nd) yet its geography still rejects it.
    const repair = r.repairs[0]!;
    expect(repair.revalidation).toMatchObject({ verdict: "BLOCKED", cultural_relevance: { ordinal_rank: 2, query_ref: rankEvidence.evidence_id } });
    expect(repair.accepted).toBe(false);
    expect(r.repair_outcomes).toEqual([{ replaces: "original-2", status: "REPAIR_REJECTED", reason: "REPLACEMENT_FAILED_HARD_CHECK", replacement_candidate_id: repair.replacement_candidate_id }]);
    expect(r.usage).toMatchObject({ qloo_dispatches: 0, adapter_calls: 8, recorded_replays: 6, unavailable_operations: 2, repair_rounds: 1 });
    const text = JSON.stringify(r); for (const raw of Object.values(AUTHORED)) expect(text).not.toContain(raw);
  });
  it("affinity alone approves nothing: a higher-ranked place that violates the city constraint is still rejected", async () => {
    const root = await seed({ body: { success: true, results: { entities: [
      { entity_id: AUTHORED.far, name: "Authored Far Pavilion", type: "urn:entity", subtype: "urn:entity:place", properties: { geocode: { city: "Authored City", country_code: "ES" } }, query: { affinity: 0.95 } },
      { entity_id: AUTHORED.venue, name: "Authored Jazz Room", type: "urn:entity", subtype: "urn:entity:place", properties: { geocode: { city: "New York", country_code: "US" } }, query: { affinity: 0.2 } }] } } });
    const r = await audit(await loadRecordedEvidence(root));
    expect(venueAudit(r)).toMatchObject({ cultural_relevance: { ordinal_rank: 2 }, verdict: "REVIEW" }); // the NYC venue ranks 2nd and is NOT replaced
    expect(r.repairs[0]).toMatchObject({ accepted: false, revalidation: { cultural_relevance: { ordinal_rank: 1 }, verdict: "BLOCKED" } });
    expect(r.final_candidate_ids).toEqual(["original-1"]);
  });
  it("a partial P06 ranks only what came back: omission is never negative evidence", async () => {
    const r = await audit(await loadRecordedEvidence(await seed({ variant: "partial" })));
    expect(venueAudit(r)).toMatchObject({ evidence_coverage: "missing", cultural_relevance: null, verdict: "UNKNOWN" });
    expect(r.repairs[0]!.revalidation.cultural_relevance).toMatchObject({ ordinal_rank: 1 });
  });
  it.each<[P06Variant, string]>([["unexpected", "UNEXPECTED_ENTITY"], ["unscored", "INCOMPATIBLE_SCORES"], ["disordered", "INCOMPATIBLE_SCORES"], ["unusable", "RESPONSE_UNUSABLE"]])(
    "a %s P06 changes nothing and says exactly why (%s)", async (variant, reason) => {
      const r = ProviderAuditReportSchema.parse(await audit(await loadRecordedEvidence(await seed({ variant }))));
      expect(venueAudit(r)).toMatchObject({ evidence_coverage: "missing", verdict: "UNKNOWN" });
      const unavailable = r.evidence.map((e) => e.snapshot).find((s) => s.kind === "unavailable" && s.request.operation === "rank_places");
      expect(unavailable).toMatchObject({ kind: "unavailable", reason });
    });
  it("an unsealed P06 changes nothing, and says it needs review", async () => {
    const r = await audit(await loadRecordedEvidence(await seed({ variant: "all", sealed: false })));
    expect(venueAudit(r).verdict).toBe("UNKNOWN");
    expect(r.evidence.map((e) => e.snapshot).find((s) => s.kind === "unavailable" && s.request.operation === "rank_places")).toMatchObject({ reason: "REVIEW_REQUIRED" });
  });
  it("tampering with a provider ranking in a finished report is rejected", async () => {
    const base = await audit(await loadRecordedEvidence(await seed({ variant: "all" })));
    const edit = (change: (r: ProviderAuditReport) => void) => { const r = structuredClone(base); change(r); return ProviderAuditReportSchema.safeParse(r).success; };
    const rankIndex = base.evidence.findIndex((e) => e.snapshot.kind === "rank_places");
    expect(ProviderAuditReportSchema.safeParse(structuredClone(base)).success).toBe(true);
    expect(edit((r) => { const s = r.evidence[rankIndex]!.snapshot; if (s.kind === "rank_places") s.scores![0]!.query_affinity = 0.1; })).toBe(false); // order contradicts scores
    expect(edit((r) => { const s = r.evidence[rankIndex]!.snapshot; if (s.kind === "rank_places") s.shortlist_class = "PARTIAL"; })).toBe(false);
    expect(edit((r) => { const s = r.evidence[rankIndex]!.snapshot; if (s.kind === "rank_places") delete s.scores; })).toBe(false);
    expect(edit((r) => { r.original_audits[0]!.cultural_relevance = null; })).toBe(false); // a returned ranking cannot be ignored
    expect(edit((r) => { r.evidence[rankIndex]!.capture!.probe = "LIVE"; })).toBe(false);
  });
});
void writeFile; void join; void readFile;
