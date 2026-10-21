import { performance } from "node:perf_hooks";
import { CaptureSchema, type Capture, type Snapshot, type UnavailableReason } from "../domain/contracts";
import { hasUnsafeCharacters } from "../domain/custom-input";
import { assertServer, classifyHttp } from "./boundary-error";
import { LIVE_ENDPOINT, loadLiveGrant, parametersAllowed, startLiveRun, type GrantEnvironment, type LiveGrant, type LiveOperation, type LiveRunHandle } from "./live-grant";
import { LIVE_ORIGIN, type LiveSend } from "./live-transport";
import { projectInsightsPlaces, projectSearch, projectTags } from "./projections";
import { providerRef } from "./provider-ref";
import type { QlooServerConfig } from "./server-config";
import { UNAVAILABLE_REASON_FOR, interpretShortlistRanking } from "./shortlist-ranking";
import type { AuthorizedLiveQlooAdapter, CallContext, DiscoveryRequest, LiveObservation, LookupRequest, RankRequest } from "./ports";

// AUTHORIZED_LIVE adapter: a fresh, ledgered, strictly allowlisted request per operation. It is NOT a proxy:
//   * four fixed request builders; a caller can only supply a bounded query string or provider REFERENCES;
//   * a reference becomes a provider ID only if THIS process received that ID in a validated response, so an ID can
//     never be injected from the browser, a model or a recording;
//   * every dispatch is reserved in a durable ledger first; the grant bounds time, requests, runs and operations;
//   * one request in flight, a hard deadline, a capped body, no retries, no redirects, and a circuit breaker that
//     stops all further dispatch after the first failure of the run;
//   * a failure becomes explicit UNAVAILABLE evidence (never a guess, never a fallback to recordings or fixtures).
export const LIVE_DATASET_PREFIX = "qloo-live-session-";
const MAX_BODY = 262_144; const TIMEOUT_MS = 4000;
export type LiveSessionDisabled = { status: "DISABLED"; reason: "CREDENTIAL_NOT_CONFIGURED" | "LIVE_BUSY" | "LIVE_RUN_LIMIT_REACHED" | "LEDGER_UNAVAILABLE" |
  "GRANT_MISSING" | "GRANT_INVALID" | "GRANT_NOT_YET_VALID" | "GRANT_EXPIRED" | "GRANT_REVOKED" };
export type LiveSession = { status: "AVAILABLE"; adapter: AuthorizedLiveQlooAdapter; grant: LiveGrant; counts(): Promise<{ runs: number; reserved: number; settled: number }>; close(): void };
let sessionOpen = false; let requestInFlight = false;

export async function openAuthorizedLiveSession(deps: { projectRoot: string; config: () => QlooServerConfig; send: LiveSend; now?: () => number; environment?: GrantEnvironment }): Promise<LiveSession | LiveSessionDisabled> {
  assertServer();
  const now = deps.now ?? Date.now;
  let headers: Readonly<Record<string, string>>;
  try { const config = deps.config(); if (config.mode !== "live") throw new Error(); headers = config.credentialHeaders(); }
  catch { return { status: "DISABLED", reason: "CREDENTIAL_NOT_CONFIGURED" }; }
  if (sessionOpen || requestInFlight) return { status: "DISABLED", reason: "LIVE_BUSY" };
  const status = await loadLiveGrant(deps.projectRoot, now(), deps.environment);
  if (!status.ok) return { status: "DISABLED", reason: status.reason === "LEDGER_UNAVAILABLE" ? "LEDGER_UNAVAILABLE" : status.reason };
  sessionOpen = true;
  const run = await startLiveRun(deps.projectRoot, status.grant, now());
  if (!("runIndex" in run)) { sessionOpen = false; return { status: "DISABLED", reason: run.reason === "LIVE_RUN_LIMIT_REACHED" ? "LIVE_RUN_LIMIT_REACHED" : run.reason === "LEDGER_UNAVAILABLE" ? "LEDGER_UNAVAILABLE" : "GRANT_EXPIRED" }; }
  const grant = status.grant; const key = headers["X-Api-Key"]!;
  const adapter = createAdapter({ run, grant, headers, key, send: deps.send, now });
  let closed = false;
  return { status: "AVAILABLE", adapter, grant, counts: () => run.counts(), close() { if (!closed) { closed = true; sessionOpen = false; } } };
}

type RefMap = Map<string, string>;
function createAdapter(ctx: { run: LiveRunHandle; grant: LiveGrant; headers: Readonly<Record<string, string>>; key: string; send: LiveSend; now: () => number }): AuthorizedLiveQlooAdapter {
  const datasetId = `${LIVE_DATASET_PREFIX}${ctx.grant.grant_id.slice(0, 8)}`;
  const ids: RefMap = new Map(); let breaker: string | null = null;
  const observe = (capture: Capture | null, snapshot: Snapshot): LiveObservation => ({ source_mode: "authorized_live", dataset_id: datasetId, capture, snapshot });
  const unavailable = (request: Extract<Snapshot, { kind: "unavailable" }>["request"], reason: UnavailableReason, detail: string) => observe(null, { kind: "unavailable", request, reason, detail });
  type Outcome = { ok: true; body: unknown; capture: Omit<Capture, "request_params" | "profile_revision"> & { requestId: string } } | { ok: false; reason: UnavailableReason; detail: string };
  async function dispatch(operation: LiveOperation, params: Record<string, string>, shape: Record<string, string | number | boolean>, context: CallContext): Promise<Outcome> {
    const refuse = (detail: string, reason: UnavailableReason = "RESPONSE_UNUSABLE"): Outcome => ({ ok: false, reason, detail });
    if (breaker) return refuse(`Live requests were stopped for this run after an earlier failure (${breaker}). Nothing further was sent.`);
    if (context.signal.aborted) return refuse("The request was cancelled before it was sent. Nothing was sent.");
    if (requestInFlight) return refuse("Another live request is still in flight; this one was not sent.");
    if (!ctx.grant.allowed_operations.includes(operation)) return refuse("This operation is not covered by the owner's live grant. Nothing was sent.", "APPROVAL_REQUIRED");
    // The grant's terms name the exact parameters each builder may send; anything else is refused before a slot is reserved.
    if (!parametersAllowed(operation, Object.keys(params))) return refuse("These request parameters are not covered by the owner's live grant. Nothing was sent.", "APPROVAL_REQUIRED");
    requestInFlight = true; // the single in-flight slot is claimed before the first await, so two concurrent calls cannot both send
    let timer: ReturnType<typeof setTimeout> | undefined; let onAbort: (() => void) | undefined;
    try {
      let handle; try { handle = await ctx.run.reserve(operation, shape); }
      catch (error) {
        const code = error instanceof Error ? error.message : "";
        return refuse(code === "LIVE_BUDGET_EXHAUSTED" ? "The owner's live request budget is exhausted. Nothing was sent." : "The owner's live grant is no longer valid. Nothing was sent.", "APPROVAL_REQUIRED");
      }
      // A caller that cancelled while the slot was being reserved: the slot stays spent (conservative), nothing is sent.
      if (context.signal.aborted) {
        await handle.settle({ httpStatus: null, responseBytes: null, elapsedMs: 0, outcome: "CANCELLED_BEFORE_SEND" }).catch(() => {});
        return refuse("The request was cancelled before it was sent. Nothing was sent.");
      }
      const url = new URL(LIVE_ENDPOINT[operation], LIVE_ORIGIN); url.search = new URLSearchParams(params).toString();
      const controller = new AbortController(); const started = performance.now(); const dispatchedAt = new Date(ctx.now()).toISOString();
      let timedOut = false;
      // The deadline is enforced HERE, not only by the transport: even a transport that ignores its signal cannot hold a run past it.
      const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("ABORTED")), { once: true }));
      aborted.catch(() => {});
      onAbort = () => controller.abort(); context.signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
      const abortCode = () => (timedOut ? "TIMEOUT" : "CANCELLED");
      const fail = async (code: string, httpStatus: number | null, bytes: number | null): Promise<Outcome> => {
        breaker = code; // first failure stops the run: no retry, no second attempt
        await handle.settle({ httpStatus, responseBytes: bytes, elapsedMs: Math.round(performance.now() - started), outcome: code }).catch(() => {});
        return refuse(`Qloo did not return a usable response (${code}). No retry was made.`);
      };
      try {
        const response = await Promise.race([ctx.send({ url: url.toString(), headers: Object.freeze({ ...ctx.headers, Accept: "application/json" }), signal: controller.signal }), aborted]);
        const http = classifyHttp(response.status);
        if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); return await fail(abortCode(), response.status, null); }
        if (http) { void response.body?.cancel().catch(() => {}); return await fail(http, response.status, null); }
        const media = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
        if (media !== "application/json" && !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(media ?? "")) { void response.body?.cancel().catch(() => {}); return await fail("SCHEMA_MISMATCH", response.status, null); }
        const reader = response.body?.getReader(); if (!reader) return await fail("SCHEMA_MISMATCH", response.status, null);
        const chunks: Uint8Array[] = []; let size = 0;
        try {
          for (;;) {
            const part = await Promise.race([reader.read(), aborted]);
            if (part.done) break; size += part.value.byteLength;
            if (size > MAX_BODY) { void reader.cancel().catch(() => {}); return await fail("RESPONSE_TOO_LARGE", response.status, MAX_BODY + 1); }
            chunks.push(part.value);
          }
        } catch (error) { void reader.cancel().catch(() => {}); throw error; }
        finally { try { reader.releaseLock(); } catch { /* a pending read was abandoned by the deadline: the stream is already cancelled */ } }
        const bytes = Buffer.concat(chunks);
        let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return await fail("SCHEMA_MISMATCH", response.status, size); }
        if ([ctx.key, encodeURIComponent(ctx.key), Buffer.from(ctx.key).toString("base64")].some((v) => text.includes(v))) return await fail("CREDENTIAL_REFLECTION", response.status, size);
        let body: unknown; try { body = JSON.parse(text); } catch { return await fail("SCHEMA_MISMATCH", response.status, size); }
        await handle.settle({ httpStatus: response.status, responseBytes: size, elapsedMs: Math.round(performance.now() - started), outcome: "OK" });
        return { ok: true, body, capture: { probe: "LIVE", attempt_id: handle.requestId, endpoint: LIVE_ENDPOINT[operation], recorded_at: dispatchedAt, http_status: 200, response_bytes: Math.max(1, size), integrity: "LIVE_LEDGER_RECORD", requestId: handle.requestId } };
      } catch { return await fail(controller.signal.aborted ? abortCode() : "NETWORK_ERROR", null, null); }
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) context.signal.removeEventListener("abort", onAbort);
      requestInFlight = false;
    }
  }
  const capture = (c: Extract<Outcome, { ok: true }>["capture"], operation: LiveOperation, params: Record<string, string>): Capture =>
    CaptureSchema.parse({ probe: c.probe, attempt_id: c.attempt_id, endpoint: c.endpoint, profile_revision: `tastegate.live.${operation}.v1`, recorded_at: c.recorded_at,
      http_status: 200, response_bytes: c.response_bytes, integrity: c.integrity, request_params: params });
  // Remember raw IDs ONLY from a validated response, paired by position with the projected (pseudonymous) entities.
  function remember(projectedRefs: string[], rawIds: unknown[]): boolean {
    if (projectedRefs.length !== rawIds.length) return false;
    const staged: Array<[string, string]> = [];
    for (const [i, ref] of projectedRefs.entries()) { const raw = rawIds[i]; if (typeof raw !== "string" || providerRef("entity", raw) !== ref) return false; staged.push([ref, raw]); }
    for (const [ref, raw] of staged) ids.set(ref, raw);
    return true;
  }
  const rawOf = (refs: readonly string[]): string[] | null => { const out = refs.map((r) => ids.get(r)); return out.every((x): x is string => !!x) ? out as string[] : null; };
  const validQuery = (q: string) => q.length >= 1 && q.length <= 200 && q.trim() === q && !hasUnsafeCharacters(q);
  const adapter: AuthorizedLiveQlooAdapter = {
    mode: "authorized_live", datasetId,
    async searchEntity(request: LookupRequest, context: CallContext) {
      const req = { operation: "entity_lookup" as const, ...request };
      if (!validQuery(request.query)) return unavailable(req, "NOT_CAPTURED", "The query is not a valid bounded lookup string. Nothing was sent.");
      const params = { query: request.query, types: `urn:entity:${request.requested_kind}`, take: "5", page: "1" };
      const out = await dispatch("entity_lookup", params, { query_length: request.query.length, type: request.requested_kind, take: 5 }, context);
      if (!out.ok) return unavailable(req, out.reason, out.detail);
      try {
        const matches = projectSearch(out.body, request.requested_kind, 5);
        const raw = ((out.body as { results: Array<{ entity_id: unknown }> }).results).map((r) => r.entity_id);
        if (!remember(matches.map((m) => m.id), raw)) throw new Error();
        return observe(capture(out.capture, "entity_lookup", params), { kind: "entity_lookup", query: request.query, requested_kind: request.requested_kind, matches });
      } catch { return unavailable(req, "RESPONSE_UNUSABLE", "Qloo's search response did not match the reviewed shape and was not used."); }
    },
    async searchTags(query: string, context: CallContext) {
      const req = { operation: "tag_lookup" as const, query };
      if (!validQuery(query)) return unavailable(req, "NOT_CAPTURED", "The query is not a valid bounded lookup string. Nothing was sent.");
      const params = { "filter.query": query, take: "5", page: "1" };
      const out = await dispatch("tag_lookup", params, { query_length: query.length, take: 5 }, context);
      if (!out.ok) return unavailable(req, out.reason, out.detail);
      try { return observe(capture(out.capture, "tag_lookup", params), { kind: "tag_lookup", query, matches: projectTags(out.body, 5) }); }
      catch { return unavailable(req, "RESPONSE_UNUSABLE", "Qloo's tag response did not match the reviewed shape and was not used."); }
    },
    async rankPlaces(request: RankRequest, context: CallContext) {
      const req = { operation: "rank_places" as const, ...request };
      // Only the reviewed artist-only signal shape exists: tag signals are an unreviewed combination.
      const signal = rawOf(request.preference_entity_ids); const candidates = rawOf(request.candidate_entity_ids);
      if (request.preference_tag_ids.length || request.preference_entity_ids.length !== 1 || !signal || !candidates || candidates.length < 1 || candidates.length > 6)
        return unavailable(req, "NOT_CAPTURED", "Only a ranking of provider-returned places for one confirmed artist signal is supported. Nothing was sent.");
      const params = { "filter.type": "urn:entity:place", "signal.interests.entities": signal[0]!, "filter.results.entities": candidates.join(","), take: String(candidates.length) };
      const out = await dispatch("rank_places", params, { signals: 1, candidates: candidates.length, take: candidates.length }, context);
      if (!out.ok) return unavailable(req, out.reason, out.detail);
      const result = interpretShortlistRanking(out.body, request.candidate_entity_ids);
      if (result.class !== "ALL_RETURNED" && result.class !== "PARTIAL") return unavailable(req, UNAVAILABLE_REASON_FOR[result.class], "Qloo's shortlist ranking response could not be used as an ordering.");
      const refParams = { ...params, "signal.interests.entities": request.preference_entity_ids[0]!, "filter.results.entities": request.candidate_entity_ids.join(",") };
      return observe(capture(out.capture, "rank_places", refParams), { kind: "rank_places", preference_entity_ids: request.preference_entity_ids, preference_tag_ids: request.preference_tag_ids,
        candidate_entity_ids: request.candidate_entity_ids, ordered_entity_ids: result.ordered.map((e) => e.id), explainability: "missing", scores: result.scores, shortlist_class: result.class });
    },
    async discoverPlaces(request: DiscoveryRequest, context: CallContext) {
      const req = { operation: "discover_places" as const, ...request };
      const signal = rawOf(request.preference_entity_ids);
      // Only the reviewed context exists: one artist signal, no tags or geography, exclusions applied by TasteGate.
      if (request.preference_tag_ids.length || request.preference_entity_ids.length !== 1 || !signal || request.exclusion !== "client" || request.signal_scope !== "first_confirmed_artist" ||
          !request.take || request.take < 1 || request.take > 5)
        return unavailable(req, "NOT_CAPTURED", "Only artist-signal discovery without geography is supported. Nothing was sent.");
      const requestTake = Math.min(request.take + request.exclude_entity_ids.length, 10);
      const params = { "filter.type": "urn:entity:place", "signal.interests.entities": signal[0]!, take: String(requestTake) };
      const out = await dispatch("discover_places", params, { signals: 1, take: requestTake }, context);
      if (!out.ok) return unavailable(req, out.reason, out.detail);
      try {
        const found = projectInsightsPlaces(out.body, requestTake);
        const raw = ((out.body as { results: { entities: Array<{ entity_id: unknown }> } }).results.entities).map((e) => e.entity_id);
        if (!remember(found.map((f) => f.entity.id), raw)) throw new Error();
        const excluded = found.filter((f) => request.exclude_entity_ids.includes(f.entity.id));
        const kept = found.filter((f) => !request.exclude_entity_ids.includes(f.entity.id)).slice(0, request.take);
        const refParams = { ...params, "signal.interests.entities": request.preference_entity_ids[0]! };
        return observe(capture(out.capture, "discover_places", refParams), { kind: "discover_places", preference_entity_ids: request.preference_entity_ids, preference_tag_ids: request.preference_tag_ids,
          exclude_entity_ids: request.exclude_entity_ids, signal_scope: request.signal_scope, take: request.take, exclusion: request.exclusion,
          client_excluded_ids: excluded.map((f) => f.entity.id), scores: [...kept, ...excluded].map((f) => ({ entity_id: f.entity.id, query_affinity: f.query_affinity })),
          candidates: kept.map((f) => f.entity) });
      } catch { return unavailable(req, "RESPONSE_UNUSABLE", "Qloo's discovery response did not match the reviewed shape and was not used."); }
    },
  };
  return Object.freeze(adapter);
}
