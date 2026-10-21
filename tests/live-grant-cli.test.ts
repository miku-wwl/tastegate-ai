import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Against the REAL project root only SAFE paths are exercised: status (read-only) and requests that must be refused before
// anything is written. The successful lifecycle runs against a throwaway root (TASTEGATE_ADMIN_ROOT), so no test can write a
// proposal or a grant into the owner's private directory.
const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/live-grant.mjs", ...args], { encoding: "utf8", timeout: 60_000, env: { ...process.env, QLOO_API_KEY: "" } });
const runIn = (root: string, ...args: string[]) => spawnSync(process.execPath, ["scripts/live-grant.mjs", ...args], { encoding: "utf8", timeout: 60_000, env: { ...process.env, QLOO_API_KEY: "", TASTEGATE_ADMIN_ROOT: root } });
const roots: string[] = [];
afterAll(async () => { for (const r of roots) await rm(r, { recursive: true, force: true }); });
const before = () => existsSync("private/qloo-live") ? readdirSync("private/qloo-live").sort() : null;
const SOME_ID = "11111111-2222-4333-8444-555555555555";

describe("owner live-grant CLI: refusals", () => {
  it.each([
    ["no mode", []], ["unknown mode", ["--bogus"]], ["status with extra arguments", ["--status", "--x=1"]], ["revoke with extra arguments", ["--revoke", "--x=1"]],
    ["create without arguments", ["--create"]], ["create with a missing option", ["--create", `--proposal=${SOME_ID}`, "--x=1"]],
    ["create with the retired free-text options", ["--create", "--owner-reply=LIVE", "--gate-id=g1", "--minutes=5", "--max-requests=3", "--max-runs=1", "--operations=entity_lookup"]],
    ["create with a duplicated option", ["--create", "--owner-reply=LIVE", "--owner-reply=LIVE"]],
    ["propose without arguments", ["--propose"]], ["propose with a missing option", ["--propose", "--minutes=5", "--max-requests=3", "--max-runs=1", "--x=1"]],
    ["propose with a non-numeric budget", ["--propose", "--minutes=five", "--max-requests=3", "--max-runs=1", "--operations=entity_lookup"]],
    ["propose with a duplicated option", ["--propose", "--minutes=5", "--minutes=5", "--max-requests=3", "--max-runs=1", "--operations=entity_lookup"]],
  ])("rejects %s without touching the filesystem", (_, args) => {
    const snapshot = before(); const result = run(...args);
    expect(result.status).toBe(2); expect(JSON.parse(result.stderr)).toEqual({ status: "BLOCKED", reason: "INVALID_ARGUMENTS" }); expect(result.stdout).toBe(""); expect(before()).toEqual(snapshot);
  });
  it.each([
    ["a reply that only says LIVE", "LIVE"], ["a refusal that contains LIVE", "I do not approve LIVE access."], ["an empty reply", ""], ["a reply for another proposal", `APPROVE LIVE-GRANT ${SOME_ID} SHA256:00000000000000000000000000000000`],
  ])("refuses to create a grant from %s (no proposal exists)", (_, reply) => {
    const snapshot = before();
    const result = run("--create", `--proposal=${SOME_ID}`, `--owner-reply=${reply}`);
    expect(result.status).toBe(2); expect(JSON.parse(result.stderr)).toEqual({ status: "BLOCKED", reason: "LIVE_GRANT_CREATION_FAILED" }); expect(before()).toEqual(snapshot);
  });
  it.each([["minutes=0"], ["minutes=61"], ["max-requests=0"], ["max-requests=15"], ["max-runs=6"], ["operations=bogus"], ["operations=entity_lookup,entity_lookup"]])("refuses an out-of-bounds proposal (%s) before writing anything", (change) => {
    const snapshot = before(); const base: Record<string, string> = { minutes: "10", "max-requests": "5", "max-runs": "1", operations: "entity_lookup" };
    const [key, value] = change.split("="); base[key!] = value!;
    const result = run("--propose", ...Object.entries(base).map(([k, v]) => `--${k}=${v}`));
    expect(result.status).toBe(2); expect(JSON.parse(result.stderr).reason).toBe("LIVE_PROPOSAL_FAILED"); expect(before()).toEqual(snapshot);
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
  const PROPOSE = ["--propose", "--minutes=10", "--max-requests=5", "--max-runs=2", "--operations=entity_lookup,rank_places"];
  const propose = (root: string) => { const out = runIn(root, ...PROPOSE); expect(out.status).toBe(0); return JSON.parse(out.stdout) as { proposal_id: string; approval_statement: string; terms_sha256: string; approve_before: string; operations: string[] }; };
  it("proposes terms, creates one bounded grant only from the exact sentence, refuses a second, revokes it, and never touches the real private directory", async () => {
    const root = await fresh(); const realBefore = before();
    expect(JSON.parse(runIn(root, "--status").stdout)).toEqual({ status: "LOCKED", reason: "GRANT_MISSING" });
    const p = propose(root);
    expect(p).toMatchObject({ status: "PROPOSED", environment: "DEVELOPMENT", operations: ["entity_lookup", "rank_places"], minutes: 10, max_requests: 5, max_runs: 2, per_request_timeout_ms: 4000, max_response_bytes: 262144 });
    expect(p.approval_statement).toBe(`APPROVE LIVE-GRANT ${p.proposal_id} SHA256:${p.terms_sha256.slice(0, 32)}`);
    expect(JSON.parse(runIn(root, "--status").stdout)).toEqual({ status: "LOCKED", reason: "GRANT_MISSING" }); // a proposal has no authority
    const create = runIn(root, "--create", `--proposal=${p.proposal_id}`, `--owner-reply=${p.approval_statement}`); expect(create.status).toBe(0);
    const created = JSON.parse(create.stdout); expect(created).toMatchObject({ status: "CREATED", grant_id: p.proposal_id, max_requests: 5, max_runs: 2, operations: ["entity_lookup", "rank_places"] });
    expect(Date.parse(created.expires_at) - Date.now()).toBeGreaterThan(9 * 60_000); expect(Date.parse(created.expires_at) - Date.now()).toBeLessThanOrEqual(10 * 60_000);
    expect(create.stdout).not.toContain("APPROVE"); // the owner's reply is stored, never echoed
    const status = JSON.parse(runIn(root, "--status").stdout);
    expect(status).toMatchObject({ status: "ACTIVE", grant: created.grant_id.slice(0, 8), operations: ["entity_lookup", "rank_places"], requests_left: 5, runs_left: 2 });
    expect(Object.keys(status).sort()).toEqual(["approved_at", "expires_at", "grant", "operations", "requests_left", "runs_left", "status"]);
    const second = runIn(root, ...PROPOSE); expect(second.status).toBe(2); expect(JSON.parse(second.stderr)).toEqual({ status: "BLOCKED", reason: "LIVE_PROPOSAL_FAILED" }); // a usable grant exists
    const replay = runIn(root, "--create", `--proposal=${p.proposal_id}`, `--owner-reply=${p.approval_statement}`); expect(replay.status).toBe(2); // the sentence is single-use
    expect(JSON.parse(runIn(root, "--revoke").stdout)).toEqual({ status: "REVOKED", withdrawn_proposals: 0 });
    expect(JSON.parse(runIn(root, "--status").stdout)).toEqual({ status: "LOCKED", reason: "GRANT_REVOKED" });
    expect(JSON.parse(runIn(root, "--revoke").stdout)).toEqual({ status: "REVOKED", withdrawn_proposals: 0 }); // idempotent
    expect(before()).toEqual(realBefore);
  });
  it("refuses a negative, hedged or bare reply and leaves the proposal usable for the exact sentence", async () => {
    const root = await fresh(); const p = propose(root);
    for (const reply of ["I do not approve LIVE access.", "Maybe turn on LIVE later.", "LIVE", `${p.approval_statement} but not yet`, p.approval_statement.toLowerCase()]) {
      const refused = runIn(root, "--create", `--proposal=${p.proposal_id}`, `--owner-reply=${reply}`);
      expect(refused.status).toBe(2); expect(JSON.parse(refused.stderr)).toEqual({ status: "BLOCKED", reason: "LIVE_GRANT_CREATION_FAILED" });
      expect(JSON.parse(runIn(root, "--status").stdout)).toEqual({ status: "LOCKED", reason: "GRANT_MISSING" });
    }
    expect(runIn(root, "--create", `--proposal=${p.proposal_id}`, `--owner-reply=${p.approval_statement}`).status).toBe(0);
  });
  it("revoking withdraws an unused proposal, and a new grant can follow a revoked one", async () => {
    const root = await fresh(); const p = propose(root);
    expect(JSON.parse(runIn(root, "--revoke").stdout)).toEqual({ status: "NO_ACTIVE_GRANT", withdrawn_proposals: 1 });
    expect(runIn(root, "--create", `--proposal=${p.proposal_id}`, `--owner-reply=${p.approval_statement}`).status).toBe(2); // withdrawn: cannot be approved later
    const q = propose(root); expect(runIn(root, "--create", `--proposal=${q.proposal_id}`, `--owner-reply=${q.approval_statement}`).status).toBe(0);
    expect(runIn(root, "--revoke").status).toBe(0);
    const r = propose(root); expect(runIn(root, "--create", `--proposal=${r.proposal_id}`, `--owner-reply=${r.approval_statement}`).status).toBe(0);
    expect(JSON.parse(runIn(root, "--status").stdout)).toMatchObject({ status: "ACTIVE", requests_left: 5 });
  });
  it("leaves no compiled helper behind", () => {
    const leftovers = existsSync(".cache/qloo-probe") ? readdirSync(".cache/qloo-probe").filter((n) => n.startsWith("live-grant-")) : [];
    expect(leftovers).toEqual([]);
  });
});
