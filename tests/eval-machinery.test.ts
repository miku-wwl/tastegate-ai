import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/workflow";
import type { AuditInput, Entity } from "../src/domain/contracts";
import { gateOutcome, runAsProposed, runTopHitUnchecked, type PolicyOutcome } from "../src/eval/baselines";
import { recordedCases, syntheticCases } from "../src/eval/cases";
import { scoreCase, type Built } from "../src/eval/harness";
import { HOLDOUT_SEED, generatePlan, holdoutCases } from "../src/eval/holdout";
import { classifyEntity, planLimit } from "../src/eval/oracle";
import { scorePolicy } from "../src/eval/paired";
import { toPublicResults, type EvaluationRecord } from "../src/eval/publish";
import { evaluate, summarizePaired } from "../src/eval/report";
import { summarize } from "../src/eval/harness";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";
import { loadRecordedEvidence } from "../src/qloo/recorded-adapter";
import type { FixtureQlooAdapter } from "../src/qloo/ports";
import { getScenario } from "../src/fixtures/scenarios";
import { AUTHORED, seedRecordedRoot } from "./helpers/recorded-root";

const input = (over: Partial<{ city: string; country: string; max: number; place: boolean }> = {}): AuditInput => ({
  schema_revision: "tastegate.input.v0", preferences: [{ id: "p", text: "x", kind: "artist", confirmed_anchor: "x" }], task: "t", destination: "Alderport",
  constraints: [{ id: "c1", kind: "city", value: over.city ?? "Alderport" }, { id: "c2", kind: "country", value: over.country ?? "US" },
    ...(over.place === false ? [] : [{ id: "c3", kind: "entity_type" as const, value: "place" as const }]), { id: "c4", kind: "max_items", value: over.max ?? 3 }],
  recommendations: [{ id: "r1", name: "A", address_hint: null, claims: [] }] });
const entity = (over: Partial<Entity> = {}): Entity => ({ id: "synthetic:e1", name: "A", kind: "place", city: "Alderport", country: "US", ...over });

describe("the oracle judges from facts alone", () => {
  it.each<[string, Partial<Entity> | null, string, string[]]>([
    ["a matching place", {}, "VALID", []], ["a different city", { city: "Elsewhere" }, "VIOLATING", ["city"]], ["case and padding in the city name are not a mismatch", { city: "  ALDERPORT " }, "VALID", []],
    ["a different country", { country: "GB" }, "VIOLATING", ["country"]], ["a brand where a place is required", { kind: "brand" }, "VIOLATING", ["type"]],
    ["several failures at once", { kind: "brand", city: "Elsewhere", country: "GB" }, "VIOLATING", ["city", "country", "type"]],
    ["a missing city fact", { city: null }, "UNVERIFIABLE", []], ["a missing country fact", { country: null }, "UNVERIFIABLE", []],
    ["a present failure beats a missing fact", { city: null, country: "GB" }, "VIOLATING", ["country"]], ["an unknown entity", null, "UNVERIFIABLE", []],
  ])("%s", (_, over, expected, failed) => {
    const truth = classifyEntity(over === null ? null : entity(over), input()); expect(truth.class).toBe(expected); expect(truth.failed).toEqual(failed);
  });
  it("ignores the entity-type check when the plan does not ask for a place, and reads the size limit", () => {
    expect(classifyEntity(entity({ kind: "brand" }), input({ place: false })).class).toBe("VALID"); expect(planLimit(input({ max: 2 }))).toBe(2);
  });
  it("shares no code with the audit rules or the workflow", () => {
    const imports = [...readFileSync("src/eval/oracle.ts", "utf8").matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
    expect(imports).toEqual(["../domain/contracts"]); // types only: no rules, no workflow, no adapter
  });
});

describe("baselines and the gate's outcome", () => {
  it("AS_PROPOSED ships every recommendation unchanged and asks nothing", () => {
    const built = syntheticCases()[0]!.build() as Built; const out = runAsProposed(built.input, built.intended);
    expect(out.shipped.map((s) => s.slot)).toEqual(built.input.recommendations.map((r) => r.id)); expect(out).toMatchObject({ requests: 0, paused_for_human: false, human_decisions: 0 });
  });
  it("TOP_HIT_UNCHECKED takes the first hit, fills a gap with the unchecked discovery and checks nothing", async () => {
    const s = getScenario("nyc-evening"); const out = await runTopHitUnchecked(s.input, createFixtureAdapter(s.world));
    // original-1 and original-2 resolve by exact name; original-3 has no hit and is filled with the provider's own top discovery.
    expect(out.shipped.map((x) => [x.slot, x.origin])).toEqual([["original-1", "original"], ["original-2", "original"], ["original-3", "unchecked_fill"]]);
    expect(out.shipped.find((x) => x.slot === "original-2")!.entity!.city).toBe("Jersey City"); // the wrong-city venue ships: nothing is checked
    expect(out.requests).toBeGreaterThan(3);
  });
  it("TOP_HIT_UNCHECKED treats a failing source as no result instead of crashing", async () => {
    const s = getScenario("valid-only"); const base = createFixtureAdapter(s.world);
    const broken: FixtureQlooAdapter = { ...base, async searchEntity() { throw new Error("down"); } };
    const out = await runTopHitUnchecked(s.input, broken); expect(out.shipped).toEqual([]);
  });
  it("the gate's outcome keeps verified and pending originals and accepted replacements, and drops blocked and unresolved ones", async () => {
    const s = getScenario("nyc-evening"); const report = await runAudit(s.input, createFixtureAdapter(s.world)); const out = gateOutcome(report);
    expect(out.shipped.map((x) => [x.slot, x.origin])).toEqual([["original-1", "original"], ["original-2", "replacement"]]); // Jersey replaced, Unresolved Cafe held back
    expect(out.shipped.every((x) => x.entity !== null)).toBe(true); expect(out.paused_for_human).toBe(false);
  });
});

describe("scoring arithmetic", () => {
  const plan = input({ max: 2 }); plan.recommendations = ["a", "b", "c"].map((id) => ({ id, name: id, address_hint: null, claims: [] }));
  const truth: Record<string, Entity> = { a: entity({ id: "synthetic:a" }), b: entity({ id: "synthetic:b", city: "Elsewhere" }), c: entity({ id: "synthetic:c", city: null }) };
  const intended = (slot: string) => truth[slot] ?? null;
  const outcome = (shipped: PolicyOutcome["shipped"]): PolicyOutcome => ({ policy: "TOP_HIT_UNCHECKED", shipped, requests: 7, elapsed_ms: 1.234, paused_for_human: false, human_decisions: 0, notes: [] });
  it("counts what reaches the user by class, what was removed, identity errors and the size limit", () => {
    const s = scorePolicy(outcome([{ slot: "a", entity: truth.a!, origin: "original" }, { slot: "b", entity: truth.b!, origin: "original" }, { slot: "c", entity: entity({ id: "synthetic:other" }), origin: "original" }]), plan, intended);
    expect(s).toMatchObject({ shipped: 3, shipped_valid: 2, shipped_violating: 1, shipped_unverifiable: 0, proposal_valid: 1, valid_kept: 1, proposal_violating: 1, violating_removed: 0, identity_errors: 1, over_limit: true, requests: 7, elapsed_ms: 1.23 });
    const gate = scorePolicy(outcome([{ slot: "a", entity: truth.a!, origin: "original" }]), plan, intended);
    expect(gate).toMatchObject({ shipped: 1, shipped_valid: 1, shipped_violating: 0, violating_removed: 1, valid_kept: 1, over_limit: false });
  });
  it("judges by TRUE facts when the world is authored, whatever the source reported", () => {
    const lie = entity({ id: "synthetic:b", city: "Alderport" }); // the source claims the wrong-city venue is in the right city
    const believed = scorePolicy(outcome([{ slot: "b", entity: lie, origin: "original" }]), plan, intended); expect(believed.shipped_violating).toBe(0);
    const truthful = scorePolicy(outcome([{ slot: "b", entity: lie, origin: "original" }]), plan, intended, (id) => (id === "synthetic:b" ? truth.b! : null)); expect(truthful.shipped_violating).toBe(1);
  });
});

describe("the seeded holdout", () => {
  it("is deterministic, prefix-stable and seed-dependent", () => {
    const a = generatePlan(HOLDOUT_SEED, 7); const b = generatePlan(HOLDOUT_SEED, 7);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); expect(JSON.stringify(generatePlan(HOLDOUT_SEED + 1, 7))).not.toBe(JSON.stringify(a)); expect(JSON.stringify(generatePlan(HOLDOUT_SEED, 8))).not.toBe(JSON.stringify(a));
    expect(holdoutCases(10).map((c) => c.description.replace(/\d+ \(seed.*/, ""))).toEqual(holdoutCases(30).slice(0, 10).map((c) => c.description.replace(/\d+ \(seed.*/, "")));
    expect(JSON.stringify(holdoutCases(5)[3]!.build())).toBeDefined();
  });
  it("covers every construction, keeps valid schemas and never shares a name between unrelated entities", () => {
    const kinds = new Set<string>(); let ambiguous = 0;
    for (let i = 0; i < 60; i++) {
      const g = generatePlan(HOLDOUT_SEED, i); for (const s of g.slots) kinds.add(s.kind); ambiguous += g.slots.filter((s) => s.kind === "ambiguous").length;
      expect(g.slots.filter((s) => s.kind === "ambiguous").length).toBeLessThanOrEqual(1);
      expect(g.input.recommendations.length).toBeGreaterThanOrEqual(1); expect(g.input.recommendations.length).toBeLessThanOrEqual(3);
      const names = g.world.entities.map((e) => e.name); const dup = names.filter((n, k) => names.indexOf(n) !== k);
      for (const d of dup) expect(g.slots.some((s) => s.kind === "ambiguous" && g.input.recommendations.find((r) => r.id === s.id)!.name === d)).toBe(true);
      expect(g.input.recommendations.every((r) => r.name.startsWith("SYNTHETIC "))).toBe(true);
    }
    expect([...kinds].sort()).toEqual(["ambiguous", "missing_city", "unresolvable", "valid", "wrong_city", "wrong_country", "wrong_type"]); expect(ambiguous).toBeGreaterThan(0);
  });
  it("labels its slots from construction, not from the gate's verdicts", () => {
    const g = generatePlan(HOLDOUT_SEED, 3); const wrong = g.slots.find((s) => s.kind === "wrong_city") ?? generatePlan(HOLDOUT_SEED, 0).slots.find((s) => s.kind === "wrong_city");
    if (wrong?.intended) expect(classifyEntity(wrong.intended, g.input).class).toBe("VIOLATING");
    for (let i = 0; i < 60; i++) for (const s of generatePlan(HOLDOUT_SEED, i).slots) {
      const truth = classifyEntity(s.intended, generatePlan(HOLDOUT_SEED, i).input).class;
      expect(truth).toBe(s.kind === "valid" || s.kind === "ambiguous" ? "VALID" : s.kind === "unresolvable" || s.kind === "missing_city" ? "UNVERIFIABLE" : "VIOLATING");
    }
  });
});

describe("the evaluation can fail (sabotage tests)", () => {
  const holdout = holdoutCases(60);
  // An evidence source that tells the gate every venue is in the right city and country, and is a place: a corrupted provider.
  const corrupt = (base: FixtureQlooAdapter, i: AuditInput): FixtureQlooAdapter => {
    const city = i.constraints.find((c) => c.kind === "city")!.value as string; const country = i.constraints.find((c) => c.kind === "country")!.value as string;
    const fix = (e: Entity): Entity => e.kind === "artist" ? e : { ...e, kind: "place", city, country };
    return { ...base,
      async searchEntity(r, c) { const o = await base.searchEntity(r, c); if (o.snapshot.kind === "entity_lookup") o.snapshot.matches = o.snapshot.matches.map(fix); return o; },
      async discoverPlaces(r, c) { const o = await base.discoverPlaces(r, c); if (o.snapshot.kind === "discover_places") o.snapshot.candidates = o.snapshot.candidates.map(fix); return o; } };
  };
  it("flags a gate that is fed corrupted evidence: violating items now reach the user and the invariants notice", async () => {
    let failing = 0; let violatingPlans = 0;
    for (const c of holdout) {
      const built = await c.build(); const g = built; const hasViolation = Object.entries(g.slotKinds!).some(([, k]) => k === "wrong_city" || k === "wrong_country" || k === "wrong_type");
      const adapter = corrupt(built.adapter as FixtureQlooAdapter, built.input); const report = await runAudit(built.input, adapter);
      const result = scoreCase(c, report, { ...built, adapter, runGate: async () => report });
      if (hasViolation) { violatingPlans++; if (result.status === "FAIL") failing++; }
    }
    expect(violatingPlans).toBeGreaterThan(15); expect(failing).toBeGreaterThanOrEqual(Math.floor(violatingPlans * 0.9));
  });
  it("flags tampered verdicts one invariant at a time", async () => {
    const find = async (kind: string) => { for (const c of holdout) { const b = await c.build(); const slot = Object.entries(b.slotKinds!).find(([, k]) => k === kind)?.[0]; if (slot && !Object.values(b.slotKinds!).includes("ambiguous")) return { c, b, slot }; } throw new Error("no plan"); };
    const tamper = async (kind: string, change: (r: Awaited<ReturnType<Built["runGate"]>>, slot: string) => void) => {
      const { c, b, slot } = await find(kind); const report = await b.runGate(); const clean = scoreCase(c, structuredClone(report), b); change(report, slot); return { clean, tampered: scoreCase(c, report, b) };
    };
    const flagged = await tamper("wrong_city", (r, slot) => { r.original_audits.find((a) => a.candidate_id === slot)!.verdict = "PASS"; });
    expect(flagged.clean.status).toBe("PASS"); expect(flagged.tampered.failures.join(" ")).toMatch(/violation not flagged/);
    const fabricated = await tamper("unresolvable", (r, slot) => { r.original_audits.find((a) => a.candidate_id === slot)!.resolution = "resolved"; });
    expect(fabricated.tampered.failures.join(" ")).toMatch(/fabricated identity/);
    const falseReject = await tamper("valid", (r, slot) => { r.original_audits.find((a) => a.candidate_id === slot)!.verdict = "BLOCKED"; });
    expect(falseReject.tampered.failures.join(" ")).toMatch(/false rejection/);
    const mishandled = await tamper("missing_city", (r, slot) => { r.original_audits.find((a) => a.candidate_id === slot)!.hard_constraints = "pass"; });
    expect(mishandled.tampered.failures.join(" ")).toMatch(/missing city fact mishandled/);
  });
  it("flags an accepted replacement that is not provably valid", async () => {
    for (const c of holdout) {
      const b = await c.build(); const report = await b.runGate(); const repair = report.repairs.find((r) => r.accepted); if (!repair) continue;
      const bad = b.truthOf!(repair.proposed_entity_id)!; const world = { ...b, truthOf: (id: string) => (id === bad.id ? { ...bad, city: "Nowhere" } : b.truthOf!(id)) };
      expect(scoreCase(c, report, world).failures.join(" ")).toMatch(/violating item shipped|accepted replacement is not provably valid/); return;
    }
    throw new Error("no accepted replacement found in the holdout");
  });
});

describe("aggregation and publication", () => {
  it("keeps strata apart, reports NOT RUN honestly and scores plans the gate paused separately", async () => {
    const { results, paired } = await evaluate([...syntheticCases(), ...holdoutCases(20)]);
    const summary = summarize(results); const comparison = summarizePaired(paired);
    expect(summary.AUTHORIZED_LIVE).toEqual({ status: "NOT RUN", cases: 0 }); expect(summary.RECORDED_LIVE).toEqual({ status: "NOT RUN", cases: 0 });
    expect(comparison.RECORDED_LIVE).toEqual({ status: "NOT RUN", plans: 0 }); expect(comparison.AUTHORIZED_LIVE).toEqual({ status: "NOT RUN", plans: 0 });
    const holdout = comparison.SYNTHETIC_HOLDOUT as unknown as { plans: number; scored_plans: number; paused_for_human_decision: number; paused_plans: { plans: number }; policies: Record<string, { plans: number }> };
    expect(holdout.plans).toBe(20); expect(holdout.scored_plans + holdout.paused_for_human_decision).toBe(20); expect(holdout.paused_plans.plans).toBe(holdout.paused_for_human_decision);
    expect(holdout.policies.TASTEGATE!.plans).toBe(holdout.scored_plans);
    expect(results.filter((r) => r.stratum === "SYNTHETIC").length).toBe(14); // the development cases are never pooled into the holdout
    expect(paired.filter((p) => p.stratum === "SYNTHETIC").length).toBe(11); // the three robustness cases have no baseline comparison
  });
  it("the public results contain counts and fixed labels only", async () => {
    const { results, paired } = await evaluate([...syntheticCases(), ...holdoutCases(10)]);
    const record: EvaluationRecord = { executed_at_utc: "2026-10-20T00:00:00.000Z", base_commit: "abc", working_tree_dirty: false, holdout_seed: HOLDOUT_SEED, recorded_evidence: "UNAVAILABLE_IN_THIS_ENVIRONMENT",
      caveat: "c", summary: summarize(results), comparison: summarizePaired(paired), results };
    const pub = toPublicResults(record); const text = JSON.stringify(pub);
    expect(Object.keys(pub.strata)).toEqual(["SYNTHETIC", "SYNTHETIC_HOLDOUT", "RECORDED_LIVE", "AUTHORIZED_LIVE"]);
    expect(pub.strata.AUTHORIZED_LIVE).toMatchObject({ status: "NOT RUN", cases: 0, comparison: null }); expect(pub.strata.RECORDED_LIVE).toMatchObject({ status: "NOT RUN", comparison: null });
    expect(pub.recorded_evidence_present).toBe(false);
    for (const forbidden of ["qloo-ref:", "entity_id", "sha256", "private/", "api_key", "Radiohead", "Blue Note"]) expect(text).not.toContain(forbidden);
    expect(text).not.toMatch(/"description"/); // no per-case text is published
  });
  it("withholds aggregates derived from recordings unless the owner includes them", async () => {
    const root = await seedRecordedRoot();
    try {
      const recordings = await loadRecordedEvidence(root); const { results, paired } = await evaluate(recordedCases(recordings));
      // The authored recordings carry invented names, so the label-based gold choices of R02/R03 cannot be made; R01 and R04 run.
      expect(results.map((r) => r.status)).toEqual(["PASS", "ERROR", "ERROR", "PASS"]);
      const record: EvaluationRecord = { executed_at_utc: "2026-10-20T00:00:00.000Z", base_commit: "abc", working_tree_dirty: false, holdout_seed: HOLDOUT_SEED,
        recorded_evidence: "VERIFIED_PRIVATE_RECORDINGS_AVAILABLE", caveat: "c", summary: summarize(results), comparison: summarizePaired(paired), results };
      const hidden = toPublicResults(record); expect(hidden.strata.RECORDED_LIVE).toMatchObject({ status: "WITHHELD", comparison: null, cases: 4, cases_passed: 2 });
      expect(JSON.stringify(hidden)).not.toMatch(/violating|policies/); // nothing derived from the recordings, beyond how many cases passed
      const shown = toPublicResults(record, { includeRecorded: true }); expect(shown.strata.RECORDED_LIVE).toMatchObject({ status: "RUN" });
      expect(shown.strata.RECORDED_LIVE.comparison).not.toBeNull();
      for (const needle of ["qloo-ref:", "Radiohead", "Authored Jazz Room", "Authored Far Pavilion", ...Object.values(AUTHORED)]) expect(JSON.stringify(shown)).not.toContain(needle);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
