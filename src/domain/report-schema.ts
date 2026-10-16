import { z } from "zod";
import { ReportShapeSchema, digest, type AuditReport, type Entity } from "./contracts";
import { candidateVerdict, checkConstraints, hardState, reportSummary } from "../audit/rules";

// Structural validation alone cannot establish evidence support: enforce the complete graph.
export const AuditReportSchema = ReportShapeSchema.superRefine((r, ctx) => {
  const reject = (message: string) => ctx.addIssue({ code: "custom", message });
  const ev = new Map(r.evidence.map((e) => [e.evidence_id, e]));
  if (ev.size !== r.evidence.length) reject("Duplicate evidence IDs");
  const fixtureId = r.evidence[0]?.fixture_id;
  for (const [i, e] of r.evidence.entries()) {
    if (e.run_id !== r.run_id || e.fixture_id !== fixtureId || e.pointer !== `/evidence/${i}/snapshot`)
      reject("Cross-run, wrong-fixture or dangling snapshot provenance");
  }
  const inputEvidence = r.evidence.filter((e) => e.snapshot.kind === "input");
  if (inputEvidence.length !== 1 || inputEvidence[0]?.snapshot.kind !== "input" ||
      digest(inputEvidence[0].snapshot.input) !== digest(r.input)) reject("Input witness mismatch");
  const inputRef = inputEvidence[0]?.evidence_id ?? "missing";
  const calls = r.trace.flatMap((t) => t.call_id ? [t.call_id] : []);
  if (new Set(calls).size !== calls.length || calls.length !== r.usage.fixture_calls ||
      r.evidence.some((e) => e.call_id && !calls.includes(e.call_id)) ||
      new Set(r.evidence.filter((e) => e.call_id).map((e) => e.call_id)).size !== r.evidence.length - 1)
    reject("Call trace mismatch");
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
  const coveredPreferences = new Set<string>(); const entitySignals: string[] = []; const tagSignals: string[] = [];
  for (const ref of r.preference_evidence_refs) {
    const s = ev.get(ref)?.snapshot;
    if (!s || (s.kind !== "entity_lookup" && s.kind !== "tag_lookup") || s.matches.length !== 1) { reject("Invalid preference evidence"); continue; }
    const preference = r.input.preferences.find((p) => p.confirmed_anchor === s.query && !coveredPreferences.has(p.id));
    const m = s.matches[0];
    if (!preference || !m || (preference.kind === "tag_concept") !== (s.kind === "tag_lookup") ||
        (s.kind === "entity_lookup" && "kind" in m && m.kind !== (preference.kind === "artist" ? "artist" : "movie"))) {
      reject("Preference identity mismatch"); continue;
    }
    coveredPreferences.add(preference.id);
    (s.kind === "tag_lookup" ? tagSignals : entitySignals).push(m.id);
  }
  const unresolved = r.input.preferences.filter((p) => !coveredPreferences.has(p.id)).map((p) => p.id);
  if (digest(unresolved) !== digest(r.unresolved_preferences)) reject("Preference coverage was forged");
  for (const e of r.evidence) {
    const s = e.snapshot;
    if (s.kind === "rank_places" || s.kind === "discover_places") {
      if (digest(s.preference_entity_ids) !== digest(entitySignals) || digest(s.preference_tag_ids) !== digest(tagSignals)) reject("Ranking signal context mismatch");
      if (s.kind === "rank_places" && (new Set(s.candidate_entity_ids).size !== s.candidate_entity_ids.length ||
          new Set(s.ordered_entity_ids).size !== s.ordered_entity_ids.length || s.ordered_entity_ids.some((x) => !s.candidate_entity_ids.includes(x)))) reject("Ranking escaped its candidate set");
      if (s.kind === "discover_places" && s.candidates.some((x) => s.exclude_entity_ids.includes(x.id))) reject("Discovery returned excluded entity");
    }
  }
  if (digest(r.original_audits.map((a) => a.candidate_id)) !== digest(r.input.recommendations.map((a) => a.id))) reject("Original slots were lost/reordered");
  const originals = new Set(r.original_audits.map((a) => a.candidate_id));
  const all = [...r.original_audits, ...r.repairs.map((x) => x.revalidation)];
  if (new Set(all.map((a) => a.candidate_id)).size !== all.length || new Set(r.repairs.map((x) => x.replaces)).size !== r.repairs.length) reject("Duplicate candidate/repair slot");
  for (const a of all) {
    if (a.resolution_evidence_ref && !ev.has(a.resolution_evidence_ref)) reject("Forged lookup reference");
    const lookup = a.resolution_evidence_ref ? ev.get(a.resolution_evidence_ref)?.snapshot : null;
    const expectedResolution = lookup?.kind === "entity_lookup" && lookup.matches.length === 1 ? "resolved" :
      lookup?.kind === "entity_lookup" && lookup.matches.length > 1 ? "ambiguous" : "unresolved";
    if (a.resolution !== expectedResolution || (lookup && lookup.kind !== "entity_lookup")) reject("Resolution contradicts lookup evidence");
    let entity: Entity | null = null;
    if (lookup?.kind === "entity_lookup" && lookup.matches.length === 1 && lookup.matches[0]?.id === a.entity_id) entity = lookup.matches[0];
    if (a.resolution === "resolved" && !entity) reject("Resolved identity lacks matching lookup");
    const original = r.input.recommendations.find((x) => x.id === a.candidate_id);
    if (original && lookup?.kind === "entity_lookup" && lookup.query !== original.name) reject("Lookup belongs to a different original");
    if (a.resolution === "ambiguous" && (lookup?.kind !== "entity_lookup" || lookup.matches.length < 2)) reject("Invalid ambiguity evidence");
    for (const f of a.findings) {
      if (f.evidence_refs.some((ref) => !ev.has(ref))) reject("Forged evidence reference");
      if (f.constraint_id && !r.input.constraints.some((c) => c.id === f.constraint_id)) reject("Unknown constraint ID");
    }
    const expectedChecks = checkConstraints(r.input, entity, a.resolution_evidence_ref, inputRef);
    if (a.hard_constraints !== hardState(expectedChecks)) reject("Hard-check summary contradicts captured facts");
    for (const expected of expectedChecks) {
      const actual = a.findings.filter((f) => f.constraint_id === expected.constraint_id && f.category === "hard_constraint");
      if (actual.length !== 1 || actual[0]?.state !== expected.state || actual[0]?.code !== expected.code ||
          digest(actual[0]?.evidence_refs) !== digest(expected.evidence_refs)) reject("Constraint finding lacks exact evidence support");
    }
    const rank = a.cultural_relevance ? ev.get(a.cultural_relevance.query_ref)?.snapshot : null;
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
    const discoveries = repair.discovery_evidence_refs.map((ref) => ev.get(ref));
    const source = discoveries.find((e) => e?.snapshot.kind === "discover_places" && e.snapshot.candidates.some((x) => x.id === repair.proposed_entity_id));
    if (!source) reject("Replacement lacks discovery provenance");
    if (repair.accepted) {
      const lookupIndex = r.evidence.findIndex((e) => e.evidence_id === repair.revalidation.resolution_evidence_ref);
      const rankIndex = r.evidence.findIndex((e) => e.evidence_id === repair.revalidation.cultural_relevance?.query_ref);
      if (!source || lookupIndex <= r.evidence.indexOf(source) || rankIndex <= lookupIndex || unresolved.length > 0) reject("Replacement was not independently revalidated");
    }
  }
  const acceptedIds = r.repairs.filter((x) => x.accepted).map((x) => x.revalidation.entity_id);
  if (new Set(acceptedIds).size !== acceptedIds.length || acceptedIds.some((id) => r.original_audits.some((a) => a.entity_id === id))) reject("Duplicate replacement entity");
  const expectedSummary = reportSummary(r.original_audits, r.repairs, unresolved, r.stop_reason);
  for (const key of ["before_status", "final_status", "completion", "final_candidate_ids"] as const)
    if (digest(r[key]) !== digest(expectedSummary[key])) reject("Report summary hides residual failures");
});
export function validateReport(value: unknown): AuditReport { return AuditReportSchema.parse(value); }
