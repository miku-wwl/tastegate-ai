"use client";

import type { ReactNode, Ref } from "react";
import type { RunProblem } from "../run-errors";

// Every screen starts with a heading that takes focus when the screen changes, so keyboard and screen-reader users land
// at the top of the new content instead of on a control that no longer exists.
export function ScreenHeading({ id, step, children, headingRef, aside }: { id: string; step: number; children: ReactNode; headingRef: Ref<HTMLHeadingElement>; aside?: ReactNode }) {
  return <div className="section-head"><h2 id={id} ref={headingRef} tabIndex={-1}><span className="step" aria-hidden="true">{step}</span>{children}</h2>{aside}</div>;
}
export function ProblemAlert({ problem }: { problem: RunProblem | null }) {
  if (!problem) return null;
  return <div role="alert" className="alert problem">
    <strong>{problem.title}.</strong> {problem.message}
    {problem.issues.length > 0 && <ul>{problem.issues.map((issue, n) => <li key={n}>{issue.field ? <a href={`#f-${issue.field}`}>{issue.message}</a> : issue.message}</li>)}</ul>}
  </div>;
}
export function Nav({ children }: { children: ReactNode }) { return <div className="actions nav">{children}</div>; }
