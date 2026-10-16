"use client";

import { useState } from "react";
import type { AuditReport, CandidateAudit } from "../src/domain/contracts";

const scenarios = [
  ["nyc-evening", "NYC evening: mixed evidence"], ["valid-only", "Valid recommendation"],
  ["wrong-city-repair", "Wrong city → validated repair"], ["unresolved-only", "Unresolved venue"],
  ["missing-evidence", "Missing taste evidence"], ["repair-fails", "Replacement also fails"],
];
function AuditCard({ audit, label }: { audit: CandidateAudit; label: string }) {
  return <article className="card">
    <div className="card-title"><h3>{label}</h3><strong className={`verdict ${audit.verdict.toLowerCase()}`}>{audit.verdict}</strong></div>
    <p className="mono">{audit.entity_id ?? "No resolved identity"}</p>
    <p>Hard constraints: {audit.hard_constraints} · Evidence: {audit.evidence_coverage}</p>
    <ul>{audit.findings.map((f, i) => <li key={i}><span className="mono">{f.code}</span><br />{f.explanation}</li>)}</ul>
  </article>;
}
export default function Inspector() {
  const [scenario, setScenario] = useState("nyc-evening");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function run() {
    setPending(true); setError(""); setReport(null);
    try {
      const response = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario }) });
      if (!response.ok) throw new Error("The offline audit could not produce a validated report.");
      setReport(await response.json() as AuditReport);
    } catch { setError("The offline audit failed. No successful result has been substituted."); }
    finally { setPending(false); }
  }
  return <main>
    <div className="notice">OFFLINE · AUTHORED SYNTHETIC FIXTURES · NO QLOO API CALLS</div>
    <header><p className="eyebrow">TasteGate AI / Phase 1A</p><h1>Inspect the evidence.<br />Keep the uncertainty.</h1>
      <p>Audit → Repair → Revalidate. A local executable core with visible decisions and provenance.</p>
      <p className="muted">Venues, IDs and rankings are synthetic. Fictional film/tag selections are example inputs, not your confirmed preferences.</p></header>
    <section className="controls" aria-label="Run an offline scenario">
      <label htmlFor="scenario">Synthetic scenario</label>
      <select id="scenario" value={scenario} disabled={pending} onChange={(e) => setScenario(e.target.value)}>{scenarios.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      <button onClick={run} disabled={pending}>{pending ? "Running…" : "Run synthetic audit"}</button>
    </section>
    {error && <p role="alert">{error}</p>}
    <div role="status" aria-live="polite">{pending ? "Computing the bounded audit…" : report ? `Final status: ${report.final_status}. Completion: ${report.completion}.` : "Choose a scenario to run the offline workflow."}</div>
    {report && <>
      <section className="summary" aria-label="Run summary">
        <div><span>Before</span><strong>{report.before_status}</strong></div><div><span>After</span><strong>{report.final_status}</strong></div>
        <div><span>Fixture calls</span><strong>{report.usage.fixture_calls} / 14</strong></div><div><span>Repair rounds</span><strong>{report.usage.repair_rounds} / 1</strong></div>
        <div><span>Qloo calls</span><strong>{report.usage.qloo_dispatches}</strong></div>
      </section>
      <p className="mono">Run {report.run_id} · Mode: {report.source_mode} · Stop: {report.stop_reason}</p>
      <div className="columns"><section><h2>Original audit</h2>{report.original_audits.map((a) => <AuditCard key={a.candidate_id} audit={a} label={report.input.recommendations.find((r) => r.id === a.candidate_id)?.name ?? a.candidate_id} />)}</section>
        <section><h2>Replacement revalidation</h2>{report.repairs.length === 0 ? <p>No replacement was proposed.</p> : report.repairs.map((r) => <div key={r.replacement_candidate_id}><p>Replaces {r.replaces} · {r.accepted ? "Accepted after revalidation" : "Rejected after revalidation"}</p><AuditCard audit={r.revalidation} label={r.proposed_entity_id} /></div>)}</section></div>
      <section><h2>Limits of this result</h2><ul>{report.limitations.map((l) => <li key={l}>{l}</li>)}</ul></section>
      <details><summary>Inspect generated evidence JSON ({report.evidence.length} records)</summary><pre data-testid="report-json">{JSON.stringify(report, null, 2)}</pre></details>
    </>}
    <footer>Phase 1A local inspector. Live integration and optional Runtime archival are deferred.</footer>
  </main>;
}
