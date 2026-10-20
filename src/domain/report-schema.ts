import {
  ProviderReportShapeSchema, ReportShapeSchema, digest, isQlooRef, isSyntheticId, snapshotRefs,
  type AuditReport, type Entity, type ProviderAuditReport, type Snapshot,
} from "./contracts";
import {
  candidateVerdict, checkConstraints, checkUnconfirmedConstraints, deriveRepairOutcomes, hardState, insightsSignals, lookupMatches, pendingReplacementConfirmations,
  preferenceCandidates, repairTargets, replacementDecision, replacementTarget, reportSummary, resolveOriginal, resolvePreference, resolveReplacement,
} from "../audit/rules";

type Shape = AuditReport | ProviderAuditReport;
const lookupQuery = (s: Snapshot | undefined) => s?.kind === "entity_lookup" || s?.kind === "tag_lookup" ? s.query :
  s?.kind === "unavailable" && (s.request.operation === "entity_lookup" || s.request.operation === "tag_lookup") ? s.request.query : undefined;
const isEntityLookup = (s: Snapshot | undefined) => s?.kind === "entity_lookup" || (s?.kind === "unavailable" && s.request.operation === "entity_lookup");

// Structural validation alone cannot establish evidence support: enforce the complete graph. Every claim a report
// makes (identity, constraint findings, relevance evidence, repair outcomes, pending decisions) is re-derived here
// from the evidence itself, so a forged or hand-edited report cannot validate.
function validateGraph(r: Shape, reject: (message: string) => void): void {
  const mode = r.source_mode; const provider = r.source_mode === "fixture" ? null : r;
  const evidence: Shape["evidence"][number][] = r.evidence;
  const ev = new Map(evidence.map((e) => [e.evidence_id, e]));
  const snap = (ref: string | null | undefined) => ref ? ev.get(ref)?.snapshot : undefined;
  const indexOf = (ref: string | null | undefined) => evidence.findIndex((e) => e.evidence_id === ref);
  if (ev.size !== evidence.length) reject("Duplicate evidence IDs");
  const datasetOf = (e: Shape["evidence"][number]) => e.source_mode === "fixture" ? e.fixture_id : e.dataset_id;
  const datasetId = evidence[0] ? datasetOf(evidence[0]) : undefined;
  for (const [i, e] of evidence.entries()) {
    if (e.run_id !== r.run_id || datasetOf(e) !== datasetId || e.pointer !== `/evidence/${i}/snapshot`)
      reject("Cross-run, wrong-fixture or dangling snapshot provenance");
    if (e.source_mode !== mode) reject("Evidence mixes execution modes");
  }
  const inputEvidence = evidence.filter((e) => e.snapshot.kind === "input");
  const inputSnapshot = inputEvidence[0]?.snapshot;
  if (inputEvidence.length !== 1 || inputSnapshot?.kind !== "input" || digest(inputSnapshot.input) !== digest(r.input) ||
      (provider && digest(inputSnapshot.confirmations ?? null) !== digest(provider.confirmations))) reject("Input witness mismatch");
  const inputRef = inputEvidence[0]?.evidence_id ?? "missing";
  // Identifier namespaces cannot mix: fixtures are synthetic, provider evidence uses pseudonymous provider references.
  const inNamespace = provider ? isQlooRef : isSyntheticId;
  const audits = [...r.original_audits, ...r.repairs.map((x) => x.revalidation)];
  const mentioned = [...evidence.flatMap((e) => [...e.entity_ids, ...snapshotRefs(e.snapshot)]),
    ...audits.flatMap((a) => a.entity_id ? [a.entity_id] : []), ...r.repairs.map((x) => x.proposed_entity_id),
    ...(provider ? [...provider.confirmations.flatMap((c) => c.decision === "select" ? [c.ref] : []),
      ...provider.preference_resolution.flatMap((p) => p.selected_id ? [p.selected_id] : []),
      ...provider.pending_confirmations.flatMap((p) => p.candidate_ids)] : [])];
  if (mentioned.some((v) => !inNamespace(v))) reject("Identifier namespace mismatch");
  const calls = r.trace.flatMap((t) => t.call_id ? [t.call_id] : []);
  const callCount = provider ? provider.usage.adapter_calls : r.source_mode === "fixture" ? r.usage.fixture_calls : -1;
  if (new Set(calls).size !== calls.length || calls.length !== callCount ||
      evidence.some((e) => e.call_id && !calls.includes(e.call_id)) ||
      new Set(evidence.filter((e) => e.call_id).map((e) => e.call_id)).size !== evidence.length - 1)
    reject("Call trace mismatch");
  if (provider) {
    const origins = provider.evidence.filter((e) => e.capture).length;
    const replayed = provider.source_mode === "recorded_live";
    if (provider.usage.recorded_replays !== (replayed ? origins : 0) || provider.usage.qloo_dispatches !== (replayed ? 0 : origins) ||
        provider.usage.unavailable_operations !== provider.evidence.filter((e) => e.snapshot.kind === "unavailable").length)
      reject("Provider usage contradicts its evidence");
  }
  if (r.trace.filter((t) => t.state === "Repair" && t.call_id === null).length !== r.usage.repair_rounds ||
      r.trace.filter((t) => t.state === "Revalidate" && t.call_id === null).length > 1 ||
      (r.repairs.length > 0 && r.usage.repair_rounds !== 1)) reject("Repair limit mismatch");
  const phaseOrder = ["Validate", "Resolve", "Retrieve", "Audit", "Repair", "Revalidate", "NeedsInput", "Report"];
  let phase = -1;
  for (const t of r.trace) {
    const next = phaseOrder.indexOf(t.state);
    if (t.call_id ? next !== phase : next <= phase) reject("Invalid audit transition");
    phase = next;
  }
  if (r.trace[0]?.state !== "Validate" || r.trace.at(-1)?.state !== "Report" ||
      (r.repairs.length > 0 && !r.trace.some((t) => t.state === "Revalidate" && t.call_id === null))) reject("Missing workflow boundary");

  const covered = new Set<string>(); const entitySignals: string[] = []; const tagSignals: string[] = [];
  const decisions = new Map((provider?.confirmations ?? []).map((c) => [c.target_id, c]));
  if (provider) {
    const targets = new Set([...r.input.preferences.map((p) => p.id), ...r.input.recommendations.flatMap((x) => [x.id, replacementTarget(x.id)])]);
    if (provider.confirmations.some((c) => !targets.has(c.target_id))) reject("Confirmation targets an unknown slot");
    const resolvedRefs: string[] = []; const resolved: Array<{ kind: (typeof r.input.preferences)[number]["kind"]; id: string }> = [];
    if (provider.preference_resolution.length !== r.input.preferences.length) reject("Preference resolution count mismatch");
    for (const [i, p] of r.input.preferences.entries()) {
      const entry = provider.preference_resolution[i];
      if (!entry || entry.preference_id !== p.id) { reject("Preference resolution order mismatch"); continue; }
      if (entry.lookup_ref === null) { if (entry.status !== "not_attempted" || entry.selected_id !== null) reject("Unattempted preference claims a result"); continue; }
      const s = snap(entry.lookup_ref);
      const operation = p.kind === "tag_concept" ? "tag_lookup" : "entity_lookup";
      const kind = s?.kind === "entity_lookup" ? s.requested_kind : s?.kind === "unavailable" && s.request.operation === "entity_lookup" ? s.request.requested_kind : undefined;
      if (!s || (s.kind !== operation && !(s.kind === "unavailable" && s.request.operation === operation)) || lookupQuery(s) !== p.confirmed_anchor ||
          (operation === "entity_lookup" && kind !== (p.kind === "artist" ? "artist" : "movie"))) { reject("Preference lookup mismatch"); continue; }
      const expected = resolvePreference(p.kind, s, decisions.get(p.id));
      if (entry.status !== expected.status || entry.selected_id !== expected.selected_id) reject("Preference resolution contradicts its evidence or decision");
      if (expected.status === "resolved" && expected.selected_id) { covered.add(p.id); resolvedRefs.push(entry.lookup_ref); resolved.push({ kind: p.kind, id: expected.selected_id }); }
    }
    if (digest(resolvedRefs) !== digest(r.preference_evidence_refs)) reject("Invalid preference evidence");
    const sent = insightsSignals(provider.insights_policy.signal_scope, resolved);
    entitySignals.push(...sent.preference_entity_ids); tagSignals.push(...sent.preference_tag_ids);
  } else {
    for (const ref of r.preference_evidence_refs) {
      const s = snap(ref);
      if (!s || (s.kind !== "entity_lookup" && s.kind !== "tag_lookup") || s.matches.length !== 1) { reject("Invalid preference evidence"); continue; }
      const preference = r.input.preferences.find((p) => p.confirmed_anchor === s.query && !covered.has(p.id));
      const m = s.matches[0];
      if (!preference || !m || (preference.kind === "tag_concept") !== (s.kind === "tag_lookup") ||
          (s.kind === "entity_lookup" && "kind" in m && m.kind !== (preference.kind === "artist" ? "artist" : "movie"))) {
        reject("Preference identity mismatch"); continue;
      }
      covered.add(preference.id);
      (s.kind === "tag_lookup" ? tagSignals : entitySignals).push(m.id);
    }
  }
  const unresolved = r.input.preferences.filter((p) => !covered.has(p.id)).map((p) => p.id);
  if (digest(unresolved) !== digest(r.unresolved_preferences)) reject("Preference coverage was forged");
  for (const e of evidence) {
    const s = e.snapshot;
    const request = s.kind === "unavailable" ? s.request : null;
    const insight = s.kind === "rank_places" || s.kind === "discover_places" ? s :
      request && (request.operation === "rank_places" || request.operation === "discover_places") ? request : null;
    if (insight && (digest(insight.preference_entity_ids) !== digest(entitySignals) || digest(insight.preference_tag_ids) !== digest(tagSignals)))
      reject("Ranking signal context mismatch");
    const discovery = s.kind === "discover_places" ? s : request?.operation === "discover_places" ? request : null;
    if (discovery && (provider ? discovery.signal_scope !== provider.insights_policy.signal_scope || discovery.take !== provider.insights_policy.discovery_take ||
        discovery.exclusion !== provider.insights_policy.discovery_exclusion : discovery.signal_scope !== undefined || discovery.take !== undefined || discovery.exclusion !== undefined))
      reject("Discovery request contradicts the trusted Insights policy");
    if (s.kind === "rank_places") {
      const sameSet = s.ordered_entity_ids.length === s.candidate_entity_ids.length;
      if (new Set(s.candidate_entity_ids).size !== s.candidate_entity_ids.length || new Set(s.ordered_entity_ids).size !== s.ordered_entity_ids.length ||
          s.ordered_entity_ids.some((x) => !s.candidate_entity_ids.includes(x))) reject("Ranking escaped its candidate set");
      if (provider && e.snapshot.kind === "rank_places" && e.operation === "insights") {
        // Provider ordering is trusted only when it follows the same query's affinities: present, finite and non-increasing.
        const scores = s.scores ?? [];
        if (!s.shortlist_class || (s.shortlist_class === "ALL_RETURNED") !== sameSet || scores.length !== s.ordered_entity_ids.length ||
            scores.some((x, i) => x.entity_id !== s.ordered_entity_ids[i] || x.query_affinity === null || (i > 0 && x.query_affinity > scores[i - 1]!.query_affinity!)))
          reject("Provider ranking is not supported by its own scores");
      } else if (s.scores || s.shortlist_class) reject("Synthetic ranking claims provider scores");
    }
    if (s.kind === "discover_places" && (s.candidates.some((x) => s.exclude_entity_ids.includes(x.id)) ||
        (s.candidates.length > (s.take ?? 5)) || (s.scores ?? []).some((x) => !s.candidates.some((c) => c.id === x.entity_id) && !(s.client_excluded_ids ?? []).includes(x.entity_id))))
      reject("Discovery returned excluded or unreturned entity");
  }
  if (digest(r.original_audits.map((a) => a.candidate_id)) !== digest(r.input.recommendations.map((a) => a.id))) reject("Original slots were lost/reordered");
  const originals = new Set(r.original_audits.map((a) => a.candidate_id));
  const targets = repairTargets(r.original_audits).map((a) => a.candidate_id);
  if (new Set(audits.map((a) => a.candidate_id)).size !== audits.length || new Set(r.repairs.map((x) => x.replaces)).size !== r.repairs.length) reject("Duplicate candidate/repair slot");
  const discoveryEntity = (repair: Shape["repairs"][number]): { entity: Entity; ref: string } | null => {
    for (const ref of repair.discovery_evidence_refs) {
      const s = snap(ref); const entity = s?.kind === "discover_places" ? s.candidates.find((x) => x.id === repair.proposed_entity_id) : undefined;
      if (entity) return { entity, ref };
    }
    return null;
  };
  const rankSnapshots = evidence.flatMap((e) => e.snapshot.kind === "rank_places" ? [{ ref: e.evidence_id, snapshot: e.snapshot }] : []);
  for (const a of audits) {
    const repair = r.repairs.find((x) => x.revalidation.candidate_id === a.candidate_id);
    const proposed = repair ? discoveryEntity(repair) : null;
    if (a.resolution_evidence_ref && !ev.has(a.resolution_evidence_ref)) reject("Forged lookup reference");
    let entity: Entity | null = null; let expectedResolutionRef: string | null = a.resolution_evidence_ref; let basis: string | null = null;
    if (repair) {
      // A replacement's identity comes from a separate lookup that returned the same provider identity, or from the
      // user's explicit confirmation of the reviewed discovery record. Discovery alone never establishes identity.
      const lookupEv = ev.get(repair.lookup_evidence_ref); const lookup = lookupEv?.snapshot;
      if (!lookupEv || !isEntityLookup(lookup)) reject("Replacement lacks an independent lookup record");
      if (proposed && lookupQuery(lookup) !== proposed.entity.name) reject("Revalidation lookup belongs to a different candidate");
      if (proposed && indexOf(repair.lookup_evidence_ref) <= indexOf(proposed.ref)) reject("Replacement lookup precedes its discovery");
      const decision = replacementDecision(decisions.get(replacementTarget(repair.replaces)), repair.proposed_entity_id);
      const expected = proposed ? resolveReplacement(mode, lookup, proposed.entity, decision) : { resolution: "unresolved" as const, entity: null, basis: null };
      if (a.resolution !== expected.resolution || repair.identity_basis !== expected.basis) reject("Resolution contradicts lookup evidence");
      expectedResolutionRef = expected.basis === "user_confirmation" ? proposed!.ref : repair.lookup_evidence_ref;
      if (a.resolution_evidence_ref !== expectedResolutionRef) reject("Resolution evidence reference was forged");
      entity = expected.entity && expected.entity.id === a.entity_id ? expected.entity : null; basis = expected.basis;
      if (a.resolution === "resolved" && !entity) reject("Resolved identity lacks matching lookup");
    } else {
      const lookup = snap(a.resolution_evidence_ref);
      if (lookup && !(provider ? isEntityLookup(lookup) : lookup.kind === "entity_lookup")) reject("Resolution contradicts lookup evidence");
      const expected = resolveOriginal(mode, lookup, decisions.get(a.candidate_id));
      if (a.resolution !== expected.resolution) reject("Resolution contradicts lookup evidence");
      entity = expected.entity && expected.entity.id === a.entity_id ? expected.entity : null;
      if (a.resolution === "resolved" && !entity) reject("Resolved identity lacks matching lookup");
      const original = r.input.recommendations.find((x) => x.id === a.candidate_id);
      if (original && lookup && lookupQuery(lookup) !== original.name) reject("Lookup belongs to a different original");
      if (a.resolution === "ambiguous" && (lookup?.kind !== "entity_lookup" || lookup.matches.length < 2)) reject("Invalid ambiguity evidence");
    }
    for (const f of a.findings) {
      if (f.evidence_refs.some((ref) => !ev.has(ref))) reject("Forged evidence reference");
      if (f.constraint_id && !r.input.constraints.some((c) => c.id === f.constraint_id)) reject("Unknown constraint ID");
    }
    const userConfirmed = a.findings.filter((f) => f.code === "IDENTITY_USER_CONFIRMED");
    if (userConfirmed.length !== (basis === "user_confirmation" ? 1 : 0) ||
        userConfirmed.some((f) => f.state !== "pass" || digest(f.evidence_refs) !== digest([inputRef]))) reject("User-confirmation finding contradicts the identity basis");
    const expectedChecks = !entity && repair && proposed ? checkUnconfirmedConstraints(r.input, proposed.entity, proposed.ref, inputRef, mode)
      : checkConstraints(r.input, entity, expectedResolutionRef, inputRef, mode);
    if (a.hard_constraints !== hardState(expectedChecks)) reject("Hard-check summary contradicts captured facts");
    for (const check of expectedChecks) {
      const actual = a.findings.filter((f) => f.constraint_id === check.constraint_id && f.category === "hard_constraint");
      if (actual.length !== 1 || actual[0]?.state !== check.state || actual[0]?.code !== check.code ||
          digest(actual[0]?.evidence_refs) !== digest(check.evidence_refs)) reject("Constraint finding lacks exact evidence support");
    }
    // Relevance evidence must exist in the claimed query. A rank that returned the entity always takes precedence; only a
    // replacement may fall back to its position in Qloo's own discovery for the confirmed signal.
    // Evidence is keyed by the provider ID the query was about: a proposal is its own subject before it is confirmed.
    const subject = a.entity_id ?? repair?.proposed_entity_id ?? null;
    const claimed = a.cultural_relevance ? snap(a.cultural_relevance.query_ref) : undefined;
    const position = (a.cultural_relevance?.ordinal_rank ?? 0) - 1;
    const hasRank = claimed?.kind === "rank_places" && subject !== null && claimed.ordered_entity_ids[position] === subject;
    const hasDiscoveryOrder = !!repair && claimed?.kind === "discover_places" && subject !== null && claimed.candidates[position]?.id === subject &&
      a.cultural_relevance?.query_ref === proposed?.ref;
    if (a.cultural_relevance && !hasRank && !hasDiscoveryOrder) reject("Relative rank lacks matching evidence");
    const ranked = subject !== null ? rankSnapshots.find((x) => x.snapshot.ordered_entity_ids.includes(subject)) : undefined;
    if (ranked && a.cultural_relevance?.query_ref !== ranked.ref) reject("A returned ranking was ignored or replaced");
    if (subject !== null && !ranked && repair && proposed && !a.cultural_relevance && claimedDiscoveryContains(proposed.ref, subject))
      reject("Discovery order evidence was omitted");
    const expectedExplanation = hasRank && claimed?.kind === "rank_places" ? claimed.explainability : "not_requested";
    if (a.explainability !== expectedExplanation) reject("Explanation availability was forged");
    const claims = r.input.recommendations.find((x) => x.id === a.candidate_id)?.claims ?? [];
    const coverage = !(hasRank || hasDiscoveryOrder) ? "missing" : unresolved.length || claims.length ? "partial" : "covered";
    if (a.evidence_coverage !== coverage || (claims.length > 0 && !a.findings.some((f) => f.code === "CLAIM_UNVERIFIED"))) reject("Claim/evidence coverage mismatch");
    if (unresolved.length && !a.findings.some((f) => f.code === "PREFERENCE_UNRESOLVED")) reject("Missing preference limitation");
    if (a.verdict !== candidateVerdict(a)) reject("Verdict contradicts candidate checks");
  }
  function claimedDiscoveryContains(ref: string, entityId: string): boolean {
    const s = snap(ref); return s?.kind === "discover_places" && s.candidates.some((c) => c.id === entityId);
  }
  for (const repair of r.repairs) {
    if (!originals.has(repair.replaces) || !targets.includes(repair.replaces)) reject("Repair refers to a slot that needs no repair");
    const proposed = discoveryEntity(repair);
    if (!proposed) reject("Replacement lacks discovery provenance");
    if (repair.accepted && (unresolved.length > 0 || repair.revalidation.resolution !== "resolved")) reject("Replacement was not independently revalidated");
  }
  const acceptedIds = r.repairs.filter((x) => x.accepted).map((x) => x.revalidation.entity_id);
  if (new Set(acceptedIds).size !== acceptedIds.length || acceptedIds.some((id) => r.original_audits.some((a) => a.entity_id === id))) reject("Duplicate replacement entity");
  const discoveryEvidence = evidence.find((e) => e.snapshot.kind === "discover_places" || (e.snapshot.kind === "unavailable" && e.snapshot.request.operation === "discover_places"));
  const expectedOutcomes = deriveRepairOutcomes({ targets, repairs: r.repairs, decisions, stop: r.stop_reason,
    hasCountFailure: r.original_audits.some((a) => a.findings.some((f) => f.code === "MAX_ITEMS_EXCEEDED")),
    hasSignal: entitySignals.length + tagSignals.length > 0,
    discovery: !discoveryEvidence ? "not_attempted" : discoveryEvidence.snapshot.kind === "unavailable" ? "unavailable" : "returned" });
  if (digest(expectedOutcomes) !== digest(r.repair_outcomes)) reject("Repair outcomes contradict the evidence");
  if (provider) {
    const blocking = [
      ...provider.preference_resolution.flatMap((p, i) => p.status === "pending" && p.lookup_ref ? [{ target_id: p.preference_id, target_kind: "preference" as const,
        lookup_ref: p.lookup_ref, candidate_ids: preferenceCandidates(r.input.preferences[i]!.kind, snap(p.lookup_ref)).map((c) => c.id) }] : []),
      ...r.original_audits.flatMap((a) => a.resolution === "unconfirmed" && a.resolution_evidence_ref ? [{ target_id: a.candidate_id,
        target_kind: "recommendation" as const, lookup_ref: a.resolution_evidence_ref, candidate_ids: lookupMatches(snap(a.resolution_evidence_ref)).map((m) => m.id) }] : []),
    ];
    const expectedPending = [...blocking, ...pendingReplacementConfirmations(r.repairs, decisions)];
    // Only blocking decisions can coexist with an unfinished audit; replacement decisions never block completion.
    if (digest(expectedPending) !== digest(provider.pending_confirmations) || (blocking.length > 0 && r.stop_reason === "COMPLETE"))
      reject("Pending confirmations were hidden or invented");
  }
  const expectedSummary = reportSummary(r.original_audits, r.repairs, unresolved, r.stop_reason);
  for (const key of ["before_status", "final_status", "completion", "final_candidate_ids"] as const)
    if (digest(r[key]) !== digest(expectedSummary[key])) reject("Report summary hides residual failures");
}
export const AuditReportSchema = ReportShapeSchema.superRefine((r, ctx) => validateGraph(r, (message) => ctx.addIssue({ code: "custom", message })));
export const ProviderAuditReportSchema = ProviderReportShapeSchema.superRefine((r, ctx) => validateGraph(r, (message) => ctx.addIssue({ code: "custom", message })));
export function validateReport(value: unknown): AuditReport { return AuditReportSchema.parse(value); }
export function validateProviderReport(value: unknown): ProviderAuditReport { return ProviderAuditReportSchema.parse(value); }
