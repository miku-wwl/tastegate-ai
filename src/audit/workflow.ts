import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  AuditInputSchema, EvidenceSchema, SnapshotSchema, digest, snapshotEntityIds,
  type AuditInput, type AuditReport, type CandidateAudit, type Evidence, type Finding, type Repair, type Snapshot, type State, type StopReason,
} from "../domain/contracts";
import { validateReport } from "../domain/report-schema";
import { requireFixture, type CallContext, type FixtureObservation, type FixtureQlooAdapter, type LiveQlooAdapter, type Signals } from "../qloo/ports";
import { candidateVerdict, checkConstraints, hardState, reportSummary } from "./rules";

const observationSchema = z.strictObject({ source_mode: z.literal("fixture"), fixture_id: z.string(), snapshot: SnapshotSchema });
const policySchema = z.strictObject({
  maxCalls: z.number().int().min(0).max(14), maxRepairRounds: z.number().int().min(0).max(1),
  timeoutMs: z.number().int().min(1).max(60_000), callTimeoutMs: z.number().int().min(1).max(4_000),
});
type Policy = z.infer<typeof policySchema>;
export type AuditOptions = Partial<Policy> & { signal?: AbortSignal };
class Stop extends Error { constructor(readonly reason: StopReason) { super(reason); } }
type Lookup = { snapshot: Extract<Snapshot, { kind: "entity_lookup" }>; ref: string };
type Rank = { snapshot: Extract<Snapshot, { kind: "rank_places" }>; ref: string };

export async function runAudit(rawInput: unknown, providedAdapter: FixtureQlooAdapter | LiveQlooAdapter, options: AuditOptions = {}): Promise<AuditReport> {
  requireFixture(providedAdapter); // A live key or a live-shaped adapter never causes a fixture fallback.
  const adapter: FixtureQlooAdapter = providedAdapter;
  const input = AuditInputSchema.parse(rawInput);
  const { signal, ...overrides } = options;
  const policy = policySchema.parse({ maxCalls: 14, maxRepairRounds: 1, timeoutMs: 60_000, callTimeoutMs: 4_000, ...overrides });
  const runId = randomUUID(); const started = performance.now(); const deadline = started + policy.timeoutMs;
  const evidence: Evidence[] = []; const trace: AuditReport["trace"] = [{ state: "Validate", call_id: null }];
  const lookups = new Map<string, Lookup>(); const preferenceRefs: string[] = [];
  const resolvedPreferenceIds = new Set<string>(); const signals: Signals = { preference_entity_ids: [], preference_tag_ids: [] };
  let calls = 0; let repairRounds = 0; let stopReason: StopReason = "COMPLETE";
  let originalRank: Rank | null = null; const repairs: Repair[] = [];
  const enter = (state: State) => { trace.push({ state, call_id: null }); };
  function capture(snapshot: Snapshot, callId: string | null): Evidence {
    const i = evidence.length;
    const result = EvidenceSchema.parse({
      evidence_id: `${runId}:e${i}`, run_id: runId, source_mode: "fixture", provider: "synthetic", fixture_id: adapter.fixtureId,
      operation: ["rank_places", "discover_places"].includes(snapshot.kind) ? "insights" : snapshot.kind,
      call_id: callId, upstream_request_id: null, retrieved_at: null, query_fingerprint: digest(snapshot),
      pointer: `/evidence/${i}/snapshot`, entity_ids: snapshotEntityIds(snapshot),
      cache_hit: false, fetched_at: null, warnings: ["AUTHORED SYNTHETIC DATA; NO QLOO REQUEST"], snapshot,
    });
    evidence.push(result); return result;
  }
  const inputRef = capture({ kind: "input", input }, null).evidence_id;
  function active() {
    if (signal?.aborted) throw new Stop("CANCELLED");
    if (performance.now() >= deadline) throw new Stop("TIMEOUT");
    if (calls >= policy.maxCalls) throw new Stop("CALL_BUDGET_EXHAUSTED");
  }
  async function call(state: State, expected: Record<string, unknown>, invoke: (ctx: CallContext) => Promise<FixtureObservation>): Promise<Evidence> {
    active(); calls++; const callId = `${runId}:call${calls}`; trace.push({ state, call_id: callId });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let parentAbort: (() => void) | undefined;
    try {
      const interrupted = new Promise<never>((_, reject) => {
        parentAbort = () => { controller.abort(); reject(new Stop("CANCELLED")); };
        signal?.addEventListener("abort", parentAbort, { once: true });
        timer = setTimeout(() => { controller.abort(); reject(new Stop("TIMEOUT")); }, Math.max(1, Math.min(policy.callTimeoutMs, deadline - performance.now())));
      });
      const value = await Promise.race([invoke({ runId, callId, signal: controller.signal }), interrupted]);
      if (signal?.aborted) throw new Stop("CANCELLED");
      if (performance.now() >= deadline || controller.signal.aborted) throw new Stop("TIMEOUT");
      const parsed = observationSchema.safeParse(value);
      if (!parsed.success || parsed.data.fixture_id !== adapter.fixtureId) throw new Stop("PROVENANCE_REJECTED");
      const snapshot = parsed.data.snapshot;
      for (const [key, value] of Object.entries(expected))
        if (digest((snapshot as Record<string, unknown>)[key]) !== digest(value)) throw new Stop("PROVENANCE_REJECTED");
      const returnedIds = snapshotEntityIds(snapshot);
      if (new Set(returnedIds).size !== returnedIds.length) throw new Stop("PROVENANCE_REJECTED");
      if ((snapshot.kind === "entity_lookup" || snapshot.kind === "tag_lookup") && snapshot.matches.some((e) => e.name !== snapshot.query)) throw new Stop("PROVENANCE_REJECTED");
      if (snapshot.kind === "rank_places" && snapshot.ordered_entity_ids.some((id) => !snapshot.candidate_entity_ids.includes(id))) throw new Stop("PROVENANCE_REJECTED");
      if (snapshot.kind === "discover_places" && snapshot.candidates.some((e) => snapshot.exclude_entity_ids.includes(e.id))) throw new Stop("PROVENANCE_REJECTED");
      return capture(snapshot, callId);
    } finally {
      if (timer) clearTimeout(timer);
      if (parentAbort) signal?.removeEventListener("abort", parentAbort);
    }
  }
  async function lookup(name: string, kind: "artist" | "movie" | "place", state: State): Promise<Lookup> {
    const request = { query: name, requested_kind: kind };
    const e = await call(state, { kind: "entity_lookup", ...request }, (ctx) => adapter.searchEntity(request, ctx));
    if (e.snapshot.kind !== "entity_lookup") throw new Stop("PROVENANCE_REJECTED");
    return { snapshot: e.snapshot, ref: e.evidence_id };
  }
  async function rank(ids: string[], state: State): Promise<Rank> {
    const request = { ...signals, candidate_entity_ids: ids };
    const e = await call(state, { kind: "rank_places", ...request }, (ctx) => adapter.rankPlaces(request, ctx));
    if (e.snapshot.kind !== "rank_places") throw new Stop("PROVENANCE_REJECTED");
    return { snapshot: e.snapshot, ref: e.evidence_id };
  }
  const unresolved = () => input.preferences.filter((p) => !resolvedPreferenceIds.has(p.id)).map((p) => p.id);
  function audit(candidateId: string, result: Lookup | undefined, ranking: Rank | null, claims: string[]): CandidateAudit {
    const matches = result?.snapshot.matches ?? [];
    const entity = matches.length === 1 ? matches[0] ?? null : null;
    const resolution: CandidateAudit["resolution"] = entity ? "resolved" : matches.length > 1 ? "ambiguous" : "unresolved";
    const findings = checkConstraints(input, entity, result?.ref ?? null, inputRef);
    const add = (code: Finding["code"], category: Finding["category"], state: Finding["state"], refs: string[], explanation: string) => findings.push({ code, category, state, constraint_id: null, evidence_refs: refs, explanation });
    if (!entity) add(resolution === "ambiguous" ? "AMBIGUOUS_ENTITY" : "UNRESOLVED_ENTITY", "uncertainty", "unknown", result ? [result.ref] : [], "Identity is not resolved; no claim of real-world nonexistence.");
    const position = entity && ranking ? ranking.snapshot.ordered_entity_ids.indexOf(entity.id) : -1;
    const hasRank = position >= 0;
    add(hasRank ? "TASTE_EVIDENCE_PRESENT" : "TASTE_EVIDENCE_MISSING", "insufficient_evidence", hasRank ? "pass" : "unknown", ranking ? [ranking.ref] : [], hasRank ? "Present in an authored relative ranking; not an individual's preference probability." : "No candidate-specific taste evidence; absence is not a negative affinity score.");
    if (unresolved().length) add("PREFERENCE_UNRESOLVED", "uncertainty", "unknown", [inputRef], "One or more preference interpretations remain unresolved.");
    if (claims.length) add("CLAIM_UNVERIFIED", "insufficient_evidence", "unknown", [inputRef], "Free-form upstream claims are unsubstantiated in this deterministic offline core.");
    const explainability: CandidateAudit["explainability"] = hasRank && ranking ? ranking.snapshot.explainability : "not_requested";
    if (explainability === "missing") add("EXPLAINABILITY_MISSING", "uncertainty", "not_applicable", ranking ? [ranking.ref] : [], "Detailed attribution is missing. No explanatory contribution is invented.");
    const body = { candidate_id: candidateId, resolution, entity_id: entity?.id ?? null, resolution_evidence_ref: result?.ref ?? null,
      hard_constraints: hardState(findings), evidence_coverage: (!hasRank ? "missing" : unresolved().length || claims.length ? "partial" : "covered") as CandidateAudit["evidence_coverage"],
      cultural_relevance: hasRank && ranking ? { query_ref: ranking.ref, ordinal_rank: position + 1 } : null, explainability, findings };
    return { ...body, verdict: candidateVerdict(body) };
  }
  const originalAudits = () => input.recommendations.map((r) => audit(r.id, lookups.get(r.id), originalRank, r.claims));
  try {
    enter("Resolve");
    for (const preference of input.preferences) {
      if (!preference.confirmed_anchor) { enter("NeedsInput"); throw new Stop("NEEDS_INPUT"); }
      let ref: string; let selectedId: string | undefined;
      if (preference.kind === "tag_concept") {
        const e = await call("Resolve", { kind: "tag_lookup", query: preference.confirmed_anchor }, (ctx) => adapter.searchTags(preference.confirmed_anchor!, ctx));
        if (e.snapshot.kind !== "tag_lookup") throw new Stop("PROVENANCE_REJECTED");
        ref = e.evidence_id; selectedId = e.snapshot.matches.length === 1 ? e.snapshot.matches[0]?.id : undefined;
      } else {
        const result = await lookup(preference.confirmed_anchor, preference.kind === "artist" ? "artist" : "movie", "Resolve");
        const entity = result.snapshot.matches.length === 1 ? result.snapshot.matches[0] : undefined;
        ref = result.ref;
        selectedId = entity?.kind === (preference.kind === "artist" ? "artist" : "movie") ? entity.id : undefined;
      }
      if (!selectedId) { enter("NeedsInput"); throw new Stop("NEEDS_INPUT"); }
      preferenceRefs.push(ref); resolvedPreferenceIds.add(preference.id);
      (preference.kind === "tag_concept" ? signals.preference_tag_ids : signals.preference_entity_ids).push(selectedId);
    }
    for (const recommendation of input.recommendations) {
      const result = await lookup(recommendation.name, "place", "Resolve"); lookups.set(recommendation.id, result);
      if (result.snapshot.matches.length > 1) { enter("NeedsInput"); throw new Stop("NEEDS_INPUT"); }
    }
    enter("Retrieve");
    const originalIds = [...lookups.values()].flatMap((x) => x.snapshot.matches.length === 1 ? x.snapshot.matches.map((e) => e.id) : []);
    if (originalIds.length) originalRank = await rank([...new Set(originalIds)], "Retrieve");
    enter("Audit");
    const originals = originalAudits();
    const targets = originals.filter((a) => a.verdict === "BLOCKED" || a.verdict === "UNKNOWN");
    const hasCountFailure = originals.some((a) => a.findings.some((f) => f.code === "MAX_ITEMS_EXCEEDED"));
    if (targets.length && policy.maxRepairRounds && !hasCountFailure) {
      // Discovery + at least one independent lookup + common-set rank must all fit.
      const capacity = Math.min(targets.length, 3, policy.maxCalls - calls - 2);
      if (capacity < 1) throw new Stop("CALL_BUDGET_EXHAUSTED");
      active(); enter("Repair"); repairRounds = 1;
      const request = { ...signals, exclude_entity_ids: originalIds };
      const discovery = await call("Repair", { kind: "discover_places", ...request }, (ctx) => adapter.discoverPlaces(request, ctx));
      if (discovery.snapshot.kind !== "discover_places") throw new Stop("PROVENANCE_REJECTED");
      const selected = discovery.snapshot.candidates.slice(0, capacity);
      if (selected.length) {
        enter("Revalidate"); const confirmations: Lookup[] = [];
        for (const entity of selected) confirmations.push(await lookup(entity.name, "place", "Revalidate"));
        const union = [...new Set([...originals.filter((a) => a.hard_constraints === "pass").flatMap((a) => a.entity_id ? [a.entity_id] : []),
          ...confirmations.flatMap((c, i) => c.snapshot.matches.length === 1 && c.snapshot.matches[0]?.id === selected[i]?.id ? c.snapshot.matches.map((e) => e.id) : [])])];
        const commonRank = union.length ? await rank(union, "Revalidate") : null;
        for (const [i, entity] of selected.entries()) {
          const candidateId = `repair:${runId}:${i}`;
          const revalidation = audit(candidateId, confirmations[i], commonRank, []);
          if (revalidation.entity_id !== null && revalidation.entity_id !== entity.id) {
            revalidation.findings.push({ code: "REVALIDATION_ID_MISMATCH", category: "integrity", state: "fail", constraint_id: null,
              evidence_refs: [discovery.evidence_id, confirmations[i]!.ref], explanation: "Independent lookup did not confirm the discovered identity." });
            revalidation.verdict = "BLOCKED";
          }
          repairs.push({ replaces: targets[i]!.candidate_id, replacement_candidate_id: candidateId, proposed_entity_id: entity.id,
            discovery_evidence_refs: [discovery.evidence_id], revalidation, accepted: revalidation.verdict === "PASS" });
        }
      }
    }
  } catch (error) {
    stopReason = error instanceof Stop ? error.reason : "ADAPTER_ERROR";
  }
  enter("Report"); const originals = originalAudits(); const unresolvedIds = unresolved();
  return validateReport({
    schema_revision: "tastegate.report.v1a", run_id: runId, source_mode: "fixture", input, input_ref: "/input",
    ...reportSummary(originals, repairs, unresolvedIds, stopReason), original_audits: originals, repairs, evidence,
    preference_evidence_refs: preferenceRefs, unresolved_preferences: unresolvedIds, stop_reason: stopReason, trace,
    limitations: ["AUTHORED SYNTHETIC FIXTURES ONLY. No Qloo API or LLM call was made.",
      "Affinity is not individual preference probability. Opening hours, live music, price and availability are not verified.",
      "Free-form claims are conservatively unverified; no LLM reasoning or operational fact service is implemented.",
      "Fixture snapshot hashes detect internal inconsistency, not authenticity of real Qloo data.",
      ...(stopReason === "COMPLETE" ? [] : [`Workflow stopped: ${stopReason}. Remaining slots and evidence stay visible.`])],
    usage: { qloo_dispatches: 0, llm_dispatches: 0, fixture_calls: calls, repair_rounds: repairRounds, elapsed_ms: Math.max(0, performance.now() - started) },
    archive: { status: "not_requested", action_id: null, receipt_ref: null },
  });
}
