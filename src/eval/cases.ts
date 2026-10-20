import { runAudit, runRecordedAudit, type AuditOptions } from "../audit/workflow";
import type { AnyAuditReport, AuditInput, Confirmation, Entity, ProviderAuditReport } from "../domain/contracts";
import { getScenario, type ScenarioId } from "../fixtures/scenarios";
import { createFixtureAdapter } from "../qloo/fixture-adapter";
import type { FixtureObservation, FixtureQlooAdapter, FixtureWorld } from "../qloo/ports";
import { createRecordedAdapter, type VerifiedRecordings } from "../qloo/recorded-adapter";
import { RECORDED_INSIGHTS_POLICY, RECORDED_SCENARIO_ID, getRecordedScenarioInput } from "../scenarios/recorded-nyc";
import type { Built, EvalCase, Gold } from "./harness";

// Authored development cases: they exercise known failure patterns and are NOT a held-out benchmark (see holdout.ts).
const gold = (g: Partial<Gold> & Pick<Gold, "expectStop">): Gold =>
  ({ violations: [], validOriginals: [], unresolvable: [], validRepairs: 0, invalidRepairs: 0, requiresConfirmation: 0, ...g });
type Scenario = ReturnType<typeof getScenario>;
// The entity a recommendation means is known to the authored world, never to the gate: exactly one same-named place, else nobody.
const intendedByName = (world: FixtureWorld, input: AuditInput) => (slot: string): Entity | null => {
  const rec = input.recommendations.find((r) => r.id === slot); const hits = world.entities.filter((e) => e.name === rec?.name && e.kind !== "artist" && e.kind !== "movie");
  return hits.length === 1 ? hits[0]! : null;
};
function fixture(id: ScenarioId, edit?: (s: Scenario) => void, wrap?: (a: FixtureQlooAdapter, w: FixtureWorld) => FixtureQlooAdapter, options?: AuditOptions) {
  return (): Built => {
    const s = getScenario(id); edit?.(s);
    const base = createFixtureAdapter(s.world); const adapter = wrap ? wrap(base, s.world) : base;
    return { input: s.input, adapter, intended: intendedByName(s.world, s.input), truthOf: (id) => s.world.entities.find((e) => e.id === id) ?? null, runGate: () => runAudit(s.input, adapter, options) };
  };
}
const hideLookup = (name: string) => (a: FixtureQlooAdapter): FixtureQlooAdapter => ({ ...a, async searchEntity(req, ctx) {
  const result = await a.searchEntity(req, ctx);
  if (req.query === name && result.snapshot.kind === "entity_lookup") result.snapshot.matches = [];
  return result;
} });
export function syntheticCases(): EvalCase[] {
  const c = (id: string, category: string, description: string, g: Gold, build: () => Built, paired = true): EvalCase =>
    ({ id, stratum: "SYNTHETIC", category, description, gold: g, paired, build });
  return [
    c("S01", "mixed", "Valid item with an unsupported claim, a wrong-city item and an unresolved item", gold({ violations: [{ slot: "original-2", constraint: "c1" }],
      validOriginals: ["original-1"], unresolvable: ["original-3"], validRepairs: 1, expectStop: "COMPLETE" }), fixture("nyc-evening")),
    c("S02", "valid", "A valid recommendation must not be rejected", gold({ validOriginals: ["original-1"], expectStop: "COMPLETE" }), fixture("valid-only")),
    c("S03", "constraint_violation", "Wrong-city recommendation with a valid replacement", gold({ violations: [{ slot: "original-2", constraint: "c1" }], validRepairs: 1, expectStop: "COMPLETE" }), fixture("wrong-city-repair")),
    c("S04", "unresolved", "Unresolvable venue keeps its slot and uncertainty", gold({ unresolvable: ["original-3"], expectStop: "COMPLETE" }), fixture("unresolved-only")),
    c("S05", "missing_evidence", "Resolved venue without taste evidence is not rejected or replaced", gold({ validOriginals: ["original-1"], expectStop: "COMPLETE" }), fixture("missing-evidence")),
    c("S06", "constraint_violation", "Replacement also violates the city constraint", gold({ violations: [{ slot: "original-2", constraint: "c1" }, { slot: "repair:0", constraint: "c1" }],
      invalidRepairs: 1, expectStop: "COMPLETE" }), fixture("repair-fails")),
    c("S07", "constraint_violation", "Wrong country and a brand where a place is required", gold({ violations: [{ slot: "original-1", constraint: "c2" }, { slot: "original-1", constraint: "c3" }],
      expectStop: "COMPLETE" }), fixture("valid-only", (s) => { const p = s.world.entities.find((e) => e.id === "synthetic:place-1")!; p.country = "JP"; p.kind = "brand"; })),
    c("S08", "missing_evidence", "Missing city fact: no city PASS and no false rejection", gold({ validOriginals: ["original-1"], expectStop: "COMPLETE" }),
      fixture("valid-only", (s) => { s.world.entities.find((e) => e.id === "synthetic:place-1")!.city = null; })),
    c("S09", "ambiguous", "Two same-name branches require a choice; no top-hit selection", gold({ unresolvable: ["original-1"], expectStop: "NEEDS_INPUT" }),
      fixture("valid-only", (s) => { const v = s.world.entities.find((e) => e.id === "synthetic:place-1")!; s.world.entities.push({ ...v, id: "synthetic:another-branch" }); })),
    c("S10", "constraint_violation", "Too many items: count failure on every slot, no venue swap", gold({ violations: [{ slot: "original-1", constraint: "c4" }, { slot: "original-2", constraint: "c4" },
      { slot: "original-2", constraint: "c1" }, { slot: "original-3", constraint: "c4" }], expectStop: "COMPLETE" }),
      fixture("nyc-evening", (s) => { s.input.constraints.find((x) => x.kind === "max_items")!.value = 2; })),
    // Robustness cases: they test how the gate fails, so a quality comparison with a baseline would be meaningless.
    c("S11", "api_failure", "Adapter failure: one attempt, no retry, explicit UNKNOWN", gold({ validOriginals: ["original-1"], expectStop: "ADAPTER_ERROR" }),
      fixture("valid-only", undefined, (a) => ({ ...a, async searchEntity() { throw new Error("injected failure"); } })), false),
    c("S12", "api_failure", "Timeout: late response discarded, explicit UNKNOWN", gold({ validOriginals: ["original-1"], expectStop: "TIMEOUT" }),
      fixture("valid-only", undefined, (a) => ({ ...a, async searchEntity(r, ctx) { await new Promise((ok) => setTimeout(ok, 40)); return a.searchEntity(r, ctx); } }), { callTimeoutMs: 5 }), false),
    c("S13", "integrity", "Forged provenance from the adapter is rejected", gold({ expectStop: "PROVENANCE_REJECTED" }),
      fixture("valid-only", undefined, (a) => ({ ...a, async searchEntity(r, ctx) { return { ...await a.searchEntity(r, ctx), fixture_id: "forged" } as FixtureObservation; } })), false),
    c("S14", "constraint_violation", "Unconfirmed replacement contradicted by its own discovery facts", gold({ violations: [{ slot: "original-2", constraint: "c1" }, { slot: "repair:0", constraint: "c1" }],
      invalidRepairs: 1, expectStop: "COMPLETE" }), fixture("repair-fails", undefined, hideLookup("SYNTHETIC Midtown Listening Cafe"))),
  ];
}

// Gold identities follow the independent Phase 1B reviews: the band Radiohead, the 2000 film, the music
// genre "Jazz" and the corroborated NYC branch. Choices are made by public label, as a user would.
function reviewedChoices(r: ProviderAuditReport, overrides: Record<string, Confirmation> = {}): Confirmation[] {
  return r.pending_confirmations.map((p) => {
    if (overrides[p.target_id]) return overrides[p.target_id]!;
    const s = r.evidence.find((e) => e.evidence_id === p.lookup_ref)!.snapshot;
    const anchor = ({ p1: "Radiohead", p2: "In the Mood for Love", p3: "Jazz" } as Record<string, string>)[p.target_id];
    const pick = s.kind === "tag_lookup" ? s.matches.find((m) => m.name === anchor && m.type_label === "genre · music") :
      s.kind === "entity_lookup" ? (anchor ? s.matches.find((m) => m.name === anchor) : s.matches.length === 1 ? s.matches[0] : undefined) : undefined;
    if (!pick) throw new Error("GOLD_CANDIDATE_NOT_FOUND");
    return { target_id: p.target_id, decision: "select" as const, ref: pick.id };
  });
}
export function recordedCases(recordings: VerifiedRecordings): EvalCase[] {
  const adapter = createRecordedAdapter(recordings); const input = getRecordedScenarioInput();
  const run = (confirmations?: Confirmation[]) => runRecordedAudit(getRecordedScenarioInput(), adapter,
    { scenarioId: RECORDED_SCENARIO_ID, insightsPolicy: RECORDED_INSIGHTS_POLICY, confirmations });
  const firstRound = () => run();
  // The oracle reads the recorded lookup for the venue's exact name. A venue with no recording is intended-but-unknown.
  const intended = (slot: string): Entity | null => {
    const rec = input.recommendations.find((r) => r.id === slot);
    const hit = [...recordings.searches.values()].find((v) => v.capture.request_params.query === rec?.name && v.capture.request_params.types === "urn:entity:place");
    return hit && hit.candidates.length === 1 ? hit.candidates[0]! : null;
  };
  const c = (id: string, category: string, description: string, g: Gold, go: () => Promise<AnyAuditReport>): EvalCase =>
    ({ id, stratum: "RECORDED_LIVE", category, description, gold: g, paired: true, build: () => ({ input: getRecordedScenarioInput(), adapter, intended, runGate: go }) });
  return [
    c("R01", "ambiguous", "Recorded candidates for 3 taste signals and 1 venue all wait for explicit confirmation", gold({ validOriginals: ["original-1"],
      unresolvable: ["original-2"], requiresConfirmation: 4, expectStop: "NEEDS_INPUT" }), firstRound),
    c("R02", "cross_domain", "Reviewed identities confirmed; recorded artist-to-place discovery proposes an out-of-city place",
      gold({ validOriginals: ["original-1"], unresolvable: ["original-2"], violations: [{ slot: "repair:0", constraint: "c1" }, { slot: "repair:0", constraint: "c2" }],
        invalidRepairs: 1, expectStop: "COMPLETE" }), async () => run(reviewedChoices(await firstRound()))),
    c("R03", "unresolved", "A different (tribute) artist confirmed: the recorded discovery is not replayed for it", gold({ validOriginals: ["original-1"],
      unresolvable: ["original-2"], expectStop: "COMPLETE" }), async () => {
      const first = await firstRound(); const p1 = first.evidence.find((e) => e.evidence_id === first.pending_confirmations[0]!.lookup_ref)!.snapshot;
      const tribute = p1.kind === "entity_lookup" ? p1.matches.find((m) => m.name !== "Radiohead") : undefined;
      if (!tribute) throw new Error("GOLD_CANDIDATE_NOT_FOUND");
      return run(reviewedChoices(first, { p1: { target_id: "p1", decision: "select", ref: tribute.id } }));
    }),
    c("R04", "missing_evidence", "All taste signals skipped: no Insights request and no repair", gold({ validOriginals: ["original-1"], unresolvable: ["original-2"], expectStop: "COMPLETE" }),
      async () => run(reviewedChoices(await firstRound(), Object.fromEntries(["p1", "p2", "p3"].map((t) => [t, { target_id: t, decision: "skip" as const }]))))),
  ];
}
