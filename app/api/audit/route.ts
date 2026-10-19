import { z } from "zod";
import { runAudit, runRecordedAudit } from "../../../src/audit/workflow";
import { ConfirmationsSchema } from "../../../src/domain/contracts";
import { getScenario, scenarioLabels, ScenarioIdSchema } from "../../../src/fixtures/scenarios";
import { createFixtureAdapter } from "../../../src/qloo/fixture-adapter";
import { createRecordedAdapter, loadRecordedEvidence } from "../../../src/qloo/recorded-adapter";
import { RECORDED_INSIGHTS_POLICY, RECORDED_SCENARIO_ID, RECORDED_SCENARIO_LABEL, getRecordedScenarioInput } from "../../../src/scenarios/recorded-nyc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The scenario ID alone selects the trusted mode. The browser never supplies a mode, provenance,
// budget, policy, path or provider ID; confirmations can only choose among candidates returned in-run.
const requestSchema = z.strictObject({ scenario: z.union([ScenarioIdSchema, z.literal(RECORDED_SCENARIO_ID)]), confirmations: ConfirmationsSchema.optional() });
const headers = { "Cache-Control": "no-store" };
// Owner's private captures are read from the server's working directory only.
const recordings = () => loadRecordedEvidence(process.cwd());

export async function GET(): Promise<Response> {
  const recorded = await recordings().catch(() => null);
  return Response.json({
    modes: { synthetic: "AVAILABLE", recorded_live: recorded ? "AVAILABLE" : "UNAVAILABLE", live: "LOCKED" },
    scenarios: [
      { id: RECORDED_SCENARIO_ID, label: RECORDED_SCENARIO_LABEL, mode: "recorded_live", available: !!recorded, input: getRecordedScenarioInput() },
      ...ScenarioIdSchema.options.map((id) => ({ id, label: scenarioLabels[id], mode: "fixture", available: true, input: getScenario(id).input })),
    ],
    // Public metadata only (probe, attempt, endpoint, time, status, byte count); never bodies, IDs or hashes.
    recorded_history: recorded?.history ?? [],
    live_gate: { status: "OWNER_APPROVAL_REQUIRED", next_request: "P06",
      detail: "Live Qloo requests are locked. The next prepared request (P06 shortlist ranking) needs explicit owner approval." },
  }, { headers });
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
    return Response.json({ error: "JSON_REQUIRED" }, { status: 415, headers });
  // Bounded streaming read, independent of an optional Content-Length header.
  const reader = request.body?.getReader(); let body = ""; let bytes = 0;
  if (!reader) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  let parsed: ReturnType<typeof requestSchema.safeParse>;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024) { await reader.cancel(); return Response.json({ error: "REQUEST_TOO_LARGE" }, { status: 413, headers }); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    parsed = requestSchema.safeParse(JSON.parse(body));
  } catch {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  } finally { reader.releaseLock(); }
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  const { scenario, confirmations } = parsed.data;
  if (scenario === RECORDED_SCENARIO_ID) {
    const input = getRecordedScenarioInput();
    const targets = new Set([...input.preferences.map((p) => p.id), ...input.recommendations.map((r) => r.id)]);
    if (confirmations?.some((c) => !targets.has(c.target_id))) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
    let adapter: ReturnType<typeof createRecordedAdapter>;
    try { adapter = createRecordedAdapter(await recordings()); }
    catch { return Response.json({ error: "RECORDED_EVIDENCE_UNAVAILABLE" }, { status: 503, headers }); }
    try {
      const report = await runRecordedAudit(input, adapter, { scenarioId: RECORDED_SCENARIO_ID, insightsPolicy: RECORDED_INSIGHTS_POLICY,
        confirmations: confirmations ?? [], signal: request.signal });
      return Response.json(report, { headers });
    } catch {
      return Response.json({ error: "RECORDED_AUDIT_FAILED" }, { status: 500, headers });
    }
  }
  if (confirmations !== undefined) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  try {
    const fixture = getScenario(scenario);
    const report = await runAudit(fixture.input, createFixtureAdapter(fixture.world), { signal: request.signal });
    return Response.json(report, { headers });
  } catch {
    // Do not leak exception text, fixture internals or server configuration.
    return Response.json({ error: "OFFLINE_AUDIT_FAILED" }, { status: 500, headers });
  }
}
