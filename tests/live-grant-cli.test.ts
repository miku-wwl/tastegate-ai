import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Against the REAL project root only SAFE paths are exercised: status (read-only) and creations that must be refused. The
// successful lifecycle runs against a throwaway root (TASTEGATE_ADMIN_ROOT), so no test can write a grant into the owner's private directory.
const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/live-grant.mjs", ...args], { encoding: "utf8", timeout: 60_000, env: { ...process.env, QLOO_API_KEY: "" } });
const runIn = (root: string, ...args: string[]) => spawnSync(process.execPath, ["scripts/live-grant.mjs", ...args], { encoding: "utf8", timeout: 60_000, env: { ...process.env, QLOO_API_KEY: "", TASTEGATE_ADMIN_ROOT: root } });
const roots: string[] = [];
afterAll(async () => { for (const r of roots) await rm(r, { recursive: true, force: true }); });
const before = () => existsSync("private/qloo-live") ? readdirSync("private/qloo-live").sort() : null;

describe("owner live-grant CLI: refusals", () => {
  it.each([
    ["no mode", []], ["unknown mode", ["--bogus"]], ["status with extra arguments", ["--status", "--x=1"]], ["revoke with extra arguments", ["--revoke", "--x=1"]],
    ["create without arguments", ["--create"]], ["create with a missing option", ["--create", "--owner-reply=LIVE", "--gate-id=g1", "--minutes=5", "--max-requests=3", "--max-runs=1"]],
    ["create with a non-numeric budget", ["--create", "--owner-reply=LIVE", "--gate-id=g1", "--minutes=five", "--max-requests=3", "--max-runs=1", "--operations=entity_lookup"]],
    ["create with a duplicated option", ["--create", "--owner-reply=LIVE", "--owner-reply=LIVE", "--gate-id=g1", "--minutes=5", "--max-requests=3", "--max-runs=1"]],
  ])("rejects %s without touching the filesystem", (_, args) => {
    const snapshot = before(); const result = run(...args);
    expect(result.status).toBe(2); expect(JSON.parse(result.stderr)).toEqual({ status: "BLOCKED", reason: "INVALID_ARGUMENTS" }); expect(result.stdout).toBe(""); expect(before()).toEqual(snapshot);
  });
  it.each([
    ["an owner reply without LIVE", "go ahead"], ["an owner reply that names a probe", "approve LIVE P06"], ["an empty owner reply", ""],
  ])("refuses to create a grant from %s", (_, reply) => {
    const snapshot = before();
    const result = run("--create", `--owner-reply=${reply}`, "--gate-id=g1", "--minutes=10", "--max-requests=5", "--max-runs=1", "--operations=entity_lookup");
    expect(result.status).toBe(2); expect(JSON.parse(result.stderr)).toEqual({ status: "BLOCKED", reason: "LIVE_GRANT_CREATION_FAILED" }); expect(before()).toEqual(snapshot);
  });
  it.each([["minutes=0"], ["minutes=61"], ["max-requests=0"], ["max-requests=15"], ["max-runs=6"], ["operations=bogus"], ["operations=entity_lookup,entity_lookup"]])("refuses an out-of-bounds budget (%s)", (change) => {
    const snapshot = before(); const base: Record<string, string> = { minutes: "10", "max-requests": "5", "max-runs": "1", operations: "entity_lookup" };
    const [key, value] = change.split("="); base[key!] = value!;
    const result = run("--create", "--owner-reply=Authorize one LIVE session", "--gate-id=g1", ...Object.entries(base).map(([k, v]) => `--${k}=${v}`));
    expect(result.status).toBe(2); expect(JSON.parse(result.stderr).reason).toBe("LIVE_GRANT_CREATION_FAILED"); expect(before()).toEqual(snapshot);
  });
});

describe("owner live-grant CLI: status", () => {
  it("is read-only and public-safe: no credential, provider ID or full grant identifier", () => {
    const snapshot = before(); const result = run("--status");
    expect(result.status).toBe(0); const out = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(["LOCKED", "ACTIVE"]).toContain(out.status);
    if (out.status === "LOCKED") expect(out.reason).toMatch(/^[A-Z_]+$/);
    else { expect(String(out.grant)).toMatch(/^[0-9a-f]{8}$/); expect(Object.keys(out).sort()).toEqual(["approved_at", "expires_at", "grant", "operations", "requests_left", "runs_left", "status"]); }
    expect(before()).toEqual(snapshot);
  });
  it("is wired as an npm script and the script never reads or prints a credential", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["live:grant"]).toBe("node scripts/live-grant.mjs");
    const source = readFileSync("scripts/live-grant.mjs", "utf8");
    expect(source).not.toMatch(/QLOO_API_KEY|LLM_API_KEY|fetch\(|node:https?|X-Api-Key/);
    // The data-root override is the only environment variable the script reads.
    expect([...source.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1])).toEqual(["TASTEGATE_ADMIN_ROOT", "TASTEGATE_ADMIN_ROOT"]);
  });
});

describe("owner live-grant CLI: lifecycle on a throwaway root", () => {
  const fresh = async () => { await mkdir(".artifacts", { recursive: true }); const root = await mkdtemp(resolve(".artifacts/live-cli-")); roots.push(root); await mkdir(join(root, "private"), { mode: 0o700 }); return root; };
  const CREATE = ["--create", "--owner-reply=Authorize one LIVE session", "--gate-id=gate-cli", "--minutes=10", "--max-requests=5", "--max-runs=2", "--operations=entity_lookup,rank_places"];
  it("creates one bounded grant, reports what is left, refuses a second, revokes it, and never touches the real private directory", async () => {
    const root = await fresh(); const realBefore = before();
    expect(JSON.parse(runIn(root, "--status").stdout)).toEqual({ status: "LOCKED", reason: "GRANT_MISSING" });
    const create = runIn(root, ...CREATE); expect(create.status).toBe(0);
    const created = JSON.parse(create.stdout); expect(created).toMatchObject({ status: "CREATED", max_requests: 5, max_runs: 2, operations: ["entity_lookup", "rank_places"] });
    expect(Date.parse(created.expires_at) - Date.now()).toBeGreaterThan(9 * 60_000); expect(Date.parse(created.expires_at) - Date.now()).toBeLessThanOrEqual(10 * 60_000);
    expect(create.stdout).not.toContain("Authorize"); // the owner's reply is stored, never echoed
    const status = JSON.parse(runIn(root, "--status").stdout);
    expect(status).toMatchObject({ status: "ACTIVE", grant: created.grant_id.slice(0, 8), operations: ["entity_lookup", "rank_places"], requests_left: 5, runs_left: 2 });
    expect(Object.keys(status).sort()).toEqual(["approved_at", "expires_at", "grant", "operations", "requests_left", "runs_left", "status"]);
    const second = runIn(root, ...CREATE); expect(second.status).toBe(2); expect(JSON.parse(second.stderr)).toEqual({ status: "BLOCKED", reason: "LIVE_GRANT_CREATION_FAILED" });
    expect(JSON.parse(runIn(root, "--revoke").stdout)).toEqual({ status: "REVOKED" });
    expect(JSON.parse(runIn(root, "--status").stdout)).toEqual({ status: "LOCKED", reason: "GRANT_REVOKED" });
    expect(JSON.parse(runIn(root, "--revoke").stdout)).toEqual({ status: "REVOKED" }); // idempotent
    expect(before()).toEqual(realBefore);
  });
  it("revoking with no grant is a no-op, and a new grant can follow a revoked one", async () => {
    const root = await fresh(); expect(JSON.parse(runIn(root, "--revoke").stdout)).toEqual({ status: "NO_ACTIVE_GRANT" });
    expect(runIn(root, ...CREATE).status).toBe(0); expect(runIn(root, "--revoke").status).toBe(0);
    const again = runIn(root, ...CREATE); expect(again.status).toBe(0); expect(JSON.parse(runIn(root, "--status").stdout)).toMatchObject({ status: "ACTIVE", requests_left: 5 });
  });
  it("leaves no compiled helper behind", () => {
    const leftovers = existsSync(".cache/qloo-probe") ? readdirSync(".cache/qloo-probe").filter((n) => n.startsWith("live-grant-")) : [];
    expect(leftovers).toEqual([]);
  });
});
