import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  AuditInputSchema, CaptureSchema, ConfirmationsSchema, EvidenceSchema, InsightsPolicySchema, ProviderEvidenceSchema, ProviderModeSchema, SnapshotSchema,
  digest, isQlooRef, isSyntheticId, snapshotEntityIds, snapshotOperation, snapshotRefs,
  type AuditReport, type CandidateAudit, type Capture, type Confirmation, type Entity, type Evidence, type Finding, type IdentityBasis, type InsightsPolicy,
  type PendingConfirmation, type PreferenceResolution, type ProviderAuditReport, type ProviderEvidence, type ProviderMode, type PublicReference, type Repair, type Snapshot, type State, type StopReason,
} from "../domain/contracts";
import { validateProviderReport, validateReport } from "../domain/report-schema";
import {
  LiveExecutionBlockedError, requireFixture, type AuthorizedLiveQlooAdapter, type CallContext, type FixtureQlooAdapter, type LiveQlooAdapter,
  type ProviderQlooAdapter, type RecordedQlooAdapter, type Signals,
} from "../qloo/ports";
import {
  candidateVerdict, checkConstraints, checkUnconfirmedConstraints, deriveRepairOutcomes, hardState, insightsSignals, lookupMatches, pendingReplacementConfirmations,
  preferenceCandidates, referenceConflicts, repairAccepted, repairTargets, replacementDecision, replacementTarget, reportSummary, resolveOriginal, resolvePreference, resolveReplacement, type EvidenceMode,
} from "./rules";

const fixtureObservation = z.strictObject({ source_mode: z.literal("fixture"), fixture_id: z.string(), snapshot: SnapshotSchema });
const providerObservation = z.strictObject({ source_mode: ProviderModeSchema, dataset_id: z.string(), capture: CaptureSchema.nullable(), snapshot: SnapshotSchema });
const policySchema = z.strictObject({
  maxCalls: z.number().int().min(0).max(14), maxRepairRounds: z.number().int().min(0).max(1),
  timeoutMs: z.number().int().min(1).max(60_000), callTimeoutMs: z.number().int().min(1).max(4_000),
});
type Policy = z.infer<typeof policySchema>;
export type AuditOptions = Partial<Policy> & { signal?: AbortSignal };
// scenarioId and insightsPolicy are trusted host values; confirmations are validated user decisions.
export type ProviderAuditOptions = AuditOptions & { scenarioId: string; insightsPolicy: InsightsPolicy; confirmations?: unknown };
export type RecordedAuditOptions = ProviderAuditOptions;
class Stop extends Error { constructor(readonly reason: StopReason) { super(reason); } }
type Lookup = { snapshot: Snapshot; ref: string };
// A null snapshot records an unavailable ranking whose reference still explains the missing evidence.
type Rank = { snapshot: Extract<Snapshot, { kind: "rank_places" }> | null; ref: string };
type Discovery = { snapshot: Extract<Snapshot, { kind: "discover_places" }>; ref: string };
type Engine =
  | { mode: "fixture"; adapter: FixtureQlooAdapter }
  | { mode: ProviderMode; adapter: ProviderQlooAdapter; scenarioId: string; insightsPolicy: InsightsPolicy; confirmations: Confirmation[] };
const ENDPOINT = { entity_lookup: "/search", tag_lookup: "/v2/tags", insights: "/v2/insights" } as const;
const PROVIDER_WARNING: Record<ProviderMode, string> = {
  recorded_live: "RECORDED QLOO RESPONSE FROM AN OWNER-APPROVED PROBE; REPLAYED, NO NEW REQUEST",
  authorized_live: "FRESH QLOO RESPONSE FROM AN OWNER-AUTHORIZED LIVE REQUEST; LEDGERED, NOT A REPLAY",
};
const WARNING = {
  input: "USER OR AUTHORED INPUT; NOT PROVIDER EVIDENCE",
  unavailable: "NO PROVIDER EVIDENCE FOR THIS EXACT REQUEST; ABSENCE IS NOT NEGATIVE EVIDENCE",
};

export async function runAudit(rawInput: unknown, providedAdapter: FixtureQlooAdapter | LiveQlooAdapter, options: AuditOptions = {}): Promise<AuditReport> {
  requireFixture(providedAdapter); // A live key or a live-shaped adapter never causes a fixture fallback.
  return await execute({ mode: "fixture", adapter: providedAdapter }, rawInput, options) as AuditReport;
}
async function runProvider(mode: ProviderMode, rawInput: unknown, adapter: ProviderQlooAdapter, options: ProviderAuditOptions): Promise<ProviderAuditReport> {
  // The adapter's own mode must equal the entry point: a recorded adapter can never run as live, nor the reverse.
  if (adapter.mode !== mode) throw new LiveExecutionBlockedError();
  const { scenarioId, insightsPolicy, confirmations, ...rest } = options;
  const engine = { mode, adapter, scenarioId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/).parse(scenarioId),
    insightsPolicy: InsightsPolicySchema.parse(insightsPolicy), confirmations: ConfirmationsSchema.parse(confirmations ?? []) };
  return await execute(engine, rawInput, rest) as ProviderAuditReport;
}
export const runRecordedAudit = (rawInput: unknown, adapter: RecordedQlooAdapter, options: ProviderAuditOptions) => runProvider("recorded_live", rawInput, adapter, options);
export const runAuthorizedLiveAudit = (rawInput: unknown, adapter: AuthorizedLiveQlooAdapter, options: ProviderAuditOptions) => runProvider("authorized_live", rawInput, adapter, options);

async function execute(engine: Engine, rawInput: unknown, options: AuditOptions): Promise<AuditReport | ProviderAuditReport> {
  const mode: EvidenceMode = engine.mode; const adapter = engine.adapter;
  const providerEngine = engine.mode === "fixture" ? null : engine; const provider = providerEngine?.mode ?? null;
  const input = AuditInputSchema.parse(rawInput);
  const confirmations = providerEngine?.confirmations ?? [];
  const targetIds = new Set([...input.preferences.map((p) => p.id), ...input.recommendations.flatMap((r) => [r.id, replacementTarget(r.id)])]);
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
  let calls = 0; let repairRounds = 0; let stopReason: StopReason = "COMPLETE"; let replays = 0; let dispatched = 0; let unavailable = 0;
  let commonRank: Rank | null = null; let discovery: Discovery | null = null; const repairs: Repair[] = [];
  const enter = (state: State) => { trace.push({ state, call_id: null }); };
  function capture(snapshot: Snapshot, callId: string | null, origin: Capture | null): Evidence | ProviderEvidence {
    const i = evidence.length;
    const common = { evidence_id: `${runId}:e${i}`, run_id: runId, operation: snapshotOperation(snapshot), call_id: callId,
      upstream_request_id: null, query_fingerprint: digest(snapshot), pointer: `/evidence/${i}/snapshot`, entity_ids: snapshotEntityIds(snapshot) };
    const result = provider === null
      ? EvidenceSchema.parse({ ...common, source_mode: "fixture", provider: "synthetic", fixture_id: datasetId, retrieved_at: null,
        cache_hit: false, fetched_at: null, warnings: ["AUTHORED SYNTHETIC DATA; NO QLOO REQUEST"], snapshot })
      : ProviderEvidenceSchema.parse({ ...common, source_mode: provider, dataset_id: datasetId,
        provider: snapshot.kind === "input" ? "user" : snapshot.kind === "unavailable" ? "tastegate" : "qloo",
        capture: origin, cache_hit: origin !== null && provider === "recorded_live", fetched_at: origin?.recorded_at ?? null,
        warnings: [snapshot.kind === "input" ? WARNING.input : snapshot.kind === "unavailable" ? WARNING.unavailable : PROVIDER_WARNING[provider]], snapshot });
    evidence.push(result); return result;
  }
  const inputRef = capture(provider === null ? { kind: "input", input } : { kind: "input", input, confirmations }, null, null).evidence_id;
  const snapshotOf = (ref: string) => evidence.find((e) => e.evidence_id === ref)?.snapshot;
  function active() {
    if (signal?.aborted) throw new Stop("CANCELLED");
    if (performance.now() >= deadline) throw new Stop("TIMEOUT");
    if (calls >= policy.maxCalls) throw new Stop("CALL_BUDGET_EXHAUSTED");
  }
  function observe(value: unknown): { snapshot: Snapshot; origin: Capture | null } {
    if (provider === null) {
      const parsed = fixtureObservation.safeParse(value);
      if (!parsed.success || parsed.data.fixture_id !== datasetId || parsed.data.snapshot.kind === "unavailable") throw new Stop("PROVENANCE_REJECTED");
      return { snapshot: parsed.data.snapshot, origin: null };
    }
    const parsed = providerObservation.safeParse(value);
    if (!parsed.success || parsed.data.dataset_id !== datasetId || parsed.data.source_mode !== provider) throw new Stop("PROVENANCE_REJECTED");
    const { snapshot, capture: origin } = parsed.data;
    // Provider facts require an origin record of the matching endpoint and the same mode; unavailability has none.
    if ((origin === null) !== (snapshot.kind === "unavailable") || snapshot.kind === "input" ||
        (origin && (origin.endpoint !== ENDPOINT[snapshotOperation(snapshot) as keyof typeof ENDPOINT] || (origin.probe === "LIVE") !== (provider === "authorized_live")))) throw new Stop("PROVENANCE_REJECTED");
    return { snapshot, origin };
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
      const { snapshot, origin } = observe(value);
      const { kind, ...fields } = expected;
      const echoed: Record<string, unknown> = snapshot.kind === "unavailable" ? snapshot.request : snapshot;
      if ((snapshot.kind === "unavailable" ? snapshot.request.operation : snapshot.kind) !== kind) throw new Stop("PROVENANCE_REJECTED");
      for (const [key, value] of Object.entries(fields))
        if (digest(echoed[key]) !== digest(value)) throw new Stop("PROVENANCE_REJECTED");
      if (snapshotRefs(snapshot).some((v) => !inNamespace(v))) throw new Stop("PROVENANCE_REJECTED");
      const returnedIds = snapshotEntityIds(snapshot);
      if (new Set(returnedIds).size !== returnedIds.length) throw new Stop("PROVENANCE_REJECTED");
      // Authored fixtures are exact-label worlds; provider candidates legitimately differ from the query.
      if (provider === null && (snapshot.kind === "entity_lookup" || snapshot.kind === "tag_lookup") && snapshot.matches.some((e) => e.name !== snapshot.query)) throw new Stop("PROVENANCE_REJECTED");
      if (snapshot.kind === "rank_places" && snapshot.ordered_entity_ids.some((id) => !snapshot.candidate_entity_ids.includes(id))) throw new Stop("PROVENANCE_REJECTED");
      if (snapshot.kind === "discover_places" && snapshot.candidates.some((e) => snapshot.exclude_entity_ids.includes(e.id))) throw new Stop("PROVENANCE_REJECTED");
      if (snapshot.kind === "unavailable") unavailable++; else if (origin) { if (provider === "authorized_live") dispatched++; else replays++; }
      return capture(snapshot, callId, origin);
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
  const currentSignals = (): Signals => providerEngine === null ? signals : insightsSignals(providerEngine.insightsPolicy.signal_scope, resolvedPreferences);
  async function rank(ids: string[], state: State): Promise<Rank> {
    const request = { ...currentSignals(), candidate_entity_ids: ids };
    const e = await call(state, { kind: "rank_places", ...request }, (ctx) => adapter.rankPlaces(request, ctx));
    return { snapshot: e.snapshot.kind === "rank_places" ? e.snapshot : null, ref: e.evidence_id };
  }
  const unresolved = () => input.preferences.filter((p) => !resolvedPreferenceIds.has(p.id)).map((p) => p.id);
  function identityFinding(resolution: CandidateAudit["resolution"], result: Lookup | undefined, candidateId: string, repair?: { declined: boolean }): Pick<Finding, "code" | "explanation"> {
    if (repair?.declined) return { code: "UNRESOLVED_ENTITY", explanation: "You declined this proposed replacement; its identity is not established." };
    if (provider === null) return { code: resolution === "ambiguous" ? "AMBIGUOUS_ENTITY" : "UNRESOLVED_ENTITY", explanation: "Identity is not resolved; no claim of real-world nonexistence." };
    if (result?.snapshot.kind === "unavailable") return { code: "EVIDENCE_UNAVAILABLE",
      explanation: repair ? "No independent provider lookup exists for the proposed replacement, and you have not confirmed its identity. This is not evidence that the venue is wrong." :
        "No provider response exists for this lookup. This is not evidence that the venue is wrong or nonexistent." };
    if (resolution === "unconfirmed") return { code: "CONFIRMATION_REQUIRED",
      explanation: `${lookupMatches(result?.snapshot).length} provider candidate(s) returned. TasteGate never selects one automatically; confirm the intended identity.` };
    if (repair) return { code: "UNRESOLVED_ENTITY", explanation: "The independent lookup did not return the proposed provider identity, and you have not confirmed it." };
    if (decisions.get(candidateId)?.decision === "skip") return { code: "UNRESOLVED_ENTITY", explanation: "You rejected every provider candidate; no identity is assumed." };
    return { code: "UNRESOLVED_ENTITY", explanation: "The provider returned no candidate; no claim of real-world nonexistence." };
  }
  // A public reference exists only for provider evidence whose adapter registers them (a recorded adapter built with a verified registry).
  const referenceFor = (proposed: Entity): PublicReference | null => provider === null ? null : (adapter as ProviderQlooAdapter).publicReference?.(proposed.id) ?? null;
  type RepairContext = { proposed: Entity; discovery: Discovery; slot: string; reference: PublicReference | null };
  function auditFull(candidateId: string, result: Lookup | undefined, ranking: Rank | null, claims: string[], repair?: RepairContext): { audit: CandidateAudit; basis: IdentityBasis | null } {
    const resolved = repair ? resolveReplacement(mode, result?.snapshot, repair.proposed, replacementDecision(decisions.get(replacementTarget(repair.slot)), repair.proposed.id), repair.reference)
      : { ...resolveOriginal(mode, result?.snapshot, decisions.get(candidateId)), basis: null as IdentityBasis | null };
    const { resolution, entity, basis } = resolved;
    // Facts of a user-confirmed or reference-identified replacement come from the discovery record; otherwise from the lookup.
    const resolutionRef = basis === "user_confirmation" || basis === "official_public_reference" ? repair!.discovery.ref : result?.ref ?? null;
    const findings = entity || !repair ? checkConstraints(input, entity, resolutionRef, inputRef, mode)
      : checkUnconfirmedConstraints(input, repair.proposed, repair.discovery.ref, inputRef, mode);
    const add = (code: Finding["code"], category: Finding["category"], state: Finding["state"], refs: string[], explanation: string) => findings.push({ code, category, state, constraint_id: null, evidence_refs: refs, explanation });
    if (!entity) {
      const declined = repair ? replacementDecision(decisions.get(replacementTarget(repair.slot)), repair.proposed.id) === "declined" : false;
      const f = identityFinding(resolution, result, candidateId, repair ? { declined } : undefined); add(f.code, "uncertainty", "unknown", result ? [result.ref] : [], f.explanation);
    }
    if (basis === "user_confirmation") add("IDENTITY_USER_CONFIRMED", "uncertainty", "pass", [inputRef], "You confirmed this venue from the provider's candidate details; no independent lookup or official reference was available. That is your decision, not a second source, so it cannot make the repair verified.");
    if (basis === "official_public_reference" && repair?.reference) add("IDENTITY_OFFICIAL_REFERENCE", "uncertainty", "pass", [repair.discovery.ref],
      `A page from ${repair.reference.publisher}, reviewed by the owner, names this venue, city and country and agrees with the provider record.`);
    if (repair?.reference && referenceConflicts(repair.reference, repair.proposed)) add("FACT_CONFLICT", "integrity", "fail", [repair.discovery.ref],
      "The reviewed official page contradicts the provider's record for this identity (name, city or country). The replacement is rejected.");
    // Taste evidence: the common-set ranking when it returned the entity; for a replacement only, otherwise the position
    // in Qloo's own discovery for the confirmed signal (one query, ordinal only). Neither is a preference probability.
    // Evidence is keyed by the provider ID the query was about. A proposal is its own subject even before the user has
    // confirmed it; an original with no selected identity has no subject. (Verdicts still require a resolved identity.)
    const subject = entity?.id ?? repair?.proposed.id ?? null;
    const rankPosition = subject && ranking?.snapshot ? ranking.snapshot.ordered_entity_ids.indexOf(subject) : -1;
    const discoveryPosition = repair && subject && rankPosition < 0 ? repair.discovery.snapshot.candidates.findIndex((c) => c.id === subject) : -1;
    const hasRank = rankPosition >= 0; const hasDiscoveryOrder = discoveryPosition >= 0; const hasTaste = hasRank || hasDiscoveryOrder;
    add(hasTaste ? "TASTE_EVIDENCE_PRESENT" : "TASTE_EVIDENCE_MISSING", "insufficient_evidence", hasTaste ? "pass" : "unknown",
      hasRank ? [ranking!.ref] : hasDiscoveryOrder ? [repair!.discovery.ref] : ranking ? [ranking.ref] : [],
      hasRank ? "Present in a relative ranking for this one query; not an individual's preference probability." :
        hasDiscoveryOrder ? "Returned by Qloo's discovery for your confirmed signal (order within that one query); not an individual's preference probability." :
          ranking && !ranking.snapshot ? "Shortlist ranking evidence is unavailable for this exact request (not recorded or not authorized). Absence is not a negative affinity score." :
            "No candidate-specific taste evidence; absence is not a negative affinity score.");
    if (unresolved().length) add("PREFERENCE_UNRESOLVED", "uncertainty", "unknown", [inputRef], "One or more preference interpretations remain unresolved.");
    if (claims.length) add("CLAIM_UNVERIFIED", "insufficient_evidence", "unknown", [inputRef], "Free-form upstream claims are unsubstantiated: no deterministic claim check or LLM extraction is implemented.");
    const explainability: CandidateAudit["explainability"] = hasRank && ranking?.snapshot ? ranking.snapshot.explainability : "not_requested";
    if (explainability === "missing") add("EXPLAINABILITY_MISSING", "uncertainty", "not_applicable", ranking ? [ranking.ref] : [], "Detailed attribution is missing. No explanatory contribution is invented.");
    const body = { candidate_id: candidateId, resolution, entity_id: entity?.id ?? null, resolution_evidence_ref: resolutionRef,
      hard_constraints: hardState(findings), evidence_coverage: (!hasTaste ? "missing" : unresolved().length || claims.length ? "partial" : "covered") as CandidateAudit["evidence_coverage"],
      cultural_relevance: hasRank && ranking ? { query_ref: ranking.ref, ordinal_rank: rankPosition + 1 } : hasDiscoveryOrder ? { query_ref: repair!.discovery.ref, ordinal_rank: discoveryPosition + 1 } : null,
      explainability, findings };
    return { audit: { ...body, verdict: candidateVerdict(body) }, basis };
  }
  const audit = (candidateId: string, result: Lookup | undefined, ranking: Rank | null, claims: string[]) => auditFull(candidateId, result, ranking, claims).audit;
  const originalAudits = (ranking: Rank | null) => input.recommendations.map((r) => audit(r.id, lookups.get(r.id), ranking, r.claims));
  function blockingConfirmations(): PendingConfirmation[] {
    if (provider === null) return [];
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
      if (provider === null) {
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
      if (provider === null && lookupMatches(result.snapshot).length > 1) { enter("NeedsInput"); throw new Stop("NEEDS_INPUT"); }
    }
    // Provider identities wait for one explicit decision round covering every pending choice.
    if (blockingConfirmations().length) { enter("NeedsInput"); throw new Stop("NEEDS_INPUT"); }
    // Identity and hard-constraint outcomes need no provider ranking, so the repair targets are known before retrieval.
    const targets = repairTargets(originalAudits(null));
    const hasCountFailure = originalAudits(null).some((a) => a.findings.some((f) => f.code === "MAX_ITEMS_EXCEEDED"));
    const originalIds = input.recommendations.flatMap((r) => {
      const l = lookups.get(r.id); if (!l) return [];
      if (provider === null) return lookupMatches(l.snapshot).length === 1 ? lookupMatches(l.snapshot).map((e) => e.id) : [];
      const entity = resolveOriginal(mode, l.snapshot, decisions.get(r.id)).entity; return entity ? [entity.id] : [];
    });
    const insights = currentSignals();
    const hasSignal = insights.preference_entity_ids.length + insights.preference_tag_ids.length > 0;
    const wantRepair = targets.length > 0 && policy.maxRepairRounds > 0 && !hasCountFailure && hasSignal;
    // Discovery + one common-set ranking + at least one independent lookup must all fit in the remaining budget.
    const capacity = wantRepair ? Math.min(targets.length, 3, policy.maxCalls - calls - 2) : 0;
    enter("Retrieve");
    let proposals: Entity[] = [];
    if (capacity >= 1) {
      const request = providerEngine === null ? { ...signals, exclude_entity_ids: originalIds } : { ...insights, exclude_entity_ids: originalIds,
        signal_scope: providerEngine.insightsPolicy.signal_scope, take: providerEngine.insightsPolicy.discovery_take, exclusion: providerEngine.insightsPolicy.discovery_exclusion };
      const found = await call("Retrieve", { kind: "discover_places", ...request }, (ctx) => adapter.discoverPlaces(request, ctx));
      if (found.snapshot.kind === "discover_places") { discovery = { snapshot: found.snapshot, ref: found.evidence_id }; proposals = found.snapshot.candidates.slice(0, capacity); }
      else discovery = null;
    }
    // ONE common-set ranking over originals and proposals, so before/after evidence comes from the same query context.
    const rankIds = [...new Set([...originalIds, ...proposals.map((p) => p.id)])];
    if (rankIds.length && hasSignal) commonRank = await rank(rankIds, "Retrieve");
    enter("Audit");
    if (wantRepair && capacity < 1) throw new Stop("CALL_BUDGET_EXHAUSTED");
    if (wantRepair) {
      enter("Repair"); repairRounds = 1;
      if (proposals.length && discovery) {
        enter("Revalidate"); const checks: Lookup[] = [];
        for (const entity of proposals) checks.push(await lookup(entity.name, "place", "Revalidate"));
        for (const [i, entity] of proposals.entries()) {
          const slot = targets[i]!.candidate_id; const candidateId = `repair:${runId}:${i}`;
          const reference = referenceFor(entity);
          const { audit: revalidation, basis } = auditFull(candidateId, checks[i], commonRank, [], { proposed: entity, discovery, slot, reference });
          if (revalidation.entity_id !== null && revalidation.entity_id !== entity.id) {
            revalidation.findings.push({ code: "REVALIDATION_ID_MISMATCH", category: "integrity", state: "fail", constraint_id: null,
              evidence_refs: [discovery.ref, checks[i]!.ref], explanation: "Independent lookup did not confirm the discovered identity." });
            revalidation.verdict = "BLOCKED";
          }
          repairs.push({ replaces: slot, replacement_candidate_id: candidateId, proposed_entity_id: entity.id, discovery_evidence_refs: [discovery.ref],
            lookup_evidence_ref: checks[i]!.ref, revalidation, accepted: repairAccepted(revalidation.verdict, basis), identity_basis: basis, corroboration: reference });
        }
      }
    }
  } catch (error) {
    stopReason = error instanceof Stop ? error.reason : "ADAPTER_ERROR";
  }
  enter("Report"); const originals = originalAudits(commonRank); const unresolvedIds = unresolved();
  const reportTargets = repairTargets(originals).map((a) => a.candidate_id);
  const discoveryEvidence = evidence.find((e) => e.snapshot.kind === "discover_places" || (e.snapshot.kind === "unavailable" && e.snapshot.request.operation === "discover_places"));
  const repair_outcomes = deriveRepairOutcomes({ targets: reportTargets, repairs, decisions, stop: stopReason,
    hasCountFailure: originals.some((a) => a.findings.some((f) => f.code === "MAX_ITEMS_EXCEEDED")),
    hasSignal: currentSignals().preference_entity_ids.length + currentSignals().preference_tag_ids.length > 0,
    discovery: !discoveryEvidence ? "not_attempted" : discoveryEvidence.snapshot.kind === "unavailable" ? "unavailable" : "returned" });
  const stopLine = stopReason === "COMPLETE" ? [] : [`Workflow stopped: ${stopReason}. Remaining slots and evidence stay visible.`];
  const common = { run_id: runId, input, input_ref: "/input" as const,
    ...reportSummary(originals, repairs, unresolvedIds, stopReason), original_audits: originals, repairs, repair_outcomes,
    preference_evidence_refs: preferenceRefs, unresolved_preferences: unresolvedIds, stop_reason: stopReason, trace,
    archive: { status: "not_requested" as const, action_id: null, receipt_ref: null } };
  const elapsed = Math.max(0, performance.now() - started);
  if (provider === null) return validateReport({
    schema_revision: "tastegate.report.v1b", source_mode: "fixture", ...common, evidence,
    limitations: ["AUTHORED SYNTHETIC FIXTURES ONLY. No Qloo API or LLM call was made.",
      "Affinity is not individual preference probability. Opening hours, live music, price and availability are not verified.",
      "Free-form claims are conservatively unverified; no LLM reasoning or operational fact service is implemented.",
      "Fixture snapshot hashes detect internal inconsistency, not authenticity of real Qloo data.", ...stopLine],
    usage: { qloo_dispatches: 0, llm_dispatches: 0, fixture_calls: calls, repair_rounds: repairRounds, elapsed_ms: elapsed },
  });
  const origin = provider === "recorded_live" ?
    "RECORDED LIVE: actual Qloo API responses, each captured once under a separate owner approval, replayed from private storage. No new Qloo request was made." :
    "AUTHORIZED LIVE: fresh Qloo requests made under a time-boxed owner grant, each recorded in a private ledger. The report contains only normalized, validated fields.";
  return validateProviderReport({
    schema_revision: "tastegate.report.v2b", source_mode: provider, scenario_id: providerEngine!.scenarioId, ...common,
    insights_policy: providerEngine!.insightsPolicy, confirmations, preference_resolution: preferenceResolution,
    pending_confirmations: [...blockingConfirmations(), ...pendingReplacementConfirmations(repairs, decisions)], evidence,
    limitations: [origin,
      "Identities resolve only through your explicit confirmation among provider candidates (or an independent lookup for a proposed replacement); TasteGate never selects a provider ID by rank, count or label.",
      "A replacement is VERIFIED only when a second source corroborates its identity (an independent provider lookup or a registered official public reference); your confirmation alone keeps it at 'evidence insufficient'.",
      "Operations without an exactly matching verified recording or live authorization are UNAVAILABLE; unavailable evidence is never treated as negative evidence.",
      "Qloo query.affinity is query-relative ordering evidence only: not comparable across queries and not a probability that a person will like a venue.",
      "City checks compare the provider geocode.city exactly; borough-level normalization is unverified. Opening hours, live music and availability are not verified.",
      "Free-form claims are conservatively unverified; no LLM reasoning or claim extraction is implemented.", ...stopLine],
    usage: { qloo_dispatches: dispatched, llm_dispatches: 0, adapter_calls: calls, recorded_replays: replays, unavailable_operations: unavailable,
      repair_rounds: repairRounds, elapsed_ms: elapsed },
  });
}
