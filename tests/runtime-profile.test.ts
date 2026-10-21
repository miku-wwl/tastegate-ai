import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateStartup } from "../scripts/start-production.mjs";
import { PRODUCTION_LIVE_AUTHORIZED, PROFILES, defaultProfile, profileSummary, resolveRuntimeProfile } from "../src/server/runtime-profile";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
const codes = (env: Record<string, string>) => resolveRuntimeProfile(env).issues.filter((i) => i.severity === "error").map((i) => i.code);

describe("runtime profiles: a safe default, and invalid configuration can only restrict", () => {
  it("defaults to production-safe for a production build, test under a test runner and development otherwise", () => {
    expect(defaultProfile({ NODE_ENV: "production" })).toBe("production-safe"); expect(defaultProfile({ NODE_ENV: "test" })).toBe("test");
    expect(defaultProfile({ VITEST: "true" })).toBe("test"); expect(defaultProfile({ NODE_ENV: "development" })).toBe("development"); expect(defaultProfile({})).toBe("development");
    expect(resolveRuntimeProfile({ NODE_ENV: "production" })).toMatchObject({ profile: "production-safe", source: "default", ok: true });
  });
  it.each([
    ["development", { recorded_replay: true, live_possible: true, live_environment: "DEVELOPMENT", public_facing: false, credential_allowed: true }],
    ["test", { recorded_replay: false, live_possible: false, live_environment: null, public_facing: false, credential_allowed: false }],
    ["recorded-local", { recorded_replay: true, live_possible: false, live_environment: null, public_facing: false, credential_allowed: false }],
    ["production-safe", { recorded_replay: false, live_possible: false, live_environment: null, public_facing: true, credential_allowed: false }],
  ] as const)("the %s profile has exactly these capabilities", (profile, capabilities) => {
    expect(resolveRuntimeProfile({ TASTEGATE_PROFILE: profile, NODE_ENV: "production" })).toMatchObject({ profile, source: "explicit", ok: true, capabilities });
  });
  it("production-live is reserved: it is refused, cannot be enabled by an environment variable, and falls back to the safest profile", () => {
    expect(PRODUCTION_LIVE_AUTHORIZED).toBe(false);
    for (const extra of [{}, { QLOO_API_KEY: "authored-value" }, { TASTEGATE_ENABLE_PRODUCTION_LIVE: "1" }, { TASTEGATE_PRODUCTION_LIVE_AUTHORIZED: "true" }, { TASTEGATE_DISABLE_LIVE: "0" }]) {
      const r = resolveRuntimeProfile({ TASTEGATE_PROFILE: "production-live", NODE_ENV: "production", ...extra });
      expect(r).toMatchObject({ ok: false, profile: "production-safe" }); expect(r.issues.map((i) => i.code)).toContain("PRODUCTION_LIVE_NOT_AUTHORIZED");
      expect(r.capabilities).toMatchObject({ live_possible: false, recorded_replay: false, public_facing: true });
    }
  });
  it.each(["staging", "PRODUCTION-SAFE", "production", "dev", "live", "../private", "development ; live"])("an unknown profile (%j) is an error and restricts to production-safe", (name) => {
    const r = resolveRuntimeProfile({ TASTEGATE_PROFILE: name, NODE_ENV: "production" });
    expect(r).toMatchObject({ ok: false, profile: "production-safe", issues: [{ code: "UNKNOWN_PROFILE", severity: "error" }] });
  });
  it("a blank profile variable is the same as an unset one", () => { expect(resolveRuntimeProfile({ TASTEGATE_PROFILE: "   ", NODE_ENV: "production" })).toMatchObject({ profile: "production-safe", source: "default", ok: true }); });
  it("a credential, live mode or an LLM key on a profile that must not use them is an error, not a silent ignore", () => {
    for (const profile of ["production-safe", "recorded-local", "test"] as const) {
      expect(codes({ TASTEGATE_PROFILE: profile, QLOO_API_KEY: "authored-value" })).toEqual(["CREDENTIAL_PRESENT_BUT_NOT_ALLOWED"]);
      expect(codes({ TASTEGATE_PROFILE: profile, LLM_API_KEY: "authored-value" })).toEqual(["CREDENTIAL_PRESENT_BUT_NOT_ALLOWED"]);
      expect(codes({ TASTEGATE_PROFILE: profile, QLOO_MODE: "live" })).toEqual(["LIVE_MODE_NOT_ALLOWED"]);
    }
    expect(codes({ TASTEGATE_PROFILE: "development", QLOO_API_KEY: "authored-value", QLOO_MODE: "live" })).toEqual([]); // the owner's machine may hold a credential
    expect(codes({ NODE_ENV: "production", QLOO_API_KEY: "authored-value" })).toEqual(["CREDENTIAL_PRESENT_BUT_NOT_ALLOWED"]); // ... but a default production host may not
  });
  it("a secret-looking NEXT_PUBLIC variable is an error in every profile", () => {
    for (const profile of PROFILES.filter((p) => p !== "production-live")) for (const name of ["NEXT_PUBLIC_QLOO_API_KEY", "NEXT_PUBLIC_SECRET", "NEXT_PUBLIC_AUTH_TOKEN", "NEXT_PUBLIC_DB_PASSWORD"])
      expect(codes({ TASTEGATE_PROFILE: profile, [name]: "authored-value" })).toContain("PUBLIC_SECRET_VARIABLE");
    expect(codes({ TASTEGATE_PROFILE: "development", NEXT_PUBLIC_APP_NAME: "TasteGate" })).toEqual([]);
    expect(codes({ TASTEGATE_PROFILE: "development", NEXT_PUBLIC_QLOO_API_KEY: "" })).toEqual([]);
  });
  it("invalid configuration never widens: whatever is wrong, the effective capabilities are those of production-safe", () => {
    for (const env of [{ TASTEGATE_PROFILE: "development", NEXT_PUBLIC_QLOO_API_KEY: "authored-value" }, { TASTEGATE_PROFILE: "recorded-local", QLOO_API_KEY: "authored-value" }, { TASTEGATE_PROFILE: "bogus" }]) {
      const r = resolveRuntimeProfile(env); expect(r.ok).toBe(false); expect(r.profile).toBe("production-safe"); expect(r.capabilities.recorded_replay || r.capabilities.live_possible).toBe(false);
    }
  });
  it("warns, without failing, about a public profile outside a production build", () => {
    expect(resolveRuntimeProfile({ TASTEGATE_PROFILE: "production-safe", NODE_ENV: "development" })).toMatchObject({ ok: true, issues: [{ code: "PUBLIC_PROFILE_OUTSIDE_PRODUCTION_BUILD", severity: "warning" }] });
    expect(resolveRuntimeProfile({ NODE_ENV: "development" }).issues).toEqual([]);
  });
  it("the summary carries fixed labels and codes only: no environment value", () => {
    const summary = profileSummary(resolveRuntimeProfile({ TASTEGATE_PROFILE: "recorded-local", QLOO_API_KEY: "authored-secret-value", NEXT_PUBLIC_KEY: "another-secret-value" }));
    const printed = JSON.stringify(summary); expect(printed).not.toMatch(/authored-secret-value|another-secret-value/);
    expect(summary).toMatchObject({ profile: "production-safe", recorded_replay: "DISABLED_BY_PROFILE", live: "DISABLED_BY_PROFILE", config_errors: ["CREDENTIAL_PRESENT_BUT_NOT_ALLOWED", "PUBLIC_SECRET_VARIABLE"] });
  });
});

describe("the start script and the TypeScript profile agree", () => {
  const variables = ["", "production-safe", "recorded-local", "development", "test", "production-live", "staging"];
  const cases: Array<Record<string, string>> = [];
  for (const TASTEGATE_PROFILE of variables) for (const NODE_ENV of ["", "production", "development", "test"]) for (const credential of [false, true]) for (const mode of ["", "live"]) for (const publicSecret of [false, true]) {
    const env: Record<string, string> = {}; if (TASTEGATE_PROFILE) env.TASTEGATE_PROFILE = TASTEGATE_PROFILE; if (NODE_ENV) env.NODE_ENV = NODE_ENV;
    if (credential) env.QLOO_API_KEY = "authored-value"; if (mode) env.QLOO_MODE = mode; if (publicSecret) env.NEXT_PUBLIC_QLOO_API_KEY = "authored-value"; cases.push(env);
  }
  it(`yields the same errors and effective profile for all ${cases.length} combinations`, () => {
    for (const env of cases) {
      const ts = resolveRuntimeProfile(env); const js = validateStartup(env);
      expect(js.errors.sort(), JSON.stringify(env)).toEqual(ts.issues.filter((i) => i.severity === "error").map((i) => i.code).sort()); expect(js.profile, JSON.stringify(env)).toBe(ts.profile);
    }
  });
  it("--check exits 0 for a valid configuration and 78 for an invalid one, printing codes only", () => {
    const run = (env: Record<string, string>) => spawnSync(process.execPath, ["scripts/start-production.mjs", "--check"], { env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env } as unknown as NodeJS.ProcessEnv, encoding: "utf8" });
    const ok = run({ NODE_ENV: "production" }); expect(ok.status).toBe(0); expect(JSON.parse(ok.stdout)).toEqual({ status: "VALID", profile: "production-safe", errors: [] });
    const bad = run({ NODE_ENV: "production", QLOO_API_KEY: "authored-secret-value", TASTEGATE_PROFILE: "production-live" });
    expect(bad.status).toBe(78); expect(JSON.parse(bad.stdout)).toMatchObject({ status: "REFUSED", errors: expect.arrayContaining(["PRODUCTION_LIVE_NOT_AUTHORIZED"]) });
    expect(bad.stdout + bad.stderr).not.toContain("authored-secret-value");
  });
  it("the audit route follows the profile: a public profile never loads recordings or allows live, whatever files exist", async () => {
    vi.stubEnv("TASTEGATE_PROFILE", "production-safe");
    const { GET, POST } = await import("../app/api/audit/route");
    const catalog = await (await GET()).json() as { modes: Record<string, string>; recorded_history: unknown[]; live_gate: { status: string; reason: string } };
    expect(catalog.modes.recorded_live).toBe("UNAVAILABLE"); expect(catalog.recorded_history).toEqual([]); expect(catalog.live_gate).toMatchObject({ status: "LOCKED", reason: "LIVE_DISABLED" });
    const live = await POST(new Request("http://127.0.0.1/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: "recorded-nyc-evening", source: "live", live_ack: "RUN_LIVE_QLOO_REQUESTS" }) }));
    expect(live.status).toBe(403); expect(await live.json()).toEqual({ error: "LIVE_UNAVAILABLE", reason: "LIVE_DISABLED" });
    const recorded = await POST(new Request("http://127.0.0.1/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: "recorded-nyc-evening" }) }));
    expect(recorded.status).toBe(503); expect(await recorded.json()).toEqual({ error: "RECORDED_EVIDENCE_UNAVAILABLE" });
  });
  it("an invalid configuration is served as production-safe, not as what was asked for", async () => {
    vi.stubEnv("TASTEGATE_PROFILE", "development"); vi.stubEnv("NEXT_PUBLIC_QLOO_API_KEY", "authored-value");
    const { GET } = await import("../app/api/audit/route"); const catalog = await (await GET()).json() as { modes: Record<string, string>; live_gate: { reason: string } };
    expect(catalog.modes.recorded_live).toBe("UNAVAILABLE"); expect(catalog.live_gate.reason).toBe("LIVE_DISABLED");
  });
});
