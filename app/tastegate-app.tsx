"use client";

import { useEffect, useRef, useState } from "react";
import type { Catalog } from "../src/domain/catalog";
import type { AnyAuditReport, AuditInput, Confirmation } from "../src/domain/contracts";
import { LIVE_ACK } from "../src/domain/protocol";
import { clientIssues, emptyForm, formToInput, type FieldIssue, type FormState } from "./custom-form";
import { describeProblem, type RunProblem } from "./run-errors";
import { GuideCard, HowItWorks } from "./screens/guide";
import { InputScreen, type Plan, type Source } from "./screens/input-screen";
import { AuditScreen, CompareScreen, IdentityScreen, RepairScreen } from "./screens/result-screens";
import { SCREENS, isProvider, reachableScreens, screenAfterRun, statusText, type Screen } from "./view-model";

// What produced the current report, so a follow-up round (identity or replacement decisions) repeats exactly the same
// request plus the user's decisions. The mode is part of it: a round never silently changes evidence source.
type RunBody = { scenario: string; source?: Source; live_ack?: typeof LIVE_ACK } | { input: AuditInput; source: Source; live_ack?: typeof LIVE_ACK };
const isCatalog = (v: unknown): v is Catalog => !!v && typeof v === "object" && Array.isArray((v as Catalog).scenarios) && !!(v as Catalog).modes && !!(v as Catalog).live_gate && !!(v as Catalog).custom_input;

export default function TasteGateApp() {
  const [catalog, setCatalog] = useState<Catalog | null>(null); const [catalogFailed, setCatalogFailed] = useState(false);
  const [screen, setScreen] = useState<Screen>(1);
  const [report, setReport] = useState<AnyAuditReport | null>(null); const [runBody, setRunBody] = useState<RunBody | null>(null);
  const [plan, setPlan] = useState<Plan>({ kind: "scenario", id: "nyc-evening" });
  const [source, setSource] = useState<Source>("recorded"); const [liveAck, setLiveAck] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formIssues, setFormIssues] = useState<FieldIssue[]>([]); const [problem, setProblem] = useState<RunProblem | null>(null);
  const [busy, setBusy] = useState(false); const [guided, setGuided] = useState(false);
  const heading = useRef<HTMLHeadingElement | null>(null); const firstScreen = useRef(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/audit", { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject(new Error())).then((c: unknown) => {
      if (!mounted) return;
      if (!isCatalog(c)) throw new Error();
      setCatalog(c); setPlan({ kind: "scenario", id: c.scenarios.find((s) => s.mode === "recorded_live" && s.available)?.id ?? "nyc-evening" });
    }).catch(() => { if (mounted) setCatalogFailed(true); });
    return () => { mounted = false; };
  }, []);
  // Move focus to the new screen's heading (not on first load), so keyboard and screen-reader users start at the top.
  useEffect(() => { if (firstScreen.current) { firstScreen.current = false; return; } heading.current?.focus(); }, [screen]);

  const reachable = reachableScreens(report);
  const go = (next: Screen) => { setProblem(null); setScreen(next); };

  function choosePlan(next: Plan) { setPlan(next); setProblem(null); setFormIssues([]); setLiveAck(false); if (next.kind === "scenario" && catalog?.scenarios.find((s) => s.id === next.id)?.mode === "fixture") setSource("recorded"); }

  async function post(body: RunBody, confirmations: Confirmation[] | undefined, after: (next: AnyAuditReport) => Screen) {
    setBusy(true); setProblem(null);
    try {
      const response = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(confirmations ? { ...body, confirmations } : body) });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as unknown; const next = describeProblem(response.status, detail); setProblem(next);
        if (next.issues.length) setFormIssues(next.issues); return;
      }
      const next = await response.json() as AnyAuditReport; setReport(next); setRunBody(body); setFormIssues([]); setScreen(after(next));
    } catch { setProblem(describeProblem(0, null)); }
    finally { setBusy(false); }
  }
  function runFromInput() {
    if (!catalog) return; setProblem(null); setFormIssues([]);
    const scenario = plan.kind === "scenario" ? catalog.scenarios.find((s) => s.id === plan.id) : undefined;
    let body: RunBody;
    if (plan.kind === "custom") {
      const issues = clientIssues(form, catalog.custom_input.countries); if (issues.length) { setFormIssues(issues); return; }
      body = { input: formToInput(form), source, ...(source === "live" ? { live_ack: LIVE_ACK } : {}) };
    } else if (!scenario) return;
    else body = scenario.mode === "fixture" ? { scenario: scenario.id } : { scenario: scenario.id, source, ...(source === "live" ? { live_ack: LIVE_ACK } : {}) };
    setReport(null); void post(body, undefined, screenAfterRun);
  }
  // Follow-up rounds repeat the same request with the user's decisions added; they stay where the decision was made.
  const confirmIdentities = (c: Confirmation[]) => { if (runBody) void post(runBody, c, screenAfterRun); };
  const confirmReplacement = (c: Confirmation[]) => { if (runBody) void post(runBody, c, () => 4); };
  function restart() { setReport(null); setRunBody(null); setProblem(null); setLiveAck(false); setGuided(false); setScreen(1); }
  // The guided demo always uses the authored synthetic "wrong city -> validated repair" sample: no provider data, no setup, no network request to Qloo.
  function startGuided() {
    const sample = catalog?.scenarios.find((s) => s.id === "wrong-city-repair" && s.mode === "fixture"); if (!sample) return;
    setPlan({ kind: "scenario", id: sample.id }); setSource("recorded"); setLiveAck(false); setReport(null); setGuided(true);
    void post({ scenario: sample.id }, undefined, () => 3);
  }
  const guideStep = guided && report && screen >= 3 ? (screen - 2) as 1 | 2 | 3 : null;

  const live = catalog?.live_gate.status === "AVAILABLE";
  return <>
    <a className="skip-link" href="#main">Skip to the content</a>
    <header className="topbar">
      <div className="brand"><span className="logo" aria-hidden="true">TG</span><span>TasteGate <span className="brand-ai">AI</span></span></div>
      <nav aria-label="Pages"><a className="nav-link" href="/results">Evaluation results</a></nav>
      <ul className="mode-chips" aria-label="Data modes">
        <li className="badge tone-synthetic">FIXTURE: available</li>
        <li className={`badge tone-${catalog?.modes.recorded_live === "AVAILABLE" ? "recorded" : "unknown"}`}>RECORDED: {catalog ? catalog.modes.recorded_live.toLowerCase() : "…"}</li>
        <li className={`badge tone-${live ? "live" : "locked"}`}>LIVE: {live ? "ready (owner grant)" : "locked"}</li>
      </ul>
    </header>
    <main id="main">
      {screen === 1 && <section className="hero">
        <p className="eyebrow">The cultural quality gate for AI agents</p>
        <h1>Don’t just generate recommendations.<br /><span className="hero-accent">Audit them, repair them, verify the evidence.</span></h1>
        <p className="lede">TasteGate checks an AI agent’s plan against Qloo taste data and your hard constraints, repairs only what fails, and re-checks every replacement.
          When it cannot prove something, it says so.</p>
        <HowItWorks onStartGuide={catalog ? startGuided : undefined} busy={busy} />
      </section>}

      <nav className="stepper" aria-label="Progress"><ol>{SCREENS.map((s) => {
        const enabled = reachable.has(s.n); const current = screen === s.n; const skipped = s.n === 2 && report !== null && !isProvider(report);
        return <li key={s.n}><button type="button" className={`step-btn${current ? " current" : ""}${enabled && !current ? " visited" : ""}`} aria-current={current ? "step" : undefined}
          disabled={!enabled || busy || (skipped && !current)} onClick={() => go(s.n)}>
          <span className="num" aria-hidden="true">{s.n}</span><span className="step-label">{s.label}{skipped && <span className="step-note"> (not needed)</span>}</span></button></li>; })}</ol></nav>

      <div role="status" aria-live="polite" className="status-line">{busy ? "Running the bounded audit…" : report ? statusText(report) : problem ? "" : "Choose a plan and run the gate."}</div>

      {catalogFailed && <p role="alert" className="alert">The scenario catalog could not be loaded. No result has been substituted.</p>}
      {!catalog && !catalogFailed && <p className="muted">Loading…</p>}

      {catalog && screen === 1 && <InputScreen catalog={catalog} plan={plan} onPlan={choosePlan} source={source} onSource={(s) => { setSource(s); setLiveAck(false); }} liveAck={liveAck} onLiveAck={setLiveAck}
        form={form} onForm={(f) => { setForm(f); if (formIssues.length) setFormIssues([]); }} formIssues={formIssues} problem={problem} busy={busy} onRun={runFromInput} headingRef={heading} />}
      {catalog && report && screen === 2 && <IdentityScreen report={report} headingRef={heading} problem={problem} go={go} busy={busy} onSubmit={confirmIdentities} />}
      {guideStep && <GuideCard step={guideStep} onBack={() => go(screen === 3 ? 1 : (screen - 1) as Screen)} onNext={() => { if (screen === 5) setGuided(false); else go((screen + 1) as Screen); }} onExit={() => setGuided(false)} />}
      {catalog && report && screen === 3 && <AuditScreen report={report} headingRef={heading} problem={problem} go={go} />}
      {catalog && report && screen === 4 && <RepairScreen report={report} headingRef={heading} problem={problem} go={go} busy={busy} onSubmit={confirmReplacement} />}
      {catalog && report && screen === 5 && <CompareScreen report={report} headingRef={heading} problem={problem} go={go} onRestart={restart} />}
    </main>
    <footer className="footer">TasteGate AI · Synthetic data is authored; recorded data is replayed from private storage and never published; live data exists only under an owner’s time-boxed grant.
      No booking, payment or other external action is ever taken.</footer>
  </>;
}
