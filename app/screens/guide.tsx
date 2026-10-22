"use client";

import type { ReactNode } from "react";

// Orientation for someone seeing TasteGate for the first time. Static copy only: nothing here reads a report, a provider value or a
// private file, so it can appear in a public screenshot.
export function HowItWorks({ onStartGuide, onStartPriority, onStartRecorded, onCustom, busy }: { onStartGuide?: () => void; onStartPriority?: () => void; onStartRecorded?: () => void; onCustom?: () => void; busy?: boolean }) {
  return <section className="how" aria-labelledby="how-title">
    <h2 id="how-title" className="how-title">How it works, in 30 seconds</h2>
    <ol className="how-steps">
      <li><span className="how-num" aria-hidden="true">1</span><strong>An AI agent proposes a plan.</strong><span className="muted small">For example three venues for an evening.</span></li>
      <li><span className="how-num" aria-hidden="true">2</span><strong>TasteGate audits it.</strong><span className="muted small">Identity, hard constraints (city, country, type, size) and Qloo taste evidence are checked separately.</span></li>
      <li><span className="how-num" aria-hidden="true">3</span><strong>It repairs only what fails, once.</strong><span className="muted small">A replacement is audited from scratch and counts as verified only with a second source.</span></li>
      <li><span className="how-num" aria-hidden="true">4</span><strong>It says what it cannot prove.</strong><span className="muted small">UNKNOWN means “no evidence”, never “wrong”. Nothing is booked or bought.</span></li>
    </ol>
    {onStartGuide && <div className="actions"><button type="button" className="primary" onClick={onStartGuide} disabled={busy}>{busy ? "Starting…" : "Start the 2-minute guided demo"}</button>
      {onCustom && <button type="button" className="secondary" onClick={onCustom} disabled={busy}>Audit your own recommendations</button>}
      <span className="muted small">Synthetic data, no setup, no network request to Qloo.</span></div>}
    {onStartPriority && <p className="small demo-extra"><button type="button" className="link" onClick={onStartPriority} disabled={busy}>Compare two valid choices</button>
      {" "}— see what cultural ordering adds after both choices pass the rules. Authored synthetic evidence.</p>}
    {onStartRecorded && <p className="small demo-extra"><button type="button" className="secondary" onClick={onStartRecorded} disabled={busy}>Try the recorded Qloo case</button>
      {" "}Owner-local provider evidence. Confirm identities, then inspect a verified replacement within a still-partial plan. No fresh Qloo request.</p>}
  </section>;
}

const GUIDE: Record<1 | 2 | 3, { title: string; body: ReactNode }> = {
  1: { title: "Audit: look for the red card", body: <>This plan comes from an imaginary agent. The red card failed a hard constraint and says exactly which one. Anything marked
    <strong> UNKNOWN</strong> is not wrong: TasteGate had no evidence, so it claims nothing.</> },
  2: { title: "Repair: one replacement, audited from scratch", body: <>Only the failing item gets a replacement, once. The replacement must pass identity, every hard constraint and cultural evidence, and its identity needs a second source.
    The candidate comparison shows what the rules alone establish and what cultural evidence adds; each source link opens the evidence ledger. A high Qloo ranking never fixes a failed hard check. Because this data is authored, a success here is labelled SYNTHETIC.</> },
  3: { title: "Compare: before, after, and the decision trace", body: <>The counts are plain numbers, and the trace lists each decision TasteGate made in a fixed vocabulary. For the paired evaluation (including a control without Qloo’s cultural
    evidence and an honest “quality uplift not established”), open <a href="/results">Evaluation results</a>.</> },
};
export function GuideCard({ step, onBack, onNext, onExit }: { step: 1 | 2 | 3; onBack: () => void; onNext: () => void; onExit: () => void }) {
  const g = GUIDE[step];
  return <aside className="guide" aria-label={`Guided demo, step ${step} of 3`} data-testid="guide-card">
    <p className="eyebrow">Guided demo · step {step} of 3</p>
    <h3>{g.title}</h3><p>{g.body}</p>
    <div className="actions">
      <button type="button" className="secondary" onClick={onBack}>{step === 1 ? "Back to the start" : "Back"}</button>
      <button type="button" className="primary" onClick={onNext}>{step === 3 ? "Finish the guide" : "Next"}</button>
      <button type="button" className="secondary" onClick={onExit}>Exit the guide</button>
    </div>
  </aside>;
}
