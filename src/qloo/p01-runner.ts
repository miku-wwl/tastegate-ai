import https from "node:https";
import { Readable } from "node:stream";
import { performance } from "node:perf_hooks";
import { assertServer, classifyHttp } from "./boundary-error";
import { QlooServerConfig } from "./server-config";
import { blockedP01, P01_PROFILE, P01ProfileSchema, P01CheckpointSchema, P01SummarySchema, ProbeReasonSchema, validP01Checkpoint,
  type P01Summary, type ProbeReason } from "./p01-profile";
import { unsafeP01Diagnostics } from "./p01-local-env";

export interface ProbeRequest {
  readonly url: string; readonly method: "GET"; readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal; readonly redirect: "error";
}
export interface LocalProbeTransport { readonly kind: "local-test-double"; send(request: ProbeRequest): Promise<Response> }
export interface ProbeStore {
  // Reserve a separately approved ID before dispatch; retain every immutable attempt record.
  reserve(): Promise<void>;
  saveRaw(bytes: Uint8Array): Promise<void>;
  saveSummary(summary: P01Summary): Promise<void>;
}
class ProbeStop extends Error { constructor(readonly reason: ProbeReason) { super(reason); } }
function stop(reason: ProbeReason): never { throw new ProbeStop(reason); }
function safeReason(error: unknown): ProbeReason {
  return error instanceof ProbeStop && ProbeReasonSchema.safeParse(error.reason).success ? error.reason : "NETWORK_ERROR";
}

async function readCapped(response: Response, signal: AbortSignal, observed: (bytes: number) => void): Promise<Uint8Array> {
  observed(0); const reader = response.body?.getReader(); if (!reader) return new Uint8Array();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const part = await reader.read(); if (signal.aborted) stop("CANCELLED"); if (part.done) break;
      size += part.value.byteLength;
      observed(Math.min(size, 65_537));
      if (size > 65_536) { cancel(); stop("RESPONSE_TOO_LARGE"); }
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

function runner(sourceMode: "offline_test" | "live_probe", loadConfig: () => QlooServerConfig,
  send: LocalProbeTransport["send"], store: ProbeStore) {
  let started = false; let busy = false;
  return Object.freeze({
    async run(options: { checkpoint?: unknown; profile?: unknown; signal?: AbortSignal } = {}): Promise<P01Summary> {
      assertServer();
      if (Object.keys(options).some((k) => !["checkpoint", "profile", "signal"].includes(k))) return blockedP01("INVALID_PROFILE");
      if (!P01ProfileSchema.safeParse(options.profile ?? P01_PROFILE).success) return blockedP01("INVALID_PROFILE");
      if (!validP01Checkpoint(options.checkpoint)) return blockedP01();
      const checkpoint = P01CheckpointSchema.parse(options.checkpoint);
      if (busy) return blockedP01("CONCURRENCY_LIMIT");
      if (started) return blockedP01("CALL_BUDGET_EXHAUSTED");
      if (options.signal?.aborted) return blockedP01("CANCELLED");
      // Claim this instance synchronously, including the async evidence reservation interval.
      busy = true;
      let config: QlooServerConfig; let headers: Readonly<Record<string, string>>;
      try {
        config = loadConfig(); if (config.mode !== "live") { busy = false; return blockedP01("CONFIG_BLOCKED"); }
        headers = config.credentialHeaders();
      } catch { busy = false; return blockedP01("CONFIG_BLOCKED"); }
      try { await store.reserve(); } catch { busy = false; return blockedP01("EVIDENCE_UNAVAILABLE"); }
      if (options.signal?.aborted || !validP01Checkpoint(options.checkpoint)) {
        busy = false; const result = blockedP01("CHECKPOINT_REQUIRED", checkpoint.attempt_id);
        try { await store.saveSummary(result); } catch { return blockedP01("EVIDENCE_UNAVAILABLE", checkpoint.attempt_id); }
        return result;
      }
      started = true;
      const url = new URL(P01_PROFILE.path, P01_PROFILE.origin); url.search = new URLSearchParams(P01_PROFILE.params).toString();
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
        const bytes = await readCapped(response, controller.signal, (bytes) => { responseBytes = bytes; });
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
      let summary = P01SummarySchema.parse({ schema_revision: "tastegate.raw-probe.v2", probe: "P01", attempt_id: checkpoint.attempt_id, source_mode: sourceMode,
        status, reason, dispatches: 1, max_dispatches: 1, automatic_retries: 0, http_status: httpStatus,
        response_bytes: responseBytes, elapsed_ms: elapsed, transport_settled: transportSettled,
        raw_saved_privately: saved, semantic_review: "NOT_REVIEWED" });
      try { await store.saveSummary(summary); }
      catch { summary = P01SummarySchema.parse({ ...summary, status: "UNKNOWN", reason: "EVIDENCE_UNAVAILABLE" }); }
      return summary;
    },
  });
}

export function createLocalP01Runner(config: QlooServerConfig, transport: LocalProbeTransport, store: ProbeStore) {
  assertServer();
  if (transport.kind !== "local-test-double") throw new Error("LOCAL_TEST_DOUBLE_REQUIRED");
  return runner("offline_test", () => config, (r) => transport.send(r), store);
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
export async function executeLiveP01(options: { checkpoint?: unknown; profile?: unknown; signal?: AbortSignal }, store: ProbeStore,
  trustedLocalConfig?: QlooServerConfig): Promise<P01Summary> {
  assertServer();
  if (!validP01Checkpoint(options.checkpoint)) return blockedP01();
  if (unsafeP01Diagnostics()) return blockedP01("UNSAFE_DIAGNOSTICS");
  const id = P01CheckpointSchema.parse(options.checkpoint).attempt_id;
  if (liveBusy) return blockedP01("CONCURRENCY_LIMIT");
  if (liveSpent.has(id)) return blockedP01("CALL_BUDGET_EXHAUSTED");
  liveBusy = true;
  let releaseSlot = true;
  try {
    const result = await runner("live_probe", () => trustedLocalConfig ?? QlooServerConfig.load(), sendNative, store).run(options);
    if (result.dispatches === 1) liveSpent.add(id);
    releaseSlot = result.transport_settled; return result;
  } catch { liveSpent.add(id); releaseSlot = false; throw new Error("PROBE_EXECUTION_INTERRUPTED"); }
  finally { if (releaseSlot) liveBusy = false; }
}
