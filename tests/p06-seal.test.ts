import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, expect, it } from "vitest";
import { AUTHORED, P06_ATTEMPT, seedRecordedRoot, type P06SeedOptions } from "./helpers/recorded-root";

// The seal script runs the REAL product modules in an isolated copy of the project against authored private data.
const roots: string[] = [];
afterAll(async () => { for (const root of roots) await rm(root, { recursive: true, force: true }); });
async function isolated(p06: P06SeedOptions, mutate?: NonNullable<Parameters<typeof seedRecordedRoot>[0]>["mutate"]) {
  const root = await seedRecordedRoot({ p06, mutate }); roots.push(root);
  await mkdir(join(root, "scripts")); await copyFile(resolve("scripts/seal-recorded-probe.mjs"), join(root, "scripts/seal-recorded-probe.mjs"));
  for (const rel of ["src/domain", "src/qloo"]) for (const name of await readdir(resolve(rel))) if (name.endsWith(".ts")) {
    const target = join(root, rel, name); await mkdir(dirname(target), { recursive: true }); await copyFile(resolve(rel, name), target);
  }
  await writeFile(join(root, "package.json"), '{"type":"module"}'); await symlink(resolve("node_modules"), join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const env = { ...process.env }; for (const k of Object.keys(env)) if (/^(?:QLOO_|NEXT_PUBLIC_QLOO|NODE_DEBUG|NODE_OPTIONS)/.test(k)) delete env[k];
  const run = (...args: string[]) => spawnSync(process.execPath, [join(root, "scripts/seal-recorded-probe.mjs"), ...args], { cwd: root, env, encoding: "utf8", windowsHide: true });
  const sealPath = join(root, "private/qloo-probes/phase2b-p06-execution-review/post-execution-integrity.private.json");
  return { root, run, sealPath };
}
const noSecrets = (text: string) => { for (const secret of [...Object.values(AUTHORED), "0.82", "0.41"]) expect(text).not.toContain(secret); };

it("inspect classifies the saved response, prints only counts and booleans, and writes nothing", async () => {
  const s = await isolated({ variant: "all", sealed: false });
  const child = s.run("--inspect-p06"); expect(child.status).toBe(0); noSecrets(child.stdout + child.stderr);
  expect(JSON.parse(child.stdout)).toMatchObject({ mode: "INSPECT_ONLY", wrote_nothing: true, attempt_id: P06_ATTEMPT, http_status: 200, classification: "ALL_RETURNED",
    requested: 2, returned: 2, every_returned_entity_has_numeric_affinity: true, returned_ids_all_on_shortlist: true, shortlist_first_role_ordered_before_second: true });
  expect(existsSync(s.sealPath)).toBe(false);
}, 60_000);
it.each([["partial", "PARTIAL"], ["unexpected", "UNEXPECTED_ENTITY"], ["unscored", "INCOMPATIBLE_SCORES"], ["disordered", "INCOMPATIBLE_SCORES"], ["unusable", "RESPONSE_UNUSABLE"]] as const)(
  "inspect reports a %s response as %s", async (variant, expected) => {
    const child = (await isolated({ variant, sealed: false })).run("--inspect-p06"); expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout).classification).toBe(expected); noSecrets(child.stdout);
  }, 60_000);
it("seal writes one exclusive manifest, then proves the real loader accepts it; a second seal is refused", async () => {
  const s = await isolated({ variant: "all", sealed: false });
  const child = s.run("--seal-p06"); expect(child.status).toBe(0); noSecrets(child.stdout + child.stderr);
  expect(JSON.parse(child.stdout)).toMatchObject({ mode: "SEAL", classification: "ALL_RETURNED", loader_accepts_seal: true, shortlist_state: "READY", history_row_present: true });
  const manifest = JSON.parse(await readFile(s.sealPath, "utf8")) as Array<{ path: string; sha256: string }>;
  expect(manifest.map((e) => e.path.split("/").pop()).sort()).toEqual(["attempt.json", "response.raw.json", "summary.json"]);
  expect(manifest.every((e) => e.path.startsWith(`private/qloo-probes/p06/attempts/${P06_ATTEMPT}/`) && /^[a-f0-9]{64}$/.test(e.sha256))).toBe(true);
  const before = await readFile(s.sealPath, "utf8"); const again = s.run("--seal-p06");
  expect(again.status).toBe(2); expect(await readFile(s.sealPath, "utf8")).toBe(before);
}, 60_000);
it("seals a failed response too, so the failure itself is recorded as unusable evidence", async () => {
  const s = await isolated({ omitRaw: true, sealed: false, summary: { reason: "UPSTREAM_ERROR", http_status: 500, raw_saved_privately: false, response_bytes: 0 } });
  const child = s.run("--seal-p06"); expect(child.status).toBe(0);
  expect(JSON.parse(child.stdout)).toMatchObject({ classification: "RESPONSE_UNUSABLE", http_status: 500, loader_accepts_seal: true, shortlist_state: "UNUSABLE" });
}, 60_000);
it("removes its own seal again when the product loader refuses the attempt (request not bound to the recorded entities)", async () => {
  const dir = `private/qloo-probes/p06/attempts/${P06_ATTEMPT}`;
  const s = await isolated({ variant: "all", sealed: false }, (files) => { files.set(`${dir}/attempt.json`, Buffer.from(files.get(`${dir}/attempt.json`)!.toString("utf8").replace(`"signal_entity_id":"${AUTHORED.artist}"`, `"signal_entity_id":"${AUTHORED.otherArtist}"`))); });
  const child = s.run("--seal-p06"); expect(child.status).toBe(2);
  expect(JSON.parse(child.stdout)).toMatchObject({ loader_accepts_seal: false, seal_removed: true }); expect(existsSync(s.sealPath)).toBe(false);
}, 60_000);
it("refuses anything but one explicit mode and exactly one attempt", async () => {
  const s = await isolated({ variant: "all", sealed: false });
  for (const args of [[], ["--seal-p07"], ["--seal-p06", "extra"], ["--inspect-p06", "--seal-p06"]]) { const bad = s.run(...args); expect(bad.status).toBe(2); expect(bad.stdout).toBe(""); }
  const two = await isolated({ variant: "all", sealed: false, extraAttempt: true });
  expect(two.run("--inspect-p06").status).toBe(2);
}, 60_000);
