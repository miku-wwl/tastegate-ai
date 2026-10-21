"use client";

import { useState } from "react";
import { RepairAssessmentView } from "./trace-view";
import type { AnyAuditReport, AuditInput, CandidateAudit, Confirmation, Entity, Finding, ProviderAuditReport, Repair } from "../src/domain/contracts";
import {
  FINDING_LABEL, MODE_INFO, OUTCOME_TEXT, STAGES, VERDICT, describeConstraint, evidenceSource, highlights, proposedEntity,
  reachedStages, resolvedEntity, slotOutcomes, stageCalls, subChecks, type Choice, type EvidenceMode, type Verdict,
} from "./view-model";

export function VerdictPill({ verdict, large = false }: { verdict: Verdict; large?: boolean }) {
  const v = VERDICT[verdict];
  return <span className={`pill tone-${v.tone}${large ? " pill-large" : ""}`} title={v.description}>
    <span aria-hidden="true" className="pill-icon">{v.icon}</span>{v.label}<span className="sr-only">: {v.description}</span></span>;
}
export function SourceBadge({ mode }: { mode: EvidenceMode }) {
  const m = MODE_INFO[mode];
  return <span className={`badge tone-${m.tone}`} title={m.summary}><span className="mode-word">{m.label}</span> {m.badge}</span>;
}
// Said once at the top of every result screen: which evidence this run used, in words.
export function ModeBanner({ report }: { report: AnyAuditReport }) {
  const m = MODE_INFO[report.source_mode];
  // A recorded run in which nothing was replayed (a server with no recordings) must not claim to have replayed Qloo responses.
  const empty = report.source_mode === "recorded_live" && report.usage.recorded_replays === 0;
  return <p className={`mode-banner tone-${m.tone}`} role="note"><strong>{m.label}</strong>
    <span>{empty ? "No Qloo evidence was available for this plan: nothing was replayed and nothing was requested, so every provider fact is UNKNOWN. Your plan was still validated and checked for what needs no provider data." : m.summary}</span></p>;
}

export function PlanView({ input, mode, origin }: { input: AuditInput; mode: EvidenceMode; origin: "sample" | "yours" }) {
  return <div className="plan-grid">
    <div className="panel">
      <h3>Request</h3><p className="task">{input.task}</p>
      <h4>Taste signals</h4>
      <ul className="chips">{input.preferences.map((p) => <li key={p.id} className="chip">
        <span className="chip-kind">{p.kind === "artist" ? "Artist" : p.kind === "film_concept" ? "Film" : "Tag"}</span>{p.text}
        {p.confirmed_anchor && p.confirmed_anchor !== p.text && <span className="muted"> → “{p.confirmed_anchor}”</span>}</li>)}</ul>
      <h4>Hard constraints</h4>
      <ul className="chips">{input.constraints.map((c) => <li key={c.id} className="chip chip-hard">{describeConstraint(c)}</li>)}</ul>
    </div>
    <div className="panel">
      <h3>Upstream agent’s recommendations <span className="muted small">({origin === "yours" ? "your input" : mode === "fixture" ? "authored synthetic plan" : "authored sample plan, not a real model run"})</span></h3>
      <ol className="plan-items">{input.recommendations.map((r) => <li key={r.id}>
        <strong>{r.name}</strong>{r.address_hint && <span className="muted small"> · {r.address_hint}</span>}
        {r.claims.length > 0 && <ul className="claims">{r.claims.map((c) => <li key={c}><span className="claim-tag">claim</span>“{c}”</li>)}</ul>}
      </li>)}</ol>
    </div>
  </div>;
}

// One question per identity the audit cannot settle by itself. Nothing is chosen by rank, count or label.
export function ConfirmPanel({ report, choices, busy, title, intro, submitLabel, skipLabel, onSubmit }: {
  report: ProviderAuditReport; choices: Choice[]; busy: boolean; title: string; intro: string; submitLabel: string; skipLabel: string; onSubmit: (c: Confirmation[]) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = choices.every((c) => answers[c.targetId]);
  const submit = () => onSubmit([...report.confirmations, ...choices.map((c): Confirmation => answers[c.targetId] === "skip" ?
    { target_id: c.targetId, decision: "skip" } : { target_id: c.targetId, decision: "select", ref: answers[c.targetId]! })]);
  return <section className="confirm" aria-labelledby={`confirm-${choices[0]?.kind ?? "x"}`}>
    <div className="section-head"><h3 id={`confirm-${choices[0]?.kind ?? "x"}`}>{title}</h3><span className="badge tone-pending">{choices.length} decision{choices.length === 1 ? "" : "s"}</span></div>
    <p className="lede-small">{intro}</p>
    <div className="choice-grid">{choices.map((c) => <ChoiceGroup key={c.targetId} choice={c} value={answers[c.targetId]} skipLabel={skipLabel}
      onChange={(v) => setAnswers((a) => ({ ...a, [c.targetId]: v }))} />)}</div>
    <div className="actions"><button type="button" className="primary" disabled={!complete || busy} onClick={submit}>{busy ? "Continuing…" : submitLabel}</button>
      {!complete && <span className="muted small">Answer every question to continue.</span>}</div>
  </section>;
}
function ChoiceGroup({ choice, value, skipLabel, onChange }: { choice: Choice; value: string | undefined; skipLabel: string; onChange: (v: string) => void }) {
  const name = `choice-${choice.targetId}`;
  return <fieldset className="panel choice">
    <legend>{choice.question}</legend>
    {choice.options.map((o) => <label key={o.id} className={`option${value === o.id ? " selected" : ""}`}>
      <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
      <span><strong>{o.title}</strong>{o.detail && <> — <span className="muted">{o.detail}</span></>}
        {o.tags.length > 0 && <span className="option-tags">{o.tags.join(" · ")}</span>}</span>
    </label>)}
    <label className={`option option-skip${value === "skip" ? " selected" : ""}`}>
      <input type="radio" name={name} value="skip" checked={value === "skip"} onChange={() => onChange("skip")} />
      <span>{skipLabel}</span>
    </label>
  </fieldset>;
}

export function Pipeline({ report }: { report: AnyAuditReport }) {
  const reached = reachedStages(report); const calls = stageCalls(report);
  const stopped = report.stop_reason === "NEEDS_INPUT" ? "NeedsInput" : null;
  return <ol className="pipeline" aria-label="Workflow stages">
    {STAGES.map((s) => <li key={s} className={reached.has(s) ? "done" : "skipped"}>
      <span className="stage-name">{s}</span><span className="stage-meta">{reached.has(s) ? calls[s] ? `${calls[s]} call${calls[s] === 1 ? "" : "s"}` : "✓" : "skipped"}</span>
    </li>)}
    {stopped && <li className="halt"><span className="stage-name">Needs input</span><span className="stage-meta">paused</span></li>}
  </ol>;
}

function Facts({ entity }: { entity: Entity | null }) {
  if (!entity) return null;
  const place = [entity.neighborhood, entity.city, entity.country].filter(Boolean).join(", ");
  return <dl className="facts">
    {entity.detail && entity.detail !== entity.name && <><dt>Provider detail</dt><dd>{entity.detail}</dd></>}
    {place && <><dt>Provider geography</dt><dd>{place}</dd></>}
    {entity.descriptive_tags && entity.descriptive_tags.length > 0 && <><dt>Provider categories</dt><dd>{entity.descriptive_tags.join(" · ")}</dd></>}
    {entity.provider_class && <><dt>Provider type</dt><dd className="mono">{entity.provider_class}</dd></>}
  </dl>;
}
function FindingList({ report, findings }: { report: AnyAuditReport; findings: Finding[] }) {
  return <ul className="findings">{findings.map((f, i) => <li key={i} className={`finding state-${f.state}`}>
    <span className="finding-head"><span className="finding-state" aria-hidden="true">{f.state === "pass" ? "✓" : f.state === "fail" ? "✕" : f.state === "unknown" ? "?" : "–"}</span>
      <strong>{FINDING_LABEL[f.code]}</strong><code>{f.code}</code></span>
    <span className="finding-text">{f.explanation}</span>
    <span className="finding-refs">{f.evidence_refs.map((ref) => { const src = evidenceSource(report, ref);
      return <span key={ref} className={`badge tone-${src.tone}`} title={src.detail}>{src.label}</span>; })}</span>
  </li>)}</ul>;
}
export function AuditCard({ report, audit, title, entity, claims, note }: { report: AnyAuditReport; audit: CandidateAudit; title: string; entity: Entity | null; claims: number; note?: string }) {
  return <article className={`card verdict-${VERDICT[audit.verdict].tone}`} aria-label={`${title}: ${VERDICT[audit.verdict].label}`}>
    <header className="card-head"><div><h4>{title}</h4>{entity && entity.name !== title && <p className="muted small">Provider entity: {entity.name}</p>}</div><VerdictPill verdict={audit.verdict} /></header>
    {note && <p className="card-note">{note}</p>}
    <ul className="subchecks">{subChecks(audit, claims).map((c) => <li key={c.name} className={`check tone-${c.tone}`}>
      <span className="check-name">{c.name}</span><span className="check-text">{c.text}</span></li>)}</ul>
    <Facts entity={entity} />
    <details className="why"><summary>Evidence and findings ({audit.findings.length})</summary><FindingList report={report} findings={audit.findings} /></details>
  </article>;
}
export function RepairCard({ report, repair }: { report: AnyAuditReport; repair: Repair }) {
  const proposal = proposedEntity(report, repair);
  const discovery = proposal ? report.evidence.find((e) => e.evidence_id === proposal.evidenceRef) : undefined;
  const scope = discovery?.snapshot.kind === "discover_places" ? discovery.snapshot : undefined;
  const failed = repair.revalidation.findings.filter((f) => f.state === "fail").map((f) => FINDING_LABEL[f.code]);
  const basis = repair.identity_basis === "user_confirmation" ? " Its identity rests on your confirmation alone, which is not a second source." : repair.identity_basis === "independent_lookup" ? " Its identity was confirmed by a separate provider lookup." :
    repair.identity_basis === "official_public_reference" ? ` Its identity was corroborated by an official public page (${repair.corroboration?.publisher ?? "reviewed by the owner"}).` : "";
  const uncorroborated = !repair.accepted && repair.revalidation.verdict === "PASS";
  const note = repair.accepted ? `Accepted after revalidation: identity, every hard constraint and taste evidence all passed.${basis}` :
    uncorroborated ? `Not verified: every check passed, but the identity has no second source.${basis}` :
    `Rejected after revalidation${failed.length ? `: ${failed.join(" and ").toLowerCase()}` : ": identity, constraints or taste evidence could not be confirmed"}.${basis}`;
  const origin = report.source_mode === "fixture" ? "synthetic discovery" : report.source_mode === "authorized_live" ? "a live Qloo Insights discovery" : "a recorded Qloo Insights discovery";
  return <div className="repair">
    <p className="repair-origin">Proposed by {origin}
      {scope?.signal_scope === "first_confirmed_artist" && " from your confirmed artist signal only, with no geography filter"}.</p>
    <AuditCard report={report} audit={repair.revalidation} title={proposal?.entity.name ?? repair.proposed_entity_id}
      entity={proposal?.entity ?? null} claims={0} note={note} />
    <RepairAssessmentView report={report} repair={repair} />
    {proposal?.score != null && <p className="affinity"><span className="mono">query.affinity = {proposal.score.toFixed(3)}</span> — Qloo’s query-relative score for
      this one request. Not comparable across queries and not a probability that you will like it; TasteGate makes no decision from it.</p>}
  </div>;
}

export function Summary({ report }: { report: AnyAuditReport }) {
  const accepted = report.repairs.filter((r) => r.accepted).length;
  return <section className="summary" aria-label="Audit summary">
    <div className="summary-status">
      <div><span className="label">Before</span><VerdictPill verdict={report.before_status} large /></div>
      <span className="arrow" aria-hidden="true">→</span>
      <div><span className="label">After TasteGate</span><VerdictPill verdict={report.final_status} large /></div>
      <p className="summary-text">{VERDICT[report.final_status].description} Completion: <strong>{report.completion}</strong>.
        {report.repairs.length > 0 && ` ${report.repairs.length} replacement${report.repairs.length > 1 ? "s" : ""} proposed, ${accepted} accepted after revalidation.`}</p>
    </div>
    <Highlights report={report} />
    <Metrics report={report} />
  </section>;
}
export function Highlights({ report }: { report: AnyAuditReport }) {
  return <div className="highlights"><h3>What the gate found</h3>
    <ul>{highlights(report).map((h) => <li key={h.text} className={`highlight tone-${h.tone}`}>{h.text}</li>)}</ul></div>;
}
export function Metrics({ report }: { report: AnyAuditReport }) {
  return <dl className="metrics">
    {report.source_mode === "fixture" ? <>
      <div><dt>Qloo requests</dt><dd>0</dd></div><div><dt>Synthetic fixture calls</dt><dd>{report.usage.fixture_calls} / 14</dd></div></> :
      report.source_mode === "authorized_live" ? <>
        <div><dt>Fresh Qloo requests</dt><dd>{report.usage.qloo_dispatches}</dd></div>
        <div><dt>Unavailable operations</dt><dd>{report.usage.unavailable_operations}</dd></div><div><dt>Bounded calls</dt><dd>{report.usage.adapter_calls} / 14</dd></div></> : <>
        <div><dt>New Qloo requests</dt><dd>{report.usage.qloo_dispatches}</dd></div><div><dt>Recorded Qloo responses used</dt><dd>{report.usage.recorded_replays}</dd></div>
        <div><dt>Unavailable operations</dt><dd>{report.usage.unavailable_operations}</dd></div><div><dt>Bounded calls</dt><dd>{report.usage.adapter_calls} / 14</dd></div></>}
    <div><dt>Repair rounds</dt><dd>{report.usage.repair_rounds} / 1</dd></div>
    <div><dt>Elapsed</dt><dd>{report.usage.elapsed_ms.toFixed(0)} ms</dd></div>
  </dl>;
}

// Per recommendation: the verdict on the upstream item and, beside it, what ships after the gate.
export function Comparison({ report }: { report: AnyAuditReport }) {
  return <section aria-labelledby="compare-title">
    <div className="section-head"><h3 id="compare-title">As proposed, and after the gate</h3><SourceBadge mode={report.source_mode} /></div>
    <div className="compare-head" aria-hidden="true"><span>Upstream plan, as proposed</span><span>After the gate</span></div>
    {slotOutcomes(report).map(({ audit, repairs, accepted, outcome, recommendation }) => <div className="compare-row" key={audit.candidate_id}>
      <AuditCard report={report} audit={audit} title={recommendation.name} entity={resolvedEntity(report, audit)} claims={recommendation.claims.length} />
      <div className="after">
        <p className={`outcome tone-${OUTCOME_TEXT[outcome].tone}`}><strong>{OUTCOME_TEXT[outcome].title}</strong></p>
        {accepted && <RepairCard report={report} repair={accepted} />}
        {repairs.filter((r) => !r.accepted).map((r) => <RepairCard key={r.replacement_candidate_id} report={report} repair={r} />)}
        {!accepted && OUTCOME_TEXT[outcome].note && <p className="muted small">{OUTCOME_TEXT[outcome].note}</p>}
      </div>
    </div>)}
  </section>;
}

export function Signals({ report }: { report: ProviderAuditReport }) {
  return <section className="panel" aria-labelledby="signals-title">
    <h3 id="signals-title">Taste signals</h3>
    <ul className="signal-list">{report.preference_resolution.map((p) => {
      const pref = report.input.preferences.find((x) => x.id === p.preference_id)!;
      const s = report.evidence.find((e) => e.evidence_id === p.lookup_ref)?.snapshot;
      const chosen = s?.kind === "tag_lookup" ? s.matches.find((m) => m.id === p.selected_id) : s?.kind === "entity_lookup" ? s.matches.find((m) => m.id === p.selected_id) : undefined;
      const label = chosen ? `${chosen.name}${"type_label" in chosen && chosen.type_label ? ` (${chosen.type_label})` : ""}` : "—";
      return <li key={p.preference_id}><strong>{pref.text}</strong> <span className={`badge tone-${p.status === "resolved" ? "pass" : "unknown"}`}>{p.status}</span> <span className="muted">{label}</span></li>;
    })}</ul>
    <p className="muted small">Sent to Qloo Insights: {report.insights_policy.signal_scope === "first_confirmed_artist" ?
      "the confirmed artist only — the one context that is supported. Film and tag confirmations are audited but not used as Insights signals." : "all confirmed signals."}</p>
  </section>;
}

export function Ledger({ report }: { report: AnyAuditReport }) {
  return <details className="ledger" id="evidence-ledger"><summary>Evidence ledger — {report.evidence.length} records, run {report.run_id.slice(0, 8)}</summary>
    <table><thead><tr><th>#</th><th>Stage operation</th><th>Source</th><th>Details</th></tr></thead>
      <tbody>{report.evidence.map((e, i) => { const src = evidenceSource(report, e.evidence_id);
        return <tr key={e.evidence_id} id={"evidence-" + e.evidence_id} tabIndex={-1}><td>{i}</td><td>{e.operation}{e.snapshot.kind === "unavailable" ? ` (${e.snapshot.request.operation})` : ""}</td>
          <td><span className={`badge tone-${src.tone}`}>{src.label}</span></td><td className="small">{src.detail}</td></tr>; })}</tbody></table>
  </details>;
}

export function Limits({ report }: { report: AnyAuditReport }) {
  return <section className="panel limits" aria-labelledby="limits-title"><h3 id="limits-title">What this result does not prove</h3>
    <ul>{report.limitations.map((l) => <li key={l}>{l}</li>)}</ul></section>;
}

export function Export({ report }: { report: AnyAuditReport }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `tastegate-report-${report.run_id}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="export">
    <button type="button" className="secondary" onClick={download}>Download the validated report (JSON)</button>
    <details><summary>Inspect the validated report JSON</summary><pre data-testid="report-json">{JSON.stringify(report, null, 2)}</pre></details>
  </section>;
}
