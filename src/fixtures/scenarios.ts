import { z } from "zod";
import { AuditInputSchema, type AuditInput } from "../domain/contracts";
import type { FixtureWorld } from "../qloo/ports";

export const ScenarioIdSchema = z.enum(["nyc-evening", "valid-only", "wrong-city-repair", "unresolved-only", "missing-evidence", "repair-fails"]);
export type ScenarioId = z.infer<typeof ScenarioIdSchema>;
export const scenarioLabels: Record<ScenarioId, string> = {
  "nyc-evening": "NYC evening: mixed evidence",
  "valid-only": "A valid synthetic recommendation",
  "wrong-city-repair": "Wrong city → validated repair",
  "unresolved-only": "Unresolved venue",
  "missing-evidence": "No taste evidence",
  "repair-fails": "Replacement also violates the city constraint",
};
const input: AuditInput = {
  schema_revision: "tastegate.input.v0",
  preferences: [
    { id: "p1", text: "Radiohead", kind: "artist", confirmed_anchor: "Radiohead" },
    { id: "p2", text: "Wong Kar-wai films", kind: "film_concept", confirmed_anchor: "In the Mood for Love" },
    { id: "p3", text: "Japanese jazz cafes", kind: "tag_concept", confirmed_anchor: "Synthetic reviewed cafe/jazz concept" },
  ],
  task: "Audit AI-generated cultural recommendations for an evening in New York.", destination: "New York",
  constraints: [
    { id: "c1", kind: "city", value: "New York" }, { id: "c2", kind: "country", value: "US" },
    { id: "c3", kind: "entity_type", value: "place" }, { id: "c4", kind: "max_items", value: 3 },
  ],
  recommendations: [
    { id: "original-1", name: "SYNTHETIC Manhattan Listening Room", address_hint: "Synthetic NYC hint", claims: ["You are guaranteed to love this venue."] },
    { id: "original-2", name: "SYNTHETIC Jersey Lounge", address_hint: "Synthetic Jersey City hint", claims: [] },
    { id: "original-3", name: "SYNTHETIC Unresolved Cafe", address_hint: null, claims: [] },
  ],
};
const world: FixtureWorld = {
  fixtureId: "authored-nyc-v1a",
  entities: [
    { id: "synthetic:artist-radiohead", name: "Radiohead", kind: "artist", city: null, country: null },
    { id: "synthetic:film-anchor", name: "In the Mood for Love", kind: "movie", city: null, country: null },
    { id: "synthetic:place-1", name: "SYNTHETIC Manhattan Listening Room", kind: "place", city: "New York", country: "US" },
    { id: "synthetic:place-2", name: "SYNTHETIC Jersey Lounge", kind: "place", city: "Jersey City", country: "US" },
    { id: "synthetic:place-4", name: "SYNTHETIC Midtown Listening Cafe", kind: "place", city: "New York", country: "US" },
  ],
  tags: [{ id: "synthetic:tag-cafe-jazz", name: "Synthetic reviewed cafe/jazz concept" }],
  discoveries: ["synthetic:place-4"], rankOrder: ["synthetic:place-4", "synthetic:place-1", "synthetic:place-2"], explainability: "missing",
};

export function getScenario(id: ScenarioId): { input: AuditInput; world: FixtureWorld } {
  const result = { input: structuredClone(input), world: structuredClone(world) };
  result.world.fixtureId = `authored-${id}-v1a`;
  if (id === "valid-only" || id === "missing-evidence") {
    result.input.recommendations = [{ ...result.input.recommendations[0]!, claims: [] }];
    result.world.discoveries = [];
    if (id === "missing-evidence") result.world.rankOrder = [];
  } else if (id === "wrong-city-repair" || id === "repair-fails") {
    result.input.recommendations = [result.input.recommendations[1]!];
    if (id === "repair-fails") result.world.entities.find((e) => e.id === "synthetic:place-4")!.city = "Jersey City";
  } else if (id === "unresolved-only") {
    result.input.recommendations = [result.input.recommendations[2]!]; result.world.discoveries = [];
  }
  result.input = AuditInputSchema.parse(result.input);
  return result;
}
