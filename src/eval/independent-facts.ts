import labels from "../../data/independent-venue-facts.json";
import type { ProviderAuditReport } from "../domain/contracts";
import { entityInReport } from "./baselines";
import { RECORDED_SCENARIO_ID } from "../scenarios/recorded-nyc";

// A separate factual check, never used by the product gate or the cultural oracle. The label set covers ALL pre-existing
// original slots; it was not chosen by the gate's score. It does not establish a Qloo-ID-to-official-branch mapping.
export function evaluateIndependentFacts(report: ProviderAuditReport) {
  if (report.source_mode !== "recorded_live" || report.scenario_id !== RECORDED_SCENARIO_ID ||
      report.input.recommendations.length !== labels.cases.length ||
      labels.cases.some((label) => report.input.recommendations.find((r) => r.id === label.slot_id)?.name !== label.input_name))
    throw new Error("INDEPENDENT_LABEL_CONTEXT_MISMATCH");
  const rows = labels.cases.map((label) => {
    const audit = report.original_audits.find((a) => a.candidate_id === label.slot_id);
    const entity = audit?.resolution === "resolved" && audit.entity_id ? entityInReport(report, audit.entity_id) : null;
    const compare = (field: "city" | "country") => label[field] === null ? "NOT_LABELLED" as const :
      !entity?.[field] ? "NO_ESTABLISHED_PROVIDER_EVIDENCE" as const :
      entity[field]!.trim().toLowerCase() === label[field]!.trim().toLowerCase() ? "CONSISTENT" as const : "CONTRADICTED" as const;
    return { slot_id: label.slot_id, city: compare("city"), country: compare("country"), source_url: label.source_url };
  });
  const checks = rows.flatMap((r) => [r.city, r.country]);
  return { status: "RUN" as const, source_kind: "INDEPENDENT_OFFICIAL_LOCATION_FACTS" as const, independent_plans: 1,
    labelled_slots: rows.length, labelled_fields: checks.filter((s) => s !== "NOT_LABELLED").length,
    comparable_fields: checks.filter((s) => s === "CONSISTENT" || s === "CONTRADICTED").length,
    consistent_fields: checks.filter((s) => s === "CONSISTENT").length, contradicted_fields: checks.filter((s) => s === "CONTRADICTED").length,
    missing_provider_fields: checks.filter((s) => s === "NO_ESTABLISHED_PROVIDER_EVIDENCE").length,
    unlabelled_fields: checks.filter((s) => s === "NOT_LABELLED").length,
    rows, identity_mapping: "NOT_INDEPENDENTLY_ADMITTED", cultural_fit_labels: 0,
    selection: labels.selection,
    limitation: "Comparison is conditional on the same human-confirmed provider identities. Public existence/location is not provider identity, repair verification, or liking. Missing provider evidence is abstention, not a false location claim." };
}
