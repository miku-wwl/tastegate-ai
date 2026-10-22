"use client";
import type { AnyAuditReport } from "../src/domain/contracts";
import { culturalComparison } from "./cultural-comparison";
import { EvidenceLinks } from "./evidence-links";
import { SourceBadge } from "./report-view";
export function CulturalComparisonView({ report }: { report: AnyAuditReport }) {
  const c = culturalComparison(report), name = (id: string) => c.rows.find((r) => r.candidate_id === id)?.name ?? id;
  const p07 = report.evidence.find((e) => e.source_mode !== "fixture" && e.capture?.probe === "P07" && e.snapshot.kind === "discover_places");
  const pool = p07?.snapshot.kind === "discover_places" ? p07.snapshot.candidates : [];
  return <section className="panel cultural-comparison" aria-labelledby="cultural-comparison-title" data-testid="cultural-comparison">
    <div className="section-head"><h3 id="cultural-comparison-title">What cultural evidence changes</h3><SourceBadge mode={report.source_mode} /></div>
    <p>First establish identity and hard constraints. Then compare cultural priority <strong>within the same query</strong>. A higher rank never rescues an invalid candidate.</p>
    {report.source_mode === "fixture" && <p className="badge tone-synthetic">SYNTHETIC · authored cultural ordering; not a real Qloo result</p>}
    {p07 && <details className="real-discovery"><summary>Real Qloo discovery: {pool.length} candidates, separate verification</summary>
      <p className="small">One recorded artist-to-place query supplies this cultural order. All geography below is provider-reported.
        The locality name was ambiguous; the requested boundary is not verified. Only attempted replacements have a revalidation outcome.</p>
      <div className="table-wrap"><table><caption className="sr-only">The P07 query pool, not a list of verified replacements</caption>
        <thead><tr><th>Candidate</th><th>Reported geography</th><th>Position in this query</th><th>Verification</th></tr></thead>
        <tbody>{pool.map((e,i) => {const repair=report.repairs.find((r)=>r.proposed_entity_id===e.id);return <tr key={e.id}>
          <th scope="row">{e.name}</th><td>{e.city ?? "Unknown city"}, {e.country ?? "Unknown country"}</td><td>{i+1}</td>
          <td>{repair ? repair.accepted ? "Verified replacement — see mandatory checks" : "Attempted; not verified" : "Not independently revalidated"}</td></tr>;})}</tbody>
      </table></div><EvidenceLinks report={report} refs={[p07.evidence_id]} /></details>}
    <details><summary>Candidate evidence and eligibility ({c.rows.length} assessed)</summary>
    <div className="table-wrap"><table className="results-table">
      <caption>Candidate evidence and eligibility for this run</caption>
      <thead><tr><th scope="col">Candidate</th><th scope="col">Identity / geography / constraints</th><th scope="col">Cultural evidence</th><th scope="col">Decision and source</th></tr></thead>
      <tbody>{c.rows.map((r) => <tr key={r.candidate_id}><th scope="row">{r.name}<span className="muted small"> · {r.role}</span></th>
        <td>Identity: {r.identity}<br />Geography: {r.geography}<br />Hard constraints: {r.hard_constraints}
          {r.independent_identity !== null && <><br />Independent identity: {r.independent_identity ? "CORROBORATED" : "NOT ESTABLISHED"}</>}</td>
        <td>{r.ordinal_rank === null ? "No candidate-specific cultural evidence" : <>Query position {r.ordinal_rank}
          {r.query_affinity !== null && <><br />Query-relative affinity: {String(r.query_affinity)}</>}</>}</td>
        <td><strong>{r.eligible ? "Eligible for comparison" : "Excluded from comparison"}</strong>
          <p className="small">{r.role === "REPLACEMENT" ? "Revalidation" : "Audit"}: {r.result.replaceAll("_", " ").toLowerCase()}. {r.reason}</p>
          <EvidenceLinks report={report} refs={r.evidence_refs} /></td></tr>)}</tbody>
    </table></div></details>
    <div className="comparison">
      <div><h4>Rules and identity only</h4><p className="small">Same valid pool; input order; no cultural fields.</p>
        <ol>{c.control_order.map((id) => <li key={id}>{name(id)}</li>)}</ol>{!c.control_order.length && <p>No eligible candidate.</p>}</div>
      <div><h4>With cultural evidence</h4>{c.status === "COMPARABLE_WITHIN_QUERY" ? <>
        <p className="small">{c.changed_order ? "Priority changes within one reviewed query." : "The observed order agrees with input order."} The retained set is unchanged.</p>
        <ol>{c.cultural_order.map((id) => <li key={id}>{name(id)}</li>)}</ol></> :
        <p>{c.status === "INSUFFICIENT_VALID_CANDIDATES" ? "Fewer than two hard-constraint-valid candidates: no eligible pair to prioritize." :
          "The eligible candidates do not share a complete reviewed ranking query. Cross-query priorities are not inferred."}</p>}</div>
    </div>
    <p className="small">Coverage: {c.EVIDENCE_COVERAGE_GAIN} of {c.rows.length} assessed candidates carry cultural evidence; the rules-only view has none.
      {" "}An ordering difference is separate from a valid-repair gain. Neither this report nor Qloo affinity supplies independent human preference labels.
      {" "}<strong>Independent quality gain: NOT ESTABLISHED.</strong> Affinity is never a liking probability.</p>
  </section>;
}
