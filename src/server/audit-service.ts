import { z } from "zod";
import { replacementTarget } from "../audit/rules";
import { runAudit, runAuthorizedLiveAudit, runRecordedAudit } from "../audit/workflow";
import { CUSTOM_INPUT_LIMITS, CUSTOM_SCENARIO_ID, CatalogSchema, LIVE_ACK, MAX_REQUEST_BYTES, REQUEST_SOURCES, type Catalog } from "../domain/catalog";
import { ConfirmationsSchema, type AuditInput, type Confirmation } from "../domain/contracts";
import { normalizeCustomInput, type CustomInputIssue } from "../domain/custom-input";
import { ScenarioIdSchema, getScenario, scenarioLabels, type ScenarioId } from "../fixtures/scenarios";
import { createFixtureAdapter } from "../qloo/fixture-adapter";
import { openAuthorizedLiveSession, type LiveSessionDisabled } from "../qloo/live-adapter-authorized";
import { loadLiveGrant, readLiveBudget } from "../qloo/live-grant";
import type { LiveSend } from "../qloo/live-transport";
import { createEmptyRecordedAdapter, createRecordedAdapter, recordedCoverage, type VerifiedRecordings } from "../qloo/recorded-adapter";
import type { QlooServerConfig } from "../qloo/server-config";
import { RECORDED_INSIGHTS_POLICY, RECORDED_SCENARIO_ID, RECORDED_SCENARIO_LABEL, getRecordedScenarioInput } from "../scenarios/recorded-nyc";

// The HTTP-independent core of /api/audit. The route is a thin adapter around it; tests drive it with injected
// dependencies so no network, credential or private file is needed.
//
// Authority model (nothing here lets a request widen it):
//   * the BROWSER picks only: an authored scenario OR a custom input, an evidence source, and identity decisions;
//   * `fixture` is for authored scenarios only; custom input is audited against recordings (default) or live;
//   * `live` additionally needs: the exact acknowledgement string, a same-origin caller, a server-side credential, an
//     unexpired owner-created grant with budget left, a free single-flight slot and the rate limiter. Failing any of
//     them sends nothing and never falls back to another mode;
//   * mode, policy, budgets, paths, provider IDs and credentials are never read from the request.
export type AuditServiceDeps = {
  projectRoot: string;
  recordings: () => Promise<VerifiedRecordings>;
  liveConfig: () => QlooServerConfig;
  send: LiveSend;
  now?: () => number;
  // Operator kill switch (TASTEGATE_DISABLE_LIVE=1): live is refused before anything else, whatever credential or grant exists.
  liveDisabled?: () => boolean;
};
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status, headers });
const LIVE_ATTEMPTS_PER_MINUTE = 6;

const requestSchema = z.strictObject({
  scenario: z.union([ScenarioIdSchema, z.literal(RECORDED_SCENARIO_ID)]).optional(),
  input: z.unknown().optional(),
  source: z.enum(REQUEST_SOURCES).optional(),
  confirmations: ConfirmationsSchema.optional(),
  live_ack: z.literal(LIVE_ACK).optional(),
});

// Bounded streaming read, independent of any Content-Length header.
async function readJson(request: Request, limit: number): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const reader = request.body?.getReader(); if (!reader) return { ok: false, status: 400 };
  let body = ""; let bytes = 0;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel().catch(() => {}); return { ok: false, status: 413 }; }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return { ok: true, value: JSON.parse(body) };
  } catch { return { ok: false, status: 400 }; }
  finally { try { reader.releaseLock(); } catch { /* already released */ } }
}

type Plan =
  | { kind: "fixture"; scenario: ScenarioId }
  | { kind: "provider"; source: "recorded" | "live"; scenarioId: string; input: AuditInput; confirmations: Confirmation[] };
type PlanResult = { ok: true; plan: Plan } | { ok: false; response: Response };
const invalid = (): PlanResult => ({ ok: false, response: fail(400, "INVALID_REQUEST") });

function plan(data: z.infer<typeof requestSchema>): PlanResult {
  const { scenario, input: rawInput, source, confirmations, live_ack } = data;
  if ((scenario === undefined) === (rawInput === undefined)) return invalid(); // exactly one of: authored scenario, custom input
  if (scenario !== undefined && ScenarioIdSchema.safeParse(scenario).success) {
    if ((source ?? "fixture") !== "fixture" || confirmations !== undefined || live_ack !== undefined) return invalid();
    return { ok: true, plan: { kind: "fixture", scenario: scenario as ScenarioId } };
  }
  let input: AuditInput; let scenarioId: string;
  if (scenario === RECORDED_SCENARIO_ID) { input = getRecordedScenarioInput(); scenarioId = RECORDED_SCENARIO_ID; }
  else {
    const normalized = normalizeCustomInput(rawInput);
    // Field paths and fixed reason codes only: the offending value is never echoed.
    if (!normalized.ok) return { ok: false, response: fail(400, "INVALID_INPUT", { issues: normalized.issues satisfies CustomInputIssue[] }) };
    input = normalized.input; scenarioId = CUSTOM_SCENARIO_ID;
  }
  const effective = source ?? "recorded";
  if (effective === "fixture") return invalid(); // an authored synthetic world exists only for authored scenarios
  if (effective === "recorded" && live_ack !== undefined) return invalid();
  const targets = new Set([...input.preferences.map((p) => p.id), ...input.recommendations.flatMap((r) => [r.id, replacementTarget(r.id)])]);
  if (confirmations?.some((c) => !targets.has(c.target_id))) return invalid();
  return { ok: true, plan: { kind: "provider", source: effective, scenarioId, input, confirmations: confirmations ?? [] } };
}

const LOCK_DETAIL: Record<string, string> = {
  CREDENTIAL_NOT_CONFIGURED: "No live credential is configured on this server, so live Qloo requests are impossible here.",
  GRANT_MISSING: "The owner has not created a live grant. Live requests stay locked until they do.",
  GRANT_INVALID: "The live grant is invalid. Live requests stay locked.",
  GRANT_NOT_YET_VALID: "The live grant is not valid yet. Live requests stay locked.",
  GRANT_EXPIRED: "The owner's live grant has expired. Live requests stay locked.",
  GRANT_REVOKED: "The owner revoked the live grant. Live requests stay locked.",
  LIVE_RUN_LIMIT_REACHED: "The grant's run limit has been reached. Live requests stay locked.",
  LIVE_BUDGET_EXHAUSTED: "The grant's request budget is spent. Live requests stay locked.",
  LEDGER_UNAVAILABLE: "The live ledger is unavailable, so live requests stay locked (fail closed).",
  LIVE_DISABLED: "Live requests are switched off by the operator of this server.",
  LIVE_BUSY: "Another live run is in progress. Try again when it finishes.",
};
const LIVE_STATUS: Record<LiveSessionDisabled["reason"], number> = {
  CREDENTIAL_NOT_CONFIGURED: 403, GRANT_MISSING: 403, GRANT_INVALID: 403, GRANT_NOT_YET_VALID: 403, GRANT_EXPIRED: 403, GRANT_REVOKED: 403,
  LIVE_RUN_LIMIT_REACHED: 403, LEDGER_UNAVAILABLE: 503, LIVE_BUSY: 429,
};

// Browsers send Origin on cross-origin POSTs and Sec-Fetch-Site always; a page on another origin can never trigger a live run.
function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site"); if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin"); if (!origin) return true; // non-browser caller: still needs the ack, credential and grant
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export function createAuditService(deps: AuditServiceDeps) {
  const now = deps.now ?? Date.now;
  const attempts: number[] = [];
  // In-memory and per process: it protects the endpoint from being hammered (every attempt costs file I/O), while the
  // owner's grant remains the authority on how many provider requests may ever be made.
  function liveAttemptAllowed(): boolean {
    const t = now(); while (attempts.length && t - attempts[0]! > 60_000) attempts.shift();
    if (attempts.length >= LIVE_ATTEMPTS_PER_MINUTE) return false;
    attempts.push(t); return true;
  }
  async function liveGate(): Promise<Catalog["live_gate"]> {
    const locked = (reason: Exclude<Catalog["live_gate"]["reason"], "READY">): Catalog["live_gate"] =>
      ({ status: "LOCKED", reason, detail: LOCK_DETAIL[reason]!, remaining_requests: null, remaining_runs: null, expires_at: null });
    if (deps.liveDisabled?.()) return locked("LIVE_DISABLED");
    // The credential VALUE is never read here: only whether a live configuration loads.
    try { if (deps.liveConfig().mode !== "live") return locked("CREDENTIAL_NOT_CONFIGURED"); } catch { return locked("CREDENTIAL_NOT_CONFIGURED"); }
    const grant = await loadLiveGrant(deps.projectRoot, now());
    if (!grant.ok) return locked(grant.reason);
    let budget; try { budget = await readLiveBudget(deps.projectRoot, grant.grant); } catch { return locked("LEDGER_UNAVAILABLE"); }
    const remainingRuns = grant.grant.max_runs - budget.runs_used; const remainingRequests = grant.grant.max_requests - budget.requests_reserved;
    if (remainingRuns <= 0) return locked("LIVE_RUN_LIMIT_REACHED");
    if (remainingRequests <= 0) return locked("LIVE_BUDGET_EXHAUSTED");
    return { status: "AVAILABLE", reason: "READY", remaining_requests: remainingRequests, remaining_runs: remainingRuns, expires_at: grant.grant.expires_at,
      detail: "An owner-created live grant is active. A live run still needs your explicit confirmation each time." };
  }

  async function catalog(): Promise<Response> {
    try {
      const recorded = await deps.recordings().catch(() => null); const live = await liveGate();
      const shortlist = recorded?.shortlist.state;
      const body: Catalog = CatalogSchema.parse({
        modes: { synthetic: "AVAILABLE", recorded_live: recorded ? "AVAILABLE" : "UNAVAILABLE", live: live.status },
        scenarios: [
          { id: RECORDED_SCENARIO_ID, label: RECORDED_SCENARIO_LABEL, mode: "recorded_live", available: !!recorded, input: getRecordedScenarioInput() },
          ...ScenarioIdSchema.options.map((id) => ({ id, label: scenarioLabels[id], mode: "fixture", available: true, input: getScenario(id).input })),
        ],
        // Public metadata only (probe, attempt, endpoint, time, status, byte count); never bodies, IDs or hashes.
        recorded_history: recorded ? recorded.history.map((h) => ({ ...h })) : [],
        recorded_coverage: recorded ? recordedCoverage(recorded) : { artist: [], movie: [], place: [], tag: [] },
        pending_request: shortlist === "NOT_EXECUTED" ? { id: "P06", state: "OWNER_APPROVAL_REQUIRED",
          detail: "Shortlist ranking (P06) is prepared but has never been executed. It needs the owner's explicit approval." } :
          shortlist === "REVIEW_REQUIRED" ? { id: "P06", state: "REVIEW_REQUIRED", detail: "The approved shortlist request ran; its response is awaiting local review before it can be replayed." } : null,
        live_gate: live, custom_input: CUSTOM_INPUT_LIMITS,
      });
      return Response.json(body, { headers });
    } catch { return fail(500, "CATALOG_UNAVAILABLE"); }
  }

  async function audit(request: Request): Promise<Response> {
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return fail(415, "JSON_REQUIRED");
    const read = await readJson(request, MAX_REQUEST_BYTES);
    if (!read.ok) return fail(read.status, read.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST");
    const parsed = requestSchema.safeParse(read.value); if (!parsed.success) return fail(400, "INVALID_REQUEST");
    const decided = plan(parsed.data); if (!decided.ok) return decided.response;
    const chosen = decided.plan;

    if (chosen.kind === "fixture") {
      try { const fixture = getScenario(chosen.scenario); return Response.json(await runAudit(fixture.input, createFixtureAdapter(fixture.world), { signal: request.signal }), { headers }); }
      catch { return fail(500, "OFFLINE_AUDIT_FAILED"); } // no exception text, fixture internals or configuration
    }
    const options = { scenarioId: chosen.scenarioId, insightsPolicy: RECORDED_INSIGHTS_POLICY, confirmations: chosen.confirmations, signal: request.signal };
    if (chosen.source === "recorded") {
      let adapter: ReturnType<typeof createRecordedAdapter>;
      try { adapter = createRecordedAdapter(await deps.recordings()); }
      catch {
        // The curated recorded scenario IS its recordings, so it cannot run without them. A custom plan can: it is audited with
        // no provider evidence at all (every lookup UNKNOWN), and the report says so.
        if (chosen.scenarioId !== CUSTOM_SCENARIO_ID) return fail(503, "RECORDED_EVIDENCE_UNAVAILABLE");
        adapter = createEmptyRecordedAdapter();
      }
      try { return Response.json(await runRecordedAudit(chosen.input, adapter, options), { headers }); } catch { return fail(500, "RECORDED_AUDIT_FAILED"); }
    }

    // ---- AUTHORIZED_LIVE: every gate below runs before any provider request could exist. ----
    if (deps.liveDisabled?.()) return fail(403, "LIVE_UNAVAILABLE", { reason: "LIVE_DISABLED" });
    if (parsed.data.live_ack !== LIVE_ACK) return fail(403, "LIVE_ACK_REQUIRED");
    if (!sameOrigin(request)) return fail(403, "CROSS_ORIGIN_REFUSED");
    if (!liveAttemptAllowed()) return fail(429, "LIVE_RATE_LIMITED");
    const session = await openAuthorizedLiveSession({ projectRoot: deps.projectRoot, config: deps.liveConfig, send: deps.send, now });
    if (session.status !== "AVAILABLE") return fail(LIVE_STATUS[session.reason], "LIVE_UNAVAILABLE", { reason: session.reason });
    try { return Response.json(await runAuthorizedLiveAudit(chosen.input, session.adapter, options), { headers }); }
    catch { return fail(500, "LIVE_AUDIT_FAILED"); }
    finally { session.close(); }
  }
  return Object.freeze({ catalog, audit });
}
