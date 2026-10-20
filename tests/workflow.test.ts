import { afterEach, describe, expect, it, vi } from "vitest";
import { runAudit } from "../src/audit/workflow";
import { getScenario } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";
import { LiveExecutionBlockedError, type FixtureQlooAdapter, type LiveQlooAdapter } from "../src/qloo/ports";

afterEach(() => vi.restoreAllMocks());
describe("Audit -> Repair -> Revalidate", () => {
  it("runs the mixed case, retaining the known failure and the unresolved slot", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const s = getScenario("nyc-evening"); const r = await runAudit(s.input, createFixtureAdapter(s.world));
    expect(r.original_audits.map((a) => a.verdict)).toEqual(["REVIEW", "BLOCKED", "UNKNOWN"]);
    expect(r.original_audits[1]!.findings).toContainEqual(expect.objectContaining({ code: "CITY_MISMATCH", state: "fail" }));
    expect(r.repairs).toHaveLength(1); expect(r.repairs[0]!.accepted).toBe(true);
    expect(r.repairs[0]!.revalidation.verdict).toBe("PASS");
    expect(r.before_status).toBe("BLOCKED"); expect(r.final_status).toBe("UNKNOWN"); expect(r.completion).toBe("partial");
    expect(r.final_candidate_ids).toContain(r.repairs[0]!.replacement_candidate_id);
    expect(r.final_candidate_ids).not.toContain("original-3");
    expect(r.usage).toMatchObject({ fixture_calls: 9, repair_rounds: 1, qloo_dispatches: 0, llm_dispatches: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("a valid low-ranked item is not rejected and missing explanation is honest", async () => {
    const s = getScenario("valid-only"); const r = await runAudit(s.input, createFixtureAdapter(s.world));
    expect(r.final_status).toBe("PASS"); expect(r.completion).toBe("complete"); expect(r.repairs).toEqual([]);
    expect(r.original_audits[0]!.explainability).toBe("missing");
    expect(r.original_audits[0]!.findings).toContainEqual(expect.objectContaining({ code: "EXPLAINABILITY_MISSING", state: "not_applicable" }));
    expect(r.archive).toEqual({ status: "not_requested", action_id: null, receipt_ref: null });
  });
  it("closes a wrong-city slot only after a separate lookup and new ranking", async () => {
    const s = getScenario("wrong-city-repair"); const r = await runAudit(s.input, createFixtureAdapter(s.world));
    expect(r.before_status).toBe("BLOCKED"); expect(r.final_status).toBe("PASS");
    expect(r.original_audits[0]!.verdict).toBe("BLOCKED");
    expect(r.repairs[0]!.revalidation.resolution_evidence_ref).not.toBe(r.original_audits[0]!.resolution_evidence_ref);
    expect(r.trace.filter((t) => t.state === "Revalidate" && !t.call_id)).toHaveLength(1);
  });
  it("a wrong-city replacement is rejected and cannot start a second repair", async () => {
    const s = getScenario("repair-fails"); const base = createFixtureAdapter(s.world); const discover = vi.fn(base.discoverPlaces);
    const r = await runAudit(s.input, { ...base, discoverPlaces: discover });
    expect(r.repairs[0]!.accepted).toBe(false); expect(r.repairs[0]!.revalidation.verdict).toBe("BLOCKED");
    expect(r.final_status).toBe("BLOCKED"); expect(r.final_candidate_ids).toEqual([]);
    expect(discover).toHaveBeenCalledTimes(1); expect(r.usage.repair_rounds).toBe(1);
  });
  it("discovery alone cannot approve an unresolvable replacement", async () => {
    const s = getScenario("wrong-city-repair"); const base = createFixtureAdapter(s.world);
    const r = await runAudit(s.input, { ...base, async searchEntity(req, ctx) {
      const result = await base.searchEntity(req, ctx);
      if (req.query === "SYNTHETIC Midtown Listening Cafe" && result.snapshot.kind === "entity_lookup") result.snapshot.matches = [];
      return result;
    } });
    expect(r.repairs[0]!.accepted).toBe(false); expect(r.repairs[0]!.revalidation.verdict).toBe("UNKNOWN");
    expect(r.final_status).toBe("BLOCKED"); expect(r.usage.repair_rounds).toBe(1);
  });
  it("a different ID from independent lookup is an integrity failure", async () => {
    const s = getScenario("wrong-city-repair"); const base = createFixtureAdapter(s.world);
    const r = await runAudit(s.input, { ...base, async searchEntity(req, ctx) {
      const result = await base.searchEntity(req, ctx);
      if (req.query === "SYNTHETIC Midtown Listening Cafe" && result.snapshot.kind === "entity_lookup") result.snapshot.matches[0]!.id = "synthetic:wrong-identity";
      return result;
    } });
    expect(r.repairs[0]!.accepted).toBe(false); expect(r.repairs[0]!.revalidation.verdict).toBe("BLOCKED");
    expect(r.repairs[0]!.revalidation.findings).toContainEqual(expect.objectContaining({ code: "REVALIDATION_ID_MISMATCH" }));
  });
  it.each(["unresolved-only", "missing-evidence"] as const)("%s returns uncertainty, not invented proof", async (id) => {
    const s = getScenario(id); const r = await runAudit(s.input, createFixtureAdapter(s.world));
    expect(r.final_status).toBe("UNKNOWN"); expect(r.completion).toBe("partial");
    expect(r.original_audits[0]!.evidence_coverage).toBe("missing"); expect(r.final_candidate_ids).toEqual([]);
    expect(r.repairs).toEqual([]);
  });
  it("missing city is unknown; matching country/type cannot manufacture a city PASS", async () => {
    const s = getScenario("valid-only"); s.world.entities.find((e) => e.id === "synthetic:place-1")!.city = null;
    const r = await runAudit(s.input, createFixtureAdapter(s.world));
    expect(r.original_audits[0]!.hard_constraints).toBe("unknown"); expect(r.final_status).toBe("UNKNOWN");
  });
  it("rejects wrong country and brand/place mismatch independently of ranking", async () => {
    const s = getScenario("valid-only"); const place = s.world.entities.find((e) => e.id === "synthetic:place-1")!;
    place.country = "JP"; place.kind = "brand";
    const r = await runAudit(s.input, createFixtureAdapter(s.world));
    expect(r.original_audits[0]!.findings.filter((f) => f.state === "fail").map((f) => f.code)).toEqual(["COUNTRY_MISMATCH", "TYPE_MISMATCH"]);
    expect(r.final_status).toBe("BLOCKED");
  });
  it("materially ambiguous entity stops further calls for clarification", async () => {
    const s = getScenario("valid-only"); const venue = s.world.entities.find((e) => e.id === "synthetic:place-1")!;
    s.world.entities.push({ ...venue, id: "synthetic:another-branch" });
    const r = await runAudit(s.input, createFixtureAdapter(s.world));
    expect(r.original_audits[0]!.resolution).toBe("ambiguous"); expect(r.stop_reason).toBe("NEEDS_INPUT");
    expect(r.usage.fixture_calls).toBe(4); expect(r.usage.repair_rounds).toBe(0);
  });
  it("unconfirmed and unresolved preferences are never silently discarded", async () => {
    const s = getScenario("valid-only"); s.input.preferences[1]!.confirmed_anchor = null;
    const r = await runAudit(s.input, createFixtureAdapter(s.world));
    expect(r.stop_reason).toBe("NEEDS_INPUT"); expect(r.unresolved_preferences).toEqual(["p2", "p3"]);
    expect(r.usage.fixture_calls).toBe(1); expect(r.final_status).toBe("UNKNOWN");
  });
  it("missing taste evidence alone is a soft gate: a verified venue is never replaced", async () => {
    const s = getScenario("missing-evidence"); const base = createFixtureAdapter(s.world); const discover = vi.fn(base.discoverPlaces);
    const r = await runAudit(s.input, { ...base, discoverPlaces: discover });
    expect(r.original_audits[0]).toMatchObject({ resolution: "resolved", hard_constraints: "pass", evidence_coverage: "missing", verdict: "UNKNOWN" });
    expect(discover).not.toHaveBeenCalled(); expect(r.usage.repair_rounds).toBe(0); expect(r.repairs).toEqual([]);
  });
  it("discovery facts can reject an unconfirmed replacement but never pass it", async () => {
    const s = getScenario("repair-fails"); const base = createFixtureAdapter(s.world);
    const unconfirmed = { ...base, async searchEntity(req: Parameters<typeof base.searchEntity>[0], ctx: Parameters<typeof base.searchEntity>[1]) {
      const result = await base.searchEntity(req, ctx);
      if (req.query === "SYNTHETIC Midtown Listening Cafe" && result.snapshot.kind === "entity_lookup") result.snapshot.matches = [];
      return result;
    } };
    const rejected = await runAudit(s.input, unconfirmed);
    const discoveryRef = rejected.evidence.find((e) => e.snapshot.kind === "discover_places")!.evidence_id;
    expect(rejected.repairs[0]!.revalidation).toMatchObject({ resolution: "unresolved", verdict: "BLOCKED" });
    expect(rejected.repairs[0]!.revalidation.findings).toContainEqual(expect.objectContaining({ code: "CITY_MISMATCH", state: "fail",
      evidence_refs: [rejected.evidence[0]!.evidence_id, discoveryRef] }));
    const ok = getScenario("wrong-city-repair"); const okBase = createFixtureAdapter(ok.world);
    const passing = await runAudit(ok.input, { ...okBase, async searchEntity(req, ctx) {
      const result = await okBase.searchEntity(req, ctx);
      if (req.query === "SYNTHETIC Midtown Listening Cafe" && result.snapshot.kind === "entity_lookup") result.snapshot.matches = [];
      return result;
    } });
    expect(passing.repairs[0]!.accepted).toBe(false);
    expect(passing.repairs[0]!.revalidation.findings.find((f) => f.constraint_id === "c1")).toMatchObject({ code: "FACT_UNCONFIRMED", state: "unknown" });
  });
  it("explicit count violations cannot be repaired merely by swapping venues", async () => {
    const s = getScenario("nyc-evening"); s.input.constraints.find((c) => c.kind === "max_items")!.value = 2;
    const r = await runAudit(s.input, createFixtureAdapter(s.world));
    expect(r.original_audits.every((a) => a.findings.some((f) => f.code === "MAX_ITEMS_EXCEEDED"))).toBe(true);
    expect(r.usage.repair_rounds).toBe(0); expect(r.final_status).toBe("BLOCKED");
  });
});

describe("trusted budgets, failures and no live fallback", () => {
  it.each(Array.from({ length: 15 }, (_, i) => i))("honors a %i-call ceiling including repair reservation", async (maxCalls) => {
    const s = getScenario("nyc-evening"); const r = await runAudit(s.input, createFixtureAdapter(s.world), { maxCalls });
    expect(r.usage.fixture_calls).toBeLessThanOrEqual(maxCalls); expect(r.usage.repair_rounds).toBeLessThanOrEqual(1);
    if (maxCalls < 9) { expect(r.completion).toBe("partial"); expect(r.repairs.every((x) => !x.accepted)).toBe(true); }
  });
  it("invalid or expanded host limits reject before dispatch", async () => {
    const s = getScenario("valid-only"); const base = createFixtureAdapter(s.world); const search = vi.fn(base.searchEntity);
    for (const config of [{ maxCalls: 15 }, { maxRepairRounds: 2 }, { maxCalls: NaN }, { timeoutMs: 60_001 }])
      await expect(runAudit(s.input, { ...base, searchEntity: search }, config)).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });
  it("a host may disable repair", async () => {
    const s = getScenario("wrong-city-repair"); const r = await runAudit(s.input, createFixtureAdapter(s.world), { maxRepairRounds: 0 });
    expect(r.usage.repair_rounds).toBe(0); expect(r.repairs).toEqual([]); expect(r.final_status).toBe("BLOCKED");
  });
  it("adapter failure consumes one attempt, exposes no exception and never retries", async () => {
    const s = getScenario("valid-only"); const base = createFixtureAdapter(s.world);
    const search = vi.fn(async () => { throw new Error("private exception must not be included"); });
    const r = await runAudit(s.input, { ...base, searchEntity: search });
    expect(search).toHaveBeenCalledTimes(1); expect(r.stop_reason).toBe("ADAPTER_ERROR"); expect(r.usage.fixture_calls).toBe(1);
    expect(JSON.stringify(r)).not.toContain("private exception"); expect(r.final_status).toBe("UNKNOWN");
  });
  it("per-call timeout aborts the adapter and discards late responses", async () => {
    const s = getScenario("valid-only"); const base = createFixtureAdapter(s.world); let aborted = false;
    const slow: FixtureQlooAdapter = { ...base, async searchEntity(request, context) {
      context.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      await new Promise((resolve) => setTimeout(resolve, 40)); return base.searchEntity(request, context);
    } };
    const r = await runAudit(s.input, slow, { callTimeoutMs: 5 });
    expect(aborted).toBe(true); expect(r.stop_reason).toBe("TIMEOUT"); expect(r.evidence).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 50)); expect(r.evidence).toHaveLength(1); expect(r.usage.fixture_calls).toBe(1);
  });
  it("the total envelope shortens a longer per-call timeout", async () => {
    const s = getScenario("valid-only"); const base = createFixtureAdapter(s.world);
    const r = await runAudit(s.input, { ...base, searchEntity: () => new Promise<never>(() => {}) }, { timeoutMs: 5, callTimeoutMs: 100 });
    expect(r.stop_reason).toBe("TIMEOUT"); expect(r.usage.fixture_calls).toBe(1);
  });
  it("pre-cancelled runs dispatch nothing", async () => {
    const s = getScenario("valid-only"); const controller = new AbortController(); controller.abort();
    const r = await runAudit(s.input, createFixtureAdapter(s.world), { signal: controller.signal });
    expect(r.stop_reason).toBe("CANCELLED"); expect(r.usage.fixture_calls).toBe(0);
  });
  it("live mode is blocked before any operation and cannot fall back to fixtures", async () => {
    const s = getScenario("valid-only"); const operation = vi.fn();
    const live: LiveQlooAdapter = { mode: "live", searchEntity: operation, searchTags: operation, rankPlaces: operation, discoverPlaces: operation };
    await expect(runAudit(s.input, live)).rejects.toBeInstanceOf(LiveExecutionBlockedError); expect(operation).not.toHaveBeenCalled();
  });
});
