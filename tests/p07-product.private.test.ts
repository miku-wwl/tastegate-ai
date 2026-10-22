import { existsSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { assessRepair } from "../src/audit/assessment";
import { runRecordedAudit } from "../src/audit/workflow";
import { ProviderAuditReportSchema } from "../src/domain/report-schema";
import { loadOfficialReferences } from "../src/qloo/official-reference-store";
import { loadP07Recordings } from "../src/qloo/p07-recording";
import { createRecordedAdapter } from "../src/qloo/recorded-adapter";
import { P07_INSIGHTS_POLICY, P07_SCENARIO_ID, getP07ScenarioInput } from "../src/scenarios/recorded-nyc";
const available=existsSync("private/venue-references/registry.json")&&existsSync("private/qloo-probes/p07/attempts/598e608d-ba24-4dbb-96c5-5335493e6cce/replay-admission.v1.json");
it.skipIf(!available)("replays admitted P07 through the existing adapter and verifies one replacement while the whole plan remains partial",async()=>{
 const net=vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("Offline only"));
 try {
  const set=await loadP07Recordings(process.cwd()),references=await loadOfficialReferences(process.cwd(),["www.guggenheim.org","whc.unesco.org"]);
  const adapter=createRecordedAdapter(set,{references}),input=getP07ScenarioInput();
  const venue=set.searches.get("place\0Blue Note New York")!.candidates[0]!;
  const confirmations=[{target_id:"p1",decision:"select" as const,ref:set.discovery.signalRef},{target_id:"original-1",decision:"select" as const,ref:venue.id}];
  const report=ProviderAuditReportSchema.parse(await runRecordedAudit(input,adapter,{scenarioId:P07_SCENARIO_ID,insightsPolicy:P07_INSIGHTS_POLICY,confirmations}));
  expect(report.repair_outcomes.map(o=>o.status)).toEqual(["REPAIR_VERIFIED"]);
  expect(report.schema_revision).toBe("tastegate.report.v2c");
  expect(ProviderAuditReportSchema.safeParse({...report,schema_revision:"tastegate.report.v2b"}).success).toBe(false);
  expect(report.repairs[0]!.identity_basis).toBe("official_public_reference");
  expect(assessRepair(report,report.repairs[0]!).checklist.every(c=>["PASS","NOT_APPLICABLE"].includes(c.state))).toBe(true);
  expect(report.final_status).toBe("UNKNOWN");expect(report.usage.qloo_dispatches).toBe(0);
  const d=await adapter.discoverPlaces({preference_entity_ids:[set.discovery.signalRef],preference_tag_ids:[],exclude_entity_ids:[],take:3,signal_scope:"first_confirmed_artist",exclusion:"client"},{runId:"test",callId:"call",signal:new AbortController().signal});
  expect(d.snapshot.kind).toBe("unavailable"); // even a matching signal cannot omit the exact P07 profile
  expect(net).not.toHaveBeenCalled();
 }finally{net.mockRestore();}
});
