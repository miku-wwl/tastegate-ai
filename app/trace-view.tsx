"use client";

import type { AnyAuditReport, Repair } from "../src/domain/contracts";
import { assessRepair, type ChecklistState } from "../src/audit/assessment";
import { TRACE_NOTE, decisionTrace, type TraceAction, type TraceCondition } from "./decision-trace";
import { EvidenceLinks } from "./evidence-links";

const CONDITION: Record<TraceCondition, string> = {
  IDENTITY_AMBIGUOUS: "Several candidates, identity not chosen", IDENTITY_UNRESOLVED: "No identity could be established", HARD_CONSTRAINT_FAILED: "A hard constraint failed",
  COUNT_CONSTRAINT_FAILED: "The plan is larger than its size limit", CULTURAL_EVIDENCE_MISSING: "Identity and constraints verified; no cultural evidence", VERIFIED_WITH_EVIDENCE: "Identity, constraints and cultural evidence verified",
  VERIFIED_NEEDS_HUMAN_REVIEW: "Verified; some claims or evidence need a person", REPLACEMENT_WRONG_CITY: "The replacement is in the wrong city", REPLACEMENT_WRONG_COUNTRY: "The replacement is in the wrong country",
  REPLACEMENT_FAILED_HARD_CHECK: "The replacement failed a hard check", REPLACEMENT_DECLINED_BY_USER: "You declined the replacement", REPLACEMENT_NOT_CORROBORATED: "The replacement's identity has no second source",
  REPLACEMENT_IDENTITY_UNCONFIRMED: "The replacement's identity is unconfirmed", REPLACEMENT_EVIDENCE_MISSING: "Evidence to verify the replacement is missing", VALID_REPLACEMENT_VERIFIED: "A valid replacement passed every gate",
  NO_SUPPORTED_CANDIDATE: "No supported candidate exists", NO_CONFIRMED_SIGNAL: "No confirmed taste signal to search from", REPAIR_DISABLED: "Repair is disabled for this run", BUDGET_EXHAUSTED: "The bounded call budget ran out", WORKFLOW_STOPPED: "The audit stopped early",
};
const ACTION: Record<TraceAction, { label: string; tone: string }> = {
  HUMAN_CONFIRMATION_REQUIRED: { label: "Ask a person to choose", tone: "review" }, HOLD_UNKNOWN: { label: "Hold the slot as UNKNOWN", tone: "unknown" }, REPAIR_CONSIDERED: { label: "Consider one repair", tone: "repair" },
  NOT_REPAIRABLE_BY_SWAP: { label: "Not fixable by swapping venues", tone: "blocked" }, KEEP_WITH_UNKNOWN: { label: "Keep, with the gap stated", tone: "unknown" }, KEEP: { label: "Keep", tone: "pass" },
  KEEP_FOR_HUMAN_REVIEW: { label: "Keep, for a person to review", tone: "review" }, REPAIR_REJECTED: { label: "Reject the replacement", tone: "blocked" }, REPAIR_VERIFIED: { label: "Replace: verified", tone: "pass" },
  REPAIR_UNAVAILABLE: { label: "No repair available", tone: "unknown" }, EVIDENCE_INSUFFICIENT: { label: "Not verified: evidence insufficient", tone: "review" }, STOPPED_UNKNOWN: { label: "Stopped: UNKNOWN", tone: "unknown" },
};
const SYMBOL: Record<ChecklistState, string> = { PASS: "✓", FAIL: "✕", UNKNOWN: "?", NOT_APPLICABLE: "–" };
const TONE: Record<ChecklistState, string> = { PASS: "pass", FAIL: "blocked", UNKNOWN: "unknown", NOT_APPLICABLE: "unknown" };
const CHECKLIST_LABEL: Record<string, string> = { IDENTITY: "Identity established", BRANCH_CORROBORATION: "Branch corroborated by a second source", CITY: "City", COUNTRY: "Country", TYPE: "Type", OTHER_CONSTRAINTS: "Plan size and other constraints",
  CONSISTENCY: "No missing or conflicting fact", PROVENANCE: "Provenance of the evidence", FRESHNESS: "Evidence is dated", CULTURAL_EVIDENCE: "Cultural evidence present" };

// The bounded decisions the workflow made, one row each. Read from the validated report; nothing is inferred or invented.
export function DecisionTrace({ report }: { report: AnyAuditReport }) {
  const steps = decisionTrace(report);
  return <section className="panel trace" aria-labelledby="trace-title" data-testid="decision-trace">
    <h3 id="trace-title">Decision trace</h3>
    <p className="muted small">{TRACE_NOTE}</p>
    <div className="table-wrap"><table className="results-table">
      <caption className="sr-only">The decisions TasteGate made for each recommendation</caption>
      <thead><tr><th scope="col">Recommendation</th><th scope="col">What was found</th><th scope="col">What TasteGate did</th><th scope="col">Supporting evidence</th></tr></thead>
      <tbody>{steps.map((s) => {
        const action = ACTION[s.action];
        return <tr key={`${s.slot}-${s.phase}`}><th scope="row">{s.name}<span className="muted small"> · {s.phase === "AUDIT" ? "audit" : "repair"}</span></th>
          <td>{CONDITION[s.condition]}<br /><code>{s.condition}</code></td>
          <td><span className={`pill tone-${action.tone}`}>{action.label}</span><br /><code>{s.action}</code></td><td><EvidenceLinks report={report} refs={s.evidence_refs} /></td></tr>;
      })}</tbody>
    </table></div>
    {report.source_mode === "fixture" && <p className="small muted">SYNTHETIC: authored data. A success here demonstrates the rules; it is not evidence about real recommendations.</p>}
  </section>;
}

// Hard validity and cultural support are separate questions; the checklist shows every mandatory item and the first one not met.
export function RepairAssessmentView({ report, repair }: { report: AnyAuditReport; repair: Repair }) {
  const a = assessRepair(report, repair); const met = a.checklist.filter((c) => c.state === "PASS" || c.state === "NOT_APPLICABLE").length;
  const hardTone = a.hard_constraint_validity === "VALID" ? "pass" : a.hard_constraint_validity === "INVALID" ? "blocked" : "unknown";
  const identity: Record<typeof a.identity_corroboration, { label: string; tone: string }> = {
    INDEPENDENT_PROVIDER_LOOKUP: { label: "second source: separate provider lookup", tone: "pass" }, OFFICIAL_PUBLIC_REFERENCE: { label: "second source: official public page", tone: "pass" },
    USER_CONFIRMATION_ONLY: { label: "your confirmation only (not a second source)", tone: "review" }, NONE: { label: "no identity established", tone: "unknown" } };
  return <div className="assessment" data-testid="repair-assessment" aria-label="Why this replacement is or is not verified">
    <p className="assess-pills">
      <span className={`pill tone-${hardTone}`}>Hard constraints: {a.hard_constraint_validity}</span>
      <span className={`pill tone-${a.cultural_evidence_support === "SUPPORTED" ? "pass" : "unknown"}`}>Cultural evidence: {a.cultural_evidence_support === "SUPPORTED" ? "SUPPORTED" : "NOT AVAILABLE"}</span>
      <span className={`pill tone-${identity[a.identity_corroboration].tone}`}>Identity: {identity[a.identity_corroboration].label}</span>
      {a.synthetic_success && <span className="pill tone-synthetic">SYNTHETIC SUCCESS · authored data</span>}
    </p>
    <details><summary>Mandatory evidence ({met} of {a.checklist.length} met){a.first_unmet ? ` · first gap: ${CHECKLIST_LABEL[a.first_unmet]}` : ""}</summary>
      <ul className="subchecks">{a.checklist.map((c) => <li key={c.item} className={`check tone-${TONE[c.state]}`}><span className="check-name"><span aria-hidden="true">{SYMBOL[c.state]}</span> {CHECKLIST_LABEL[c.item]}</span><span className="check-text">{c.note}</span></li>)}</ul>
      <p className="muted small">A high Qloo ranking never overrides a failed hard check or an unestablished identity: affinity is not an input to any hard check.</p>
    </details>
  </div>;
}
