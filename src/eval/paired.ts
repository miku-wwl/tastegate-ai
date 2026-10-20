import type { AnyAuditReport, AuditInput, Entity } from "../domain/contracts";
import { gateOutcome, keptByGate, runAsProposed, runTopHitUnchecked, POLICIES, type PolicyId, type PolicyOutcome } from "./baselines";
import type { Built } from "./harness";
import { classifyEntity, planLimit } from "./oracle";

// One plan, three policies, one oracle. The score counts what each policy would put in front of the user.
export type PolicyScore = {
  policy: PolicyId; shipped: number; shipped_valid: number; shipped_violating: number; shipped_unverifiable: number;
  proposal_valid: number; valid_kept: number; proposal_violating: number; violating_removed: number;
  identity_errors: number; over_limit: boolean; requests: number; elapsed_ms: number; paused_for_human: boolean; human_decisions: number;
};
export function scorePolicy(outcome: PolicyOutcome, input: AuditInput, intended: (slot: string) => Entity | null, truthOf?: (id: string) => Entity | null): PolicyScore {
  const proposal = input.recommendations.map((r) => ({ slot: r.id, intended: intended(r.id), truth: classifyEntity(intended(r.id), input) }));
  const shippedAsOriginal = new Set(outcome.shipped.filter((s) => s.origin === "original").map((s) => s.slot));
  // Where the world is authored, an item is judged by its TRUE facts (by ID), not by whatever an evidence source reported.
  const truths = outcome.shipped.map((s) => classifyEntity(s.entity ? truthOf?.(s.entity.id) ?? s.entity : null, input));
  const limit = planLimit(input);
  return {
    policy: outcome.policy, shipped: outcome.shipped.length,
    shipped_valid: truths.filter((t) => t.class === "VALID").length, shipped_violating: truths.filter((t) => t.class === "VIOLATING").length,
    shipped_unverifiable: truths.filter((t) => t.class === "UNVERIFIABLE").length,
    proposal_valid: proposal.filter((p) => p.truth.class === "VALID").length, valid_kept: proposal.filter((p) => p.truth.class === "VALID" && shippedAsOriginal.has(p.slot)).length,
    proposal_violating: proposal.filter((p) => p.truth.class === "VIOLATING").length, violating_removed: proposal.filter((p) => p.truth.class === "VIOLATING" && !shippedAsOriginal.has(p.slot)).length,
    identity_errors: outcome.shipped.filter((s) => s.origin === "original" && s.entity && intended(s.slot) && s.entity.id !== intended(s.slot)!.id).length,
    over_limit: limit !== null && outcome.shipped.length > limit,
    requests: outcome.requests, elapsed_ms: Math.round(outcome.elapsed_ms * 100) / 100, paused_for_human: outcome.paused_for_human, human_decisions: outcome.human_decisions,
  };
}
// What the gate itself reports about the plan it shipped (the baselines collect no evidence, so they have no equivalent).
export type GateFacts = { final_status: string; stop_reason: string; final_items: number; final_with_taste_evidence: number };
export type PairedResult = { id: string; scores: Record<PolicyId, PolicyScore>; gate: GateFacts };

// Runs both baselines on one built case, next to the gate's report for the same plan. A baseline that throws is recorded
// as shipping nothing rather than hiding the case.
export async function runPaired(id: string, built: Built, report: AnyAuditReport): Promise<PairedResult> {
  const gate = gateOutcome(report);
  const proposed = runAsProposed(built.input, built.intended);
  const naive = await runTopHitUnchecked(built.input, built.adapter).catch((): PolicyOutcome => ({ policy: "TOP_HIT_UNCHECKED", shipped: [], requests: 0, elapsed_ms: 0, paused_for_human: false, human_decisions: 0, notes: ["baseline failed"] }));
  const outcomes: Record<PolicyId, PolicyOutcome> = { AS_PROPOSED: proposed, TOP_HIT_UNCHECKED: naive, TASTEGATE: gate };
  const finalOriginals = report.original_audits.filter((a) => keptByGate(report, a));
  const gateFacts: GateFacts = { final_status: report.final_status, stop_reason: report.stop_reason, final_items: gate.shipped.length,
    final_with_taste_evidence: finalOriginals.filter((a) => a.cultural_relevance !== null).length + report.repairs.filter((r) => r.accepted && r.revalidation.cultural_relevance !== null).length };
  return { id, gate: gateFacts, scores: Object.fromEntries(POLICIES.map((p) => [p, scorePolicy(outcomes[p], built.input, built.intended, built.truthOf)])) as Record<PolicyId, PolicyScore> };
}

// ---- aggregation: counts first, rates second, never pooled across strata ----
const COUNT_KEYS = ["shipped", "shipped_valid", "shipped_violating", "shipped_unverifiable", "proposal_valid", "valid_kept", "proposal_violating", "violating_removed", "identity_errors", "requests", "human_decisions"] as const;
type CountKey = typeof COUNT_KEYS[number];
const percentile = (values: number[], p: number) => { if (!values.length) return null; const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!; };
const rate = (n: number, d: number) => d ? Math.round((n / d) * 1000) / 1000 : "N/A" as const;
export type PolicyAggregate = Record<CountKey, number> & { plans: number; plans_over_limit: number; latency_ms: { samples: number; p50: number | null; p95: number | null; max: number | null };
  violating_removed_rate: number | "N/A"; valid_kept_rate: number | "N/A" };
export function aggregate(results: PairedResult[], policy: PolicyId): PolicyAggregate {
  const rows = results.map((r) => r.scores[policy]); const sums = Object.fromEntries(COUNT_KEYS.map((k) => [k, rows.reduce((n, r) => n + r[k], 0)])) as Record<CountKey, number>;
  const latency = rows.map((r) => r.elapsed_ms).filter((n) => policy !== "AS_PROPOSED" && Number.isFinite(n));
  return { ...sums, plans: rows.length, plans_over_limit: rows.filter((r) => r.over_limit).length,
    latency_ms: { samples: latency.length, p50: percentile(latency, 50), p95: percentile(latency, 95), max: latency.length ? Math.max(...latency) : null },
    violating_removed_rate: rate(sums.violating_removed, sums.proposal_violating), valid_kept_rate: rate(sums.valid_kept, sums.proposal_valid) };
}
// Paired sign comparison on one metric: in how many plans did TasteGate do strictly better / the same / strictly worse than a baseline?
export function pairedSigns(results: PairedResult[], baseline: PolicyId, metric: "shipped_violating" | "shipped_unverifiable" | "identity_errors"): { better: number; same: number; worse: number } {
  const out = { better: 0, same: 0, worse: 0 };
  for (const r of results) { const a = r.scores.TASTEGATE[metric]; const b = r.scores[baseline][metric]; if (a < b) out.better++; else if (a === b) out.same++; else out.worse++; }
  return out;
}
