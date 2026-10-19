import {
  ProviderReportShapeSchema, ReportShapeSchema, digest, isQlooRef, isSyntheticId, snapshotRefs,
  type AuditReport, type Entity, type ProviderAuditReport, type Snapshot,
} from "./contracts";
import {
  candidateVerdict, checkConstraints, checkUnconfirmedConstraints, hardState, insightsSignals, lookupMatches, preferenceCandidates,
  reportSummary, resolveOriginal, resolvePreference, resolveReplacement,
} from "../audit/rules";

type Shape = AuditReport | ProviderAuditReport;
const lookupQuery = (s: Snapshot | undefined) => s?.kind === "entity_lookup" || s?.kind === "tag_lookup" ? s.query :
  s?.kind === "unavailable" && (s.request.operation === "entity_lookup" || s.request.operation === "tag_lookup") ? s.request.query : undefined;
const isEntityLookup = (s: Snapshot | undefined) => s?.kind === "entity_lookup" || (s?.kind === "unavailable" && s.request.operation === "entity_lookup");

// Structural validation alone cannot establish evidence support: enforce the complete graph.
function validateGraph(r: Shape, reject: (message: string) => void): void {
  const mode = r.source_mode; const provider = r.source_mode === "recorded_live" ? r : null;
  const evidence: Shape["evidence"][number][] = r.evidence;
  const ev = new Map(evidence.map((e) => [e.evidence_id, e]));
  const snap = (ref: string | null | undefined) => ref ? ev.get(ref)?.snapshot : undefined;
  if (ev.size !== evidence.length) reject("Duplicate evidence IDs");
  const datasetOf = (e: Shape["evidence"][number]) => e.source_mode === "fixture" ? e.fixture_id : e.dataset_id;
  const datasetId = evidence[0] ? datasetOf(evidence[0]) : undefined;
  for (const [i, e] of evidence.entries()) {
    if (e.run_id !== r.run_id || datasetOf(e) !== datasetId || e.pointer !== `/evidence/${i}/snapshot`)
      reject("Cross-run, wrong-fixture or dangling snapshot provenance");
  }
  const inputEvidence = evidence.filter((e) => e.snapshot.kind === "input");
  const inputSnapshot = inputEvidence[0]?.snapshot;
  if (inputEvidence.length !== 1 || inputSnapshot?.kind !== "input" || digest(inputSnapshot.input) !== digest(r.input) ||
      (provider && digest(inputSnapshot.confirmations ?? null) !== digest(provider.confirmations))) reject("Input witness mismatch");
  const inputRef = inputEvidence[0]?.evidence_id ?? "missing";
  // Identifier namespaces cannot mix: fixtures are synthetic, recordings are pseudonymous provider references.
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
  if (provider && (provider.usage.recorded_replays !== provider.evidence.filter((e) => e.capture).length ||
      provider.usage.unavailable_operations !== provider.evidence.filter((e) => e.snapshot.kind === "unavailable").length))
    reject("Recording usage mismatch");
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
    const targets = new Set([...r.input.preferences.map((p) => p.id), ...r.input.recommendations.map((x) => x.id)]);
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
    if (s.kind === "rank_places" && (new Set(s.candidate_entity_ids).size !== s.candidate_entity_ids.length ||
        new Set(s.ordered_entity_ids).size !== s.ordered_entity_ids.length || s.ordered_entity_ids.some((x) => !s.candidate_entity_ids.includes(x)))) reject("Ranking escaped its candidate set");
    if (s.kind === "discover_places" && (s.candidates.some((x) => s.exclude_entity_ids.includes(x.id)) ||
        (s.candidates.length > (s.take ?? 5)) || (s.scores ?? []).some((x) => !s.candidates.some((c) => c.id === x.entity_id) && !(s.client_excluded_ids ?? []).includes(x.entity_id))))
      reject("Discovery returned excluded or unreturned entity");
  }
  if (digest(r.original_audits.map((a) => a.candidate_id)) !== digest(r.input.recommendations.map((a) => a.id))) reject("Original slots were lost/reordered");
  const originals = new Set(r.original_audits.map((a) => a.candidate_id));
  if (new Set(audits.map((a) => a.candidate_id)).size !== audits.length || new Set(r.repairs.map((x) => x.replaces)).size !== r.repairs.length) reject("Duplicate candidate/repair slot");
  const discoveryEntity = (repair: Shape["repairs"][number]): { entity: Entity; ref: string } | null => {
    for (const ref of repair.discovery_evidence_refs) {
      const s = snap(ref); const entity = s?.kind === "discover_places" ? s.candidates.find((x) => x.id === repair.proposed_entity_id) : undefined;
      if (entity) return { entity, ref };
    }
    return null;
  };
  for (const a of audits) {
    const repair = r.repairs.find((x) => x.revalidation.candidate_id === a.candidate_id);
    if (a.resolution_evidence_ref && !ev.has(a.resolution_evidence_ref)) reject("Forged lookup reference");
    const lookup = snap(a.resolution_evidence_ref);
    if (lookup && !(provider ? isEntityLookup(lookup) : lookup.kind === "entity_lookup")) reject("Resolution contradicts lookup evidence");
    const expected = repair ? resolveReplacement(mode, lookup, repair.proposed_entity_id) : resolveOriginal(mode, lookup, decisions.get(a.candidate_id));
    if (a.resolution !== expected.resolution) reject("Resolution contradicts lookup evidence");
    const entity = expected.entity && expected.entity.id === a.entity_id ? expected.entity : null;
    if (a.resolution === "resolved" && !entity) reject("Resolved identity lacks matching lookup");
    const original = r.input.recommendations.find((x) => x.id === a.candidate_id);
    if (original && lookup && lookupQuery(lookup) !== original.name) reject("Lookup belongs to a different original");
    const proposed = repair ? discoveryEntity(repair) : null;
    if (repair && lookup && proposed && lookupQuery(lookup) !== proposed.entity.name) reject("Revalidation lookup belongs to a different candidate");
    if (a.resolution === "ambiguous" && (lookup?.kind !== "entity_lookup" || lookup.matches.length < 2)) reject("Invalid ambiguity evidence");
    for (const f of a.findings) {
      if (f.evidence_refs.some((ref) => !ev.has(ref))) reject("Forged evidence reference");
      if (f.constraint_id && !r.input.constraints.some((c) => c.id === f.constraint_id)) reject("Unknown constraint ID");
    }
    const expectedChecks = !entity && repair && proposed ? checkUnconfirmedConstraints(r.input, proposed.entity, proposed.ref, inputRef, mode)
      : checkConstraints(r.input, entity, a.resolution_evidence_ref, inputRef, mode);
    if (a.hard_constraints !== hardState(expectedChecks)) reject("Hard-check summary contradicts captured facts");
    for (const check of expectedChecks) {
      const actual = a.findings.filter((f) => f.constraint_id === check.constraint_id && f.category === "hard_constraint");
      if (actual.length !== 1 || actual[0]?.state !== check.state || actual[0]?.code !== check.code ||
          digest(actual[0]?.evidence_refs) !== digest(check.evidence_refs)) reject("Constraint finding lacks exact evidence support");
    }
    const rank = a.cultural_relevance ? snap(a.cultural_relevance.query_ref) : undefined;
    const hasRank = rank?.kind === "rank_places" && a.entity_id !== null &&
      rank.ordered_entity_ids[(a.cultural_relevance?.ordinal_rank ?? 0) - 1] === a.entity_id;
    if (a.cultural_relevance && !hasRank) reject("Relative rank lacks matching evidence");
    const expectedExplanation = hasRank && rank?.kind === "rank_places" ? rank.explainability : "not_requested";
    if (a.explainability !== expectedExplanation) reject("Explanation availability was forged");
    const claims = original?.claims ?? [];
    const coverage = !hasRank ? "missing" : unresolved.length || claims.length ? "partial" : "covered";
    if (a.evidence_coverage !== coverage || (claims.length > 0 && !a.findings.some((f) => f.code === "CLAIM_UNVERIFIED"))) reject("Claim/evidence coverage mismatch");
    if (unresolved.length && !a.findings.some((f) => f.code === "PREFERENCE_UNRESOLVED")) reject("Missing preference limitation");
    if (a.verdict !== candidateVerdict(a)) reject("Verdict contradicts candidate checks");
  }
  for (const repair of r.repairs) {
    if (!originals.has(repair.replaces)) reject("Repair refers to unknown slot");
    const source = repair.discovery_evidence_refs.map((ref) => ev.get(ref)).find((e) => e?.snapshot.kind === "discover_places" &&
      e.snapshot.candidates.some((x) => x.id === repair.proposed_entity_id));
    if (!source) reject("Replacement lacks discovery provenance");
    if (repair.accepted) {
      const lookupIndex = evidence.findIndex((e) => e.evidence_id === repair.revalidation.resolution_evidence_ref);
      const rankIndex = evidence.findIndex((e) => e.evidence_id === repair.revalidation.cultural_relevance?.query_ref);
      if (!source || lookupIndex <= evidence.indexOf(source) || rankIndex <= lookupIndex || unresolved.length > 0) reject("Replacement was not independently revalidated");
    }
  }
  const acceptedIds = r.repairs.filter((x) => x.accepted).map((x) => x.revalidation.entity_id);
  if (new Set(acceptedIds).size !== acceptedIds.length || acceptedIds.some((id) => r.original_audits.some((a) => a.entity_id === id))) reject("Duplicate replacement entity");
  if (provider) {
    const expectedPending = [
      ...provider.preference_resolution.flatMap((p, i) => p.status === "pending" && p.lookup_ref ? [{ target_id: p.preference_id, target_kind: "preference",
        lookup_ref: p.lookup_ref, candidate_ids: preferenceCandidates(r.input.preferences[i]!.kind, snap(p.lookup_ref)).map((c) => c.id) }] : []),
      ...r.original_audits.flatMap((a) => a.resolution === "unconfirmed" && a.resolution_evidence_ref ? [{ target_id: a.candidate_id,
        target_kind: "recommendation", lookup_ref: a.resolution_evidence_ref, candidate_ids: lookupMatches(snap(a.resolution_evidence_ref)).map((m) => m.id) }] : []),
    ];
    if (digest(expectedPending) !== digest(provider.pending_confirmations) || (expectedPending.length > 0 && r.stop_reason === "COMPLETE"))
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
