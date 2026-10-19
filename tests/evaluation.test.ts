import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import { recordedCases, syntheticCases } from "../src/eval/cases";
import { errorResult, scoreCase, summarize, type CaseResult } from "../src/eval/harness";
import { loadRecordedEvidence } from "../src/qloo/recorded-adapter";

// Reproducible evaluation run (`npm run eval`). Strata are summarized separately and never pooled.
// RECORDED_LIVE runs only where the owner's verified private recordings exist; LIVE_EXECUTED is NOT RUN.
it("evaluates the SYNTHETIC and RECORDED_LIVE strata separately and records actual results", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden during evaluation"));
  const recordings = await loadRecordedEvidence(process.cwd()).catch(() => null);
  const cases = [...syntheticCases(), ...(recordings ? recordedCases(recordings) : [])];
  const results: CaseResult[] = [];
  for (const c of cases) {
    try { results.push(scoreCase(c, await c.run())); } catch { results.push(errorResult(c, "CASE_EXECUTION_FAILED")); }
  }
  const summary = summarize(results);
  const git = (args: string[]) => { try { return execFileSync("git", args, { encoding: "utf8" }).trim(); } catch { return "UNAVAILABLE"; } };
  const record = { evidence_kind: "ACTUAL_LOCAL_EVALUATION_RUN", executed_at_utc: new Date().toISOString(), node: process.version,
    base_commit: git(["rev-parse", "HEAD"]), working_tree_dirty: git(["status", "--porcelain"]) !== "",
    recorded_evidence: recordings ? "VERIFIED_PRIVATE_RECORDINGS_AVAILABLE" : "UNAVAILABLE_IN_THIS_ENVIRONMENT",
    caveat: "Authored development cases, not a held-out benchmark. No live Qloo request was made. Latency is local in-process time only.",
    summary, results };
  await mkdir(".artifacts", { recursive: true });
  await writeFile(".artifacts/phase2a-evaluation.json", JSON.stringify(record, null, 2) + "\n");
  const row = (r: CaseResult) => `| ${r.id} | ${r.stratum} | ${r.category} | ${r.status} | ${r.stop_reason ?? "—"} | ${r.final_status ?? "—"} | ${r.adapter_calls ?? "—"} | ${r.failures.join("; ") || "—"} |`;
  await writeFile(".artifacts/phase2a-evaluation.md", [`# Phase 2A evaluation run — ${record.executed_at_utc}`, "", record.caveat, "",
    "| Case | Stratum | Category | Result | Stop | Final status | Calls | Failures |", "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map(row), "", "```json", JSON.stringify(summary, null, 2), "```", ""].join("\n"));
  expect(summary.LIVE_EXECUTED).toEqual({ status: "NOT RUN", cases: 0 });
  expect(results.filter((r) => r.status !== "PASS").map((r) => [r.id, r.failures])).toEqual([]);
  expect(results.every((r) => r.qloo_dispatches === 0)).toBe(true);
  expect(fetchSpy).not.toHaveBeenCalled();
});
