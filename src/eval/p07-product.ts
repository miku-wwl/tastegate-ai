import { runRecordedAudit } from "../audit/workflow";
import { assessRepair } from "../audit/assessment";
import { loadOfficialReferences } from "../qloo/official-reference-store";
import { loadP07Recordings } from "../qloo/p07-recording";
import { createRecordedAdapter } from "../qloo/recorded-adapter";
import { P07_INSIGHTS_POLICY, P07_SCENARIO_ID, getP07ScenarioInput } from "../scenarios/recorded-nyc";
// One owner-local case, separate from frozen strata. Explicit prior-reviewed identity selections;
// not independent taste ground truth, a human study or a fresh provider request.
export async function evaluateP07Product(root: string) {
  const set=await loadP07Recordings(root),refs=await loadOfficialReferences(root,["www.guggenheim.org","whc.unesco.org"]);
  const venue=set.searches.get("place\0Blue Note New York")!.candidates[0]!;
  const report=await runRecordedAudit(getP07ScenarioInput(),createRecordedAdapter(set,{references:refs}),{
    scenarioId:P07_SCENARIO_ID,insightsPolicy:P07_INSIGHTS_POLICY,confirmations:[
      {target_id:"p1",decision:"select",ref:set.discovery.signalRef},{target_id:"original-1",decision:"select",ref:venue.id}]});
  return {source:"RECORDED_LIVE" as const,status:"RUN" as const,independent_plans:1,original_recommendations:report.original_audits.length,
    valid_repairs:report.repairs.filter(r=>r.accepted).length,rejected_repairs:report.repair_outcomes.filter(o=>o.status==="REPAIR_REJECTED").length,
    original_identity_unknown:report.original_audits.filter(a=>a.resolution!=="resolved").length,
    final_status:report.final_status,completion:report.completion,mandatory_checks:report.repairs.map(r=>assessRepair(report,r).checklist.map(c=>({item:c.item,state:c.state}))),
    provider_candidates:set.discovery.found.length,independently_corroborated:refs.size,usage:report.usage,
    independent_hard_constraint_accuracy:"NOT_AN_INDEPENDENT_BENCHMARK",cultural_prioritization:"NO_PAIR_OF_INDEPENDENTLY_CORROBORATED_CANDIDATES",
    independent_quality_gain:"NOT_ESTABLISHED"};
}
