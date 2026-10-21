import https from "node:https";
import { Readable } from "node:stream";
import { performance } from "node:perf_hooks";
import { assertServer, classifyHttp } from "./boundary-error";
import { QlooServerConfig } from "./server-config";
import { ProbeReasonSchema, type ProbeReason } from "./p01-profile";
import { probeDefinition, type ExecutableProbe, type RawProbeSummary } from "./probe-definitions";
import { matchesP05Signal, type P05SignalBinding } from "./p05-signal";
import { matchesP06Shortlist, type P06ShortlistBinding } from "./p06-shortlist";
import { matchesP07Signal } from "./p07-signal";
import { p07RequestSha256, p07RequestUrl, type P07Checkpoint } from "./p07-profile";
import { unsafeP01Diagnostics } from "./p01-local-env";

// A trusted in-process binding to private reviewed identities. Only code that verified the private evidence can
// mint one (WeakSet-registered), so untrusted checkpoint/model objects can never stand in for it. P07 reuses the P05
// artist binding; its request is additionally fenced by the hash of the exact request the owner approved.
export type ProbeBinding = P05SignalBinding | P06ShortlistBinding;

export interface ProbeRequest {
  readonly url: string; readonly method: "GET"; readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal; readonly redirect: "error";
}
export interface LocalProbeTransport { readonly kind: "local-test-double"; send(request: ProbeRequest): Promise<Response> }
export type ProbeRunOptions = { checkpoint?: unknown; profile?: unknown; signal?: AbortSignal };
export interface ProbeStore {
  // Reserve a separately approved ID before dispatch; retain every immutable attempt record.
  reserve(): Promise<void>;
  saveRaw(bytes: Uint8Array): Promise<void>;
  saveSummary(summary: RawProbeSummary): Promise<void>;
}
class ProbeStop extends Error { constructor(readonly reason: ProbeReason) { super(reason); } }
function stop(reason: ProbeReason): never { throw new ProbeStop(reason); }
function safeReason(error: unknown): ProbeReason {
  return error instanceof ProbeStop && ProbeReasonSchema.safeParse(error.reason).success ? error.reason : "NETWORK_ERROR";
}

async function readCapped(response: Response, signal: AbortSignal, cap: number, observed: (bytes: number) => void): Promise<Uint8Array> {
  observed(0); const reader = response.body?.getReader(); if (!reader) return new Uint8Array();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const part = await reader.read(); if (signal.aborted) stop("CANCELLED"); if (part.done) break;
      size += part.value.byteLength;
      observed(Math.min(size, cap + 1));
      if (size > cap) { cancel(); stop("RESPONSE_TOO_LARGE"); }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
function rejectReflection(bytes: Uint8Array, key: string, raw: unknown): void {
  const text = Buffer.from(bytes).toString("utf8"); const normalized = JSON.stringify(raw) ?? "";
  for (const value of [key, encodeURIComponent(key), Buffer.from(key).toString("base64")])
    if (text.includes(value) || normalized.includes(value)) stop("CREDENTIAL_REFLECTION");
}

function runner(probe: ExecutableProbe, sourceMode: "offline_test" | "live_probe", loadConfig: () => QlooServerConfig,
  send: LocalProbeTransport["send"], store: ProbeStore, binding?: ProbeBinding) {
  const def = probeDefinition(probe);
  let started = false; let busy = false;
  return Object.freeze({
    async run(options: { checkpoint?: unknown; profile?: unknown; signal?: AbortSignal } = {}): Promise<RawProbeSummary> {
      assertServer();
      if (Object.keys(options).some((k) => !["checkpoint", "profile", "signal"].includes(k))) return def.blocked("INVALID_PROFILE");
      if (!def.profileSchema.safeParse(options.profile ?? def.profile).success) return def.blocked("INVALID_PROFILE");
      if (!def.validCheckpoint(options.checkpoint)) return def.blocked();
      const checkpoint = def.checkpointSchema.parse(options.checkpoint);
      if (probe === "P05" && !matchesP05Signal(checkpoint, binding as P05SignalBinding | undefined)) return def.blocked("EVIDENCE_UNAVAILABLE");
      if (probe === "P06" && !matchesP06Shortlist(checkpoint, binding as P06ShortlistBinding | undefined)) return def.blocked("EVIDENCE_UNAVAILABLE");
      if (probe === "P07") {
        if (!matchesP07Signal(checkpoint, binding as P05SignalBinding | undefined)) return def.blocked("EVIDENCE_UNAVAILABLE");
        // The request is rebuilt from the fixed profile and the verified artist; it must be exactly what the owner approved.
        if (p07RequestSha256((binding as P05SignalBinding).entityId) !== (checkpoint as P07Checkpoint).request_sha256) return def.blocked("INVALID_PROFILE");
      }
      if (busy) return def.blocked("CONCURRENCY_LIMIT");
      if (started) return def.blocked("CALL_BUDGET_EXHAUSTED");
      if (options.signal?.aborted) return def.blocked("CANCELLED");
      // Claim this instance synchronously, including the async evidence reservation interval.
      busy = true;
      let config: QlooServerConfig; let headers: Readonly<Record<string, string>>;
      try {
        config = loadConfig(); if (config.mode !== "live") { busy = false; return def.blocked("CONFIG_BLOCKED"); }
        headers = config.credentialHeaders();
      } catch { busy = false; return def.blocked("CONFIG_BLOCKED"); }
      try { await store.reserve(); } catch { busy = false; return def.blocked("EVIDENCE_UNAVAILABLE"); }
      if (options.signal?.aborted || !def.validCheckpoint(options.checkpoint)) {
        busy = false; const result = def.blocked("CHECKPOINT_REQUIRED", checkpoint.attempt_id);
        try { await store.saveSummary(result); } catch { return def.blocked("EVIDENCE_UNAVAILABLE", checkpoint.attempt_id); }
        return result;
      }
      started = true;
      // The ONLY places private IDs enter a request: markers in the fixed profile are replaced by the verified binding.
      const p06 = binding as P06ShortlistBinding | undefined;
      const url = probe === "P07" ? new URL(p07RequestUrl((binding as P05SignalBinding).entityId)) : new URL(def.profile.path, def.profile.origin);
      if (probe !== "P07") url.search = new URLSearchParams(probe === "P05" ?
        { ...def.profile.params, "signal.interests.entities": (binding as P05SignalBinding).entityId } : probe === "P06" ?
        { ...def.profile.params, "signal.interests.entities": p06!.signalEntityId, "filter.results.entities": `${p06!.nycEntityId},${p06!.controlEntityId}` } :
        def.profile.params).toString();
      const controller = new AbortController(); const began = performance.now(); const deadline = began + config.requestTimeoutMs;
      let timer: ReturnType<typeof setTimeout> | undefined; let cancel: (() => void) | undefined;
      let httpStatus: number | null = null; let responseBytes: number | null = null; let saved = false;
      let transportSettled = false; let elapsed: number | null = null;
      let reason: ProbeReason = "SCHEMA_REVIEW_REQUIRED";
      const interrupted = new Promise<never>((_, reject) => {
        cancel = () => { controller.abort(); reject(new ProbeStop("CANCELLED")); };
        options.signal?.addEventListener("abort", cancel, { once: true });
        timer = setTimeout(() => { controller.abort(); reject(new ProbeStop("TIMEOUT")); }, config.requestTimeoutMs);
      });
      const operation = (async () => {
        const response = await send(Object.freeze({ url: url.toString(), method: "GET", signal: controller.signal,
          redirect: "error", headers: Object.freeze({ ...headers, Accept: "application/json" }) }));
        if (controller.signal.aborted) { await response.body?.cancel().catch(() => {}); stop("CANCELLED"); }
        httpStatus = response.status;
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel().catch(() => {}); stop("REDIRECT_REJECTED"); }
        const code = classifyHttp(response.status);
        if (code) { await response.body?.cancel().catch(() => {}); stop(ProbeReasonSchema.safeParse(code).success ? code as ProbeReason : "HTTP_ERROR"); }
        const bytes = await readCapped(response, controller.signal, def.maxResponseBytes, (bytes) => { responseBytes = bytes; });
        if (controller.signal.aborted) stop("CANCELLED");
        rejectReflection(bytes, headers["X-Api-Key"]!, undefined);
        let raw: unknown;
        try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
        catch { stop("SCHEMA_MISMATCH"); }
        rejectReflection(bytes, headers["X-Api-Key"]!, raw);
        const media = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
        if (media !== "application/json" && !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(media ?? "")) stop("SCHEMA_MISMATCH");
        return bytes; // Syntax validation only. No Qloo field names, entity selections or semantic PASS.
      })();
      void operation.then(() => { transportSettled = true; busy = false; }, () => { transportSettled = true; busy = false; });
      try {
        const bytes = await Promise.race([operation, interrupted]);
        elapsed = Math.round((performance.now() - began) * 1000) / 1000;
        if (options.signal?.aborted) stop("CANCELLED");
        if (performance.now() >= deadline) { controller.abort(); stop("TIMEOUT"); }
        try { await store.saveRaw(bytes); saved = true; } catch { stop("EVIDENCE_UNAVAILABLE"); }
      } catch (error) { elapsed ??= Math.round((performance.now() - began) * 1000) / 1000; reason = safeReason(error); }
      finally { clearTimeout(timer); if (cancel) options.signal?.removeEventListener("abort", cancel); }
      const status = ["AUTH_INVALID", "FORBIDDEN", "HTTP_ERROR", "REDIRECT_REJECTED"].includes(reason) ? "FAIL" : "UNKNOWN";
      let summary = def.summarySchema.parse({ ...def.blocked("CHECKPOINT_REQUIRED", checkpoint.attempt_id), source_mode: sourceMode,
        status, reason, dispatches: 1, max_dispatches: 1, automatic_retries: 0, http_status: httpStatus,
        response_bytes: responseBytes, elapsed_ms: elapsed, transport_settled: transportSettled,
        raw_saved_privately: saved, semantic_review: "NOT_REVIEWED" });
      try { await store.saveSummary(summary); }
      catch { summary = def.summarySchema.parse({ ...summary, status: "UNKNOWN", reason: "EVIDENCE_UNAVAILABLE" }); }
      return summary;
    },
  });
}

export function createLocalRawProbeRunner(probe: ExecutableProbe, config: QlooServerConfig, transport: LocalProbeTransport, store: ProbeStore, binding?: ProbeBinding) {
  assertServer();
  if (transport.kind !== "local-test-double") throw new Error("LOCAL_TEST_DOUBLE_REQUIRED");
  return runner(probe, "offline_test", () => config, (r) => transport.send(r), store, binding);
}

// Deliberately no transport injection for live mode. Node HTTPS issues one request, does not
// follow redirects, has no retry loop, and opts out of connection pooling; TLS remains verified.
function sendNative(request: ProbeRequest): Promise<Response> {
  return new Promise((resolve, reject) => {
    const outgoing = https.request(request.url, { method: "GET", headers: request.headers,
      signal: request.signal, agent: false, rejectUnauthorized: true }, (incoming) => {
      try {
        const status = incoming.statusCode ?? 502;
        const body = [204, 205, 304].includes(status) ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
        if (!body) incoming.resume();
        resolve(new Response(body, { status, headers: { "content-type": incoming.headers["content-type"] ?? "" } }));
      } catch { incoming.destroy(); reject(new ProbeStop("NETWORK_ERROR")); }
    });
    outgoing.once("error", () => reject(new ProbeStop("NETWORK_ERROR"))); outgoing.end();
  });
}
let liveBusy = false; const liveSpent = new Set<string>();
export async function executeLiveRawProbe(probe: ExecutableProbe, options: { checkpoint?: unknown; profile?: unknown; signal?: AbortSignal }, store: ProbeStore,
  trustedLocalConfig?: QlooServerConfig, binding?: ProbeBinding): Promise<RawProbeSummary> {
  assertServer(); const def = probeDefinition(probe);
  if (!def.validCheckpoint(options.checkpoint)) return def.blocked();
  if (probe === "P05" && !matchesP05Signal(options.checkpoint, binding as P05SignalBinding | undefined)) return def.blocked("EVIDENCE_UNAVAILABLE");
  if (probe === "P06" && !matchesP06Shortlist(options.checkpoint, binding as P06ShortlistBinding | undefined)) return def.blocked("EVIDENCE_UNAVAILABLE");
  if (probe === "P07" && !matchesP07Signal(options.checkpoint, binding as P05SignalBinding | undefined)) return def.blocked("EVIDENCE_UNAVAILABLE");
  if (unsafeP01Diagnostics()) return def.blocked("UNSAFE_DIAGNOSTICS");
  const id = probe + ":" + def.checkpointSchema.parse(options.checkpoint).attempt_id;
  if (liveBusy) return def.blocked("CONCURRENCY_LIMIT");
  if (liveSpent.has(id)) return def.blocked("CALL_BUDGET_EXHAUSTED");
  liveBusy = true;
  let releaseSlot = true;
  try {
    const result = await runner(probe, "live_probe", () => trustedLocalConfig ?? QlooServerConfig.load(), sendNative, store, binding).run(options);
    if (result.dispatches === 1) liveSpent.add(id);
    releaseSlot = result.transport_settled; return result;
  } catch { liveSpent.add(id); releaseSlot = false; throw new Error("PROBE_EXECUTION_INTERRUPTED"); }
  finally { if (releaseSlot) liveBusy = false; }
}
