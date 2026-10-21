import type { Metadata } from "next";
import results from "../../data/evaluation-results.json";
import type { AblationSummary } from "../../src/eval/ablation-summary";
import type { PolicyAggregate } from "../../src/eval/paired";
import type { summarizeCandidatePriority } from "../../src/eval/candidate-priority";
import { RESULTS_SCHEMA, type PublicResults } from "../../src/eval/publish";

export const metadata: Metadata = {
  title: "Evaluation results · TasteGate AI",
  description: "Paired evaluation of TasteGate against two simple baselines, by evidence stratum, with its limits stated.",
};

// A static, aggregate-only page: counts and fixed labels written by `EVAL_PUBLISH=1 npm run eval`. Nothing here is computed in
// the browser and no provider content is ever included.
type Comparison = {
  plans: number; scored_plans: number; paused_for_human_decision: number;
  paused_plans: { plans: number; gate_decisions_requested: number; baseline_identity_errors: Record<string, number>; baseline_unverifiable_shipped: Record<string, number>; baseline_violating_shipped: Record<string, number> };
  policies: Record<"AS_PROPOSED" | "TOP_HIT_UNCHECKED" | "TASTEGATE", PolicyAggregate>;
  paired_signs: Record<"vs_AS_PROPOSED" | "vs_TOP_HIT_UNCHECKED", { shipped_violating: Sign; shipped_unverifiable: Sign; identity_errors: Sign }>;
  gate: { final_status_counts: Record<string, number>; final_items: number; final_items_with_taste_evidence: number; taste_evidence_coverage: number | "N/A" };
  cultural_evidence_ablation?: AblationSummary;
  valid_candidate_priority?: ReturnType<typeof summarizeCandidatePriority>;
};
type Sign = { better: number; same: number; worse: number };
type StratumView = { status: string; note: string; cases: number; cases_passed: number; failed_case_ids: string[] | number; comparison: Comparison | null };

const TITLES: Record<string, string> = {
  SYNTHETIC: "Authored development cases (synthetic)", SYNTHETIC_HOLDOUT: "Seeded holdout (synthetic)",
  RECORDED_LIVE: "Recorded Qloo responses", AUTHORIZED_LIVE: "Live Qloo requests",
};
const COLUMNS = [["AS_PROPOSED", "Ship the plan as proposed"], ["TOP_HIT_UNCHECKED", "Trust the first Qloo hit, check nothing"], ["TASTEGATE", "TasteGate"]] as const;
const n = (v: number) => v.toLocaleString("en-US");
const ms = (v: number | null) => v === null ? "—" : v < 10 ? `${v.toFixed(2)} ms` : `${v.toFixed(1)} ms`;
const per = (total: number, plans: number) => plans ? (total / plans).toFixed(1) : "—";

function Table({ c }: { c: Comparison }) {
  const p = c.policies;
  const rows: Array<{ label: string; hint: string; cell: (k: typeof COLUMNS[number][0]) => string; gate?: boolean }> = [
    { label: "Hard-constraint violations that reach the user", hint: "lower is better", cell: (k) => n(p[k].shipped_violating) },
    { label: "Items shipped with nothing proving them", hint: "identity or a required fact missing; lower is better", cell: (k) => n(p[k].shipped_unverifiable) },
    { label: "Violating items kept out of the plan", hint: "higher is better", cell: (k) => `${n(p[k].violating_removed)} of ${n(p[k].proposal_violating)}` },
    { label: "Valid items kept", hint: "higher is better", cell: (k) => `${n(p[k].valid_kept)} of ${n(p[k].proposal_valid)}` },
    { label: "Wrong identities shipped", hint: "lower is better", cell: (k) => n(p[k].identity_errors) },
    { label: "Plans larger than their own size limit", hint: "lower is better", cell: (k) => n(p[k].plans_over_limit) },
    { label: "Evidence-source calls per plan", hint: "the cost of checking", cell: (k) => per(p[k].requests, p[k].plans) },
    { label: "Local latency, median / 95th percentile", hint: "in-process only, not a network figure", cell: (k) => k === "AS_PROPOSED" ? "—" : `${ms(p[k].latency_ms.p50)} / ${ms(p[k].latency_ms.p95)}` },
    { label: "People asked to decide", hint: "the cost of not guessing", cell: (k) => k === "TASTEGATE" ? n(p[k].human_decisions + c.paused_plans.gate_decisions_requested) : "0" },
  ];
  return <table className="results-table">
    <caption>{c.scored_plans} plans scored{c.paused_for_human_decision ? `; ${c.paused_for_human_decision} more paused for a human decision (below)` : ""}</caption>
    <thead><tr><th scope="col">What reaches the user</th>{COLUMNS.map(([k, label]) => <th scope="col" key={k} className={k === "TASTEGATE" ? "us" : undefined}>{label}</th>)}</tr></thead>
    <tbody>{rows.map((r) => <tr key={r.label}><th scope="row">{r.label}<span className="muted small"> — {r.hint}</span></th>
      {COLUMNS.map(([k]) => <td key={k} className={k === "TASTEGATE" ? "us" : undefined}>{r.cell(k)}</td>)}</tr>)}</tbody>
  </table>;
}
const pct = (v: number | "N/A") => v === "N/A" ? "n/a" : `${Math.round(v * 100)}%`;
// The same gate with and without Qloo's cultural evidence, kept as three separate questions with their own numbers.
function Ablation({ a }: { a: AblationSummary }) {
  const q = a.INDEPENDENTLY_VALIDATED_QUALITY_GAIN; const m = q.oracle_metrics;
  return <div className="ablation" aria-label="What Qloo's cultural evidence adds">
    <h3>What does Qloo’s cultural evidence add?</h3>
    <p className="muted small">The control is the <em>same gate without cultural evidence</em>. It shares {a.shared_with_control.join(", ")}; it differs in one thing only. {a.reading}</p>
    <div className="table-wrap"><table className="results-table"><thead><tr><th scope="col">Question</th><th scope="col">Result</th></tr></thead><tbody>
      <tr><th scope="row">EVIDENCE_COVERAGE_GAIN<span className="muted small"> — coverage, not quality</span></th>
        <td>{n(a.EVIDENCE_COVERAGE_GAIN.with_cultural_evidence.treatment)} of {n(a.EVIDENCE_COVERAGE_GAIN.shipped_items)} kept items carry cultural evidence ({pct(a.EVIDENCE_COVERAGE_GAIN.coverage_treatment)}); the control has none.</td></tr>
      <tr><th scope="row">DECISION_DIFFERENCE<span className="muted small"> — did it change the plan?</span></th>
        <td>{a.DECISION_DIFFERENCE.plans_with_a_different_kept_plan} of {a.plans} plans kept a different set of items ({a.DECISION_DIFFERENCE.items_only_in_treatment} only with the evidence, {a.DECISION_DIFFERENCE.items_only_in_control} only without it).</td></tr>
      <tr><th scope="row">INDEPENDENTLY_VALIDATED_QUALITY_GAIN<span className="muted small"> — judged by an oracle that does not use Qloo’s affinity</span></th>
        <td>Strictly better in {q.plans_treatment_strictly_better}, strictly worse in {q.plans_control_strictly_better}, tied in {q.plans_tied} of {a.plans} plans. Violating items shipped: {n(m.false_accepts_violating_items_shipped.treatment)} vs {n(m.false_accepts_violating_items_shipped.control)};
          valid items dropped: {n(m.false_rejects_valid_items_dropped.treatment)} vs {n(m.false_rejects_valid_items_dropped.control)}.</td></tr>
      <tr><th scope="row">CANDIDATE_ASSESSMENT_DIFFERENCES<span className="muted small"> — labels that change without the evidence</span></th>
        <td>{n(a.CANDIDATE_ASSESSMENT_DIFFERENCES.items_whose_verdict_differs)} of {n(a.CANDIDATE_ASSESSMENT_DIFFERENCES.audited_items)} audited items are labelled differently (for example PASS or REVIEW versus UNKNOWN for missing evidence).</td></tr>
      <tr><th scope="row">EVIDENCE_SUPPORTED_RANKING<span className="muted small"> — an ordering only the evidence can give</span></th>
        <td>{n(a.EVIDENCE_SUPPORTED_RANKING.items_with_a_cultural_ordering.treatment)} items carry a cultural ordering; the control has none. The ordering decides no hard check.</td></tr>
      <tr><th scope="row">VALID_REPAIRS<span className="muted small"> — judged by the oracle, not by Qloo</span></th>
        <td>Replacements accepted: {n(a.VALID_REPAIRS.accepted.treatment)} vs {n(a.VALID_REPAIRS.accepted.control)}; valid by the oracle: {n(a.VALID_REPAIRS.accepted_and_valid_by_oracle.treatment)} vs {n(a.VALID_REPAIRS.accepted_and_valid_by_oracle.control)}.</td></tr>
      <tr><th scope="row">UNKNOWN items</th><td>{pct(a.unknown_frequency.treatment_rate)} with the evidence vs {pct(a.unknown_frequency.control_rate)} without ({n(a.unknown_frequency.audited_items)} audited items).</td></tr>
      <tr><th scope="row">Cost</th><td>{a.cost.calls_per_plan_with_cultural_evidence} vs {a.cost.calls_per_plan_without} evidence-source calls per plan (the control skips the ranking request). Local run time of the treatment: median {a.runtime.treatment_local_latency_ms_median ?? "—"} ms; the control has no separate measurement.</td></tr>
    </tbody></table></div>
    <p><strong className={a.quality_uplift === "QUALITY_UPLIFT_NOT_ESTABLISHED" ? "badge tone-review" : "badge tone-pass"}>{a.quality_uplift}</strong>{" "}
      <span className="muted small">No ground truth for cultural fit exists that is independent of Qloo’s own affinity, so a quality gain is claimed only where the oracle shows one.</span></p>
  </div>;
}
const signText = (s: Sign, versus: string) => `In ${s.better} of ${s.better + s.same + s.worse} plans TasteGate shipped fewer violating items than “${versus}”, ${s.same} the same, ${s.worse} more.`;

export default function ResultsPage() {
  const data = results as unknown as PublicResults;
  if (data.schema !== RESULTS_SCHEMA) return <main><h1>Evaluation results</h1><p role="alert" className="alert">No published results are available.</p></main>;
  const strata = data.strata as unknown as Record<string, StratumView>;
  return <>
    <a className="skip-link" href="#main">Skip to the content</a>
    <header className="topbar"><div className="brand"><span className="logo" aria-hidden="true">TG</span><span>TasteGate <span className="brand-ai">AI</span></span></div>
      <nav aria-label="Pages"><a className="nav-link" href="/">← Back to the app</a></nav></header>
    <main id="main" className="results" tabIndex={-1}>
      <section className="hero"><p className="eyebrow">Evaluation</p><h1>Does the gate keep bad recommendations out?</h1>
        <p className="lede">The same plan is put through three policies on the <strong>same evidence</strong>, and an oracle that does not use TasteGate’s own rules counts what would reach the user.
          Strata are never pooled, and a stratum that was not run says so.</p></section>
      <section className="panel" aria-labelledby="method-title"><h2 id="method-title">How it was measured</h2>
        <ul className="plain">
          <li><strong>Ship the plan as proposed</strong> — trusts the upstream agent completely.</li>
          <li><strong>Trust the first Qloo hit, check nothing</strong> — takes the provider’s first search result for each item and fills any gap with the provider’s own top recommendation, like a quick integration.</li>
          <li><strong>TasteGate</strong> — audit, repair one round, revalidate; it asks a person instead of guessing an identity.</li>
          <li><strong>Control: rules and identity only</strong> — the same gate with the cultural evidence taken away, to separate what Qloo adds from what the rules already do.</li>
          <li>The oracle classifies each item that reaches the user from its true facts: <em>valid</em>, <em>violating</em> a hard constraint, or <em>unverifiable</em>.</li>
        </ul>
        <p className="muted small">Generated {data.generated_at_utc.slice(0, 16).replace("T", " ")} UTC from commit {data.base_commit.slice(0, 9)}{data.working_tree_dirty ? " plus uncommitted changes" : ""}. Holdout seed {data.holdout_seed}.</p></section>
      {Object.entries(strata).map(([key, s]) => <section key={key} className="panel stratum" aria-labelledby={`h-${key}`}>
        <div className="section-head"><h2 id={`h-${key}`}>{TITLES[key] ?? key}</h2><span className={`badge tone-${s.status === "RUN" ? "pass" : s.status === "WITHHELD" ? "review" : "unknown"}`}>{s.status}</span></div>
        <p className="muted">{s.note}</p>
        {s.status === "RUN" && s.comparison && <>
          <p><strong>{s.cases_passed} of {s.cases}</strong> cases satisfied every expectation or invariant{typeof s.failed_case_ids === "object" && s.failed_case_ids.length ? ` (failed: ${s.failed_case_ids.join(", ")})` : ""}.</p>
          <div className="table-wrap"><Table c={s.comparison} /></div>
          {s.comparison.cultural_evidence_ablation && <Ablation a={s.comparison.cultural_evidence_ablation} />}
          {s.comparison.valid_candidate_priority && <div aria-label="Priority among valid candidates">
            <h3>Can cultural evidence prioritize valid candidates?</h3>
            <p>Same identities, constraints and candidate pool. The control keeps input order; Qloo evidence may reorder only within one reviewed query.</p>
            <p>{s.comparison.valid_candidate_priority.plans_with_multiple_valid_candidates} plans have multiple valid candidates;
              {" "}{s.comparison.valid_candidate_priority.plans_with_common_reviewed_query} have a common reviewed ranking;
              {" "}{s.comparison.valid_candidate_priority.plans_with_changed_priority} change priority.
              This changes no acceptance and establishes no cultural quality gain.</p>
            <p className="muted small">Real-data gap: the recorded shortlist has only one hard-constraint-valid candidate. No real prioritization between multiple valid candidates has been demonstrated.</p>
          </div>}
          <ul className="plain">
            <li>{signText(s.comparison.paired_signs.vs_TOP_HIT_UNCHECKED.shipped_violating, "trust the first Qloo hit")}</li>
            <li>{signText(s.comparison.paired_signs.vs_AS_PROPOSED.shipped_violating, "ship the plan as proposed")}</li>
            {s.comparison.paused_for_human_decision > 0 && <li>On {s.comparison.paused_plans.plans} plan{s.comparison.paused_plans.plans === 1 ? "" : "s"} TasteGate paused and asked a person to choose among same-named candidates ({s.comparison.paused_plans.gate_decisions_requested} decision{s.comparison.paused_plans.gate_decisions_requested === 1 ? "" : "s"});
              the first-hit baseline picked the wrong identity {s.comparison.paused_plans.baseline_identity_errors.TOP_HIT_UNCHECKED} time{s.comparison.paused_plans.baseline_identity_errors.TOP_HIT_UNCHECKED === 1 ? "" : "s"} on those plans and shipped {s.comparison.paused_plans.baseline_violating_shipped.TOP_HIT_UNCHECKED} violating items.</li>}
            <li>{s.comparison.gate.taste_evidence_coverage === "N/A" ? "No item was kept." : `${n(s.comparison.gate.final_items_with_taste_evidence)} of ${n(s.comparison.gate.final_items)} kept items had taste evidence`}; items without it are kept, not guessed (a soft gate).</li>
          </ul></>}
        {s.status === "RUN" && !s.comparison && <p>No paired comparison was possible for this stratum.</p>}
      </section>)}
      <section className="panel limits" aria-labelledby="limits-title"><h2 id="limits-title">What this does not show</h2>
        <ul className="plain"><li>{data.caveat}</li>
          <li>Synthetic worlds prove the logic handles constructed failure patterns. They say nothing about how often real agents fail, and nothing about cultural relevance.</li>
          <li>Qloo’s <code>query.affinity</code> is relative within one query. It is never used as a probability, and TasteGate makes no claim that a person will like a place.</li>
          <li>A plan larger than its own size limit has every item blocked: choosing which to drop is a human decision. That is why “valid items kept” is not 100% in the holdout.</li>
          <li>No live Qloo request was made for any number on this page.</li></ul></section>
    </main>
  </>;
}
