"use client";

import type { Ref } from "react";
import type { AnyAuditReport, Confirmation, ProviderAuditReport } from "../../src/domain/contracts";
import { CUSTOM_SCENARIO_ID } from "../../src/domain/protocol";
import {
  AuditCard, Comparison, ConfirmPanel, Export, Highlights, Ledger, Limits, ModeBanner, Pipeline, PlanView, RepairCard, Signals, Summary, VerdictPill,
} from "../report-view";
import {
  REPAIR_REASON_TEXT, REPAIR_STATUS, VERDICT, blockingChoices, comparisonStats, isProvider, repairRows, replacementChoices, resolvedEntity, slotOutcomes, type Screen,
} from "../view-model";
import type { RunProblem } from "../run-errors";
import { DecisionTrace } from "../trace-view";
import { CulturalComparisonView } from "../cultural-comparison-view";
import { Nav, ProblemAlert, ScreenHeading } from "./shared";

type Common = { report: AnyAuditReport; headingRef: Ref<HTMLHeadingElement>; problem: RunProblem | null; go: (screen: Screen) => void };

// ---- 2 · Identity ----
export function IdentityScreen({ report, headingRef, problem, go, busy, onSubmit }: Common & { busy: boolean; onSubmit: (c: Confirmation[]) => void }) {
  const provider = isProvider(report) ? report : null;
  const choices = provider ? blockingChoices(provider) : [];
  const live = report.source_mode === "authorized_live";
  return <section aria-labelledby="identity-title">
    <ScreenHeading id="identity-title" step={2} headingRef={headingRef}>{choices.length ? "Confirm identities" : "Identities"}</ScreenHeading>
    <ModeBanner report={report} />
    <ProblemAlert problem={problem} />
    <Pipeline report={report} />
    {provider && choices.length > 0 && <ConfirmPanel report={provider} choices={choices} busy={busy}
      title="Which one did you mean?" skipLabel="None of these — keep it unresolved" submitLabel={live ? "Continue the audit with my confirmations (sends live requests)" : "Continue the audit with my confirmations"}
      intro={live ? "Qloo returned these candidates. TasteGate never picks a provider identity by rank, count or label — you decide. Continuing sends further live requests under the owner’s grant."
        : "Qloo returned these candidates. TasteGate never picks a provider identity by rank, count or label — you decide. Nothing is sent to Qloo; the next step replays the same recordings."}
      onSubmit={onSubmit} />}
    {provider && choices.length === 0 && <>
      <Signals report={provider} />
      <p className="muted">{provider.confirmations.length ? `You made ${provider.confirmations.length} identity decision${provider.confirmations.length === 1 ? "" : "s"}; none were selected automatically.` : "No identity needed your decision in this run."}</p>
      <Nav><button type="button" className="primary" onClick={() => go(3)}>Next: Audit</button></Nav></>}
    {!provider && <><p className="lede-small">Synthetic runs use authored identities, so there is nothing to confirm.</p><Nav><button type="button" className="primary" onClick={() => go(3)}>Next: Audit</button></Nav></>}
  </section>;
}

// ---- 3 · Audit ----
export function AuditScreen({ report, headingRef, problem, go }: Common) {
  const slots = slotOutcomes(report);
  return <section aria-labelledby="audit-title">
    <ScreenHeading id="audit-title" step={3} headingRef={headingRef}>Audit: what holds up</ScreenHeading>
    <ModeBanner report={report} />
    <ProblemAlert problem={problem} />
    <Pipeline report={report} />
    <div className="summary-status audit-status">
      <div><span className="label">Plan as proposed</span><VerdictPill verdict={report.before_status} large /></div>
      <p className="summary-text">{VERDICT[report.before_status].description} Each recommendation below is checked on four things: <strong>identity</strong>, <strong>hard constraints</strong>, <strong>taste evidence</strong> and <strong>claims</strong>.</p>
    </div>
    <Highlights report={report} />
    <div className="audit-grid">{slots.map(({ audit, recommendation }) =>
      <AuditCard key={audit.candidate_id} report={report} audit={audit} title={recommendation.name} entity={resolvedEntity(report, audit)} claims={recommendation.claims.length} />)}</div>
    {isProvider(report) && <Signals report={report} />}
    <details className="plan-details"><summary>The plan that was audited</summary><PlanView input={report.input} mode={report.source_mode} origin={report.source_mode === "fixture" || (isProvider(report) && report.scenario_id !== CUSTOM_SCENARIO_ID) ? "sample" : "yours"} /></details>
    <Nav><button type="button" className="secondary" onClick={() => go(isProvider(report) ? 2 : 1)}>{isProvider(report) ? "Back: Identity" : "Back: Input"}</button>
      <button type="button" className="primary" onClick={() => go(4)}>Next: Repair</button></Nav>
  </section>;
}

// ---- 4 · Repair ----
export function RepairScreen({ report, headingRef, problem, go, busy, onSubmit }: Common & { busy: boolean; onSubmit: (c: Confirmation[]) => void }) {
  const rows = repairRows(report); const provider = isProvider(report) ? report as ProviderAuditReport : null;
  const pending = provider ? replacementChoices(provider) : [];
  const stats = comparisonStats(report);
  return <section aria-labelledby="repair-title">
    <ScreenHeading id="repair-title" step={4} headingRef={headingRef}>Repair and revalidate</ScreenHeading>
    <ModeBanner report={report} />
    <ProblemAlert problem={problem} />
    {rows.length === 0 ? <div className="panel">
      <h3>Nothing needed repair</h3>
      <p>A recommendation is a repair target only when it is <strong>blocked</strong> by a hard constraint or has <strong>no established identity</strong>. Every item here is either verified or only missing taste evidence — which is a soft gate:
        TasteGate does not replace a verified venue just because evidence is missing, and it does not approve anything just because a score exists.</p>
    </div> : <>
      <p className="lede-small">For each failing recommendation TasteGate may propose one replacement, then audits that replacement <em>from scratch</em>. A replacement is accepted only if its identity, every hard constraint and its taste evidence all pass
        <strong> and</strong> its identity has a second source (a separate provider lookup or a registered official public page). Your own confirmation is recorded, but it is not a second source.</p>
      <ul className="repair-list">{rows.map((row) => {
        const status = REPAIR_STATUS[row.outcome.status];
        return <li key={row.slot} className={`panel repair-row tone-edge-${status.tone}`}>
          <div className="repair-head"><h3>{row.name}</h3><span className={`pill tone-${status.tone}`}><span aria-hidden="true" className="pill-icon">{status.icon}</span>{status.label}</span></div>
          <p className="repair-reason">{REPAIR_REASON_TEXT[row.outcome.reason]}</p>
          {row.repairs.map((repair) => <RepairCard key={repair.replacement_candidate_id} report={report} repair={repair} />)}
          {!row.accepted && row.outcome.status !== "REPAIR_VERIFIED" && <p className="muted small">The original is <strong>not</strong> presented as repaired. {report.source_mode === "recorded_live" && row.outcome.status !== "EVIDENCE_INSUFFICIENT" ?
            "The next useful evidence would be a geography-filtered discovery request; it needs the owner’s separate approval and is never run automatically." : ""}</p>}
        </li>; })}</ul>
      {provider && pending.length > 0 && <ConfirmPanel report={provider} choices={pending} busy={busy}
        title="Confirm a proposed replacement" skipLabel="No — do not use this replacement" submitLabel={report.source_mode === "authorized_live" ? "Apply my decision (sends live requests)" : "Apply my decision"}
        intro="No independent lookup could identify this proposed venue, so its identity would rest on your decision. Confirm it only if the details shown match the venue you want; otherwise decline it. The replacement is then re-audited — but your confirmation alone does not make the repair verified."
        onSubmit={onSubmit} />}
    </>}
    <p className="muted small">{stats.repairsProposed} replacement{stats.repairsProposed === 1 ? "" : "s"} proposed · {stats.repairVerified} verified · {stats.repairRejected} rejected · {stats.repairUnavailable} unavailable · {stats.evidenceInsufficient} with insufficient evidence · {stats.repairUnknown} unknown. One repair round at most.</p>
    <CulturalComparisonView report={report} />
    <Ledger report={report} />
    <Nav><button type="button" className="secondary" onClick={() => go(3)}>Back: Audit</button><button type="button" className="primary" onClick={() => go(5)}>Next: Compare</button></Nav>
  </section>;
}

// ---- 5 · Compare ----
export function CompareScreen({ report, headingRef, problem, go, onRestart }: Common & { onRestart: () => void }) {
  const s = comparisonStats(report);
  const tiles: Array<{ label: string; value: string; note: string }> = [
    { label: "Items audited", value: String(s.items), note: "recommendations in the upstream plan" },
    { label: "Hard violations found", value: String(s.hardViolations), note: "failed a hard constraint on provider data" },
    { label: "Identity not established", value: String(s.identityNotEstablished), note: "unresolved, ambiguous or awaiting you" },
    { label: "Claims unverified", value: String(s.unverifiedClaims), note: "free-text claims are never marked supported" },
    { label: "Kept", value: String(s.keptVerified), note: "identity and constraints verified" },
    { label: "Replaced and verified", value: String(s.replaced), note: "passed every revalidation gate" },
    { label: "Removed", value: String(s.removed), note: "failed a hard check, no verified replacement" },
    { label: "On hold", value: String(s.held), note: "identity or evidence missing; not judged wrong" },
  ];
  return <section aria-labelledby="compare-main-title">
    <ScreenHeading id="compare-main-title" step={5} headingRef={headingRef}>Before and after</ScreenHeading>
    <ModeBanner report={report} />
    <ProblemAlert problem={problem} />
    <Summary report={report} />
    <dl className="tiles" aria-label="What changed">{tiles.map((t) => <div key={t.label} className="tile"><dt>{t.label}</dt><dd>{t.value}</dd><dd className="tile-note">{t.note}</dd></div>)}</dl>
    <Comparison report={report} />
    <CulturalComparisonView report={report} />
    <DecisionTrace report={report} />
    <Limits report={report} />
    <Ledger report={report} />
    <Export report={report} />
    <Nav><button type="button" className="secondary" onClick={() => go(4)}>Back: Repair</button><button type="button" className="primary" onClick={onRestart}>Audit another plan</button></Nav>
  </section>;
}
