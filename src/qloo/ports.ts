import type { Entity, Snapshot } from "../domain/contracts";

export type Signals = { preference_entity_ids: string[]; preference_tag_ids: string[] };
export type LookupRequest = { query: string; requested_kind: "artist" | "movie" | "place" };
export type RankRequest = Signals & { candidate_entity_ids: string[] };
export type DiscoveryRequest = Signals & { exclude_entity_ids: string[] };
export interface CallContext { runId: string; callId: string; signal: AbortSignal }
export type FixtureObservation = { source_mode: "fixture"; fixture_id: string; snapshot: Snapshot };
export interface FixtureQlooAdapter {
  readonly mode: "fixture";
  readonly fixtureId: string;
  searchEntity(request: LookupRequest, context: CallContext): Promise<FixtureObservation>;
  searchTags(query: string, context: CallContext): Promise<FixtureObservation>;
  rankPlaces(request: RankRequest, context: CallContext): Promise<FixtureObservation>;
  discoverPlaces(request: DiscoveryRequest, context: CallContext): Promise<FixtureObservation>;
}

// Future semantic adapter port. Phase 1B adds isolated offline transport checks and a
// permanently disabled live implementation; no verified response mapper exists.
// `unknown` deliberately avoids promising an unobserved live response shape.
export interface LiveQlooAdapter {
  readonly mode: "live";
  searchEntity(request: LookupRequest, context: CallContext): Promise<unknown>;
  searchTags(query: string, context: CallContext): Promise<unknown>;
  rankPlaces(request: RankRequest, context: CallContext): Promise<unknown>;
  discoverPlaces(request: DiscoveryRequest, context: CallContext): Promise<unknown>;
}
export class LiveExecutionBlockedError extends Error {
  constructor() { super("Live Qloo execution is blocked in Phase 1A; no live adapter is implemented."); }
}
export function requireFixture(adapter: FixtureQlooAdapter | LiveQlooAdapter): asserts adapter is FixtureQlooAdapter {
  if (adapter.mode !== "fixture") throw new LiveExecutionBlockedError();
}
export type FixtureWorld = {
  fixtureId: string;
  entities: Entity[];
  tags: Array<{ id: string; name: string }>;
  discoveries: string[];
  rankOrder: string[];
  explainability: "missing" | "available";
};
