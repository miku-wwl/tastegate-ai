import { SnapshotSchema } from "../domain/contracts";
import type { FixtureObservation, FixtureQlooAdapter, FixtureWorld } from "./ports";

export function createFixtureAdapter(world: FixtureWorld): FixtureQlooAdapter {
  // Isolated authored records, never a prewritten report or a Qloo response copy.
  const data = structuredClone(world);
  const observe = (snapshot: FixtureObservation["snapshot"]): FixtureObservation => ({
    source_mode: "fixture", fixture_id: data.fixtureId, snapshot: SnapshotSchema.parse(snapshot),
  });
  const adapter: FixtureQlooAdapter = {
    mode: "fixture" as const, fixtureId: data.fixtureId,
    async searchEntity(request) {
      // Exact synthetic lookup; ambiguity is preserved. Do not invent fuzzy identity confidence.
      return observe({ kind: "entity_lookup", ...request,
        matches: data.entities.filter((e) => e.name === request.query) });
    },
    async searchTags(query) {
      return observe({ kind: "tag_lookup", query, matches: data.tags.filter((t) => t.name === query) });
    },
    async rankPlaces(request) {
      return observe({ kind: "rank_places", ...request,
        ordered_entity_ids: data.rankOrder.filter((id) => request.candidate_entity_ids.includes(id)),
        explainability: data.explainability });
    },
    async discoverPlaces(request) {
      return observe({ kind: "discover_places", ...request,
        candidates: data.entities.filter((e) => data.discoveries.includes(e.id) && !request.exclude_entity_ids.includes(e.id)).slice(0, 5) });
    },
  };
  return Object.freeze(adapter);
}
