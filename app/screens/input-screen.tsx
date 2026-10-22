"use client";

import type { Ref } from "react";
import type { Catalog } from "../../src/domain/catalog";
import { SourceBadge, PlanView } from "../report-view";
import type { FieldIssue, FormState } from "../custom-form";
import type { RunProblem } from "../run-errors";
import { CustomFormView } from "./custom-form-view";
import { ProblemAlert, ScreenHeading } from "./shared";

export type Plan = { kind: "scenario"; id: string } | { kind: "custom" };
export type Source = "recorded" | "live";
type Scenario = Catalog["scenarios"][number];

const OUTCOME_TEXT: Record<Catalog["recorded_history"][number]["outcome"], (bytes: number | null) => string> = {
  REPLAYABLE: (b) => `HTTP 200 · ${(b ?? 0).toLocaleString("en-US")} bytes · replayable`,
  RESPONSE_TOO_LARGE_NOT_SAVED: () => "HTTP 200 · exceeded the 64 KiB capture budget · nothing saved (UNKNOWN)",
  REVIEW_REQUIRED: () => "executed · awaiting local review before it can be replayed",
  RESPONSE_UNUSABLE: () => "response not usable · no ordering exists",
  UNEXPECTED_ENTITY: () => "returned an entity outside the request · not used",
  INCOMPATIBLE_SCORES: () => "scores missing or contradictory · not used",
};

export function InputScreen(props: {
  catalog: Catalog; plan: Plan; onPlan: (plan: Plan) => void; source: Source; onSource: (source: Source) => void; liveAck: boolean; onLiveAck: (ack: boolean) => void;
  form: FormState; onForm: (form: FormState) => void; formIssues: FieldIssue[]; problem: RunProblem | null; busy: boolean; onRun: () => void; headingRef: Ref<HTMLHeadingElement>;
}) {
  const { catalog, plan, source, liveAck, form, busy } = props;
  const scenarios = catalog.scenarios; const scenario = plan.kind === "scenario" ? scenarios.find((s) => s.id === plan.id) : undefined;
  const recordedUp = catalog.modes.recorded_live === "AVAILABLE"; const liveUp = catalog.live_gate.status === "AVAILABLE";
  const needsSource = plan.kind === "custom" || scenario?.mode === "recorded_live";
  // The curated recorded scenario IS the recordings. A custom plan can still be audited without any (every lookup is UNKNOWN).
  const recordedOk = plan.kind === "custom" || recordedUp;
  const live = needsSource && source === "live";
  const blocked = busy || (plan.kind === "scenario" && (!scenario || !scenario.available)) || (needsSource && (live ? !liveUp || !props.liveAck : !recordedOk));
  return <section aria-labelledby="input-title">
    <ScreenHeading id="input-title" step={1} headingRef={props.headingRef}>What should the gate audit?</ScreenHeading>
    <ProblemAlert problem={props.problem} />
    <fieldset className="plan-kind">
      <legend className="sr-only">Plan to audit</legend>
      <div className="seg">
        <label><input type="radio" name="plan-kind" checked={plan.kind === "scenario"} disabled={busy} onChange={() => props.onPlan({ kind: "scenario", id: scenario?.id ?? scenarios.find((s) => s.mode === "recorded_live" && s.available)?.id ?? scenarios[1]!.id })} /> Ready-made sample plans</label>
        <label><input type="radio" name="plan-kind" checked={plan.kind === "custom"} disabled={busy} onChange={() => props.onPlan({ kind: "custom" })} /> Your own plan</label>
      </div>
    </fieldset>

    {plan.kind === "scenario" ? <>
      <fieldset className="scenario-picker" disabled={busy}>
        <legend className="sr-only">Sample plan</legend>
        <p className="group-label">Real provider data</p>
        <div className="scenario-grid">{scenarios.filter((s) => s.mode === "recorded_live").map((s) => <ScenarioCard key={s.id} s={s} checked={s.id === plan.id} onChoose={(id) => props.onPlan({ kind: "scenario", id })}
          note={s.available ? "Replays only matching, reviewed Qloo recordings. No new request is made in RECORDED mode." :
            "Unavailable on this server: the owner’s private recordings are not present."} />)}</div>
        <p className="group-label">Synthetic test scenarios</p>
        <div className="scenario-grid compact">{scenarios.filter((s) => s.mode === "fixture").map((s) => <ScenarioCard key={s.id} s={s} checked={s.id === plan.id} onChoose={(id) => props.onPlan({ kind: "scenario", id })} />)}</div>
      </fieldset>
      {scenario && <div className="plan-preview"><div className="section-head"><h3>The upstream agent’s plan</h3><SourceBadge mode={scenario.mode} /></div>
        <PlanView input={scenario.input} mode={scenario.mode} origin="sample" /></div>}
    </> : <>
      {props.formIssues.length > 0 && <div role="alert" className="alert problem"><strong>Check your input.</strong>
        <ul>{props.formIssues.map((issue, n) => <li key={n}>{issue.field ? <a href={`#f-${issue.field}`}>{issue.message}</a> : issue.message}</li>)}</ul></div>}
      <p className="lede-small">Describe a plan an AI agent produced. TasteGate checks identity and hard constraints, and says <strong>UNKNOWN</strong> when it has no evidence — it never invents taste data.
        Nothing leaves this server unless you choose LIVE below.</p>
      <CustomFormView form={form} onChange={props.onForm} issues={props.formIssues} coverage={catalog.recorded_coverage} countries={catalog.custom_input.countries} live={live} />
    </>}

    {needsSource && <fieldset className="panel source-picker">
      <legend>Evidence source</legend>
      <label className={`source${source === "recorded" ? " selected" : ""}${recordedOk ? "" : " unavailable"}`}>
        <input type="radio" name="source" value="recorded" checked={source === "recorded"} disabled={busy || !recordedOk} onChange={() => props.onSource("recorded")} />
        <span><strong>RECORDED</strong> — replay owner-approved Qloo responses. No new request is made.{!recordedOk && " Unavailable on this server."}
          {recordedUp && plan.kind === "custom" && " Only lookups that were actually recorded have evidence; everything else is UNKNOWN."}
          {!recordedUp && plan.kind === "custom" && " This server holds no recordings, so every lookup is UNKNOWN. Your plan is still validated and checked for what needs no provider data (its size limit and claims)."}</span>
      </label>
      <label className={`source${source === "live" ? " selected" : ""}${liveUp ? "" : " unavailable"}`}>
        <input type="radio" name="source" value="live" checked={source === "live"} disabled={busy || !liveUp} onChange={() => props.onSource("live")} />
        <span><strong>LIVE</strong> — fresh Qloo requests under the owner’s time-boxed grant.{!liveUp && <> <span className="muted">Locked: {catalog.live_gate.detail}</span></>}</span>
      </label>
      {live && liveUp && <label className="ack"><input type="checkbox" checked={liveAck} disabled={busy} onChange={(e) => props.onLiveAck(e.target.checked)} />
        <span>I understand this sends real requests to Qloo with the owner’s credential — up to {catalog.live_gate.remaining_requests} remain in the grant — and I want to run it now.</span></label>}
    </fieldset>}

    <div className="actions run-bar">
      <button type="button" className={`primary${live ? " live" : ""}`} onClick={props.onRun} disabled={blocked}>
        {busy ? "Running the gate…" : live ? "Run LIVE (sends real Qloo requests)" : "Run the gate"}</button>
      <span className="muted small">Validate → Resolve → Retrieve → Audit → Repair → Revalidate → Report · at most 14 bounded calls, one repair round.</span>
    </div>

    {liveUp && <LiveCard gate={catalog.live_gate} />}
    {!recordedUp && <aside className="panel public-evidence" aria-label="Real Qloo demo availability">
      <h3>Two demos, two kinds of evidence</h3>
      <p>The guided repair uses authored synthetic data. Owner-local Qloo cases replay reviewed responses: one verifies a replacement; another rejects one. They are separate demonstrations.</p>
      <p className="small muted">Real recordings are unavailable on this server. Public display permission is still pending; synthetic success is never presented as real Qloo repair.</p>
    </aside>}
    <details className="technical-evidence"><summary>Technical evidence and owner controls</summary>
    {!liveUp && <LiveCard gate={catalog.live_gate} />}
    {(catalog.recorded_history.length > 0 || catalog.pending_request) && <section className="panel history" aria-labelledby="history-title">
      <h3 id="history-title">Recorded evidence</h3>
      {catalog.pending_request && <p className="small"><strong>{catalog.pending_request.id}</strong> — {catalog.pending_request.detail}</p>}
      {catalog.recorded_history.length > 0 && <details><summary>Recorded request history ({catalog.recorded_history.length} owner-approved requests)</summary>
        <table><thead><tr><th>Probe</th><th>Endpoint</th><th>Recorded (UTC)</th><th>Outcome</th></tr></thead><tbody>
          {catalog.recorded_history.map((h) => <tr key={h.attempt_id}><td>{h.probe}</td><td className="mono">GET {h.endpoint}</td>
            <td>{h.recorded_at ? h.recorded_at.slice(0, 16).replace("T", " ") : "—"}</td><td>{OUTCOME_TEXT[h.outcome](h.response_bytes)}</td></tr>)}</tbody></table></details>}
    </section>}
    </details>
  </section>;
}

function ScenarioCard({ s, checked, onChoose, note }: { s: Scenario; checked: boolean; onChoose: (id: string) => void; note?: string }) {
  return <label className={`scenario${checked ? " selected" : ""}${s.available ? "" : " unavailable"}`}>
    <input type="radio" name="scenario" value={s.id} checked={checked} disabled={!s.available} onChange={() => onChoose(s.id)} />
    <span className="scenario-body"><span className="scenario-title">{s.label}</span>
      <span className="scenario-meta"><SourceBadge mode={s.mode} /> <span className="muted small">{s.input.recommendations.length} recommendation{s.input.recommendations.length > 1 ? "s" : ""}</span></span>
      {note && <span className="muted small">{note}</span>}</span>
  </label>;
}

function LiveCard({ gate }: { gate: Catalog["live_gate"] }) {
  const available = gate.status === "AVAILABLE";
  return <section className={`panel live-card${available ? " available" : ""}`} aria-labelledby="live-title">
    <h3 id="live-title"><span aria-hidden="true">{available ? "●" : "🔒"}</span> Live Qloo: {available ? "ready — an owner grant is active" : "locked"}</h3>
    <p>{gate.detail}</p>
    {available ? <p className="small">Left in the grant: <strong>{gate.remaining_requests}</strong> request{gate.remaining_requests === 1 ? "" : "s"} · <strong>{gate.remaining_runs}</strong> run{gate.remaining_runs === 1 ? "" : "s"}
      {gate.expires_at && <> · ends {gate.expires_at.slice(0, 16).replace("T", " ")} UTC</>}. Each live run still needs your confirmation, makes at most 14 requests with a 4-second limit each, and is never retried.</p> :
      <details><summary>How the owner unlocks it</summary>
        <ol className="small"><li>Put the Qloo key in the <em>server</em> environment only. It is never sent to the browser.</li>
          <li>Create a time-boxed, request-budgeted grant on the server: <code>npm run live:grant -- --create …</code>.</li>
          <li>Choose LIVE here and confirm the run.</li></ol>
        <p className="small muted">Opening this page, setting an environment variable or pressing a generic button can never start a live request. A locked or failed live run never falls back to recorded or synthetic data.</p></details>}
  </section>;
}
