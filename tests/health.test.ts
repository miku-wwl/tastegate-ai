import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "../app/api/health/route";

afterEach(() => { vi.unstubAllEnvs(); });
const json = async (r: Response) => await r.json() as Record<string, unknown>;

describe("/api/health: liveness plus configuration, and nothing else", () => {
  it("is 200 and ok for a valid configuration, with fixed labels and process figures only", async () => {
    vi.stubEnv("TASTEGATE_PROFILE", "production-safe"); vi.stubEnv("NODE_ENV", "production");
    const r = await GET(); expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("no-store"); expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await json(r);
    expect(body).toMatchObject({ status: "ok", profile: "production-safe", profile_source: "explicit", recorded_replay: "DISABLED_BY_PROFILE", live: "DISABLED_BY_PROFILE", config_errors: [], config_warnings: [] });
    expect(Object.keys(body).sort()).toEqual(["config_errors", "config_warnings", "live", "memory_mb", "profile", "profile_source", "recorded_replay", "status", "uptime_s"]);
    expect(body.memory_mb).toEqual({ rss: expect.any(Number), heap_used: expect.any(Number) }); expect(body.uptime_s).toEqual(expect.any(Number));
  });
  it("is 503 degraded when the configuration is invalid, and reports the error code but never a value", async () => {
    vi.stubEnv("TASTEGATE_PROFILE", "production-safe"); vi.stubEnv("QLOO_API_KEY", "authored-secret-value-123"); vi.stubEnv("NEXT_PUBLIC_QLOO_API_KEY", "another-secret-value-456");
    const r = await GET(); expect(r.status).toBe(503); const body = await json(r);
    expect(body).toMatchObject({ status: "degraded", profile: "production-safe", config_errors: ["CREDENTIAL_PRESENT_BUT_NOT_ALLOWED", "PUBLIC_SECRET_VARIABLE"] });
    expect(JSON.stringify(body)).not.toMatch(/secret-value/);
  });
  it("shows the development profile as owner-grant-gated live, never as open", async () => {
    vi.stubEnv("TASTEGATE_PROFILE", "development");
    expect(await json(await GET())).toMatchObject({ status: "ok", profile: "development", recorded_replay: "ENABLED", live: "OWNER_GRANT_REQUIRED" });
  });
  it("reports the reserved production-live profile as refused and serves as production-safe", async () => {
    vi.stubEnv("TASTEGATE_PROFILE", "production-live");
    const r = await GET(); expect(r.status).toBe(503);
    expect(await json(r)).toMatchObject({ status: "degraded", profile: "production-safe", live: "DISABLED_BY_PROFILE", config_errors: ["PRODUCTION_LIVE_NOT_AUTHORIZED"] });
  });
  it("answers HEAD with the same status and no body", async () => {
    vi.stubEnv("TASTEGATE_PROFILE", "production-safe"); const ok = await HEAD(); expect(ok.status).toBe(200); expect(await ok.text()).toBe("");
    vi.stubEnv("TASTEGATE_PROFILE", "bogus"); expect((await HEAD()).status).toBe(503);
  });
  it("reads no file and contacts no host", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite"));
    await GET(); expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
  });
});
