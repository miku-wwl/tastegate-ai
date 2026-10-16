import { performance } from "node:perf_hooks";
import { z } from "zod";
import { assertServer, classifyHttp, logBoundary, QlooBoundaryError, type BoundaryLogSink } from "./boundary-error";
import type { QlooServerConfig } from "./server-config";

// These two request profiles are documented. Insights serialization and all response projections stay deferred.
const query = z.string().min(1).max(200).refine((s) => s.trim().length > 0 && !/[\uD800-\uDFFF]/u.test(s));
const requestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("search"), query, entityType: z.enum(["artist", "movie", "place"]) }),
  z.strictObject({ operation: z.literal("tags"), query }),
]);
const policySchema = z.strictObject({
  maxCalls: z.number().int().min(0).max(14), timeoutMs: z.number().int().min(1).max(60_000),
});
export type OfflineHttpRequest = Readonly<{
  method: "GET"; url: string; headers: Readonly<Record<string, string>>;
  redirect: "error"; cache: "no-store"; signal: AbortSignal;
}>;
export interface LocalTestTransport {
  readonly kind: "local-test-double";
  send(request: OfflineHttpRequest): Promise<Response>;
}
export type UnverifiedResponse = Readonly<{
  source_mode: "offline_test"; status: "UNVERIFIED_RESPONSE"; attempt: number; raw: unknown;
}>;
const MAX_RESPONSE_BYTES = 65_536;

async function readUnknownJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) throw new QlooBoundaryError("CANCELLED");
  const media = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (media !== "application/json" && !media?.endsWith("+json")) {
    void response.body?.cancel().catch(() => {}); throw new QlooBoundaryError("SCHEMA_MISMATCH");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new QlooBoundaryError("SCHEMA_MISMATCH");
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    let bytes = 0; let body = ""; const decoder = new TextDecoder("utf-8", { fatal: true });
    for (;;) {
      const part = await reader.read();
      if (signal.aborted) throw new QlooBoundaryError("CANCELLED");
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { cancel(); throw new QlooBoundaryError("RESPONSE_TOO_LARGE"); }
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
    // Parse syntax only; no shape (including an apparently successful envelope) is trusted as evidence.
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof QlooBoundaryError) throw error;
    throw new QlooBoundaryError("SCHEMA_MISMATCH");
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

export function createOfflineTransportBoundary(config: QlooServerConfig, transport: LocalTestTransport, log?: BoundaryLogSink) {
  assertServer();
  if (transport.kind !== "local-test-double") throw new QlooBoundaryError("LIVE_NOT_VERIFIED");
  // One outstanding transport operation across all sessions of this host-owned client.
  let inFlight = false;
  return Object.freeze({
    createSession(options: { maxCalls?: number; timeoutMs?: number } = {}) {
      const checked = policySchema.safeParse({ maxCalls: 14, timeoutMs: 60_000, ...options });
      if (!checked.success) throw new QlooBoundaryError("INVALID_CONFIG");
      const policy = checked.data; const deadline = performance.now() + policy.timeoutMs;
      let calls = 0; let closed = false;
      return Object.freeze({
        usage: () => Object.freeze({ dispatches: calls, maxCalls: policy.maxCalls, automaticRetries: 0 as const }),
        async request(rawRequest: unknown, parentSignal?: AbortSignal): Promise<UnverifiedResponse> {
          assertServer();
          const parsed = requestSchema.safeParse(rawRequest);
          if (!parsed.success) throw new QlooBoundaryError("INVALID_REQUEST");
          if (closed) throw new QlooBoundaryError("SESSION_CLOSED");
          if (parentSignal?.aborted) throw new QlooBoundaryError("CANCELLED");
          if (performance.now() >= deadline) { closed = true; throw new QlooBoundaryError("TIMEOUT"); }
          if (inFlight) throw new QlooBoundaryError("CONCURRENCY_LIMIT");
          if (calls >= policy.maxCalls) throw new QlooBoundaryError("CALL_BUDGET_EXHAUSTED");
          const credentials = config.credentialHeaders(); // Missing credentials consume no dispatch.
          const request = parsed.data;
          const url = new URL(request.operation === "search" ? "/search" : "/v2/tags", config.baseUrl);
          url.search = new URLSearchParams(request.operation === "search" ?
            { query: request.query, types: `urn:entity:${request.entityType}`, take: "5", page: "1" } :
            { "filter.query": request.query, take: "5", page: "1" }).toString();
          const controller = new AbortController(); const callDeadline = Math.min(deadline, performance.now() + config.requestTimeoutMs);
          let timer: ReturnType<typeof setTimeout> | undefined; let cancel: (() => void) | undefined;
          let httpStatus: number | null = null; let outcome: QlooBoundaryError["code"] | "UNVERIFIED_RESPONSE" = "UNVERIFIED_RESPONSE";
          inFlight = true; calls++; const attempt = calls;
          const interrupted = new Promise<never>((_, reject) => {
            cancel = () => { closed = true; controller.abort(); reject(new QlooBoundaryError("CANCELLED")); };
            parentSignal?.addEventListener("abort", cancel, { once: true });
            timer = setTimeout(() => { closed = true; controller.abort(); reject(new QlooBoundaryError("TIMEOUT")); }, Math.max(1, callDeadline - performance.now()));
          });
          const operation = (async () => {
            const response = await transport.send(Object.freeze({ method: "GET", url: url.toString(),
              headers: Object.freeze({ ...credentials, Accept: "application/json" }), redirect: "error", cache: "no-store", signal: controller.signal }));
            if (controller.signal.aborted) {
              void response.body?.cancel().catch(() => {}); throw new QlooBoundaryError("CANCELLED");
            }
            httpStatus = response.status;
            const code = classifyHttp(response.status);
            if (code) { void response.body?.cancel().catch(() => {}); throw new QlooBoundaryError(code); }
            return readUnknownJson(response, controller.signal);
          })();
          // Keep the lease after timeout until an abort-ignoring test double actually settles.
          void operation.then(() => { inFlight = false; }, () => { inFlight = false; });
          try {
            const raw = await Promise.race([operation, interrupted]);
            if (parentSignal?.aborted) { closed = true; throw new QlooBoundaryError("CANCELLED"); }
            if (performance.now() >= callDeadline) { closed = true; controller.abort(); throw new QlooBoundaryError("TIMEOUT"); }
            return Object.freeze({ source_mode: "offline_test", status: "UNVERIFIED_RESPONSE", attempt, raw });
          } catch (error) {
            outcome = error instanceof QlooBoundaryError ? error.code : "NETWORK_ERROR";
            throw new QlooBoundaryError(outcome);
          } finally {
            clearTimeout(timer); if (cancel) parentSignal?.removeEventListener("abort", cancel);
            logBoundary(log, { event: "qloo_offline_boundary", attempt, outcome, http_status: httpStatus });
          }
        },
      });
    },
  });
}
