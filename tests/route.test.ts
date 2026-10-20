import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/audit/route";
import { CatalogSchema, MAX_REQUEST_BYTES } from "../src/domain/catalog";
import { AuditReportSchema, ProviderAuditReportSchema } from "../src/domain/report-schema";

function request(body: unknown) {
  return new Request("http://127.0.0.1/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
describe("offline HTTP boundary", () => {
  it("executes the selected fixture scenario and returns a validated no-cache report", async () => {
    const response = await POST(request({ scenario: "wrong-city-repair" }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const report = AuditReportSchema.parse(await response.json()); expect(report.final_status).toBe("PASS"); expect(report.source_mode).toBe("fixture");
  });
  it.each([{ scenario: "unknown" }, { scenario: "nyc-evening", mode: "live" }, { scenario: "nyc-evening", maxCalls: 1000 }, { scenario: "nyc-evening", evidence: [] }])("rejects untrusted parameters %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
  });
  it("bounds bytes even without a Content-Length header", async () => {
    expect((await POST(request({ scenario: "nyc-evening", padding: "x".repeat(MAX_REQUEST_BYTES + 1) }))).status).toBe(413);
  });
  it("rejects malformed JSON and wrong content type", async () => {
    const malformed = new Request("http://127.0.0.1/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    expect((await POST(malformed)).status).toBe(400);
    expect((await POST(new Request("http://127.0.0.1/api/audit", { method: "POST", body: "hello" }))).status).toBe(415);
    expect((await POST(new Request("http://127.0.0.1/api/audit", { method: "POST", headers: { "Content-Type": "application/jsonp" }, body: "{}" }))).status).toBe(415);
  });
});

// The real route reads the owner's private recordings only when they exist on this machine.
const recordedHere = existsSync("private/qloo-probes/p05/attempts/154bd4c0-ea64-49c5-ad95-cb57efd7647a/response.raw.json");
describe("catalog and recorded-evidence boundary", () => {
  it("publishes modes, authored scenario inputs and public recording metadata only", async () => {
    const response = await GET(); expect(response.headers.get("cache-control")).toBe("no-store");
    const catalog = CatalogSchema.parse(await response.json());
    // Live is locked unless this machine has a credential AND an owner-created grant; the shared test environment has neither.
    expect(catalog.modes).toEqual({ synthetic: "AVAILABLE", recorded_live: recordedHere ? "AVAILABLE" : "UNAVAILABLE", live: catalog.live_gate.status });
    expect(catalog.scenarios.map((s) => s.mode)).toEqual(["recorded_live", ...Array(6).fill("fixture")]);
    for (const h of catalog.recorded_history) expect(Object.keys(h).sort()).toEqual(expect.arrayContaining(["attempt_id", "endpoint", "http_status", "outcome", "probe", "recorded_at", "response_bytes"]));
    expect(JSON.stringify(catalog)).not.toMatch(/qloo-ref:|sha256|entity_id/);
  });
  it.each([
    { scenario: "nyc-evening", confirmations: [] },
    { scenario: "recorded-nyc-evening", confirmations: [{ target_id: "unknown-slot", decision: "skip" }] },
    { scenario: "recorded-nyc-evening", confirmations: [{ target_id: "p1", decision: "select", ref: "raw-provider-id" }] },
    { scenario: "recorded-nyc-evening", mode: "live" },
    { scenario: "recorded-nyc-evening", insights_policy: { signal_scope: "all_confirmed" } },
    { scenario: "recorded-nyc-evening", source: "fixture" },
    { scenario: "nyc-evening", source: "live", live_ack: "RUN_LIVE_QLOO_REQUESTS" },
  ])("rejects untrusted recorded/confirmation input %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
  });
  // Deliberately WITHOUT the acknowledgement: this suite must never be able to start a live run, whatever credential or
  // grant happens to exist on the machine that runs it. The positive live paths are covered with injected doubles.
  it("refuses a live request that lacks the explicit acknowledgement before reserving or sending anything", async () => {
    const response = await POST(request({ scenario: "recorded-nyc-evening", source: "live" }));
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: "LIVE_ACK_REQUIRED" });
  });
  it("runs the recorded scenario only from verified private recordings, never contacting Qloo", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(request({ scenario: "recorded-nyc-evening" }));
    if (!recordedHere) { expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "RECORDED_EVIDENCE_UNAVAILABLE" }); return; }
    expect(response.status).toBe(200);
    const report = ProviderAuditReportSchema.parse(await response.json());
    expect(report).toMatchObject({ source_mode: "recorded_live", stop_reason: "NEEDS_INPUT", usage: { qloo_dispatches: 0 } });
    expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
  });
});
