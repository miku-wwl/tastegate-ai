import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKLIST_ITEMS, assessReport, assessRepair, type RepairAssessment } from "../src/audit/assessment";
import { repairAccepted } from "../src/audit/rules";
import { runAudit } from "../src/audit/workflow";
import type { AuditReport } from "../src/domain/contracts";
import { AuditReportSchema } from "../src/domain/report-schema";
import { getScenario, ScenarioIdSchema, type ScenarioId } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";

// The assessment is a read-only view of a validated report. These tests pin the rule it explains: REPAIR_VERIFIED needs every
// mandatory item, hard validity and cultural support are separate, and an authored success is labelled as synthetic.
beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite")); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
const run = async (id: ScenarioId, edit?: (s: ReturnType<typeof getScenario>) => void) => { const s = getScenario(id); edit?.(s); return AuditReportSchema.parse(await runAudit(s.input, createFixtureAdapter(s.world))); };
const met = (a: RepairAssessment) => a.checklist.every((c) => c.state === "PASS" || c.state === "NOT_APPLICABLE");

describe("repair assessment: one rule, explained", () => {
  it("lists every mandatory evidence class in a fixed order", () => {
    expect([...CHECKLIST_ITEMS]).toEqual(["IDENTITY", "BRANCH_CORROBORATION", "CITY", "COUNTRY", "TYPE", "OTHER_CONSTRAINTS", "CONSISTENCY", "PROVENANCE", "FRESHNESS", "CULTURAL_EVIDENCE"]);
  });
  it.each(ScenarioIdSchema.options)("scenario %s: verified == accepted == every mandatory item met", async (id) => {
    const report = await run(id);
    for (const { repair, assessment } of assessReport(report)) {
      expect(assessment.verified).toBe(repair.accepted); expect(met(assessment)).toBe(repair.accepted);
      expect(assessment.checklist.map((c) => c.item)).toEqual([...CHECKLIST_ITEMS]);
      expect(assessment.first_unmet === null).toBe(repair.accepted); expect(assessment.evidence_label).toBe("SYNTHETIC");
      expect(repairAccepted(repair.revalidation.verdict, repair.identity_basis)).toBe(repair.accepted);
    }
  });
  it("a verified synthetic repair is labelled as a synthetic success, never as evidence about real recommendations", async () => {
    const report = await run("wrong-city-repair"); const [a] = assessReport(report).map((x) => x.assessment);
    expect(a).toMatchObject({ verified: true, synthetic_success: true, evidence_label: "SYNTHETIC", hard_constraint_validity: "VALID", cultural_evidence_support: "SUPPORTED",
      identity_corroboration: "INDEPENDENT_PROVIDER_LOOKUP", first_unmet: null });
    expect(a!.checklist.find((c) => c.item === "FRESHNESS")).toMatchObject({ state: "NOT_APPLICABLE" });
    expect(a!.checklist.find((c) => c.item === "BRANCH_CORROBORATION")!.state).toBe("PASS");
  });
  it("a replacement that fails the city constraint is invalid even though Qloo-style evidence supports it", async () => {
    const report = await run("repair-fails"); const [a] = assessReport(report).map((x) => x.assessment);
    expect(a).toMatchObject({ verified: false, synthetic_success: false, hard_constraint_validity: "INVALID", cultural_evidence_support: "SUPPORTED" });
    expect(a!.first_unmet).toBe("CITY"); expect(a!.checklist.find((c) => c.item === "CITY")!.state).toBe("FAIL");
  });
  it("hard validity and cultural support are independent axes (all four combinations are expressible, none implies the other)", async () => {
    const report = await run("wrong-city-repair"); const repair = report.repairs[0]!;
    const edited = (change: (r: AuditReport) => void) => { const x = structuredClone(report); change(x); return assessRepair(x, x.repairs[0]!); };
    // valid + supported (as run)
    expect(assessRepair(report, repair)).toMatchObject({ hard_constraint_validity: "VALID", cultural_evidence_support: "SUPPORTED" });
    // valid + no cultural evidence: not verified, and not "wrong" either
    const noTaste = edited((r) => { r.repairs[0]!.revalidation.findings = r.repairs[0]!.revalidation.findings.filter((f) => f.code !== "TASTE_EVIDENCE_PRESENT"); });
    expect(noTaste).toMatchObject({ hard_constraint_validity: "VALID", cultural_evidence_support: "NOT_AVAILABLE" });
    expect(noTaste.checklist.find((c) => c.item === "CULTURAL_EVIDENCE")!.state).toBe("UNKNOWN"); expect(noTaste.first_unmet).toBe("CULTURAL_EVIDENCE");
    // invalid + supported / invalid + not available
    const wrongCity = edited((r) => { Object.assign(r.repairs[0]!.revalidation, { hard_constraints: "fail" }); const f = r.repairs[0]!.revalidation.findings.find((x) => x.code === "CITY_MATCH"); if (f) { f.code = "CITY_MISMATCH"; f.state = "fail"; } });
    expect(wrongCity).toMatchObject({ hard_constraint_validity: "INVALID", cultural_evidence_support: "SUPPORTED" });
    expect(wrongCity.checklist.find((c) => c.item === "CITY")!.state).toBe("FAIL");
  });
  it("an unestablished identity, a missing fact and a conflicting source each leave a named gap", async () => {
    const report = await run("wrong-city-repair"); const edit = (change: (r: AuditReport) => void) => { const x = structuredClone(report); change(x); return assessRepair(x, x.repairs[0]!); };
    expect(edit((r) => { r.repairs[0]!.revalidation.resolution = "unresolved"; }).checklist.find((c) => c.item === "IDENTITY")!.state).toBe("UNKNOWN");
    expect(edit((r) => { r.repairs[0]!.identity_basis = "user_confirmation"; })).toMatchObject({ identity_corroboration: "USER_CONFIRMATION_ONLY", first_unmet: "BRANCH_CORROBORATION" });
    expect(edit((r) => { r.repairs[0]!.identity_basis = null; })).toMatchObject({ identity_corroboration: "NONE" });
    expect(edit((r) => { r.repairs[0]!.revalidation.findings.push({ code: "FACT_MISSING", category: "hard_constraint", state: "unknown", constraint_id: "c1", evidence_refs: [], explanation: "authored" }); })
      .checklist.find((c) => c.item === "CONSISTENCY")!.state).toBe("UNKNOWN");
    const conflict = edit((r) => { r.repairs[0]!.revalidation.findings.push({ code: "FACT_CONFLICT", category: "integrity", state: "fail", constraint_id: null, evidence_refs: [], explanation: "authored" }); });
    expect(conflict).toMatchObject({ hard_constraint_validity: "INVALID", first_unmet: "BRANCH_CORROBORATION" }); expect(conflict.checklist.find((c) => c.item === "CONSISTENCY")!.state).toBe("FAIL");
    expect(edit((r) => { r.repairs[0]!.lookup_evidence_ref = "missing-evidence-id"; }).checklist.find((c) => c.item === "PROVENANCE")!.state).toBe("FAIL");
    expect(edit((r) => { r.repairs[0]!.revalidation.findings.push({ code: "PREFERENCE_UNRESOLVED", category: "uncertainty", state: "unknown", constraint_id: null, evidence_refs: [], explanation: "authored" }); })
      .checklist.find((c) => c.item === "CULTURAL_EVIDENCE")!.state).toBe("UNKNOWN");
  });
  it("a plan without a country constraint marks that item not applicable instead of passing or failing it", async () => {
    const report = await run("wrong-city-repair", (s) => { s.input.constraints = s.input.constraints.filter((c) => c.kind !== "country"); });
    const a = assessRepair(report, report.repairs[0]!); expect(a.checklist.find((c) => c.item === "COUNTRY")).toMatchObject({ state: "NOT_APPLICABLE" });
  });
  it("is a pure view: it changes nothing and prints no provider identifier", async () => {
    const report = await run("nyc-evening"); const before = JSON.stringify(report); const out = assessReport(report);
    expect(JSON.stringify(report)).toBe(before);
    expect(JSON.stringify(out.map((x) => x.assessment))).not.toMatch(/qloo-ref:/);
  });
});
