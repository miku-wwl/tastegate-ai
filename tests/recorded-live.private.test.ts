import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runRecordedAudit } from "../src/audit/workflow";
import type { Confirmation, ProviderAuditReport } from "../src/domain/contracts";
import { ProviderAuditReportSchema } from "../src/domain/report-schema";
import { RECORDED_SPECS, createRecordedAdapter, loadRecordedEvidence } from "../src/qloo/recorded-adapter";
import { RECORDED_INSIGHTS_POLICY, RECORDED_SCENARIO_ID, getRecordedScenarioInput } from "../src/scenarios/recorded-nyc";
import { culturalComparison } from "../app/cultural-comparison";

// Runs only where the owner's ignored private captures exist (never in a clean clone or CI). It asserts
// generic invariants only: no provider ID, location, score or returned name is written into this file.
const available = existsSync("private/qloo-probes/p05/attempts/154bd4c0-ea64-49c5-ad95-cb57efd7647a/response.raw.json");
const options = (confirmations?: Confirmation[]) => ({ scenarioId: RECORDED_SCENARIO_ID, insightsPolicy: RECORDED_INSIGHTS_POLICY, confirmations });
// The user's choices, made by exact public query label and public tag category (documented in Phase 1B reports).
function choose(report: ProviderAuditReport): Confirmation[] {
  return report.pending_confirmations.map((p) => {
    const s = report.evidence.find((e) => e.evidence_id === p.lookup_ref)!.snapshot;
    const anchor = { p1: "Radiohead", p2: "In the Mood for Love", p3: "Jazz" }[p.target_id as "p1" | "p2" | "p3"];
    const pick = s.kind === "tag_lookup" ? s.matches.find((m) => m.name === anchor && m.type_label === "genre · music") :
      s.kind === "entity_lookup" ? (anchor ? s.matches.find((m) => m.name === anchor) : s.matches.length === 1 ? s.matches[0] : undefined) : undefined;
    return { target_id: p.target_id, decision: "select" as const, ref: pick!.id };
  });
}
async function providerIdentifiers(): Promise<string[]> {
  const found = new Set<string>();
  // Provider entity/place IDs and tag URNs. (External social handles are public names, not provider IDs.)
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
      if (typeof x === "string" && (["entity_id", "place_id"].includes(k) ||
          (["id", "tag_id"].includes(k) && /^urn:tag:/.test(x)) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x))) found.add(x);
      walk(x);
    }
  };
  for (const s of RECORDED_SPECS.filter((x) => x.reason === "SCHEMA_REVIEW_REQUIRED"))
    walk(JSON.parse(await readFile(`private/qloo-probes/${s.probe.toLowerCase()}/attempts/${s.attempt}/response.raw.json`, "utf8")));
  return [...found];
}
afterEach(() => vi.restoreAllMocks());
describe.skipIf(!available)("recorded Qloo evidence (owner-local private captures only)", () => {
  it("verifies every capture, then stops for explicit identity confirmation without network I/O", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const set = await loadRecordedEvidence(process.cwd());
    // P06 appears only once its single approved request has been executed, reviewed and sealed.
    expect(set.history.map((h) => [h.probe, h.outcome])).toEqual([["P01", "REPLAYABLE"], ["P02", "REPLAYABLE"],
      ["P03", "RESPONSE_TOO_LARGE_NOT_SAVED"], ["P03R", "REPLAYABLE"], ["P04", "REPLAYABLE"], ["P05", "REPLAYABLE"], ...(set.shortlist.state === "READY" ? [["P06", "REPLAYABLE"]] : [])]);
    const r = await runRecordedAudit(getRecordedScenarioInput(), createRecordedAdapter(set), options());
    expect(r.stop_reason).toBe("NEEDS_INPUT");
    expect(r.pending_confirmations.map((p) => [p.target_id, p.candidate_ids.length])).toEqual([["p1", 5], ["p2", 5], ["p3", 5], ["original-1", 1]]);
    expect(r.original_audits.map((a) => a.resolution)).toEqual(["unconfirmed", "unresolved"]);
    expect(r.usage).toMatchObject({ qloo_dispatches: 0, adapter_calls: 5, recorded_replays: 4, unavailable_operations: 1, repair_rounds: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("after confirmation, a culturally discovered replacement is rejected on the provider's own geography", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const set = await loadRecordedEvidence(process.cwd()); const ranked = set.shortlist.state === "READY"; const adapter = createRecordedAdapter(set);
    const first = await runRecordedAudit(getRecordedScenarioInput(), adapter, options());
    const r = await runRecordedAudit(getRecordedScenarioInput(), adapter, options(choose(first)));
    expect(ProviderAuditReportSchema.parse(r)).toEqual(r);
    expect(r.preference_resolution.map((p) => p.status)).toEqual(["resolved", "resolved", "resolved"]);
    const [venue, unresolvedSlot] = r.original_audits;
    // Without a sealed shortlist ranking a verified venue has no taste evidence (UNKNOWN); with it, the venue and the proposal are
    // ranked in ONE query, and the venue is REVIEW (identity and constraints verified, claims still open).
    if (ranked) expect(venue).toMatchObject({ resolution: "resolved", hard_constraints: "pass", evidence_coverage: "partial", verdict: "REVIEW" });
    else expect(venue).toMatchObject({ resolution: "resolved", hard_constraints: "pass", evidence_coverage: "missing", verdict: "UNKNOWN" });
    expect(unresolvedSlot!.findings).toContainEqual(expect.objectContaining({ code: "EVIDENCE_UNAVAILABLE" }));
    expect(r.repairs).toHaveLength(1);
    const repair = r.repairs[0]!;
    expect(repair).toMatchObject({ replaces: "original-2", accepted: false });
    expect(repair.revalidation.verdict).toBe("BLOCKED"); // a high rank never rescues a failed hard constraint
    if (ranked) {
      const ranks = [venue!.cultural_relevance?.ordinal_rank, repair.revalidation.cultural_relevance?.ordinal_rank];
      expect([...ranks].sort()).toEqual([1, 2]); // one query, two distinct positions; the order itself is not asserted here
    }
    expect(repair.revalidation.findings.filter((f) => f.state === "fail").map((f) => f.code)).toEqual(["CITY_MISMATCH", "COUNTRY_MISMATCH"]);
    const comparison = culturalComparison(r);
    expect(comparison.valid_candidates).toBe(1);
    expect(comparison.status).toBe("INSUFFICIENT_VALID_CANDIDATES");
    expect(comparison.rows.filter((row) => row.role === "REPLACEMENT").every((row) => !row.eligible)).toBe(true);
    expect(r).toMatchObject({ before_status: "UNKNOWN", final_status: "UNKNOWN", completion: "partial", stop_reason: "COMPLETE" });
    expect(r.usage).toMatchObject({ qloo_dispatches: 0, adapter_calls: 8, recorded_replays: ranked ? 6 : 5, unavailable_operations: ranked ? 2 : 3, repair_rounds: 1 });
    const text = JSON.stringify(r);
    for (const id of await providerIdentifiers()) expect(text).not.toContain(id);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
