import { describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/workflow";
import { digest } from "../src/domain/contracts";
import { AuditReportSchema } from "../src/domain/report-schema";
import { getScenario } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";
import type { FixtureObservation, FixtureQlooAdapter } from "../src/qloo/ports";

describe("forged provenance fails closed", () => {
  it.each(["source_mode", "fixture_id"])("rejects adapter observation with forged %s", async (field) => {
    const s = getScenario("valid-only"); const base = createFixtureAdapter(s.world);
    const adapter: FixtureQlooAdapter = { ...base, async searchEntity(r, c) {
      return { ...await base.searchEntity(r, c), [field]: "forged" } as FixtureObservation;
    } };
    const r = await runAudit(s.input, adapter);
    expect(r.stop_reason).toBe("PROVENANCE_REJECTED"); expect(r.final_status).toBe("BLOCKED");
    expect(r.usage.fixture_calls).toBe(1); expect(r.evidence).toHaveLength(1);
  });
  it("rejects ranking entries outside the requested shortlist", async () => {
    const s = getScenario("valid-only"); const base = createFixtureAdapter(s.world);
    const r = await runAudit(s.input, { ...base, async rankPlaces(req, ctx) {
      const observation = await base.rankPlaces(req, ctx);
      if (observation.snapshot.kind === "rank_places") observation.snapshot.ordered_entity_ids = ["synthetic:invented"];
      return observation;
    } });
    expect(r.stop_reason).toBe("PROVENANCE_REJECTED"); expect(r.final_status).toBe("BLOCKED"); expect(r.usage.repair_rounds).toBe(0);
  });
  it("rejects a changed signal context rather than claiming the wrong taste query", async () => {
    const s = getScenario("valid-only"); const base = createFixtureAdapter(s.world);
    const r = await runAudit(s.input, { ...base, async rankPlaces(req, ctx) {
      const observation = await base.rankPlaces(req, ctx);
      if (observation.snapshot.kind === "rank_places") observation.snapshot.preference_entity_ids = [];
      return observation;
    } });
    expect(r.final_status).toBe("BLOCKED"); expect(r.stop_reason).toBe("PROVENANCE_REJECTED");
  });
  it.each(["dangling", "cross-run", "snapshot", "pointer", "live", "fake-upstream-id", "false-rank", "omitted-original", "false-completion", "wrong-fact-reference", "fake-explanation", "missing-revalidation-state"])("report validator rejects %s tampering", async (attack) => {
    const s = getScenario("nyc-evening"); const r = await runAudit(s.input, createFixtureAdapter(s.world));
    if (attack === "dangling") r.original_audits[0]!.findings[0]!.evidence_refs = ["invented-reference"];
    if (attack === "cross-run") r.evidence[0]!.run_id = "00000000-0000-4000-8000-000000000001";
    if (attack === "snapshot") r.evidence[0]!.warnings.push("changed") && (r.evidence[0]!.query_fingerprint = "0".repeat(64));
    if (attack === "pointer") r.evidence[0]!.pointer = "/nonexistent";
    if (attack === "live") Object.assign(r, { source_mode: "live" });
    if (attack === "fake-upstream-id") Object.assign(r.evidence[0]!, { upstream_request_id: "invented-provider-id" });
    if (attack === "false-rank") r.original_audits[0]!.cultural_relevance!.ordinal_rank = 2;
    if (attack === "omitted-original") r.original_audits.pop();
    if (attack === "false-completion") { r.final_status = "PASS"; r.completion = "complete"; }
    if (attack === "wrong-fact-reference") r.original_audits[1]!.findings[0]!.evidence_refs = [r.evidence[1]!.evidence_id];
    if (attack === "fake-explanation") r.original_audits[0]!.explainability = "available";
    if (attack === "missing-revalidation-state") r.trace = r.trace.filter((t) => t.state !== "Revalidate" || t.call_id !== null);
    expect(AuditReportSchema.safeParse(r).success).toBe(false);
  });
  it("rehashing a snapshot cannot hide mismatched claim facts or query inputs", async () => {
    const s = getScenario("wrong-city-repair"); const r = await runAudit(s.input, createFixtureAdapter(s.world));
    const ranked = r.evidence.find((e) => e.snapshot.kind === "rank_places")!;
    if (ranked.snapshot.kind === "rank_places") ranked.snapshot.preference_tag_ids = [];
    ranked.query_fingerprint = digest(ranked.snapshot);
    expect(AuditReportSchema.safeParse(r).success).toBe(false);
  });
});
