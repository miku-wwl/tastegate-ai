// Turns the server's fixed error codes into plain-language problems. The server never returns exception text, so there is
// nothing here to redact; an unknown code or a malformed body still produces a safe, generic message.
import { serverIssueToField, type FieldIssue } from "./custom-form";

export type RunProblem = { title: string; message: string; issues: FieldIssue[] };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export const LIVE_REASON_TEXT: Record<string, string> = {
  CREDENTIAL_NOT_CONFIGURED: "No live Qloo credential is configured on this server.",
  GRANT_MISSING: "The owner has not created a live grant.",
  GRANT_INVALID: "The owner's live grant file is invalid.",
  GRANT_NOT_YET_VALID: "The owner's live grant is not valid yet.",
  GRANT_EXPIRED: "The owner's live grant has expired.",
  GRANT_REVOKED: "The owner revoked the live grant.",
  LIVE_RUN_LIMIT_REACHED: "The grant's run limit has been reached.",
  LIVE_BUDGET_EXHAUSTED: "The grant's request budget is spent.",
  LEDGER_UNAVAILABLE: "The live request ledger is unavailable, so live requests stay locked.",
  LIVE_BUSY: "Another live run is already in progress.",
  LIVE_DISABLED: "Live requests are switched off by the operator of this server.",
};
const GENERIC: RunProblem = { title: "The audit failed", message: "The audit could not produce a validated report. No successful result has been substituted.", issues: [] };

export function describeProblem(status: number, body: unknown): RunProblem {
  const code = isRecord(body) && typeof body.error === "string" ? body.error : "";
  const reason = isRecord(body) && typeof body.reason === "string" ? body.reason : "";
  switch (code) {
    case "INVALID_INPUT": {
      const raw = isRecord(body) && Array.isArray(body.issues) ? body.issues : [];
      const issues = raw.flatMap((x) => isRecord(x) && typeof x.path === "string" && typeof x.reason === "string" ? [serverIssueToField({ path: x.path, reason: x.reason })] : []).slice(0, 10);
      return { title: "Check your input", message: "Some fields need attention before the gate can run. Nothing was run.", issues };
    }
    case "INVALID_REQUEST": case "JSON_REQUIRED": return { title: "The request was not accepted", message: "The server refused the request as malformed. Nothing was run.", issues: [] };
    case "REQUEST_TOO_LARGE": return { title: "The input is too large", message: "The input is larger than the server accepts (24 KiB). Shorten it. Nothing was run.", issues: [] };
    case "LIVE_ACK_REQUIRED": return { title: "Live run not confirmed", message: "Tick the confirmation to run against live Qloo. Nothing was sent.", issues: [] };
    case "CROSS_ORIGIN_REFUSED": return { title: "Live run refused", message: "A live run can only be started from this app's own page. Nothing was sent.", issues: [] };
    case "LIVE_RATE_LIMITED": return { title: "Too many live attempts", message: "Wait a minute before trying a live run again. Nothing was sent.", issues: [] };
    case "LIVE_UNAVAILABLE": return { title: "Live Qloo is locked", message: `${LIVE_REASON_TEXT[reason] ?? "Live requests are not available."} Nothing was sent, and nothing was substituted.`, issues: [] };
    case "RECORDED_EVIDENCE_UNAVAILABLE": return { title: "Recorded evidence unavailable", message: "The recorded Qloo evidence is not available on this server. Nothing was substituted.", issues: [] };
    default: return status === 429 ? { title: "Busy", message: "The server is busy. Try again shortly. Nothing was run.", issues: [] } : GENERIC;
  }
}
