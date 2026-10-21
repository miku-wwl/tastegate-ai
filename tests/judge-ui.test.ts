import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rm } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIONS, CONDITIONS, decisionTrace } from "../app/decision-trace";
import { RepairCard } from "../app/report-view";
import { GuideCard, HowItWorks } from "../app/screens/guide";
import { DecisionTrace, RepairAssessmentView } from "../app/trace-view";
import { runAudit, runRecordedAudit } from "../src/audit/workflow";
import type { AnyAuditReport, Confirmation } from "../src/domain/contracts";
import { getScenario, ScenarioIdSchema, type ScenarioId } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";
import { providerRef } from "../src/qloo/provider-ref";
import { createRecordedAdapter, loadRecordedEvidence } from "../src/qloo/recorded-adapter";
import { RECORDED_INSIGHTS_POLICY, RECORDED_SCENARIO_ID, getRecordedScenarioInput } from "../src/scenarios/recorded-nyc";
import { AUTHORED, authoredBodies, seedRecordedRoot } from "./helpers/recorded-root";

// The judge-facing pieces: a decision trace in a closed vocabulary, the two-question repair view, and the orientation copy.
// Everything is rendered from authored data; nothing contacts a network.
beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite")); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
const fixture = async (id: ScenarioId) => { const s = getScenario(id); return runAudit(s.input, createFixtureAdapter(s.world)); };
const pairs = (r: AnyAuditReport) => decisionTrace(r).map((s) => [s.slot, s.phase, s.condition, s.action]);

describe("decision trace: bounded decisions in a closed vocabulary, read from the report", () => {
  it.each(ScenarioIdSchema.options)("scenario %s: one audit row per recommendation, one repair row per repair target, only known codes", async (id) => {
    const report = await fixture(id); const steps = decisionTrace(report);
    expect(steps.filter((s) => s.phase === "AUDIT").map((s) => s.slot)).toEqual(report.original_audits.map((a) => a.candidate_id));
    expect(steps.filter((s) => s.phase === "REPAIR").map((s) => s.slot)).toEqual(report.repair_outcomes.map((o) => o.replaces));
    for (const s of steps) { expect(CONDITIONS).toContain(s.condition); expect(ACTIONS).toContain(s.action); expect(s.synthetic).toBe(true); expect(s.name.length).toBeGreaterThan(0); }
  });
  it("names the decisions the brief calls out, from the audit's own findings", async () => {
    expect(pairs(await fixture("wrong-city-repair"))).toEqual(expect.arrayContaining([["original-2", "AUDIT", "HARD_CONSTRAINT_FAILED", "REPAIR_CONSIDERED"], ["original-2", "REPAIR", "VALID_REPLACEMENT_VERIFIED", "REPAIR_VERIFIED"]]));
    expect(pairs(await fixture("repair-fails"))).toEqual(expect.arrayContaining([["original-2", "REPAIR", "REPLACEMENT_WRONG_CITY", "REPAIR_REJECTED"]]));
    expect(pairs(await fixture("unresolved-only"))).toEqual(expect.arrayContaining([["original-3", "AUDIT", "IDENTITY_UNRESOLVED", "HOLD_UNKNOWN"], ["original-3", "REPAIR", "NO_SUPPORTED_CANDIDATE", "REPAIR_UNAVAILABLE"]]));
    expect(pairs(await fixture("missing-evidence"))).toEqual([["original-1", "AUDIT", "CULTURAL_EVIDENCE_MISSING", "KEEP_WITH_UNKNOWN"]]);
    expect(pairs(await fixture("valid-only"))).toEqual([["original-1", "AUDIT", "VERIFIED_WITH_EVIDENCE", "KEEP"]]);
  });
  it("a plan larger than its limit is not repairable by swapping venues", async () => {
    const s = getScenario("nyc-evening"); s.input.constraints.find((c) => c.kind === "max_items")!.value = 2;
    const r = await runAudit(s.input, createFixtureAdapter(s.world));
    expect(pairs(r).filter((p) => p[1] === "REPAIR").every((p) => p[2] === "COUNT_CONSTRAINT_FAILED" && p[3] === "NOT_REPAIRABLE_BY_SWAP")).toBe(true);
  });
  it("contains no provider reference, hash or private value", async () => {
    const printed = JSON.stringify(decisionTrace(await fixture("nyc-evening"))); expect(printed).not.toMatch(/qloo-ref:|sha256|entity_id|[a-f0-9]{32}/);
  });
});

describe("decision trace on provider evidence (authored recordings)", () => {
  const NYC = "AUTHORED-NYC-REPLACEMENT-0001"; const slot = "repair:original-2";
  const nycDiscovery = { success: true, results: { entities: [{ entity_id: NYC, name: "Authored Midtown Room", type: "urn:entity", subtype: "urn:entity:place", disambiguation: "5 Authored Ave, New York",
    properties: { geocode: { city: "New York", country_code: "US", name: "Authored Midtown" } }, tags: [{ id: "urn:tag:category:place:authored_room", name: "Jazz club", type: "urn:tag:category:place", weight: null }], query: { affinity: 0.7 } }] } };
  let nycRoot = ""; let farRoot = ""; let nyc: ReturnType<typeof createRecordedAdapter>; let far: ReturnType<typeof createRecordedAdapter>;
  const ref = (id: string, kind: "entity" | "tag" = "entity") => providerRef(kind, id);
  const select = (target_id: string, id: string, kind: "entity" | "tag" = "entity"): Confirmation => ({ target_id, decision: "select", ref: ref(id, kind) });
  const base = [select("p1", AUTHORED.artist), select("p2", AUTHORED.film), select("p3", AUTHORED.musicTag, "tag"), select("original-1", AUTHORED.venue)];
  const run = (adapter: typeof nyc, confirmations?: Confirmation[]) => runRecordedAudit(getRecordedScenarioInput(), adapter, { scenarioId: RECORDED_SCENARIO_ID, insightsPolicy: RECORDED_INSIGHTS_POLICY, confirmations });
  beforeAll(async () => {
    nycRoot = await seedRecordedRoot({ bodies: authoredBodies({ P05: nycDiscovery }) }); farRoot = await seedRecordedRoot();
    nyc = createRecordedAdapter(await loadRecordedEvidence(nycRoot)); far = createRecordedAdapter(await loadRecordedEvidence(farRoot));
  });
  afterAll(async () => { await rm(nycRoot, { recursive: true, force: true }); await rm(farRoot, { recursive: true, force: true }); });
  it("ambiguous identities wait for a person", async () => {
    const r = await run(nyc); const trace = pairs(r);
    expect(trace).toEqual(expect.arrayContaining([["original-1", "AUDIT", "IDENTITY_AMBIGUOUS", "HUMAN_CONFIRMATION_REQUIRED"]])); expect(decisionTrace(r).every((s) => !s.synthetic)).toBe(true);
  });
  it("a wrong-country replacement is rejected, and a click-only replacement is not verified", async () => {
    expect(pairs(await run(far, base))).toEqual(expect.arrayContaining([["original-2", "REPAIR", "REPLACEMENT_WRONG_CITY", "REPAIR_REJECTED"]]));
    expect(pairs(await run(nyc, [...base, select(slot, NYC)]))).toEqual(expect.arrayContaining([["original-2", "REPAIR", "REPLACEMENT_NOT_CORROBORATED", "EVIDENCE_INSUFFICIENT"]]));
    expect(pairs(await run(nyc, base))).toEqual(expect.arrayContaining([["original-2", "REPAIR", "REPLACEMENT_IDENTITY_UNCONFIRMED", "HUMAN_CONFIRMATION_REQUIRED"]]));
    const printed = JSON.stringify(decisionTrace(await run(nyc, [...base, select(slot, NYC)]))); expect(printed).not.toMatch(/qloo-ref:/);
  });
  it("the repair view says why: separate questions, a second-source line, and no SYNTHETIC label on provider data", async () => {
    const r = await run(nyc, [...base, select(slot, NYC)]); const html = renderToStaticMarkup(createElement(RepairAssessmentView, { report: r, repair: r.repairs[0]! }));
    expect(html).toContain("Hard constraints: VALID"); expect(html).toContain("Cultural evidence: SUPPORTED"); expect(html).toContain("your confirmation only (not a second source)");
    expect(html).not.toContain("SYNTHETIC SUCCESS"); expect(html).toContain("first gap: Branch corroborated by a second source");
    const card = renderToStaticMarkup(createElement(RepairCard, { report: r, repair: r.repairs[0]! }));
    expect(card).toContain("Not verified: every check passed, but the identity has no second source");
    const farReport = await run(far, [...base, select(slot, AUTHORED.far)]); const farHtml = renderToStaticMarkup(createElement(RepairAssessmentView, { report: farReport, repair: farReport.repairs[0]! }));
    expect(farHtml).toContain("Hard constraints: INVALID"); expect(farHtml).toContain("Cultural evidence: SUPPORTED"); expect(farHtml).toContain("A high Qloo ranking never overrides a failed hard check");
  });
});

describe("rendered pieces", () => {
  it("the trace table shows plain language next to the code, and labels synthetic data", async () => {
    const html = renderToStaticMarkup(createElement(DecisionTrace, { report: await fixture("wrong-city-repair") }));
    expect(html).toContain("Decision trace"); expect(html).toContain("HARD_CONSTRAINT_FAILED"); expect(html).toContain("A hard constraint failed"); expect(html).toContain("REPAIR_VERIFIED"); expect(html).toContain("Replace: verified");
    expect(html).toContain("There is no free-form agent reasoning here"); expect(html).toContain("SYNTHETIC: authored data"); expect(html).toContain('<caption class="sr-only">');
  });
  it("a verified synthetic repair is labelled as a synthetic success", async () => {
    const r = await fixture("wrong-city-repair"); const html = renderToStaticMarkup(createElement(RepairAssessmentView, { report: r, repair: r.repairs[0]! }));
    expect(html).toContain("SYNTHETIC SUCCESS"); expect(html).toContain("Hard constraints: VALID"); expect(html).toContain("second source: separate provider lookup"); expect(html).toContain("10 of 10 met");
  });
  it("the 30-second explainer has four steps, states what UNKNOWN means, and offers the guided demo only when asked to", () => {
    const plain = renderToStaticMarkup(createElement(HowItWorks, {})); expect(plain).toContain("How it works, in 30 seconds"); expect((plain.match(/how-num/g) ?? []).length).toBe(4);
    expect(plain).toContain("UNKNOWN means “no evidence”"); expect(plain).not.toContain("guided demo");
    const guided = renderToStaticMarkup(createElement(HowItWorks, { onStartGuide: () => {} })); expect(guided).toContain("Start the 2-minute guided demo"); expect(guided).toContain("no network request to Qloo");
  });
  it.each([1, 2, 3] as const)("guide step %i names its place and offers back, next and exit", (step) => {
    const html = renderToStaticMarkup(createElement(GuideCard, { step, onBack: () => {}, onNext: () => {}, onExit: () => {} }));
    expect(html).toContain(`Guided demo · step ${step} of 3`); expect(html).toContain("Exit the guide"); expect(html).toContain(step === 3 ? "Finish the guide" : ">Next<"); expect(html).toContain(step === 1 ? "Back to the start" : ">Back<");
    expect(html).not.toMatch(/qloo-ref:|sha256|api[_-]?key/i);
  });
});
