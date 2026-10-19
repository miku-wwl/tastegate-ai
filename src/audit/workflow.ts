import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  AuditInputSchema, CaptureSchema, ConfirmationsSchema, EvidenceSchema, InsightsPolicySchema, ProviderEvidenceSchema, SnapshotSchema,
  digest, isQlooRef, isSyntheticId, snapshotEntityIds, snapshotOperation, snapshotRefs,
  type AuditReport, type CandidateAudit, type Capture, type Confirmation, type Entity, type Evidence, type Finding, type InsightsPolicy,
  type PreferenceResolution, type ProviderAuditReport, type ProviderEvidence, type Repair, type Snapshot, type State, type StopReason,
} from "../domain/contracts";
import { validateProviderReport, validateReport } from "../domain/report-schema";
import { LiveExecutionBlockedError, requireFixture, type CallContext, type FixtureQlooAdapter, type LiveQlooAdapter, type RecordedQlooAdapter, type Signals } from "../qloo/ports";
import {
  candidateVerdict, checkConstraints, checkUnconfirmedConstraints, hardState, insightsSignals, lookupMatches, preferenceCandidates,
  repairTargets, reportSummary, resolveOriginal, resolvePreference, resolveReplacement, type EvidenceMode,
} from "./rules";

const fixtureObservation = z.strictObject({ source_mode: z.literal("fixture"), fixture_id: z.string(), snapshot: SnapshotSchema });
const recordedObservation = z.strictObject({ source_mode: z.literal("recorded_live"), dataset_id: z.string(),
  capture: CaptureSchema.nullable(), snapshot: SnapshotSchema });
const policySchema = z.strictObject({
  maxCalls: z.number().int().min(0).max(14), maxRepairRounds: z.number().int().min(0).max(1),
  timeoutMs: z.number().int().min(1).max(60_000), callTimeoutMs: z.number().int().min(1).max(4_000),
});
type Policy = z.infer<typeof policySchema>;
export type AuditOptions = Partial<Policy> & { signal?: AbortSignal };
// scenarioId and insightsPolicy are trusted host values; confirmations are validated user decisions.
export type RecordedAuditOptions = AuditOptions & { scenarioId: string; insightsPolicy: InsightsPolicy; confirmations?: unknown };
class Stop extends Error { constructor(readonly reason: StopReason) { super(reason); } }
type Lookup = { snapshot: Snapshot; ref: string };
// A null snapshot records an unavailable ranking whose reference still explains the missing evidence.
type Rank = { snapshot: Extract<Snapshot, { kind: "rank_places" }> | null; ref: string };
type Engine =
  | { mode: "fixture"; adapter: FixtureQlooAdapter }
  | { mode: "recorded_live"; adapter: RecordedQlooAdapter; scenarioId: string; insightsPolicy: InsightsPolicy; confirmations: Confirmation[] };
const ENDPOINT = { entity_lookup: "/search", tag_lookup: "/v2/tags", insights: "/v2/insights" } as const;
const WARNING = {
  input: "USER OR AUTHORED INPUT; NOT PROVIDER EVIDENCE",
  unavailable: "NO PROVIDER EVIDENCE FOR THIS EXACT REQUEST; ABSENCE IS NOT NEGATIVE EVIDENCE",
  recorded: "RECORDED QLOO RESPONSE FROM AN OWNER-APPROVED PROBE; REPLAYED, NO NEW REQUEST",
};

export async function runAudit(rawInput: unknown, providedAdapter: FixtureQlooAdapter | LiveQlooAdapter, options: AuditOptions = {}): Promise<AuditReport> {
  requireFixture(providedAdapter); // A live key or a live-shaped adapter never causes a fixture fallback.
  return await execute({ mode: "fixture", adapter: providedAdapter }, rawInput, options) as AuditReport;
}
export async function runRecordedAudit(rawInput: unknown, adapter: RecordedQlooAdapter, options: RecordedAuditOptions): Promise<ProviderAuditReport> {
  if (adapter.mode !== "recorded_live") throw new LiveExecutionBlockedError();
  const { scenarioId, insightsPolicy, confirmations, ...rest } = options;
  const engine = { mode: "recorded_live" as const, adapter, scenarioId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/).parse(scenarioId),
    insightsPolicy: InsightsPolicySchema.parse(insightsPolicy), confirmations: ConfirmationsSchema.parse(confirmations ?? []) };
  return await execute(engine, rawInput, rest) as ProviderAuditReport;
}

async function execute(engine: Engine, rawInput: unknown, options: AuditOptions): Promise<AuditReport | ProviderAuditReport> {
  const mode: EvidenceMode = engine.mode; const adapter = engine.adapter;
  const input = AuditInputSchema.parse(rawInput);
  const confirmations = engine.mode === "recorded_live" ? engine.confirmations : [];
  const targetIds = new Set([...input.preferences.map((p) => p.id), ...input.recommendations.map((r) => r.id)]);
  if (confirmations.some((c) => !targetIds.has(c.target_id))) throw new Error("UNKNOWN_CONFIRMATION_TARGET");
  const decisions = new Map(confirmations.map((c) => [c.target_id, c]));
  const { signal, ...overrides } = options;
  const policy = policySchema.parse({ maxCalls: 14, maxRepairRounds: 1, timeoutMs: 60_000, callTimeoutMs: 4_000, ...overrides });
  const runId = randomUUID(); const started = performance.now(); const deadline = started + policy.timeoutMs;
  const datasetId = engine.mode === "fixture" ? engine.adapter.fixtureId : engine.adapter.datasetId;
  const inNamespace = engine.mode === "fixture" ? isSyntheticId : isQlooRef;
  const evidence: Array<Evidence | ProviderEvidence> = []; const trace: AuditReport["trace"] = [{ state: "Validate", call_id: null }];
  const lookups = new Map<string, Lookup>(); const preferenceRefs: string[] = [];
  const resolvedPreferenceIds = new Set<string>(); const signals: Signals = { preference_entity_ids: [], preference_tag_ids: [] };
  const resolvedPreferences: Array<{ kind: (typeof input.preferences)[number]["kind"]; id: string }> = [];
  const preferenceResolution: PreferenceResolution[] = input.preferences.map((p) =>
    ({ preference_id: p.id, lookup_ref: null, status: "not_attempted", selected_id: null }));
  let calls = 0; let repairRounds = 0; let stopReason: StopReason = "COMPLETE"; let replays = 0; let unavailable = 0;
  let originalRank: Rank | null = null; const repairs: Repair[] = [];
  const enter = (state: State) => { trace.push({ state, call_id: null }); };
  function capture(snapshot: Snapshot, callId: string | null, recording: Capture | null): Evidence | ProviderEvidence {
    const i = evidence.length;
    const common = { evidence_id: `${runId}:e${i}`, run_id: runId, operation: snapshotOperation(snapshot), call_id: callId,
      upstream_request_id: null, query_fingerprint: digest(snapshot), pointer: `/evidence/${i}/snapshot`, entity_ids: snapshotEntityIds(snapshot) };
    const result = engine.mode === "fixture"
      ? EvidenceSchema.parse({ ...common, source_mode: "fixture", provider: "synthetic", fixture_id: datasetId, retrieved_at: null,
        cache_hit: false, fetched_at: null, warnings: ["AUTHORED SYNTHETIC DATA; NO QLOO REQUEST"], snapshot })
      : ProviderEvidenceSchema.parse({ ...common, source_mode: "recorded_live", dataset_id: datasetId,
        provider: snapshot.kind === "input" ? "user" : snapshot.kind === "unavailable" ? "tastegate" : "qloo",
        capture: recording, cache_hit: recording !== null, fetched_at: recording?.recorded_at ?? null,
        warnings: [snapshot.kind === "input" ? WARNING.input : snapshot.kind === "unavailable" ? WARNING.unavailable : WARNING.recorded], snapshot });
    evidence.push(result); return result;
  }
  const inputRef = capture(engine.mode === "fixture" ? { kind: "input", input } : { kind: "input", input, confirmations }, null, null).evidence_id;
  const snapshotOf = (ref: string) => evidence.find((e) => e.evidence_id === ref)?.snapshot;
  function active() {
    if (signal?.aborted) throw new Stop("CANCELLED");
    if (performance.now() >= deadline) throw new Stop("TIMEOUT");
    if (calls >= policy.maxCalls) throw new Stop("CALL_BUDGET_EXHAUSTED");
  }
  function observe(value: unknown): { snapshot: Snapshot; recording: Capture | null } {
    if (engine.mode === "fixture") {
      const parsed = fixtureObservation.safeParse(value);
      if (!parsed.success || parsed.data.fixture_id !== datasetId || parsed.data.snapshot.kind === "unavailable") throw new Stop("PROVENANCE_REJECTED");
      return { snapshot: parsed.data.snapshot, recording: null };
    }
    const parsed = recordedObservation.safeParse(value);
    if (!parsed.success || parsed.data.dataset_id !== datasetId) throw new Stop("PROVENANCE_REJECTED");
    const { snapshot, capture: recording } = parsed.data;
    // Provider facts require a verified recording of the matching endpoint; unavailability has none.
    if ((recording === null) !== (snapshot.kind === "unavailable") || snapshot.kind === "input" ||
        (recording && recording.endpoint !== ENDPOINT[snapshotOperation(snapshot) as keyof typeof ENDPOINT])) throw new Stop("PROVENANCE_REJECTED");
    return { snapshot, recording };
  }
  async function call(state: State, expected: { kind: string } & Record<string, unknown>, invoke: (ctx: CallContext) => Promise<unknown>) {
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
      const { snapshot, recording } = observe(value);
      const { kind, ...fields } = expected;
      const echoed: Record<string, unknown> = snapshot.kind === "unavailable" ? snapshot.request : snapshot;
      if ((snapshot.kind === "unavailable" ? snapshot.request.operation : snapshot.kind) !== kind) throw new Stop("PROVENANCE_REJECTED");
      for (const [key, value] of Object.entries(fields))
        if (digest(echoed[key]) !== digest(value)) throw new Stop("PROVENANCE_REJECTED");
      if (snapshotRefs(snapshot).some((v) => !inNamespace(v))) throw new Stop("PROVENANCE_REJECTED");
      const returnedIds = snapshotEntityIds(snapshot);
      if (new Set(returnedIds).size !== returnedIds.length) throw new Stop("PROVENANCE_REJECTED");
      // Authored fixtures are exact-label worlds; provider candidates legitimately differ from the query.
      if (engine.mode === "fixture" && (snapshot.kind === "entity_lookup" || snapshot.kind === "tag_lookup") && snapshot.matches.some((e) => e.name !== snapshot.query)) throw new Stop("PROVENANCE_REJECTED");
      if (snapshot.kind === "rank_places" && snapshot.ordered_entity_ids.some((id) => !snapshot.candidate_entity_ids.includes(id))) throw new Stop("PROVENANCE_REJECTED");
      if (snapshot.kind === "discover_places" && snapshot.candidates.some((e) => snapshot.exclude_entity_ids.includes(e.id))) throw new Stop("PROVENANCE_REJECTED");
      if (snapshot.kind === "unavailable") unavailable++; else if (recording) replays++;
      return capture(snapshot, callId, recording);
    } finally {
      if (timer) clearTimeout(timer);
      if (parentAbort) signal?.removeEventListener("abort", parentAbort);
    }
  }
  async function lookup(name: string, kind: "artist" | "movie" | "place", state: State): Promise<Lookup> {
    const request = { query: name, requested_kind: kind };
    const e = await call(state, { kind: "entity_lookup", ...request }, (ctx) => adapter.searchEntity(request, ctx));
    return { snapshot: e.snapshot, ref: e.evidence_id };
  }
  const currentSignals = (): Signals => engine.mode === "fixture" ? signals : insightsSignals(engine.insightsPolicy.signal_scope, resolvedPreferences);
  async function rank(ids: string[], state: State): Promise<Rank> {
    const request = { ...currentSignals(), candidate_entity_ids: ids };
    const e = await call(state, { kind: "rank_places", ...request }, (ctx) => adapter.rankPlaces(request, ctx));
    return { snapshot: e.snapshot.kind === "rank_places" ? e.snapshot : null, ref: e.evidence_id };
  }
  const unresolved = () => input.preferences.filter((p) => !resolvedPreferenceIds.has(p.id)).map((p) => p.id);
  function identityFinding(resolution: CandidateAudit["resolution"], result: Lookup | undefined, candidateId: string, repair: boolean): Pick<Finding, "code" | "explanation"> {
    if (engine.mode === "fixture") return { code: resolution === "ambiguous" ? "AMBIGUOUS_ENTITY" : "UNRESOLVED_ENTITY", explanation: "Identity is not resolved; no claim of real-world nonexistence." };
    if (result?.snapshot.kind === "unavailable") return { code: "EVIDENCE_UNAVAILABLE",
      explanation: "No recorded provider response exists for this lookup. This is not evidence that the venue is wrong or nonexistent." };
    if (resolution === "unconfirmed") return { code: "CONFIRMATION_REQUIRED",
      explanation: `${lookupMatches(result?.snapshot).length} provider candidate(s) returned. TasteGate never selects one automatically; confirm the intended identity.` };
    if (repair) return { code: "UNRESOLVED_ENTITY", explanation: "The independent lookup did not return the discovered provider identity." };
    if (decisions.get(candidateId)?.decision === "skip") return { code: "UNRESOLVED_ENTITY", explanation: "You rejected every provider candidate; no identity is assumed." };
    return { code: "UNRESOLVED_ENTITY", explanation: "The provider returned no candidate; no claim of real-world nonexistence." };
  }
  function audit(candidateId: string, result: Lookup | undefined, ranking: Rank | null, claims: string[], repair?: { proposed: Entity; discoveryRef: string }): CandidateAudit {
    const { resolution, entity } = repair ? resolveReplacement(mode, result?.snapshot, repair.proposed.id)
      : resolveOriginal(mode, result?.snapshot, decisions.get(candidateId));
    const findings = entity || !repair ? checkConstraints(input, entity, result?.ref ?? null, inputRef, mode)
      : checkUnconfirmedConstraints(input, repair.proposed, repair.discoveryRef, inputRef, mode);
    const add = (code: Finding["code"], category: Finding["category"], state: Finding["state"], refs: string[], explanation: string) => findings.push({ code, category, state, constraint_id: null, evidence_refs: refs, explanation });
    if (!entity) { const f = identityFinding(resolution, result, candidateId, !!repair); add(f.code, "uncertainty", "unknown", result ? [result.ref] : [], f.explanation); }
    const position = entity && ranking?.snapshot ? ranking.snapshot.ordered_entity_ids.indexOf(entity.id) : -1;
    const hasRank = position >= 0;
    add(hasRank ? "TASTE_EVIDENCE_PRESENT" : "TASTE_EVIDENCE_MISSING", "insufficient_evidence", hasRank ? "pass" : "unknown", ranking ? [ranking.ref] : [],
      hasRank ? "Present in a relative ranking for this query; not an individual's preference probability." :
        ranking && !ranking.snapshot ? "Shortlist ranking evidence is unavailable (not recorded; a live request needs owner approval). Absence is not a negative affinity score." :
          "No candidate-specific taste evidence; absence is not a negative affinity score.");
    if (unresolved().length) add("PREFERENCE_UNRESOLVED", "uncertainty", "unknown", [inputRef], "One or more preference interpretations remain unresolved.");
    if (claims.length) add("CLAIM_UNVERIFIED", "insufficient_evidence", "unknown", [inputRef], "Free-form upstream claims are unsubstantiated: no deterministic claim check or LLM extraction is implemented.");
    const explainability: CandidateAudit["explainability"] = hasRank && ranking?.snapshot ? ranking.snapshot.explainability : "not_requested";
    if (explainability === "missing") add("EXPLAINABILITY_MISSING", "uncertainty", "not_applicable", ranking ? [ranking.ref] : [], "Detailed attribution is missing. No explanatory contribution is invented.");
    const body = { candidate_id: candidateId, resolution, entity_id: entity?.id ?? null, resolution_evidence_ref: result?.ref ?? null,
      hard_constraints: hardState(findings), evidence_coverage: (!hasRank ? "missing" : unresolved().length || claims.length ? "partial" : "covered") as CandidateAudit["evidence_coverage"],
      cultural_relevance: hasRank && ranking ? { query_ref: ranking.ref, ordinal_rank: position + 1 } : null, explainability, findings };
    return { ...body, verdict: candidateVerdict(body) };
  }
  const originalAudits = () => input.recommendations.map((r) => audit(r.id, lookups.get(r.id), originalRank, r.claims));
  function pendingConfirmations(): ProviderAuditReport["pending_confirmations"] {
    if (engine.mode === "fixture") return [];
    return [
      ...preferenceResolution.flatMap((p, i) => p.status === "pending" && p.lookup_ref ? [{ target_id: p.preference_id, target_kind: "preference" as const,
        lookup_ref: p.lookup_ref, candidate_ids: preferenceCandidates(input.preferences[i]!.kind, snapshotOf(p.lookup_ref)).map((c) => c.id) }] : []),
      ...input.recommendations.flatMap((r) => {
        const l = lookups.get(r.id);
        return l && resolveOriginal(mode, l.snapshot, decisions.get(r.id)).resolution === "unconfirmed" ? [{ target_id: r.id,
          target_kind: "recommendation" as const, lookup_ref: l.ref, candidate_ids: lookupMatches(l.snapshot).map((m) => m.id) }] : [];
      }),
    ];
  }
  try {
    enter("Resolve");
    for (const [index, preference] of input.preferences.entries()) {
      if (!preference.confirmed_anchor) { enter("NeedsInput"); throw new Stop("NEEDS_INPUT"); }
      const anchor = preference.confirmed_anchor;
      let found: Lookup;
      if (preference.kind === "tag_concept") {
        const e = await call("Resolve", { kind: "tag_lookup", query: anchor }, (ctx) => adapter.searchTags(anchor, ctx));
        found = { snapshot: e.snapshot, ref: e.evidence_id };
      } else found = await lookup(anchor, preference.kind === "artist" ? "artist" : "movie", "Resolve");
      let selectedId: string | undefined;
      if (engine.mode === "fixture") {
        const matches = found.snapshot.kind === "tag_lookup" ? found.snapshot.matches : lookupMatches(found.snapshot);
        const only = matches.length === 1 ? matches[0] : undefined;
        selectedId = found.snapshot.kind === "tag_lookup" ? only?.id :
          only && "kind" in only && only.kind === (preference.kind === "artist" ? "artist" : "movie") ? only.id : undefined;
        if (!selectedId) { enter("NeedsInput"); throw new Stop("NEEDS_INPUT"); }
      } else {
        const outcome = resolvePreference(preference.kind, found.snapshot, decisions.get(preference.id));
        preferenceResolution[index] = { preference_id: preference.id, lookup_ref: found.ref, ...outcome };
        selectedId = outcome.selected_id ?? undefined;
      }
      if (selectedId) {
        preferenceRefs.push(found.ref); resolvedPreferenceIds.add(preference.id); resolvedPreferences.push({ kind: preference.kind, id: selectedId });
        (preference.kind === "tag_concept" ? signals.preference_tag_ids : signals.preference_entity_ids).push(selectedId);
      }
    }
    for (const recommendation of input.recommendations) {
      const result = await lookup(recommendation.name, "place", "Resolve"); lookups.set(recommendation.id, result);
      if (engine.mode === "fixture" && lookupMatches(result.snapshot).length > 1) { enter("NeedsInput"); throw new Stop("NEEDS_INPUT"); }
    }
    // Provider identities wait for one explicit decision round covering every pending choice.
    if (pendingConfirmations().length) { enter("NeedsInput"); throw new Stop("NEEDS_INPUT"); }
    enter("Retrieve");
    const originalIds = input.recommendations.flatMap((r) => {
      const l = lookups.get(r.id); if (!l) return [];
      if (engine.mode === "fixture") return lookupMatches(l.snapshot).length === 1 ? lookupMatches(l.snapshot).map((e) => e.id) : [];
      const entity = resolveOriginal(mode, l.snapshot, decisions.get(r.id)).entity; return entity ? [entity.id] : [];
    });
    const insights = currentSignals();
    const hasSignal = insights.preference_entity_ids.length + insights.preference_tag_ids.length > 0;
    if (originalIds.length && hasSignal) originalRank = await rank([...new Set(originalIds)], "Retrieve");
    enter("Audit");
    const originals = originalAudits();
    const targets = repairTargets(originals);
    const hasCountFailure = originals.some((a) => a.findings.some((f) => f.code === "MAX_ITEMS_EXCEEDED"));
    if (targets.length && policy.maxRepairRounds && !hasCountFailure && hasSignal) {
      // Discovery + at least one independent lookup + common-set rank must all fit.
      const capacity = Math.min(targets.length, 3, policy.maxCalls - calls - 2);
      if (capacity < 1) throw new Stop("CALL_BUDGET_EXHAUSTED");
      active(); enter("Repair"); repairRounds = 1;
      const request = engine.mode === "fixture" ? { ...signals, exclude_entity_ids: originalIds } : { ...insights, exclude_entity_ids: originalIds,
        signal_scope: engine.insightsPolicy.signal_scope, take: engine.insightsPolicy.discovery_take, exclusion: engine.insightsPolicy.discovery_exclusion };
      const discovery = await call("Repair", { kind: "discover_places", ...request }, (ctx) => adapter.discoverPlaces(request, ctx));
      const selected = (discovery.snapshot.kind === "discover_places" ? discovery.snapshot.candidates : []).slice(0, capacity);
      if (selected.length) {
        enter("Revalidate"); const checks: Lookup[] = [];
        for (const entity of selected) checks.push(await lookup(entity.name, "place", "Revalidate"));
        const confirmedIds = checks.flatMap((c, i) => {
          const id = selected[i]!.id;
          if (engine.mode === "fixture") return lookupMatches(c.snapshot).length === 1 && lookupMatches(c.snapshot)[0]?.id === id ? [id] : [];
          return resolveReplacement(mode, c.snapshot, id).entity ? [id] : [];
        });
        const union = [...new Set([...originals.filter((a) => a.hard_constraints === "pass").flatMap((a) => a.entity_id ? [a.entity_id] : []), ...confirmedIds])];
        const commonRank = union.length ? await rank(union, "Revalidate") : null;
        for (const [i, entity] of selected.entries()) {
          const candidateId = `repair:${runId}:${i}`;
          const revalidation = audit(candidateId, checks[i], commonRank, [], { proposed: entity, discoveryRef: discovery.evidence_id });
          if (revalidation.entity_id !== null && revalidation.entity_id !== entity.id) {
            revalidation.findings.push({ code: "REVALIDATION_ID_MISMATCH", category: "integrity", state: "fail", constraint_id: null,
              evidence_refs: [discovery.evidence_id, checks[i]!.ref], explanation: "Independent lookup did not confirm the discovered identity." });
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
  const stopLine = stopReason === "COMPLETE" ? [] : [`Workflow stopped: ${stopReason}. Remaining slots and evidence stay visible.`];
  const common = { run_id: runId, input, input_ref: "/input" as const,
    ...reportSummary(originals, repairs, unresolvedIds, stopReason), original_audits: originals, repairs,
    preference_evidence_refs: preferenceRefs, unresolved_preferences: unresolvedIds, stop_reason: stopReason, trace,
    archive: { status: "not_requested" as const, action_id: null, receipt_ref: null } };
  const elapsed = Math.max(0, performance.now() - started);
  if (engine.mode === "fixture") return validateReport({
    schema_revision: "tastegate.report.v1a", source_mode: "fixture", ...common, evidence,
    limitations: ["AUTHORED SYNTHETIC FIXTURES ONLY. No Qloo API or LLM call was made.",
      "Affinity is not individual preference probability. Opening hours, live music, price and availability are not verified.",
      "Free-form claims are conservatively unverified; no LLM reasoning or operational fact service is implemented.",
      "Fixture snapshot hashes detect internal inconsistency, not authenticity of real Qloo data.", ...stopLine],
    usage: { qloo_dispatches: 0, llm_dispatches: 0, fixture_calls: calls, repair_rounds: repairRounds, elapsed_ms: elapsed },
  });
  return validateProviderReport({
    schema_revision: "tastegate.report.v2a", source_mode: "recorded_live", scenario_id: engine.scenarioId, ...common,
    insights_policy: engine.insightsPolicy, confirmations, preference_resolution: preferenceResolution,
    pending_confirmations: pendingConfirmations(), evidence,
    limitations: ["RECORDED LIVE: actual Qloo API responses, each captured once under a separate owner approval, replayed from private storage. No new Qloo request was made.",
      "Identities resolve only through your explicit confirmation among provider candidates; TasteGate never selects a provider ID by rank, count or label.",
      "Operations without an exactly matching verified recording are UNAVAILABLE; unavailable evidence is never treated as negative evidence.",
      "Qloo query.affinity is query-relative ordering evidence only: not comparable across queries and not a probability that a person will like a venue.",
      "City checks compare the provider geocode.city exactly; borough-level normalization is unverified. Opening hours, live music and availability are not verified.",
      "Free-form claims are conservatively unverified; no LLM reasoning or claim extraction is implemented.", ...stopLine],
    usage: { qloo_dispatches: 0, llm_dispatches: 0, adapter_calls: calls, recorded_replays: replays, unavailable_operations: unavailable,
      repair_rounds: repairRounds, elapsed_ms: elapsed },
  });
}
