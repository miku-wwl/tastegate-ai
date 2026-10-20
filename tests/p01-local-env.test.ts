import https from "node:https";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadLocalP01Config } from "../src/qloo/p01-local-env";

const syntheticKey = "synthetic-env-test-credential-never-issued";
let testBootstrapArgs: string[];
beforeEach(() => {
  testBootstrapArgs = process.execArgv; process.execArgv = [];
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External network forbidden"));
  vi.spyOn(https, "request").mockImplementation(() => { throw new Error("External network forbidden"); });
});
afterEach(() => {
  process.execArgv = testBootstrapArgs;
  expect(globalThis.fetch).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled(); vi.restoreAllMocks();
});
async function root() {
  await mkdir(".artifacts", { recursive: true }); const path = await mkdtemp(resolve(".artifacts/p01-env-test-"));
  execFileSync("git", ["init", "--quiet", path], { windowsHide: true, stdio: "ignore" });
  await writeFile(join(path, ".gitignore"), ".env*\nprivate/\n.cache/\n"); return path;
}
async function envFile(path: string, contents: string) {
  await writeFile(join(path, ".env.local"), contents, { mode: 0o600 });
  if (process.platform !== "win32") await chmod(join(path, ".env.local"), 0o600);
}
it("loads an ignored local env only inside Node without expanding values or mutating process.env", async () => {
  const path = await root(); const before = process.env.QLOO_API_KEY;
  await envFile(path, `QLOO_MODE=live\nQLOO_API_KEY='${syntheticKey}'\nQLOO_BASE_URL=https://hackathon.api.qloo.com\n`);
  const loaded = await loadLocalP01Config(path, {});
  expect(loaded).toMatchObject({ env_file: "LOADED", credential_configured: true, credential_source: "private_env_file" });
  expect(loaded.config.credentialHeaders()["X-Api-Key"]).toBe(syntheticKey);
  expect(JSON.stringify(loaded)).not.toContain(syntheticKey); expect(process.env.QLOO_API_KEY).toBe(before);
});
it("keeps process env precedence and blocks a missing key, wrong mode, or unsafe host", async () => {
  const path = await root(); const absent = await loadLocalP01Config(path, {});
  expect(absent).toMatchObject({ env_file: "ABSENT", credential_configured: false }); expect(absent.config.mode).toBe("fixture");
  await expect(loadLocalP01Config(path, { QLOO_MODE: "live" })).rejects.toThrow("CONFIG_BLOCKED");
  await envFile(path, `QLOO_MODE=live\nQLOO_API_KEY=${syntheticKey}\n`);
  const fixture = await loadLocalP01Config(path, { QLOO_MODE: "fixture" }); expect(fixture.config.mode).toBe("fixture");
  await expect(loadLocalP01Config(path, { QLOO_BASE_URL: "https://hackathon.api.qloo.com.evil.test" })).rejects.toThrow("CONFIG_BLOCKED");
  await expect(loadLocalP01Config(path, { NEXT_PUBLIC_QLOO_API_KEY: syntheticKey })).rejects.toThrow("CONFIG_BLOCKED");
});
it.each(["NODE_OPTIONS=--require=untrusted.cjs", "NODE_TLS_REJECT_UNAUTHORIZED=0", "NODE_DEBUG=*", "SSLKEYLOGFILE=private.log"])("does not apply unsafe dotenv settings: %s", async (unsafe) => {
  const path = await root(); await envFile(path, `QLOO_MODE=live\nQLOO_API_KEY=${syntheticKey}\n${unsafe}\n`);
  await expect(loadLocalP01Config(path, {})).rejects.toThrow("UNSAFE_DIAGNOSTICS");
});
it("rejects actual runtime preload/diagnostic arguments before local env loading", async () => {
  process.execArgv = ["--require=untrusted.cjs"];
  await expect(loadLocalP01Config(await root(), {})).rejects.toThrow("UNSAFE_DIAGNOSTICS");
});
it("rejects linked, oversized, unignored and tracked dotenv state without printing contents", async () => {
  const path = await root(); const target = join(path, "synthetic-secret-file"); await writeFile(target, "test-only");
  // File symlinks may need elevation on Windows; a junction to a directory is also invalid dotenv state.
  const linkTarget = process.platform === "win32" ? await root() : target;
  await symlink(linkTarget, join(path, ".env.local"), process.platform === "win32" ? "junction" : "file");
  await expect(loadLocalP01Config(path, {})).rejects.toThrow("PRIVATE_ENV_UNAVAILABLE");
  const large = await root(); await envFile(large, "x".repeat(16_385));
  await expect(loadLocalP01Config(large, {})).rejects.toThrow("PRIVATE_ENV_UNAVAILABLE");
  const unignored = await root(); await writeFile(join(unignored, ".gitignore"), "");
  await expect(loadLocalP01Config(unignored, {})).rejects.toThrow("PRIVATE_ENV_NOT_IGNORED");
  const tracked = await root(); await envFile(tracked, `QLOO_API_KEY=${syntheticKey}`);
  execFileSync("git", ["-C", tracked, "add", "--force", ".env.local"], { windowsHide: true, stdio: "ignore" });
  await expect(loadLocalP01Config(tracked, {})).rejects.toThrow("PRIVATE_ENV_NOT_IGNORED");
});
it("provides CLI preflight with a local dotenv credential, zero reservations and no default dispatch", async () => {
  const path = await root();
  for (const name of ["boundary-error", "server-config", "p01-profile", "p01-local-env", "p01-runner", "p01-private-store",
    "p02-profile", "p02-private-store", "p03-profile", "p03-private-store", "p04-profile", "p04-private-store",
    "p03r-profile", "p03r-private-store", "p05-profile", "p05-signal", "p06-profile", "p06-shortlist", "probe-cli-contract",
    "probe-definitions", "raw-probe-runner", "raw-probe-store", "p01-reuse", "search-observation"]) {
    const dest = join(path, "src/qloo", name + ".ts"); await mkdir(dirname(dest), { recursive: true });
    await copyFile(resolve("src/qloo", name + ".ts"), dest);
  }
  await mkdir(join(path, "scripts")); await copyFile(resolve("scripts/qloo-probe.mjs"), join(path, "scripts/qloo-probe.mjs"));
  await copyFile(resolve("scripts/probe-cli.mjs"), join(path, "scripts/probe-cli.mjs"));
  await writeFile(join(path, "package.json"), '{"type":"module"}');
  await symlink(resolve("node_modules"), join(path, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await envFile(path, `QLOO_MODE=live\nQLOO_API_KEY=${syntheticKey}\n`);
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/^(?:QLOO_|NEXT_PUBLIC_QLOO|NODE_DEBUG|NODE_DEBUG_NATIVE|NODE_OPTIONS|SSLKEYLOGFILE|NODE_TLS_REJECT_UNAUTHORIZED)/.test(name)) delete env[name];
  const run = (args: string[]) => spawnSync(process.execPath, [join(path, "scripts/qloo-probe.mjs"), ...args], { cwd: path, env, encoding: "utf8", windowsHide: true });
  const preview = run([]); expect(preview.status).toBe(0); expect(JSON.parse(preview.stdout).summary.dispatches).toBe(0);
  const preflight = run(["--preflight-p01"]); expect(preflight.status).toBe(0);
  expect(JSON.parse(preflight.stdout).preflight).toMatchObject({ status: "READY_FOR_HUMAN_APPROVAL", credential_configured: true,
    env_file: "LOADED", dispatches: 0, approval: "NOT_GRANTED_BY_PREFLIGHT", ledger: { reserved_attempts: 0, recorded_dispatches: 0 } });
  expect(preflight.stdout + preflight.stderr + preview.stdout + preview.stderr).not.toContain(syntheticKey);
  expect(await readdir(join(path, "private/qloo-probes/p01/attempts"))).toEqual([]);
  const force = run(["--force"]); expect(force.status).toBe(2); expect(force.stdout + force.stderr).not.toContain(syntheticKey);
  expect(await readFile(join(path, ".env.local"), "utf8")).toContain(syntheticKey);
});
