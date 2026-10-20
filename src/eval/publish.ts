import type { CaseResult } from "./harness";
import type { summarize } from "./harness";
import type { summarizePaired } from "./report";

// The public, aggregate-only view of an evaluation run. Counts, rates and fixed labels only: no case descriptions for
// recorded plans, no provider name, identifier, URL or response content, and nothing that identifies the owner's private
// storage. It is what the /results page shows and what a judge can read without running anything.
export const RESULTS_SCHEMA = "tastegate.evaluation-results.v1" as const;
export type EvaluationRecord = {
  executed_at_utc: string; base_commit: string; working_tree_dirty: boolean; holdout_seed: number; recorded_evidence: string; caveat: string;
  summary: ReturnType<typeof summarize>; comparison: ReturnType<typeof summarizePaired>; results: CaseResult[];
};
const NOTES: Record<string, string> = {
  SYNTHETIC: "Authored development cases. They shaped the gate, so they show it handles known patterns, not that it generalizes.",
  SYNTHETIC_HOLDOUT: "Seeded synthetic plans judged by an oracle that does not use the audit rules. Constructed failure patterns only; not Qloo data and not a statement about cultural relevance.",
  RECORDED_LIVE: "Authored confirmation variants of ONE plan, replayed from owner-approved Qloo responses (no new request). Aggregate counts only; no provider content is published.",
  AUTHORIZED_LIVE: "Not run. No real live Qloo request has been authorized for evaluation, so no live result is claimed.",
};
// Aggregates derived from the owner's private recordings are WITHHELD unless the owner explicitly includes them.
export function toPublicResults(record: EvaluationRecord, options: { includeRecorded?: boolean } = {}) {
  const strata = Object.fromEntries(Object.keys(NOTES).map((stratum) => {
    const rows = record.results.filter((r) => r.stratum === stratum);
    const run = (record.comparison as Record<string, { status: string }>)[stratum]; const base = (record.summary as Record<string, { status: string; cases?: number; cases_passed?: number }>)[stratum];
    const withheld = stratum === "RECORDED_LIVE" && base?.status === "RUN" && !options.includeRecorded;
    return [stratum, { status: withheld ? "WITHHELD" : base?.status ?? "NOT RUN", note: withheld ? "Computed locally from owner-approved recordings. The aggregates are withheld from this public page unless the owner chooses to publish them." : NOTES[stratum],
      cases: rows.length, cases_passed: rows.filter((r) => r.status === "PASS").length,
      failed_case_ids: stratum === "RECORDED_LIVE" ? rows.filter((r) => r.status !== "PASS").length : rows.filter((r) => r.status !== "PASS").map((r) => r.id),
      comparison: !withheld && run && run.status === "RUN" ? run : null }];
  }));
  return { schema: RESULTS_SCHEMA, generated_at_utc: record.executed_at_utc, base_commit: record.base_commit, working_tree_dirty: record.working_tree_dirty,
    holdout_seed: record.holdout_seed, caveat: record.caveat, recorded_evidence_present: record.recorded_evidence === "VERIFIED_PRIVATE_RECORDINGS_AVAILABLE", strata };
}
export type PublicResults = ReturnType<typeof toPublicResults>;
