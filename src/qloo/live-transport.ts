import https from "node:https";
import { Readable } from "node:stream";

// One GET over verified TLS. No redirect following, no retry, no connection pooling, no proxy, no caller-supplied
// host, method or path. It mirrors the probe framework's native sender (raw-probe-runner.ts) on purpose, so the
// frozen probe code is untouched; tests assert the same properties. A request can only be a URL on the single
// allowlisted origin, so this is not a general HTTP client and cannot be pointed at another host.
export const LIVE_ORIGIN = "https://hackathon.api.qloo.com" as const;
export interface LiveHttpRequest { readonly url: string; readonly headers: Readonly<Record<string, string>>; readonly signal: AbortSignal }
export type LiveSend = (request: LiveHttpRequest) => Promise<Response>;
export class LiveTransportError extends Error { constructor() { super("NETWORK_ERROR"); this.name = "LiveTransportError"; } }
export const sendNative: LiveSend = (request) => new Promise((resolve, reject) => {
  const url = new URL(request.url);
  if (url.origin !== LIVE_ORIGIN || url.username || url.password || url.hash) { reject(new LiveTransportError()); return; }
  const outgoing = https.request(url, { method: "GET", headers: request.headers, signal: request.signal, agent: false, rejectUnauthorized: true }, (incoming) => {
    try {
      const status = incoming.statusCode ?? 502;
      const body = [204, 205, 304].includes(status) ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      if (!body) incoming.resume();
      resolve(new Response(body, { status, headers: { "content-type": incoming.headers["content-type"] ?? "" } }));
    } catch { incoming.destroy(); reject(new LiveTransportError()); }
  });
  outgoing.once("error", () => reject(new LiveTransportError())); outgoing.end();
});
