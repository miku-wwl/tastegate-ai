"use client";

import { useEffect, useState } from "react";
import type { AnyAuditReport, AuditInput, Confirmation } from "../src/domain/contracts";
import { Comparison, ConfirmPanel, Export, Ledger, Limits, Pipeline, PlanView, Signals, SourceBadge, Summary } from "./report-view";
import { isProvider } from "./view-model";

type Mode = "recorded_live" | "fixture";
type Catalog = {
  modes: { synthetic: string; recorded_live: "AVAILABLE" | "UNAVAILABLE"; live: string };
  scenarios: Array<{ id: string; label: string; mode: Mode; available: boolean; input: AuditInput }>;
  recorded_history: Array<{ probe: string; attempt_id: string; endpoint: string; recorded_at: string; http_status: number; outcome: string; response_bytes: number }>;
  live_gate: { status: string; next_request: string; detail: string };
};
const statusText = (r: AnyAuditReport) => isProvider(r) && r.pending_confirmations.length ?
  `Waiting for your confirmation: ${r.pending_confirmations.length} identities.` : `Final status: ${r.final_status}. Completion: ${r.completion}.`;

export default function TasteGateApp() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [report, setReport] = useState<AnyAuditReport | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    fetch("/api/audit", { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject(new Error())).then((c: Catalog) => {
      if (!mounted) return;
      setCatalog(c); setScenarioId(c.scenarios.find((s) => s.mode === "recorded_live" && s.available)?.id ?? "nyc-evening");
    }).catch(() => { if (mounted) setCatalogFailed(true); });
    return () => { mounted = false; };
  }, []);
  const scenario = catalog?.scenarios.find((s) => s.id === scenarioId);
  function choose(id: string) { setScenarioId(id); setReport(null); setError(""); }
  async function run(confirmations?: Confirmation[]) {
    if (!scenario) return;
    setBusy(true); setError(""); if (!confirmations) setReport(null);
    try {
      const response = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmations ? { scenario: scenario.id, confirmations } : { scenario: scenario.id }) });
      if (response.status === 503) throw new Error("The recorded Qloo evidence is not available on this server. Nothing was substituted.");
      if (!response.ok) throw new Error("The audit could not produce a validated report. No successful result has been substituted.");
      setReport(await response.json() as AnyAuditReport);
    } catch (e) { setReport(null); setError(e instanceof Error && e.message ? e.message : "The audit failed."); }
    finally { setBusy(false); }
  }
  const recorded = catalog?.scenarios.filter((s) => s.mode === "recorded_live") ?? [];
  const synthetic = catalog?.scenarios.filter((s) => s.mode === "fixture") ?? [];
  const waiting = report && isProvider(report) && report.pending_confirmations.length > 0 ? report : null;
  return <>
    <header className="topbar">
      <div className="brand"><span className="logo" aria-hidden="true">TG</span><span>TasteGate <span className="brand-ai">AI</span></span></div>
      <ul className="mode-chips" aria-label="Data modes">
        <li className={`badge tone-${catalog?.modes.recorded_live === "AVAILABLE" ? "recorded" : "unknown"}`}>Recorded Qloo: {catalog ? catalog.modes.recorded_live.toLowerCase() : "…"}</li>
        <li className="badge tone-synthetic">Synthetic: available</li>
        <li className="badge tone-locked">Live Qloo: locked</li>
      </ul>
    </header>
    <main>
      <section className="hero">
        <p className="eyebrow">The cultural quality gate for AI agents</p>
        <h1>Don’t just generate recommendations.<br /><span className="hero-accent">Audit them, repair them, verify the evidence.</span></h1>
        <p className="lede">TasteGate checks an AI agent’s plan against Qloo taste data and your hard constraints, repairs only what fails,
          and re-checks every replacement. When it cannot prove something, it says so.</p>
      </section>

      <section aria-labelledby="choose-title">
        <div className="section-head"><h2 id="choose-title"><span className="step">1</span>Choose a plan to audit</h2></div>
        {catalogFailed && <p role="alert" className="alert">The scenario catalog could not be loaded. No result has been substituted.</p>}
        {!catalog && !catalogFailed && <p className="muted">Loading scenarios…</p>}
        {catalog && <fieldset className="scenario-picker" disabled={busy}>
          <legend className="sr-only">Plan to audit</legend>
          <p className="group-label">Real provider data</p>
          <div className="scenario-grid">{recorded.map((s) => <ScenarioCard key={s.id} s={s} checked={s.id === scenarioId} onChoose={choose}
            note={s.available ? `Replays ${catalog.recorded_history.filter((h) => h.outcome === "REPLAYABLE").length} owner-approved Qloo responses. No new requests.` :
              "Unavailable on this server: the owner’s private recordings are not present."} />)}</div>
          <p className="group-label">Synthetic test scenarios</p>
          <div className="scenario-grid compact">{synthetic.map((s) => <ScenarioCard key={s.id} s={s} checked={s.id === scenarioId} onChoose={choose} />)}</div>
        </fieldset>}
      </section>

      {scenario && <section aria-labelledby="plan-title">
        <div className="section-head"><h2 id="plan-title"><span className="step">2</span>The upstream agent’s plan</h2><SourceBadge mode={scenario.mode} /></div>
        <PlanView input={scenario.input} mode={scenario.mode} />
        <div className="actions"><button type="button" className="primary" onClick={() => run()} disabled={busy || !scenario.available}>
          {busy ? "Running the gate…" : "Run the gate"}</button>
          <span className="muted small">Validate → Resolve → Retrieve → Audit → Repair → Revalidate → Report · at most 14 bounded calls, one repair round.</span></div>
      </section>}

      <div role="status" aria-live="polite" className="status-line">{busy ? "Running the bounded audit…" : report ? statusText(report) : error ? "" : "Choose a plan and run the gate."}</div>
      {error && <p role="alert" className="alert">{error}</p>}

      {report && <section aria-labelledby="result-title" className="result">
        <div className="section-head"><h2 id="result-title"><span className="step">3</span>{waiting ? "Resolve identities" : "Audit result"}</h2></div>
        <Pipeline report={report} />
        {waiting ? <ConfirmPanel report={waiting} busy={busy} onSubmit={(c) => run(c)} /> : <>
          <Summary report={report} />
          {isProvider(report) && <Signals report={report} />}
          <Comparison report={report} />
          <Limits report={report} />
          <Ledger report={report} />
          <Export report={report} />
        </>}
      </section>}

      <section className="panel live-gate" aria-labelledby="live-title">
        <h3 id="live-title"><span aria-hidden="true">🔒</span> Live Qloo mode is locked</h3>
        <p>{catalog?.live_gate.detail ?? "Live Qloo requests are locked pending explicit owner approval."} Recorded mode shows exactly what the
          approved requests returned; anything else is marked unavailable rather than guessed.</p>
        {catalog && catalog.recorded_history.length > 0 && <details><summary>Recorded request history ({catalog.recorded_history.length} owner-approved requests)</summary>
          <table><thead><tr><th>Probe</th><th>Endpoint</th><th>Recorded (UTC)</th><th>Outcome</th></tr></thead><tbody>
            {catalog.recorded_history.map((h) => <tr key={h.attempt_id}><td>{h.probe}</td><td className="mono">GET {h.endpoint}</td>
              <td>{h.recorded_at.slice(0, 16).replace("T", " ")}</td><td>{h.outcome === "REPLAYABLE" ? `HTTP 200 · ${h.response_bytes.toLocaleString("en-US")} bytes · replayable` :
                "HTTP 200 · exceeded the 64 KiB capture budget · nothing saved (UNKNOWN)"}</td></tr>)}</tbody></table></details>}
      </section>
    </main>
    <footer className="footer">TasteGate AI · Phase 2A local build · Synthetic data is authored; recorded data is replayed from private storage and never published.
      No booking, payment or other external action is ever taken.</footer>
  </>;
}

function ScenarioCard({ s, checked, onChoose, note }: { s: Catalog["scenarios"][number]; checked: boolean; onChoose: (id: string) => void; note?: string }) {
  return <label className={`scenario${checked ? " selected" : ""}${s.available ? "" : " unavailable"}`}>
    <input type="radio" name="scenario" value={s.id} checked={checked} disabled={!s.available} onChange={() => onChoose(s.id)} />
    <span className="scenario-body"><span className="scenario-title">{s.label}</span>
      <span className="scenario-meta"><SourceBadge mode={s.mode} /> <span className="muted small">{s.input.recommendations.length} recommendation{s.input.recommendations.length > 1 ? "s" : ""}</span></span>
      {note && <span className="muted small">{note}</span>}</span>
  </label>;
}
