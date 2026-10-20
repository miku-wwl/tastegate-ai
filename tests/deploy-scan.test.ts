import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { forbiddenPathLabels, scanTraces, scanTree, summarizeFindings, variants } from "../scripts/lib/deploy-scan.mjs";

// Every needle below is invented. The scanner must find it in any serialization a bundler might produce, flag sensitive
// paths and traces, say what it skipped, and never repeat the needle in its output.
const roots: string[] = [];
async function tree(files: Record<string, string>) {
  await mkdir(".artifacts", { recursive: true }); const root = await mkdtemp(resolve(".artifacts/scan-test-")); roots.push(root);
  for (const [path, content] of Object.entries(files)) { await mkdir(join(root, path, ".."), { recursive: true }); await writeFile(join(root, path), content); }
  return root;
}
afterAll(async () => { for (const r of roots) await rm(r, { recursive: true, force: true }); });
const KEY = "CANARY-KEY-8f3a91c7d2e45b60"; const ID = "CANARY_PROVIDER_ID_5c2d7e90";

describe("canary content scan", () => {
  it("finds a secret in plain, URL-encoded, JSON-escaped, base64 and hex form, and reports labels only", async () => {
    const secret = `${KEY}"quoted\\slash`;
    const root = await tree({
      "plain.js": `const k = "${KEY}";`, "url.txt": encodeURIComponent(KEY), "json.json": JSON.stringify({ v: secret }), "b64.txt": Buffer.from(KEY).toString("base64"), "hex.txt": Buffer.from(KEY).toString("hex"),
      "clean.js": "console.log('nothing here');",
    });
    const result = await scanTree(root, { needles: new Map([["canary:key", KEY], ["canary:id", ID]]) });
    expect(result.findings.filter((f) => f.kind === "content").map((f) => [f.label, f.file]).sort()).toEqual([["canary:key", "b64.txt"], ["canary:key", "hex.txt"], ["canary:key", "json.json"], ["canary:key", "plain.js"], ["canary:key", "url.txt"]]);
    expect(result.files).toBe(6);
    const printed = JSON.stringify(result); for (const needle of [KEY, ID, Buffer.from(KEY).toString("base64")]) expect(printed).not.toContain(needle);
    expect(JSON.stringify(summarizeFindings(result.findings))).not.toContain(KEY);
  });
  it("passes a clean tree and treats a missing needle as not found", async () => {
    const root = await tree({ "a.js": "x", "dir/b.json": "{}" }); const result = await scanTree(root, { needles: new Map([["canary:key", KEY]]) });
    expect(result.findings).toEqual([]); expect(result.files).toBe(2);
  });
  it("ignores needles that are too short to be a meaningful secret", () => { expect(variants("short")).toEqual([]); expect(variants("long-enough-secret").length).toBeGreaterThan(1); });
  it("skips excluded directories and files over the size limit, and says so", async () => {
    const root = await tree({ "cache/big.bin": KEY, "keep.js": "ok", "huge.dat": "x".repeat(2048) + KEY });
    const result = await scanTree(root, { needles: new Map([["canary:key", KEY]]), skipDirs: ["cache"], maxBytes: 1024 });
    expect(result.findings).toEqual([]); expect(result.skipped).toEqual(expect.arrayContaining([{ path: "cache", reason: "excluded directory" }, { path: "huge.dat", reason: "larger than the scan limit" }]));
  });
  it("does not follow symbolic links out of the tree", async () => {
    const outside = await tree({ "secret.txt": KEY }); const root = await tree({ "a.js": "ok" });
    try { await symlink(join(outside, "secret.txt"), join(root, "link.txt")); } catch { return; } // symlinks may need privileges on some systems
    const result = await scanTree(root, { needles: new Map([["canary:key", KEY]]) });
    expect(result.findings.filter((f) => f.kind === "content")).toEqual([]); expect(result.skipped.some((s) => s.path === "link.txt")).toBe(true);
  });
});

describe("sensitive paths and traces", () => {
  it.each<[string, string[]]>([
    ["private/qloo-probes/p05/attempts/x/response.raw.json", ["private_directory"]], ["a/private/b.txt", ["private_directory"]], [".env.local", ["env_file"]], [".env", ["env_file"]], ["pkg/.env.production", ["env_file"]],
    [".artifacts/run.json", ["local_artifacts"]], [".cache/x", ["local_cache"]], ["test-results/x", ["test_results"]], [".git/config", ["git_directory"]],
    [".env.example", []], ["src/private-note.ts", []], ["privateer/x", []], ["docs/env.md", []],
  ])("labels %s", (path, labels) => { expect(forbiddenPathLabels(path)).toEqual(labels); });
  it("flags sensitive paths by name even when their content is harmless", async () => {
    const root = await tree({ "private/qloo-live/grant.json": "{}", ".env.local": "A=1", "ok/file.js": "1", ".env.example": "A=" });
    const result = await scanTree(root, {}); expect(summarizeFindings(result.findings)).toMatchObject({ private_directory: { kind: "path", count: 1 }, env_file: { kind: "path", count: 1 } });
  });
  it("flags a trace entry that would bundle a sensitive file, and a trace it cannot read", async () => {
    const root = await tree({
      "server/a.js.nft.json": JSON.stringify({ version: 1, files: ["../../node_modules/next/index.js", "../../private/qloo-probes/x.json", "../../.env.local"] }),
      "server/clean.js.nft.json": JSON.stringify({ version: 1, files: ["../../node_modules/react/index.js"] }), "server/broken.nft.json": "{not json",
    });
    const result = await scanTraces(root);
    expect(result.traces).toBe(3); expect(result.entries).toBe(4);
    expect(summarizeFindings(result.findings)).toMatchObject({ private_directory: { count: 1 }, env_file: { count: 1 }, unreadable_trace: { count: 1 } });
  });
  it("passes clean traces", async () => {
    const root = await tree({ "x.nft.json": JSON.stringify({ files: ["a.js", "node_modules/next/b.js"] }) }); expect((await scanTraces(root)).findings).toEqual([]);
  });
});
