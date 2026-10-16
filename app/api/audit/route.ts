import { z } from "zod";
import { runAudit } from "../../../src/audit/workflow";
import { getScenario, ScenarioIdSchema } from "../../../src/fixtures/scenarios";
import { createFixtureAdapter } from "../../../src/qloo/fixture-adapter";

export const runtime = "nodejs";
const requestSchema = z.strictObject({ scenario: ScenarioIdSchema });
const headers = { "Cache-Control": "no-store" };
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
  try {
    const scenario = getScenario(parsed.data.scenario);
    const report = await runAudit(scenario.input, createFixtureAdapter(scenario.world), { signal: request.signal });
    return Response.json(report, { headers });
  } catch {
    // Do not leak exception text, fixture internals or server configuration.
    return Response.json({ error: "OFFLINE_AUDIT_FAILED" }, { status: 500, headers });
  }
}
