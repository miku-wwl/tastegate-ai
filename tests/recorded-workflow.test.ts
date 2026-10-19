import { rm } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAudit, runRecordedAudit } from "../src/audit/workflow";
import { digest, type Confirmation, type ProviderAuditReport } from "../src/domain/contracts";
import { ProviderAuditReportSchema } from "../src/domain/report-schema";
import { getScenario } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";
import { LiveExecutionBlockedError } from "../src/qloo/ports";
import { providerRef } from "../src/qloo/provider-ref";
import { createRecordedAdapter, loadRecordedEvidence } from "../src/qloo/recorded-adapter";
import { RECORDED_INSIGHTS_POLICY, RECORDED_SCENARIO_ID, getRecordedScenarioInput } from "../src/scenarios/recorded-nyc";
import { AUTHORED, seedRecordedRoot } from "./helpers/recorded-root";

let root = ""; let adapter: ReturnType<typeof createRecordedAdapter>;
const ref = (id: string, kind: "entity" | "tag" = "entity") => providerRef(kind, id);
const select = (target_id: string, id: string, kind: "entity" | "tag" = "entity"): Confirmation => ({ target_id, decision: "select", ref: ref(id, kind) });
const confirmed = [select("p1", AUTHORED.artist), select("p2", AUTHORED.film), select("p3", AUTHORED.musicTag, "tag"), select("original-1", AUTHORED.venue)];
const run = (confirmations?: Confirmation[], extra: Record<string, unknown> = {}) => runRecordedAudit(getRecordedScenarioInput(), adapter,
  { scenarioId: RECORDED_SCENARIO_ID, insightsPolicy: RECORDED_INSIGHTS_POLICY, confirmations, ...extra });
const rehash = (r: ProviderAuditReport, i: number) => { r.evidence[i]!.query_fingerprint = digest(r.evidence[i]!.snapshot); };
beforeAll(async () => { root = await seedRecordedRoot(); adapter = createRecordedAdapter(await loadRecordedEvidence(root)); });
afterAll(async () => { await rm(root, { recursive: true, force: true }); });
beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite")); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); });

describe("recorded provider workflow", () => {
  it("collects every lookup, then waits for one explicit decision round", async () => {
    const r = await run();
    expect(r.stop_reason).toBe("NEEDS_INPUT"); expect(r.final_status).toBe("UNKNOWN");
    expect(r.pending_confirmations.map((p) => [p.target_id, p.target_kind, p.candidate_ids.length])).toEqual([
      ["p1", "preference", 2], ["p2", "preference", 2], ["p3", "preference", 2], ["original-1", "recommendation", 1]]);
    expect(r.original_audits.map((a) => a.resolution)).toEqual(["unconfirmed", "unresolved"]);
    expect(r.original_audits[0]!.findings).toContainEqual(expect.objectContaining({ code: "CONFIRMATION_REQUIRED" }));
    expect(r.usage).toMatchObject({ adapter_calls: 5, recorded_replays: 4, unavailable_operations: 1, qloo_dispatches: 0, repair_rounds: 0 });
    expect(r.trace.map((t) => t.state)).toContain("NeedsInput");
  });
  it("after confirmation, verifies the venue, keeps missing taste evidence soft and rejects an out-of-city discovery", async () => {
    const r = await run(confirmed);
    expect(r.preference_resolution.map((p) => p.status)).toEqual(["resolved", "resolved", "resolved"]);
    expect(r.original_audits[0]).toMatchObject({ resolution: "resolved", hard_constraints: "pass", evidence_coverage: "missing", verdict: "UNKNOWN" });
    expect(r.original_audits[1]!.findings).toContainEqual(expect.objectContaining({ code: "EVIDENCE_UNAVAILABLE" }));
    expect(r.repairs).toHaveLength(1);
    const repair = r.repairs[0]!;
    expect(repair).toMatchObject({ replaces: "original-2", accepted: false, proposed_entity_id: ref(AUTHORED.far) });
    expect(repair.revalidation.findings.filter((f) => f.category === "hard_constraint").map((f) => [f.code, f.state])).toEqual([
      ["CITY_MISMATCH", "fail"], ["COUNTRY_MISMATCH", "fail"], ["FACT_UNCONFIRMED", "unknown"], ["MAX_ITEMS_MATCH", "pass"]]);
    expect(r).toMatchObject({ before_status: "UNKNOWN", final_status: "UNKNOWN", completion: "partial", final_candidate_ids: [] });
    expect(r.usage).toMatchObject({ adapter_calls: 9, recorded_replays: 5, unavailable_operations: 4, repair_rounds: 1 });
    const discovery = r.evidence.find((e) => e.snapshot.kind === "discover_places")!.snapshot;
    expect(discovery).toMatchObject({ preference_entity_ids: [ref(AUTHORED.artist)], preference_tag_ids: [], exclude_entity_ids: [ref(AUTHORED.venue)] });
    const text = JSON.stringify(r);
    for (const raw of Object.values(AUTHORED)) expect(text).not.toContain(raw);
  });
  it("a different confirmed artist cannot replay the recorded discovery", async () => {
    const r = await run([select("p1", AUTHORED.otherArtist), ...confirmed.slice(1)]);
    expect(r.repairs).toEqual([]); expect(r.usage.repair_rounds).toBe(1);
    expect(r.evidence.find((e) => e.snapshot.kind === "unavailable" && e.snapshot.request.operation === "discover_places")).toBeDefined();
  });
  it("skipping the artist sends no Insights request and attempts no repair", async () => {
    const r = await run([{ target_id: "p1", decision: "skip" }, ...confirmed.slice(1)]);
    expect(r.preference_resolution[0]!.status).toBe("skipped"); expect(r.unresolved_preferences).toEqual(["p1"]);
    expect(r.evidence.some((e) => e.operation === "insights")).toBe(false);
    expect(r.repairs).toEqual([]); expect(r.completion).toBe("partial");
  });
  it("rejecting every venue candidate leaves the slot unresolved, never auto-selected", async () => {
    const r = await run([...confirmed.slice(0, 3), { target_id: "original-1", decision: "skip" }]);
    expect(r.original_audits[0]!.resolution).toBe("unresolved"); expect(r.pending_confirmations).toEqual([]);
    expect(r.repairs.map((x) => x.replaces)).toEqual(["original-1"]);
  });
  it("a stale or foreign reference is not a decision and keeps the choice pending", async () => {
    const r = await run([{ target_id: "p1", decision: "select", ref: "qloo-ref:0000000000000000" }, ...confirmed.slice(1)]);
    expect(r.stop_reason).toBe("NEEDS_INPUT"); expect(r.pending_confirmations.map((p) => p.target_id)).toEqual(["p1"]);
  });
  it.each([
    ["an unknown target", [{ target_id: "evil", decision: "skip" }]],
    ["duplicate decisions", [select("p1", AUTHORED.artist), select("p1", AUTHORED.otherArtist)]],
    ["a raw provider ID", [{ target_id: "p1", decision: "select", ref: AUTHORED.artist }]],
  ])("rejects %s before any call", async (_, confirmations) => {
    const spy = vi.fn(adapter.searchEntity); const wrapped = { ...adapter, searchEntity: spy };
    await expect(runRecordedAudit(getRecordedScenarioInput(), wrapped, { scenarioId: RECORDED_SCENARIO_ID, insightsPolicy: RECORDED_INSIGHTS_POLICY,
      confirmations })).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
  it("trusted host policy cannot be widened by callers", async () => {
    await expect(run(confirmed, { insightsPolicy: { ...RECORDED_INSIGHTS_POLICY, discovery_take: 50 } })).rejects.toThrow();
    await expect(run(confirmed, { maxCalls: 15 })).rejects.toThrow();
  });
  it("cancellation and budgets still bound the provider workflow", async () => {
    const controller = new AbortController(); controller.abort();
    expect((await run(confirmed, { signal: controller.signal })).usage.adapter_calls).toBe(0);
    const tight = await run(confirmed, { maxCalls: 6 });
    expect(tight.stop_reason).toBe("CALL_BUDGET_EXHAUSTED"); expect(tight.usage.adapter_calls).toBeLessThanOrEqual(6); expect(tight.repairs).toEqual([]);
  });
  it("engines stay separate: the fixture entry point refuses recorded adapters", async () => {
    await expect(runAudit(getScenario("valid-only").input, adapter as never)).rejects.toBeInstanceOf(LiveExecutionBlockedError);
    const s = getScenario("valid-only");
    await expect(runRecordedAudit(s.input, createFixtureAdapter(s.world) as never, { scenarioId: "x", insightsPolicy: RECORDED_INSIGHTS_POLICY })).rejects.toBeInstanceOf(LiveExecutionBlockedError);
  });
});

describe("provider report validator rejects tampering", () => {
  let base: ProviderAuditReport; let waiting: ProviderAuditReport;
  beforeAll(async () => { base = await run(confirmed); waiting = await run(); });
  const attacks: Array<[string, (r: ProviderAuditReport) => void]> = [
    ["a confirmation changed after the run", (r) => { r.confirmations[0] = select("p1", AUTHORED.otherArtist); }],
    ["a rehashed forged confirmation", (r) => {
      const forged = select("p1", AUTHORED.otherArtist); r.confirmations[0] = forged;
      const s = r.evidence[0]!.snapshot; if (s.kind === "input") s.confirmations![0] = forged; rehash(r, 0); }],
    ["unavailable evidence relabelled as Qloo", (r) => { const e = r.evidence.find((x) => x.snapshot.kind === "unavailable")!; e.provider = "qloo"; }],
    ["a recording moved to another endpoint", (r) => { r.evidence[1]!.capture!.endpoint = "/v2/insights"; }],
    ["a recorded report relabelled as fixture", (r) => { Object.assign(r, { source_mode: "fixture" }); }],
    ["a synthetic identifier injected", (r) => { r.original_audits[0]!.entity_id = "synthetic:place-1"; }],
    ["an unresolved slot claimed as resolved", (r) => { Object.assign(r.original_audits[1]!, { resolution: "resolved", entity_id: ref(AUTHORED.venue) }); }],
    ["a widened Insights policy", (r) => { r.insights_policy.signal_scope = "all_confirmed"; }],
    ["miscounted recordings", (r) => { r.usage.recorded_replays += 1; }],
    ["an invented recording time", (r) => { r.evidence[1]!.fetched_at = "2026-10-01T00:00:00.000Z"; }],
    ["a replacement marked accepted", (r) => { r.repairs[0]!.accepted = true; }],
    ["rehashed discovery facts that hide the wrong city", (r) => {
      const i = r.evidence.findIndex((e) => e.snapshot.kind === "discover_places"); const s = r.evidence[i]!.snapshot;
      if (s.kind === "discover_places") s.candidates[0]!.city = "New York"; rehash(r, i); }],
    ["a score for an entity that was never returned", (r) => {
      const i = r.evidence.findIndex((e) => e.snapshot.kind === "discover_places"); const s = r.evidence[i]!.snapshot;
      if (s.kind === "discover_places") s.scores!.push({ entity_id: ref(AUTHORED.venue), query_affinity: 1 }); rehash(r, i); }],
  ];
  it("accepts the untouched report", () => { expect(ProviderAuditReportSchema.safeParse(structuredClone(base)).success).toBe(true); });
  it.each(attacks)("rejects %s", (_, attack) => { const r = structuredClone(base); attack(r); expect(ProviderAuditReportSchema.safeParse(r).success).toBe(false); });
  it("rejects hidden pending confirmations", () => {
    const r = structuredClone(waiting); r.pending_confirmations = [];
    expect(ProviderAuditReportSchema.safeParse(r).success).toBe(false);
    const done = structuredClone(waiting); done.stop_reason = "COMPLETE";
    expect(ProviderAuditReportSchema.safeParse(done).success).toBe(false);
  });
});
