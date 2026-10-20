import { performance } from "node:perf_hooks";
import type { AnyAuditReport, AuditInput, Entity } from "../domain/contracts";
import type { CallContext, FixtureQlooAdapter, ProviderQlooAdapter } from "../qloo/ports";

// The policies a plan can be put through. Both baselines are simple, defined before any result was seen, and run against
// exactly the same evidence source as the gate: they differ only in what they DO with it.
//   AS_PROPOSED        ship the upstream plan unchanged (no lookups, no checks)
//   TOP_HIT_UNCHECKED  trust the provider's first search hit for every recommendation, fill unresolved slots with the
//                      provider's own top discovery result, and check nothing (no constraints, no revalidation)
//   TASTEGATE          the audit -> repair -> revalidate workflow
export type PolicyId = "AS_PROPOSED" | "TOP_HIT_UNCHECKED" | "TASTEGATE";
export const POLICIES: readonly PolicyId[] = ["AS_PROPOSED", "TOP_HIT_UNCHECKED", "TASTEGATE"];
export type ShippedItem = { slot: string; entity: Entity | null; origin: "original" | "unchecked_fill" | "replacement" };
export type PolicyOutcome = { policy: PolicyId; shipped: ShippedItem[]; requests: number; elapsed_ms: number; paused_for_human: boolean; human_decisions: number; notes: string[] };
type Evidence = FixtureQlooAdapter | ProviderQlooAdapter;
const context = (n: number): CallContext => ({ runId: "baseline", callId: `b${n}`, signal: new AbortController().signal });

export function runAsProposed(input: AuditInput, intended: (slot: string) => Entity | null): PolicyOutcome {
  return { policy: "AS_PROPOSED", requests: 0, elapsed_ms: 0, paused_for_human: false, human_decisions: 0, notes: [],
    shipped: input.recommendations.map((r) => ({ slot: r.id, entity: intended(r.id), origin: "original" as const })) };
}

// Mirrors what a quick integration does: first hit wins, a gap is filled with the provider's own top recommendation.
export async function runTopHitUnchecked(input: AuditInput, adapter: Evidence): Promise<PolicyOutcome> {
  const started = performance.now(); let calls = 0; const notes: string[] = [];
  const lookup = async (query: string, kind: "artist" | "place") => {
    calls++; const observed = await adapter.searchEntity({ query, requested_kind: kind }, context(calls)).catch(() => null);
    return observed?.snapshot.kind === "entity_lookup" ? observed.snapshot.matches : [];
  };
  const shipped: ShippedItem[] = []; const unresolved: string[] = [];
  for (const r of input.recommendations) {
    const hit = (await lookup(r.name, "place"))[0];
    if (hit) shipped.push({ slot: r.id, entity: hit, origin: "original" }); else unresolved.push(r.id);
  }
  const artist = input.preferences.find((p) => p.kind === "artist");
  if (unresolved.length && artist?.confirmed_anchor) {
    const signal = (await lookup(artist.confirmed_anchor, "artist"))[0];
    if (signal) {
      calls++;
      const found = await adapter.discoverPlaces({ preference_entity_ids: [signal.id], preference_tag_ids: [], exclude_entity_ids: shipped.flatMap((s) => s.entity ? [s.entity.id] : []),
        signal_scope: "first_confirmed_artist", take: Math.min(unresolved.length, 5), exclusion: "client" }, context(calls)).catch(() => null);
      const candidates = found?.snapshot.kind === "discover_places" ? found.snapshot.candidates : [];
      unresolved.slice(0, candidates.length).forEach((slot, i) => shipped.push({ slot, entity: candidates[i]!, origin: "unchecked_fill" }));
    } else notes.push("signal artist not found");
  }
  return { policy: "TOP_HIT_UNCHECKED", shipped, requests: calls, elapsed_ms: performance.now() - started, paused_for_human: false, human_decisions: 0, notes };
}

// Finds an entity by ID in everything a report retained as evidence (lookups and discoveries).
export function entityInReport(report: AnyAuditReport, id: string | null): Entity | null {
  if (!id) return null;
  for (const e of report.evidence) {
    const s = e.snapshot;
    const hit = s.kind === "entity_lookup" ? s.matches.find((m) => m.id === id) : s.kind === "discover_places" ? s.candidates.find((c) => c.id === id) : undefined;
    if (hit) return hit;
  }
  return null;
}
// What the gate leaves in the plan: originals that were verified or only lack taste evidence (a soft gate: identity and every
// hard constraint are established), plus accepted replacements. Originals that are blocked, or whose identity or hard facts
// could not be established, are not kept.
export function keptByGate(report: AnyAuditReport, audit: AnyAuditReport["original_audits"][number]): boolean {
  if (audit.verdict === "BLOCKED") return false;
  return report.final_candidate_ids.includes(audit.candidate_id) || (audit.verdict === "UNKNOWN" && audit.resolution === "resolved" && audit.hard_constraints === "pass");
}
export function gateOutcome(report: AnyAuditReport): PolicyOutcome {
  const shipped: ShippedItem[] = [
    ...report.original_audits.filter((a) => keptByGate(report, a)).map((a) => ({ slot: a.candidate_id, entity: entityInReport(report, a.entity_id), origin: "original" as const })),
    ...report.repairs.filter((r) => r.accepted).map((r) => ({ slot: r.replaces, entity: entityInReport(report, r.proposed_entity_id), origin: "replacement" as const })),
  ];
  const provider = report.source_mode !== "fixture" ? report : null;
  return { policy: "TASTEGATE", shipped, elapsed_ms: report.usage.elapsed_ms, notes: [],
    requests: report.source_mode === "fixture" ? report.usage.fixture_calls : report.usage.adapter_calls,
    paused_for_human: report.stop_reason === "NEEDS_INPUT",
    // Decisions asked of a person: provider runs list them; a synthetic run that paused counts the identities it refused to guess.
    human_decisions: provider ? provider.pending_confirmations.length + provider.confirmations.length :
      report.stop_reason === "NEEDS_INPUT" ? report.original_audits.filter((a) => a.resolution === "ambiguous" || a.resolution === "unconfirmed").length : 0 };
}
