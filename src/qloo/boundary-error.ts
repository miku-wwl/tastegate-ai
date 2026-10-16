const codes = ["SERVER_ONLY", "INVALID_CONFIG", "INVALID_BASE_URL", "AUTH_REQUIRED", "MODE_MISMATCH",
  "LIVE_NOT_VERIFIED", "INVALID_REQUEST", "CALL_BUDGET_EXHAUSTED", "CONCURRENCY_LIMIT",
  "TIMEOUT", "CANCELLED", "SESSION_CLOSED", "NETWORK_ERROR", "AUTH_INVALID", "FORBIDDEN",
  "RATE_LIMITED", "UPSTREAM_ERROR", "HTTP_ERROR", "SCHEMA_MISMATCH", "RESPONSE_TOO_LARGE"] as const;
export type QlooErrorCode = typeof codes[number];

// Fixed messages only: provider bodies, URLs, headers and exception causes never enter errors.
export class QlooBoundaryError extends Error {
  readonly code: QlooErrorCode;
  constructor(code: QlooErrorCode) {
    const safe = codes.includes(code) ? code : "NETWORK_ERROR";
    super(safe); this.code = safe; this.name = "QlooBoundaryError";
  }
}
export function assertServer(): void {
  if (typeof window !== "undefined") throw new QlooBoundaryError("SERVER_ONLY");
}
export function classifyHttp(status: number): QlooErrorCode | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401) return "AUTH_INVALID";
  if (status === 403) return "FORBIDDEN";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500 && status <= 599) return "UPSTREAM_ERROR";
  // A 404 is not treated as an empty entity lookup without verified provider semantics.
  return "HTTP_ERROR";
}

export type BoundaryLog = Readonly<{
  event: "qloo_offline_boundary"; attempt: number;
  outcome: QlooErrorCode | "UNVERIFIED_RESPONSE"; http_status: number | null;
}>;
export type BoundaryLogSink = (event: BoundaryLog) => void;
export function logBoundary(sink: BoundaryLogSink | undefined, event: BoundaryLog): void {
  // Rebuild the allowlist instead of attempting to redact arbitrary text after logging it.
  try { sink?.(Object.freeze({ event: "qloo_offline_boundary", attempt: event.attempt,
    outcome: event.outcome, http_status: event.http_status })); } catch { /* Logging cannot retry a dispatch. */ }
}
