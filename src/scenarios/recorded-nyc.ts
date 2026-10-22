import { AuditInputSchema, InsightsPolicySchema, type AuditInput } from "../domain/contracts";

// Authored sample of an upstream agent's evening plan. It is not a real model run and contains no
// provider data. Its lookups are answered only by the owner-approved recordings (see recorded-adapter.ts).
export const RECORDED_SCENARIO_ID = "recorded-nyc-evening" as const;
export const RECORDED_SCENARIO_LABEL = "NYC evening plan — audited with recorded Qloo responses";
export const P07_SCENARIO_ID = "recorded-nyc-p07" as const;
export const P07_SCENARIO_LABEL = "NYC cultural visit — reviewed P07 repair (recorded Qloo)";
export const P07_INSIGHTS_POLICY = Object.freeze(InsightsPolicySchema.parse({
  signal_scope:"first_confirmed_artist",discovery_take:3,discovery_exclusion:"client",discovery_profile:"p07-nyc-v1" }));
// Trusted host policy matching the single recorded Insights context (P05): only the confirmed artist
// signal, no tag or geography parameters, take=1, exclusions applied by TasteGate after the response.
export const RECORDED_INSIGHTS_POLICY = Object.freeze(InsightsPolicySchema.parse({
  signal_scope: "first_confirmed_artist", discovery_take: 1, discovery_exclusion: "client" }));
const input: AuditInput = {
  schema_revision: "tastegate.input.v0",
  preferences: [
    { id: "p1", text: "Radiohead", kind: "artist", confirmed_anchor: "Radiohead" },
    { id: "p2", text: "Wong Kar-wai films", kind: "film_concept", confirmed_anchor: "In the Mood for Love" },
    { id: "p3", text: "Jazz", kind: "tag_concept", confirmed_anchor: "jazz" },
  ],
  task: "Audit an AI-generated evening plan for a New York visitor who loves Radiohead, Wong Kar-wai films and jazz.",
  destination: "New York",
  constraints: [
    { id: "c1", kind: "city", value: "New York" }, { id: "c2", kind: "country", value: "US" },
    { id: "c3", kind: "entity_type", value: "place" }, { id: "c4", kind: "max_items", value: 3 },
  ],
  recommendations: [
    { id: "original-1", name: "Blue Note New York", address_hint: "131 W 3rd St, Greenwich Village",
      claims: ["A legendary Greenwich Village jazz club.", "Radiohead fans are guaranteed to love it."] },
    { id: "original-2", name: "Village Vanguard", address_hint: "178 7th Ave S, Greenwich Village",
      claims: ["An intimate basement jazz room."] },
  ],
};
export function getRecordedScenarioInput(): AuditInput { return AuditInputSchema.parse(structuredClone(input)); }
export function getP07ScenarioInput(): AuditInput {
  const next = getRecordedScenarioInput();
  next.preferences = next.preferences.slice(0,1);
  next.task = "Audit a New York cultural-visit plan using the reviewed Radiohead signal. Opening hours, access and personal liking are not verified.";
  next.recommendations = next.recommendations.map((r) => ({...r,claims:[]}));
  return AuditInputSchema.parse(next);
}
