import { rm } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAudit, runRecordedAudit, type AuditOptions } from "../src/audit/workflow";
import { digest, type AuditReport, type Confirmation, type ProviderAuditReport } from "../src/domain/contracts";
import { AuditReportSchema, ProviderAuditReportSchema } from "../src/domain/report-schema";
import { getScenario, type ScenarioId } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";
import { providerRef } from "../src/qloo/provider-ref";
import { createRecordedAdapter, loadRecordedEvidence } from "../src/qloo/recorded-adapter";
import { RECORDED_INSIGHTS_POLICY, RECORDED_SCENARIO_ID, getRecordedScenarioInput } from "../src/scenarios/recorded-nyc";
import { AUTHORED, authoredBodies, seedRecordedRoot } from "./helpers/recorded-root";

beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite")); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); });

const fixture = async (id: ScenarioId, edit?: (s: ReturnType<typeof getScenario>) => void, options?: AuditOptions) => {
  const s = getScenario(id); edit?.(s); return runAudit(s.input, createFixtureAdapter(s.world), options);
};
const outcomes = (r: AuditReport | ProviderAuditReport) => r.repair_outcomes.map((o) => [o.replaces, o.status, o.reason]);

describe("one common-set ranking and per-slot repair outcomes (synthetic fixtures)", () => {
  it("discovers first, then ranks originals and proposals together in ONE query so evidence is comparable", async () => {
    const r = await fixture("nyc-evening");
    const kinds = r.evidence.map((e) => e.snapshot.kind);
    expect(kinds.filter((k) => k === "rank_places")).toHaveLength(1);
    expect(kinds.indexOf("discover_places")).toBeLessThan(kinds.indexOf("rank_places"));
    const rank = r.evidence.find((e) => e.snapshot.kind === "rank_places")!;
    if (rank.snapshot.kind !== "rank_places") throw new Error("unreachable");
    expect(rank.snapshot.candidate_entity_ids).toEqual(expect.arrayContaining(["synthetic:place-1", "synthetic:place-2", "synthetic:place-4"]));
    // The original and its replacement cite the SAME ranking query.
    expect(r.original_audits[0]!.cultural_relevance!.query_ref).toBe(rank.evidence_id);
    expect(r.repairs[0]!.revalidation.cultural_relevance!.query_ref).toBe(rank.evidence_id);
    expect(r.trace.filter((t) => t.call_id).map((t) => t.state)).toEqual(["Resolve", "Resolve", "Resolve", "Resolve", "Resolve", "Resolve", "Retrieve", "Retrieve", "Revalidate"]);
  });
  it.each<[ScenarioId, Array<[string, string, string]>]>([
    ["nyc-evening", [["original-2", "REPAIR_VERIFIED", "REPLACEMENT_VERIFIED"], ["original-3", "REPAIR_UNAVAILABLE", "DISCOVERY_EMPTY"]]],
    ["wrong-city-repair", [["original-2", "REPAIR_VERIFIED", "REPLACEMENT_VERIFIED"]]],
    ["repair-fails", [["original-2", "REPAIR_REJECTED", "REPLACEMENT_FAILED_HARD_CHECK"]]],
    ["unresolved-only", [["original-3", "REPAIR_UNAVAILABLE", "DISCOVERY_EMPTY"]]],
    ["valid-only", []], ["missing-evidence", []],
  ])("%s reports exactly these slot outcomes", async (id, expected) => {
    const r = AuditReportSchema.parse(await fixture(id)); expect(outcomes(r)).toEqual(expected);
  });
  it("missing taste evidence is never a repair target and never triggers a discovery call", async () => {
    const s = getScenario("missing-evidence"); const base = createFixtureAdapter(s.world); const discover = vi.fn(base.discoverPlaces);
    const r = await runAudit(s.input, { ...base, discoverPlaces: discover });
    expect(r.original_audits[0]).toMatchObject({ resolution: "resolved", hard_constraints: "pass", evidence_coverage: "missing", verdict: "UNKNOWN" });
    expect(discover).not.toHaveBeenCalled(); expect(r.repair_outcomes).toEqual([]);
  });
  it("a correct-city replacement is not rejected because the ranking omitted it; discovery order carries the evidence", async () => {
    const r = await fixture("wrong-city-repair", (s) => { s.world.rankOrder = ["synthetic:place-2"]; });
    const repair = r.repairs[0]!; const discovery = r.evidence.find((e) => e.snapshot.kind === "discover_places")!;
    expect(repair).toMatchObject({ accepted: true, identity_basis: "independent_lookup" });
    expect(repair.revalidation.cultural_relevance).toEqual({ query_ref: discovery.evidence_id, ordinal_rank: 1 });
    expect(repair.revalidation.findings).toContainEqual(expect.objectContaining({ code: "TASTE_EVIDENCE_PRESENT", evidence_refs: [discovery.evidence_id] }));
    expect(outcomes(r)).toEqual([["original-2", "REPAIR_VERIFIED", "REPLACEMENT_VERIFIED"]]);
  });
  it("a ranking that returns the replacement always takes precedence over discovery order", async () => {
    const r = await fixture("wrong-city-repair");
    expect(r.repairs[0]!.revalidation.cultural_relevance!.query_ref).toBe(r.evidence.find((e) => e.snapshot.kind === "rank_places")!.evidence_id);
  });
  it("an explicit count violation is reported as not repairable by swapping venues", async () => {
    const r = await fixture("nyc-evening", (s) => { s.input.constraints.find((c) => c.kind === "max_items")!.value = 2; });
    // Every slot is BLOCKED by the count failure (in audit order); swapping venues cannot shrink the list.
    expect(outcomes(r)).toEqual([["original-1", "REPAIR_UNAVAILABLE", "COUNT_CONSTRAINT_NOT_REPAIRABLE"], ["original-2", "REPAIR_UNAVAILABLE", "COUNT_CONSTRAINT_NOT_REPAIRABLE"], ["original-3", "REPAIR_UNAVAILABLE", "COUNT_CONSTRAINT_NOT_REPAIRABLE"]]);
  });
  it("a host that disables repair gets REPAIR_DISABLED, not a hidden success", async () => {
    const r = await fixture("wrong-city-repair", undefined, { maxRepairRounds: 0 });
    expect(outcomes(r)).toEqual([["original-2", "REPAIR_UNAVAILABLE", "REPAIR_DISABLED"]]); expect(r.repairs).toEqual([]); expect(r.usage.repair_rounds).toBe(0);
  });
  it.each([[5, "CALL_BUDGET_EXHAUSTED"], [6, "CALL_BUDGET_EXHAUSTED"]])("a %i-call budget that cannot fit discovery, ranking and a lookup is UNKNOWN (%s), not unavailable", async (maxCalls, reason) => {
    const r = await fixture("wrong-city-repair", undefined, { maxCalls });
    expect(r.stop_reason).toBe("CALL_BUDGET_EXHAUSTED"); expect(outcomes(r)).toEqual([["original-2", "UNKNOWN", reason]]); expect(r.repairs.every((x) => !x.accepted)).toBe(true);
  });
  it("cancellation and timeouts leave repair UNKNOWN with the workflow stopped", async () => {
    const controller = new AbortController(); controller.abort();
    const r = await fixture("wrong-city-repair", undefined, { signal: controller.signal });
    expect(r.stop_reason).toBe("CANCELLED"); expect(outcomes(r)).toEqual([["original-2", "UNKNOWN", "WORKFLOW_STOPPED"]]);
  });
  it("an independent lookup that names a different identity is an integrity rejection, not a pass", async () => {
    const s = getScenario("wrong-city-repair"); const base = createFixtureAdapter(s.world);
    const r = await runAudit(s.input, { ...base, async searchEntity(req, ctx) {
      const result = await base.searchEntity(req, ctx);
      if (req.query === "SYNTHETIC Midtown Listening Cafe" && result.snapshot.kind === "entity_lookup") result.snapshot.matches[0]!.id = "synthetic:wrong-identity";
      return result;
    } });
    expect(outcomes(r)).toEqual([["original-2", "REPAIR_REJECTED", "REPLACEMENT_FAILED_HARD_CHECK"]]);
  });
  it("the validator re-derives outcomes: forged, dropped or reordered outcomes are rejected", async () => {
    const base = await fixture("nyc-evening"); const valid = (change: (r: AuditReport) => void) => { const r = structuredClone(base); change(r); return AuditReportSchema.safeParse(r).success; };
    expect(valid(() => {})).toBe(true);
    expect(valid((r) => { r.repair_outcomes[1]!.status = "REPAIR_VERIFIED"; })).toBe(false);
    expect(valid((r) => { r.repair_outcomes[1]!.reason = "REPAIR_DISABLED"; })).toBe(false);
    expect(valid((r) => { r.repair_outcomes.pop(); })).toBe(false);
    expect(valid((r) => { r.repair_outcomes.reverse(); })).toBe(false);
    expect(valid((r) => { r.repair_outcomes[0]!.replacement_candidate_id = null; })).toBe(false);
    expect(valid((r) => { r.repairs[0]!.identity_basis = "user_confirmation"; })).toBe(false);
    expect(valid((r) => { r.repairs[0]!.lookup_evidence_ref = r.evidence[0]!.evidence_id; })).toBe(false);
    expect(valid((r) => { r.repairs[0]!.replaces = "original-1"; })).toBe(false); // original-1 is valid and needs no repair
  });
});

describe("recorded provider data: replacement identity needs a lookup or YOUR confirmation", () => {
  const NYC = "AUTHORED-NYC-REPLACEMENT-0001"; const slot = "repair:original-2";
  const nycDiscovery = { success: true, results: { entities: [{ entity_id: NYC, name: "Authored Midtown Room", type: "urn:entity", subtype: "urn:entity:place", disambiguation: "5 Authored Ave, New York",
    properties: { geocode: { city: "New York", country_code: "US", name: "Authored Midtown" } }, tags: [{ id: "urn:tag:category:place:authored_room", name: "Jazz club", type: "urn:tag:category:place", weight: null }], query: { affinity: 0.7 } }] } };
  let nycRoot = ""; let farRoot = ""; let nycAdapter: ReturnType<typeof createRecordedAdapter>; let farAdapter: ReturnType<typeof createRecordedAdapter>;
  const ref = (id: string, kind: "entity" | "tag" = "entity") => providerRef(kind, id);
  const select = (target_id: string, id: string, kind: "entity" | "tag" = "entity"): Confirmation => ({ target_id, decision: "select", ref: ref(id, kind) });
  const base = [select("p1", AUTHORED.artist), select("p2", AUTHORED.film), select("p3", AUTHORED.musicTag, "tag"), select("original-1", AUTHORED.venue)];
  const run = (adapter: typeof nycAdapter, confirmations: Confirmation[]) => runRecordedAudit(getRecordedScenarioInput(), adapter, { scenarioId: RECORDED_SCENARIO_ID, insightsPolicy: RECORDED_INSIGHTS_POLICY, confirmations });
  beforeAll(async () => {
    nycRoot = await seedRecordedRoot({ bodies: authoredBodies({ P05: nycDiscovery }) }); farRoot = await seedRecordedRoot();
    nycAdapter = createRecordedAdapter(await loadRecordedEvidence(nycRoot)); farAdapter = createRecordedAdapter(await loadRecordedEvidence(farRoot));
  });
  afterAll(async () => { await rm(nycRoot, { recursive: true, force: true }); await rm(farRoot, { recursive: true, force: true }); });

  it("a discovered NYC place awaits your confirmation: facts agree, but an unconfirmed identity can never pass", async () => {
    const r = ProviderAuditReportSchema.parse(await run(nycAdapter, base));
    expect(r.stop_reason).toBe("COMPLETE"); expect(r.repairs).toHaveLength(1);
    expect(r.repairs[0]).toMatchObject({ accepted: false, identity_basis: null, proposed_entity_id: ref(NYC) });
    expect(r.repairs[0]!.revalidation).toMatchObject({ resolution: "unresolved", hard_constraints: "unknown", verdict: "UNKNOWN" });
    expect(r.repairs[0]!.revalidation.findings.filter((f) => f.category === "hard_constraint").map((f) => f.code)).toEqual(["FACT_UNCONFIRMED", "FACT_UNCONFIRMED", "FACT_UNCONFIRMED", "MAX_ITEMS_MATCH"]);
    expect(outcomes(r)).toEqual([["original-2", "EVIDENCE_INSUFFICIENT", "REPLACEMENT_AWAITING_IDENTITY_CONFIRMATION"]]);
    expect(r.pending_confirmations).toEqual([{ target_id: slot, target_kind: "replacement", lookup_ref: r.repairs[0]!.discovery_evidence_refs[0], candidate_ids: [ref(NYC)] }]);
    expect(r.final_candidate_ids).not.toContain(r.repairs[0]!.replacement_candidate_id); // still not offered as a verified result
  });
  it("after you confirm it, the same place is verified on the provider's own geography: REPAIR_VERIFIED", async () => {
    const r = ProviderAuditReportSchema.parse(await run(nycAdapter, [...base, select(slot, NYC)]));
    const repair = r.repairs[0]!; const discovery = r.evidence.find((e) => e.snapshot.kind === "discover_places")!;
    expect(repair).toMatchObject({ accepted: true, identity_basis: "user_confirmation" });
    expect(repair.revalidation).toMatchObject({ resolution: "resolved", hard_constraints: "pass", verdict: "PASS", entity_id: ref(NYC), resolution_evidence_ref: discovery.evidence_id,
      cultural_relevance: { query_ref: discovery.evidence_id, ordinal_rank: 1 } });
    expect(repair.revalidation.findings).toContainEqual(expect.objectContaining({ code: "IDENTITY_USER_CONFIRMED", state: "pass" }));
    expect(outcomes(r)).toEqual([["original-2", "REPAIR_VERIFIED", "REPLACEMENT_VERIFIED"]]);
    expect(r.pending_confirmations).toEqual([]); expect(r.final_candidate_ids).toContain(repair.replacement_candidate_id);
    expect(r.usage).toMatchObject({ qloo_dispatches: 0 }); // recorded data, never a fresh request
  });
  it("declining it is final: REPAIR_REJECTED by you, nothing pending, nothing verified", async () => {
    const r = ProviderAuditReportSchema.parse(await run(nycAdapter, [...base, { target_id: slot, decision: "skip" }]));
    expect(outcomes(r)).toEqual([["original-2", "REPAIR_REJECTED", "REPLACEMENT_DECLINED_BY_USER"]]);
    expect(r.pending_confirmations).toEqual([]); expect(r.repairs[0]!.accepted).toBe(false);
    expect(r.repairs[0]!.revalidation.findings).toContainEqual(expect.objectContaining({ code: "UNRESOLVED_ENTITY", explanation: expect.stringContaining("declined") }));
  });
  it("a stale or foreign reference is not a decision: the proposal stays pending", async () => {
    const r = await run(nycAdapter, [...base, select(slot, AUTHORED.venue)]);
    expect(outcomes(r)).toEqual([["original-2", "EVIDENCE_INSUFFICIENT", "REPLACEMENT_AWAITING_IDENTITY_CONFIRMATION"]]);
    expect(r.pending_confirmations.map((p) => p.target_id)).toEqual([slot]); expect(r.repairs[0]!.accepted).toBe(false);
  });
  it("your confirmation cannot override a proven hard failure from the provider's own data", async () => {
    const r = ProviderAuditReportSchema.parse(await run(farAdapter, [...base, select(slot, AUTHORED.far)]));
    expect(r.repairs[0]).toMatchObject({ accepted: false, identity_basis: "user_confirmation" });
    expect(r.repairs[0]!.revalidation).toMatchObject({ hard_constraints: "fail", verdict: "BLOCKED" });
    expect(outcomes(r)).toEqual([["original-2", "REPAIR_REJECTED", "REPLACEMENT_FAILED_HARD_CHECK"]]);
  });
  it("a proven failure needs no confirmation from you: it is rejected outright and nothing is asked", async () => {
    const r = await run(farAdapter, base);
    expect(outcomes(r)).toEqual([["original-2", "REPAIR_REJECTED", "REPLACEMENT_FAILED_HARD_CHECK"]]); expect(r.pending_confirmations).toEqual([]);
  });
  it("without a confirmed taste signal there is no discovery at all: REPAIR_UNAVAILABLE, never a guess", async () => {
    const r = ProviderAuditReportSchema.parse(await run(nycAdapter, [{ target_id: "p1", decision: "skip" }, ...base.slice(1)]));
    expect(outcomes(r)).toEqual([["original-2", "REPAIR_UNAVAILABLE", "NO_CONFIRMED_SIGNAL"]]); expect(r.evidence.some((e) => e.operation === "insights")).toBe(false);
  });
  it("confirmations for unknown replacement slots are rejected before any call", async () => {
    await expect(run(nycAdapter, [...base, select("repair:evil", NYC)])).rejects.toThrow();
    await expect(run(nycAdapter, [...base, select("repair:original-2", NYC), { target_id: "repair:original-2", decision: "skip" }])).rejects.toThrow();
  });
  it("tampering with replacement identity fields is rejected", async () => {
    const good = await run(nycAdapter, [...base, select(slot, NYC)]); const waiting = await run(nycAdapter, base);
    const edit = (r: ProviderAuditReport, change: (r: ProviderAuditReport) => void) => { const x = structuredClone(r); change(x); return ProviderAuditReportSchema.safeParse(x).success; };
    expect(edit(good, () => {})).toBe(true); expect(edit(waiting, () => {})).toBe(true);
    expect(edit(good, (r) => { r.repairs[0]!.identity_basis = "independent_lookup"; })).toBe(false);
    expect(edit(good, (r) => { r.repairs[0]!.revalidation.findings = r.repairs[0]!.revalidation.findings.filter((f) => f.code !== "IDENTITY_USER_CONFIRMED"); })).toBe(false);
    expect(edit(good, (r) => { r.repairs[0]!.revalidation.resolution_evidence_ref = r.repairs[0]!.lookup_evidence_ref; })).toBe(false);
    expect(edit(good, (r) => { r.confirmations = r.confirmations.filter((c) => c.target_id !== slot); })).toBe(false); // the witness in the input evidence still names it
    expect(edit(waiting, (r) => { r.repairs[0]!.accepted = true; })).toBe(false);
    expect(edit(waiting, (r) => { Object.assign(r.repairs[0]!, { identity_basis: "user_confirmation" }); Object.assign(r.repairs[0]!.revalidation, { resolution: "resolved", entity_id: ref(NYC) }); })).toBe(false);
    expect(edit(waiting, (r) => { r.pending_confirmations = []; })).toBe(false);
    expect(edit(waiting, (r) => { r.pending_confirmations[0]!.candidate_ids = [ref(AUTHORED.venue)]; })).toBe(false);
    expect(digest(good.repairs[0]!.revalidation.findings)).not.toBe(digest(waiting.repairs[0]!.revalidation.findings));
  });
});
