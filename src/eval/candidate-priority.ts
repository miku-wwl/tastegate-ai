import type { AnyAuditReport, Snapshot } from "../domain/contracts";
import { AuditReportSchema, ProviderAuditReportSchema } from "../domain/report-schema";
import { rulesAndIdentityOnly } from "./ablation";

// Internal ordering operation after the caller has established the common-query/valid-pool preconditions.
export function orderWithinReviewedQuery(pool: readonly string[], snapshot: Extract<Snapshot, { kind: "rank_places" }>) {
  const score = (id: string) => snapshot.scores?.find((s) => s.entity_id === id)?.query_affinity;
  return [...pool].sort((a, b) => {
    const sa = score(a), sb = score(b);
    return typeof sa === "number" && typeof sb === "number" && sa === sb ? 0 : snapshot.ordered_entity_ids.indexOf(a) - snapshot.ordered_entity_ids.indexOf(b);
  });
}

// A secondary, read-only comparison, separate from retention and from the independent quality oracle.
// Both arms share the rules-only gate's valid pool, identities and constraints. The control keeps input order and cannot
// read culture. The treatment can reorder only a fully covered pool within ONE reviewed ranking query. No new call or repair.
export function compareCandidatePriority(input: AnyAuditReport) {
  const report: AnyAuditReport = input.source_mode === "fixture" ? AuditReportSchema.parse(input) : ProviderAuditReportSchema.parse(input);
  const control = rulesAndIdentityOnly(report);
  const pool = [...new Set(control.shipped.flatMap((s) => s.entity ? [s.entity.id] : []))];
  const audits = [...report.original_audits, ...report.repairs.map((r) => r.revalidation)];
  const base = { evidence_mode: report.source_mode, valid_candidates: pool.length, control_order: pool,
    quality_uplift: "QUALITY_UPLIFT_NOT_ESTABLISHED" as const };
  const unavailable = (status: "INSUFFICIENT_VALID_CANDIDATES" | "NO_COMMON_REVIEWED_QUERY") =>
    ({ ...base, status, treatment_order: [...pool], changed_priority: false, tied_groups: 0 });
  if (control.paused_for_human || pool.length < 2) return unavailable("INSUFFICIENT_VALID_CANDIDATES");
  const ranks = pool.map((id) => audits.find((a) => a.entity_id === id)?.cultural_relevance);
  const query = ranks[0]?.query_ref;
  if (!query || ranks.some((r) => !r || r.query_ref !== query)) return unavailable("NO_COMMON_REVIEWED_QUERY");
  const snapshot = report.evidence.find((e) => e.evidence_id === query)?.snapshot;
  if (snapshot?.kind !== "rank_places" || pool.some((id) => !snapshot.ordered_entity_ids.includes(id)))
    return unavailable("NO_COMMON_REVIEWED_QUERY");
  const score = (id: string) => snapshot.scores?.find((s) => s.entity_id === id)?.query_affinity;
  // Equal query scores establish no preference: preserve the no-Qloo order for ties.
  const order = orderWithinReviewedQuery(pool, snapshot);
  const scores = pool.map(score).filter((s): s is number => typeof s === "number");
  const tied = [...new Set(scores)].filter((s) => scores.filter((v) => v === s).length > 1).length;
  return { ...base, status: "PRIORITIZED_WITHIN_QUERY" as const, treatment_order: order,
    changed_priority: order.some((id, i) => id !== pool[i]), tied_groups: tied };
}
export type CandidatePriority = ReturnType<typeof compareCandidatePriority>;

export function summarizeCandidatePriority(rows: Array<{ priority?: CandidatePriority }>) {
  const values = rows.flatMap((r) => r.priority ? [r.priority] : []);
  return { plans_checked: values.length, plans_with_multiple_valid_candidates: values.filter((r) => r.valid_candidates >= 2).length,
    plans_with_common_reviewed_query: values.filter((r) => r.status === "PRIORITIZED_WITHIN_QUERY").length,
    plans_with_changed_priority: values.filter((r) => r.changed_priority).length,
    plans_missing_common_query: values.filter((r) => r.status === "NO_COMMON_REVIEWED_QUERY").length,
    plans_with_ties: values.filter((r) => r.tied_groups > 0).length,
    quality_uplift: "QUALITY_UPLIFT_NOT_ESTABLISHED" as const,
    note: "Same valid candidate pool and identity assumptions in both arms. Input order without cultural evidence; within-one-query ordering with it. Ranking differences establish no cultural quality gain." };
}
