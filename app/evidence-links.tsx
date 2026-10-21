"use client";
import type { AnyAuditReport } from "../src/domain/contracts";
import { evidenceSource } from "./view-model";
export function EvidenceLinks({ report, refs }: { report: AnyAuditReport; refs: readonly string[] }) {
  const found = [...new Set(refs)].flatMap((ref) => {
    const index = report.evidence.findIndex((e) => e.evidence_id === ref);
    return index < 0 ? [] : [{ ref, index, source: evidenceSource(report, ref) }];
  });
  return <span className="evidence-links">{found.length ? found.map(({ ref, index, source }, i) => <span key={ref}>
    {i > 0 ? " · " : ""}<a href={"#evidence-" + ref} aria-label={"Open evidence record " + index + ", " + source.label}
      onClick={() => { document.getElementById("evidence-ledger")?.setAttribute("open", ""); }}>Record {index}</a>
  </span>) : <span className="muted">No supporting record</span>}</span>;
}
