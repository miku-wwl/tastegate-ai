import { describe, expect, it } from "vitest";
import { AuditInputSchema, CandidateAuditSchema, EvidenceSchema } from "../src/domain/contracts";
import { AuditReportSchema } from "../src/domain/report-schema";
import { runAudit } from "../src/audit/workflow";
import { getScenario } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";

describe("strict input boundary", () => {
  it("accepts the authored NYC input without coercion", () => {
    const { input } = getScenario("nyc-evening"); expect(AuditInputSchema.parse(input)).toEqual(input);
  });
  it.each(["source_mode", "evidence", "api_key", "execution_timeout_seconds", "maxCalls"])("rejects client authority field %s", (field) => {
    expect(AuditInputSchema.safeParse({ ...getScenario("nyc-evening").input, [field]: "forged" }).success).toBe(false);
  });
  it("rejects extra nested fields and noninteger/coerced counts", () => {
    const { input } = getScenario("valid-only");
    expect(AuditInputSchema.safeParse({ ...input, recommendations: [{ ...input.recommendations[0], provider: "qloo" }] }).success).toBe(false);
    for (const value of ["3", true, 1.5, NaN, Infinity, 0, 4])
      expect(AuditInputSchema.safeParse({ ...input, constraints: [{ id: "max", kind: "max_items", value }] }).success).toBe(false);
  });
  it.each(["preferences", "constraints", "recommendations"] as const)("rejects duplicate %s IDs", (key) => {
    const { input } = getScenario("valid-only");
    expect(AuditInputSchema.safeParse({ ...input, [key]: [input[key][0], input[key][0]] }).success).toBe(false);
  });
  it("rejects unsupported operational constraints instead of dropping them", () => {
    expect(AuditInputSchema.safeParse({ ...getScenario("valid-only").input, constraints: [{ id: "hours", kind: "opening_at", value: "tonight" }] }).success).toBe(false);
  });
  it("rejects lone Unicode surrogates without rejecting ordinary emoji", () => {
    const { input } = getScenario("valid-only");
    expect(AuditInputSchema.safeParse({ ...input, task: "\ud800" }).success).toBe(false);
    expect(AuditInputSchema.safeParse({ ...input, task: "Music 🎵" }).success).toBe(true);
  });
  it("enforces UTF-8 bytes in addition to bounded strings", () => {
    const { input } = getScenario("nyc-evening");
    input.recommendations.forEach((r) => { r.claims = Array(5).fill("😀".repeat(300)); });
    expect(AuditInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("output schemas enforce evidence, not just JSON shape", () => {
  it("validates actual generated candidate/evidence/report objects", async () => {
    const s = getScenario("wrong-city-repair"); const r = await runAudit(s.input, createFixtureAdapter(s.world));
    expect(AuditReportSchema.parse(r)).toEqual(r);
    expect(CandidateAuditSchema.safeParse(r.repairs[0]!.revalidation).success).toBe(true);
    expect(EvidenceSchema.safeParse(r.evidence[0]).success).toBe(true);
  });
  it("rejects a PASS substituted over known wrong-city facts", async () => {
    const s = getScenario("wrong-city-repair"); const r = await runAudit(s.input, createFixtureAdapter(s.world));
    r.original_audits[0]!.hard_constraints = "pass"; r.original_audits[0]!.verdict = "PASS";
    expect(AuditReportSchema.safeParse(r).success).toBe(false);
  });
});
