import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/workflow";
import { getScenario, ScenarioIdSchema } from "../src/fixtures/scenarios";
import { createFixtureAdapter } from "../src/qloo/fixture-adapter";
import { AuditReportSchema } from "../src/domain/report-schema";

describe("executable offline end-to-end evidence", () => {
  it("computes all seven scenarios and writes versioned run evidence separately from fixtures", async () => {
    const reports = [];
    for (const id of ScenarioIdSchema.options) {
      const scenario = getScenario(id);
      const report = await runAudit(scenario.input, createFixtureAdapter(scenario.world));
      reports.push({ scenario: id, report: AuditReportSchema.parse(report) });
    }
    expect(reports.map((x) => [x.scenario, x.report.final_status])).toEqual([
      ["nyc-evening", "UNKNOWN"], ["valid-only", "PASS"], ["wrong-city-repair", "PASS"],
      ["unresolved-only", "UNKNOWN"], ["missing-evidence", "UNKNOWN"], ["repair-fails", "BLOCKED"],
      ["valid-pool-priority", "PASS"],
    ]);
    expect(new Set(reports.map((x) => x.report.run_id)).size).toBe(7);
    await mkdir(".artifacts", { recursive: true });
    const directory = await mkdtemp(".artifacts/offline-e2e-");
    await writeFile(join(directory, "results.json"), JSON.stringify({
      evidence_kind: "ACTUAL_EXECUTION_AGAINST_AUTHORED_SYNTHETIC_FIXTURES", executed_at_utc: new Date().toISOString(),
      live_qloo_executed: false, reports,
    }, null, 2) + "\n");
  });
});
