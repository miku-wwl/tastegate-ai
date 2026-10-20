import { rm } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODE_INFO, REPAIR_REASON_TEXT, REPAIR_STATUS, SCREENS, blockingChoices, comparisonStats, evidenceSource, highlights, isProvider, pendingChoices, reachableScreens, repairRows, replacementChoices, screenAfterRun, slotOutcomes, statusText, subChecks } from "../app/view-model";
import { runAudit, runRecordedAudit } from "../src/audit/workflow";
import { RepairReasonSchema, RepairStatusSchema, type Confirmation, type ProviderAuditReport } from "../src/domain/contracts";
import { getScenario } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";
import { providerRef } from "../src/qloo/provider-ref";
import { createRecordedAdapter, loadRecordedEvidence } from "../src/qloo/recorded-adapter";
import { RECORDED_INSIGHTS_POLICY, RECORDED_SCENARIO_ID, getRecordedScenarioInput } from "../src/scenarios/recorded-nyc";
import { runLiveReport } from "./helpers/live-session";
import { AUTHORED, seedRecordedRoot } from "./helpers/recorded-root";

const fixture = async (id: Parameters<typeof getScenario>[0]) => { const s = getScenario(id); return runAudit(s.input, createFixtureAdapter(s.world)); };
let root = ""; let waiting: ProviderAuditReport; let done: ProviderAuditReport;
beforeAll(async () => {
  root = await seedRecordedRoot(); const adapter = createRecordedAdapter(await loadRecordedEvidence(root));
  const options = (confirmations?: Confirmation[]) => ({ scenarioId: RECORDED_SCENARIO_ID, insightsPolicy: RECORDED_INSIGHTS_POLICY, confirmations });
  waiting = await runRecordedAudit(getRecordedScenarioInput(), adapter, options());
  const sel = (target_id: string, id: string, kind: "entity" | "tag" = "entity"): Confirmation => ({ target_id, decision: "select", ref: providerRef(kind, id) });
  done = await runRecordedAudit(getRecordedScenarioInput(), adapter, options([sel("p1", AUTHORED.artist), sel("p2", AUTHORED.film), sel("p3", AUTHORED.musicTag, "tag"), sel("original-1", AUTHORED.venue)]));
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe("presentation view-model", () => {
  it("separates a verified venue awaiting taste evidence from an unresolved slot", () => {
    expect(slotOutcomes(done).map((s) => [s.recommendation.name, s.outcome])).toEqual([["Blue Note New York", "keep_pending"], ["Village Vanguard", "hold"]]);
    expect(subChecks(done.original_audits[0]!, 2).map((c) => [c.name, c.tone])).toEqual([["Identity", "pass"], ["Constraints", "pass"], ["Taste evidence", "unknown"], ["Claims", "unknown"]]);
  });
  it("leads with plain-language findings that come only from the validated report", () => {
    const text = highlights(done).map((h) => h.text);
    expect(text).toContain("Rejected the proposed replacement Authored Far Pavilion for Village Vanguard: wrong city and wrong country, according to the provider's own data.");
    expect(text).toContain("Blue Note New York: identity and all hard constraints verified; cultural fit not yet established.");
    expect(text).toContain("4 identities confirmed by you among Qloo candidates; none were selected automatically.");
    expect(text).toContain("3 upstream claims remain unverified; free-text claims are never marked as supported.");
  });
  it("labels every confirmation option with type and context, plus an explicit none-of-these path", () => {
    const choices = pendingChoices(waiting);
    expect(choices.map((c) => [c.targetId, c.options.length])).toEqual([["p1", 2], ["p2", 2], ["p3", 2], ["original-1", 1]]);
    expect(choices[2]!.options.map((o) => `${o.title} — ${o.detail}`)).toEqual(["Jazz — genre · music · used for artist, album", "Jazz — genre · media · used for book"]);
    expect(choices[3]!.question).toBe("Is this the venue the plan meant by “Blue Note New York”?");
  });
  it("describes recorded, unavailable and synthetic evidence sources distinctly", () => {
    const recorded = done.evidence.find((e) => e.capture)!; const missing = done.evidence.find((e) => e.snapshot.kind === "unavailable")!;
    expect(evidenceSource(done, recorded.evidence_id)).toMatchObject({ label: "Recorded Qloo", tone: "recorded" });
    expect(evidenceSource(done, missing.evidence_id)).toMatchObject({ label: "Unavailable", tone: "unknown" });
  });
  it("covers synthetic outcomes: validated replacement, removal and verified keep", async () => {
    const repaired = await fixture("wrong-city-repair"); const failed = await fixture("repair-fails"); const valid = await fixture("valid-only");
    expect(slotOutcomes(repaired)[0]!.outcome).toBe("replaced");
    expect(slotOutcomes(failed)[0]!.outcome).toBe("remove");
    expect(slotOutcomes(valid)[0]!.outcome).toBe("verified");
    expect(evidenceSource(valid, valid.evidence[1]!.evidence_id).label).toBe("Synthetic");
    expect(highlights(repaired).some((h) => h.text.startsWith("SYNTHETIC Jersey Lounge replaced by SYNTHETIC Midtown Listening Cafe"))).toBe(true);
  });
});

describe("wizard navigation, modes and repair statuses", () => {
  it("opens Identity while identities are pending and Audit otherwise; reachability follows the report", async () => {
    expect(screenAfterRun(waiting)).toBe(2); expect(screenAfterRun(done)).toBe(3); expect(screenAfterRun(await fixture("valid-only"))).toBe(3);
    expect([...reachableScreens(null)]).toEqual([1]); expect([...reachableScreens(waiting)]).toEqual([1, 2]);
    expect([...reachableScreens(done)]).toEqual([1, 2, 3, 4, 5]); expect([...reachableScreens(await fixture("valid-only"))]).toEqual([1, 3, 4, 5]); // no identity step in a synthetic run
    expect(SCREENS.map((s) => s.label)).toEqual(["Input", "Identity", "Audit", "Repair", "Compare"]);
  });
  it("states progress in plain words", async () => {
    expect(statusText(waiting)).toBe("Waiting for your confirmation: 4 identities."); expect(statusText(done)).toMatch(/^Final status: [A-Z_]+\. Completion: (complete|partial)\.$/);
    expect(statusText(await fixture("wrong-city-repair"))).toBe("Final status: PASS. Completion: complete.");
  });
  it("names the three evidence modes distinctly and never alike", () => {
    expect(Object.values(MODE_INFO).map((m) => m.label)).toEqual(["FIXTURE", "RECORDED", "LIVE"]);
    expect(new Set(Object.values(MODE_INFO).map((m) => m.tone)).size).toBe(3); expect(new Set(Object.values(MODE_INFO).map((m) => m.badge)).size).toBe(3);
    expect(isProvider(done)).toBe(true);
  });
  it("covers every repair status and reason with plain text", () => {
    for (const status of RepairStatusSchema.options) { expect(REPAIR_STATUS[status].label.length).toBeGreaterThan(3); expect(REPAIR_STATUS[status].icon).toBeTruthy(); }
    for (const reason of RepairReasonSchema.options) expect(REPAIR_REASON_TEXT[reason].length).toBeGreaterThan(20);
    expect(new Set(RepairStatusSchema.options.map((s) => REPAIR_STATUS[s].label)).size).toBe(RepairStatusSchema.options.length);
  });
  it("reports each repair target with its honest status", async () => {
    const verified = repairRows(await fixture("wrong-city-repair")); const rejected = repairRows(await fixture("repair-fails")); const none = repairRows(await fixture("valid-only"));
    expect(verified.map((r) => [r.name, r.outcome.status, r.outcome.reason, !!r.accepted])).toEqual([["SYNTHETIC Jersey Lounge", "REPAIR_VERIFIED", "REPLACEMENT_VERIFIED", true]]);
    expect(rejected.map((r) => [r.outcome.status, r.outcome.reason, !!r.accepted, r.repairs.length])).toEqual([["REPAIR_REJECTED", "REPLACEMENT_FAILED_HARD_CHECK", false, 1]]);
    expect(none).toEqual([]);
    const real = repairRows(done); expect(real.map((r) => [r.name, r.outcome.status])).toEqual([["Village Vanguard", "REPAIR_REJECTED"]]);
    expect(real[0]!.accepted).toBeNull(); // a rejected replacement is never presented as a repair
  });
  it("derives comparison numbers from the validated report only", async () => {
    expect(comparisonStats(done)).toMatchObject({ items: 2, hardViolations: 0, identityNotEstablished: 1, unverifiedClaims: 3, keptVerified: 1, replaced: 0, removed: 0, held: 1,
      repairTargets: 1, repairsProposed: 1, repairVerified: 0, repairRejected: 1, requests: 0 });
    expect(comparisonStats(await fixture("wrong-city-repair"))).toMatchObject({ items: 1, hardViolations: 1, replaced: 1, repairVerified: 1, repairRejected: 0, requests: 0 });
    expect(comparisonStats(await fixture("repair-fails"))).toMatchObject({ items: 1, hardViolations: 1, replaced: 0, removed: 1, repairVerified: 0, repairRejected: 1 });
    expect(comparisonStats(await fixture("valid-only"))).toMatchObject({ items: 1, hardViolations: 0, keptVerified: 1, repairTargets: 0 });
  });
  it("separates blocking identity questions from non-blocking replacement confirmations", () => {
    expect(blockingChoices(waiting).map((c) => c.targetId)).toEqual(["p1", "p2", "p3", "original-1"]); expect(replacementChoices(waiting)).toEqual([]);
    expect(replacementChoices(done).every((c) => c.kind === "replacement")).toBe(true);
  });
  it("labels live evidence as live, not as a recording", async () => {
    const { report } = await runLiveReport(); const evidence = report.evidence.find((e) => e.capture)!;
    expect(evidenceSource(report, evidence.evidence_id)).toMatchObject({ label: "Live Qloo", tone: "live" }); expect(evidenceSource(report, evidence.evidence_id).detail).toMatch(/^LIVE request · GET \/search/);
    expect(isProvider(report)).toBe(true); expect(MODE_INFO[report.source_mode].label).toBe("LIVE");
    const unavailable = await runLiveReport(undefined, { status: 429 });
    expect(highlights(unavailable.report).some((h) => /not completed \(refused, failed or outside the grant\)/.test(h.text))).toBe(true);
  });
});
