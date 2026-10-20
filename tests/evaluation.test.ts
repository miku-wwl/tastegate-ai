import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import { holdoutCases, HOLDOUT_SEED } from "../src/eval/holdout";
import { recordedCases, syntheticCases } from "../src/eval/cases";
import { summarize } from "../src/eval/harness";
import { toPublicResults } from "../src/eval/publish";
import { evaluate, STRATA, summarizePaired } from "../src/eval/report";
import { loadRecordedEvidence } from "../src/qloo/recorded-adapter";

// Reproducible evaluation run (`npm run eval`). Strata are summarized separately and never pooled. Every plan is put through
// the gate AND two baselines on the same evidence. RECORDED_LIVE runs only where the owner's verified private recordings
// exist; AUTHORIZED_LIVE is NOT RUN because no real live request has been authorized for evaluation.
it("evaluates every stratum separately, pairs the gate with two baselines and records actual results", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden during evaluation"));
  const recordings = await loadRecordedEvidence(process.cwd()).catch(() => null);
  const cases = [...syntheticCases(), ...holdoutCases(), ...(recordings ? recordedCases(recordings) : [])];
  const { results, paired } = await evaluate(cases);
  const summary = summarize(results, STRATA); const comparison = summarizePaired(paired);
  const git = (args: string[]) => { try { return execFileSync("git", args, { encoding: "utf8" }).trim(); } catch { return "UNAVAILABLE"; } };
  const record = { evidence_kind: "ACTUAL_LOCAL_EVALUATION_RUN", executed_at_utc: new Date().toISOString(), node: process.version,
    base_commit: git(["rev-parse", "HEAD"]), working_tree_dirty: git(["status", "--porcelain"]) !== "", holdout_seed: HOLDOUT_SEED,
    recorded_evidence: recordings ? "VERIFIED_PRIVATE_RECORDINGS_AVAILABLE" : "UNAVAILABLE_IN_THIS_ENVIRONMENT",
    caveat: "Development cases shaped the gate and are not a benchmark. The seeded holdout is synthetic: it shows constructed failure patterns are handled, not that real recommendations behave this way. No live Qloo request was made. Latency is local in-process time only.",
    summary, comparison, results };
  await mkdir(".artifacts", { recursive: true });
  await writeFile(".artifacts/phase2b-evaluation.json", JSON.stringify(record, null, 2) + "\n");
  // Aggregate-only, provider-free results for the public results page. Written only when explicitly asked to refresh them.
  if (process.env.EVAL_PUBLISH === "1") {
    await mkdir("data", { recursive: true });
    await writeFile("data/evaluation-results.json", JSON.stringify(toPublicResults(record, { includeRecorded: process.env.EVAL_PUBLISH_RECORDED === "1" }), null, 2) + "\n");
  }
  const row = (r: (typeof results)[number]) => `| ${r.id} | ${r.stratum} | ${r.category} | ${r.status} | ${r.stop_reason ?? "—"} | ${r.final_status ?? "—"} | ${r.adapter_calls ?? "—"} | ${r.failures.join("; ") || "—"} |`;
  await writeFile(".artifacts/phase2b-evaluation.md", [`# Evaluation run — ${record.executed_at_utc}`, "", record.caveat, "",
    "| Case | Stratum | Category | Result | Stop | Final status | Calls | Failures |", "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map(row), "", "```json", JSON.stringify({ summary, comparison }, null, 2), "```", ""].join("\n"));
  expect(summary.AUTHORIZED_LIVE).toEqual({ status: "NOT RUN", cases: 0 }); expect(comparison.AUTHORIZED_LIVE).toEqual({ status: "NOT RUN", plans: 0 });
  expect(results.filter((r) => r.status !== "PASS").map((r) => [r.id, r.failures])).toEqual([]);
  expect(results.every((r) => r.qloo_dispatches === 0)).toBe(true);
  expect(fetchSpy).not.toHaveBeenCalled();
});
