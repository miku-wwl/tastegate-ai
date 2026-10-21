import type { Capture, Entity, InsightsPolicy, PublicReference, Snapshot } from "../domain/contracts";

export type Signals = { preference_entity_ids: string[]; preference_tag_ids: string[] };
export type LookupRequest = { query: string; requested_kind: "artist" | "movie" | "place" };
export type RankRequest = Signals & { candidate_entity_ids: string[] };
export type DiscoveryRequest = Signals & { exclude_entity_ids: string[];
  signal_scope?: InsightsPolicy["signal_scope"]; take?: number; exclusion?: InsightsPolicy["discovery_exclusion"] };
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

// Replays immutable, owner-approved Qloo recordings. It performs no network I/O: a request without an
// exactly matching verified recording yields an explicit `unavailable` snapshot with a null capture.
export type RecordedObservation = { source_mode: "recorded_live"; dataset_id: string; capture: Capture | null; snapshot: Snapshot };
export interface RecordedQlooAdapter {
  readonly mode: "recorded_live";
  readonly datasetId: string;
  // An owner-registered official public reference for one provider identity, if the host has one (see PublicReferenceSchema).
  // Synchronous and local: it performs no I/O. Absent or null means no second source is registered for that identity.
  publicReference?(entityId: string): PublicReference | null;
  searchEntity(request: LookupRequest, context: CallContext): Promise<RecordedObservation>;
  searchTags(query: string, context: CallContext): Promise<RecordedObservation>;
  rankPlaces(request: RankRequest, context: CallContext): Promise<RecordedObservation>;
  discoverPlaces(request: DiscoveryRequest, context: CallContext): Promise<RecordedObservation>;
}

// A fresh request made under an owner-created grant (see src/qloo/live-grant.ts and live-adapter-authorized.ts). It
// returns the same normalized snapshots as the recorded adapter, but every provider observation is tied to a ledgered
// live request and is never represented as a replay. Recorded and live observations are not interchangeable.
export type LiveObservation = { source_mode: "authorized_live"; dataset_id: string; capture: Capture | null; snapshot: Snapshot };
export interface AuthorizedLiveQlooAdapter {
  readonly mode: "authorized_live";
  readonly datasetId: string;
  // Live mode has no reference registry: a registered page is bound to a recorded identity, never to a fresh response.
  publicReference?(entityId: string): PublicReference | null;
  searchEntity(request: LookupRequest, context: CallContext): Promise<LiveObservation>;
  searchTags(query: string, context: CallContext): Promise<LiveObservation>;
  rankPlaces(request: RankRequest, context: CallContext): Promise<LiveObservation>;
  discoverPlaces(request: DiscoveryRequest, context: CallContext): Promise<LiveObservation>;
}
export type ProviderQlooAdapter = RecordedQlooAdapter | AuthorizedLiveQlooAdapter;

// Legacy port, permanently disabled (see live-adapter.ts): it returns `unknown` and can never run a workflow.
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
export function requireFixture(adapter: FixtureQlooAdapter | LiveQlooAdapter | ProviderQlooAdapter): asserts adapter is FixtureQlooAdapter {
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
