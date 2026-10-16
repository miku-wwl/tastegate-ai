import { describe, expect, it } from "vitest";
import { POST } from "../app/api/audit/route";
import { AuditReportSchema } from "../src/domain/report-schema";

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
    expect((await POST(request({ scenario: "nyc-evening", padding: "x".repeat(2048) }))).status).toBe(413);
  });
  it("rejects malformed JSON and wrong content type", async () => {
    const malformed = new Request("http://127.0.0.1/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    expect((await POST(malformed)).status).toBe(400);
    expect((await POST(new Request("http://127.0.0.1/api/audit", { method: "POST", body: "hello" }))).status).toBe(415);
    expect((await POST(new Request("http://127.0.0.1/api/audit", { method: "POST", headers: { "Content-Type": "application/jsonp" }, body: "{}" }))).status).toBe(415);
  });
});
