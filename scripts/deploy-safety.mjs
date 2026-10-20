// Deployment-safety gate (does NOT deploy anything; it never contacts Qloo or any external host).
//
// It builds the app from a CLEAN COPY of the working tree (tracked and untracked-but-not-ignored files; none of the owner's
// private data), with synthetic canary secrets in the build environment, in .env.local and in a planted private directory.
// It then proves that none of that reaches the build output, that no trace would package a sensitive file, that no real
// private token appears in anything shippable, and that the built server degrades safely when there is no private evidence.
//
//   node scripts/deploy-safety.mjs [--keep]
//
// Output: a JSON report in .artifacts/ and a one-line-per-check summary. Only labels, relative paths and counts are printed:
// never a secret, an identifier or a response. Exit status 1 if any check FAILS. A check that cannot run says NOT RUN.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { forbiddenPathLabels, scanTraces, scanTree, summarizeFindings, walk } from "./lib/deploy-scan.mjs";
import { deriveSensitiveTokens, loadPrivateFacts } from "./lib/private-tokens.mjs";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keep = process.argv.includes("--keep");
// --self-test proves the gate can FAIL: it plants a leak in the clean copy (a canary in a public asset, and a trace that pulls the
// private directory into the server output) and passes only if the gate then reports those leaks.
const selfTest = process.argv.includes("--self-test");
const rand = () => randomBytes(8).toString("hex");
const CANARY = { key: `CANARY-QLOO-KEY-${rand()}`, llm: `CANARY-LLM-KEY-${rand()}`, ids: [1, 2, 3].map(() => `CANARY_PROVIDER_ID_${rand()}`), venue: `CANARY_VENUE_NAME_${rand()}`, grant: `CANARY_GRANT_${rand()}` };
const NEEDLES = [["canary:qloo_key", CANARY.key], ["canary:llm_key", CANARY.llm], ...CANARY.ids.map((v) => ["canary:provider_id", v]), ["canary:venue_name", CANARY.venue], ["canary:grant", CANARY.grant]];

const checks = [];
const record = (name, status, detail = "") => { checks.push({ name, status, detail }); process.stdout.write(`${status.padEnd(7)} ${name}${detail ? ` — ${detail}` : ""}\n`); };
const git = (args) => { try { return execFileSync("git", args, { cwd: project, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); } catch { return ""; } };

// ---------- 1. stage a clean copy ----------
// Outside the repository, like a fresh clone on another machine (set DEPLOY_SAFETY_TMP to choose the drive).
const work = join(process.env.DEPLOY_SAFETY_TMP ?? tmpdir(), `tastegate-deploy-safety-${rand()}`); const clone = join(work, "clone");
function stage() {
  const files = git(["ls-files", "-co", "--exclude-standard", "-z"]).split("\0").filter(Boolean)
    .filter((f) => !/^(node_modules|\.next)(\/|$)/.test(f) && forbiddenPathLabels(f).length === 0);
  for (const f of files) { const to = join(clone, f); mkdirSync(dirname(to), { recursive: true }); copyFileSync(join(project, f), to); }
  // A real copy of the installed dependencies: the build then has its own root and produces the same layout a clean clone would.
  cpSync(join(project, "node_modules"), join(clone, "node_modules"), { recursive: true, filter: (src) => !/[\\/]node_modules[\\/]\.cache([\\/]|$)/.test(src) });
  return files.length;
}
function plantCanaries() {
  const attempt = randomUUID();
  const put = (rel, content) => { const to = join(clone, rel); mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, content); };
  put(`private/qloo-probes/p05/attempts/${attempt}/response.raw.json`, JSON.stringify({ results: { entities: CANARY.ids.map((id) => ({ entity_id: id, name: CANARY.venue })) } }));
  put("private/qloo-probes/p05-radiohead-identity.private.json", JSON.stringify({ selected_entity_id: CANARY.ids[0] }));
  put("private/qloo-live/grant.json", JSON.stringify({ owner_reply: CANARY.grant }));
  put(".env.local", `QLOO_API_KEY=${CANARY.key}\nLLM_API_KEY=${CANARY.llm}\n`); put(".env.production.local", `QLOO_API_KEY=${CANARY.key}\n`);
  put(".artifacts/canary.json", JSON.stringify({ k: CANARY.key })); put("test-results/canary.txt", CANARY.venue);
}

function injectLeaks() {
  mkdirSync(join(clone, "public"), { recursive: true }); writeFileSync(join(clone, "public", "leak.txt"), CANARY.key);
  const config = readFileSync(join(clone, "next.config.ts"), "utf8");
  const leaky = config.replace(/outputFileTracingExcludes: \{[^}]*\},/, 'outputFileTracingIncludes: { "/api/audit": ["./private/**/*"] },');
  if (leaky === config) throw new Error("self-test could not weaken the trace exclusions");
  writeFileSync(join(clone, "next.config.ts"), leaky);
}

// ---------- 2. build ----------
function build() {
  return new Promise((resolveBuild) => {
    const env = { ...process.env }; for (const k of Object.keys(env)) if (/^(QLOO_|LLM_|NEXT_PUBLIC_|TASTEGATE_)/.test(k)) delete env[k];
    Object.assign(env, { TASTEGATE_STANDALONE: "1", NEXT_TELEMETRY_DISABLED: "1", QLOO_API_KEY: CANARY.key, LLM_API_KEY: CANARY.llm, QLOO_MODE: "live", NODE_ENV: "production" });
    const child = spawn(process.execPath, [join("node_modules", "next", "dist", "bin", "next"), "build"], { cwd: clone, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; child.stdout.on("data", (d) => { if (out.length < 2_000_000) out += d; }); child.stderr.on("data", (d) => { if (out.length < 2_000_000) out += d; });
    child.on("close", (code) => resolveBuild({ code, out }));
  });
}

// ---------- 3. run the standalone server ----------
const freePort = () => new Promise((ok, bad) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); }); s.on("error", bad); });
function findServer(root) {
  const queue = [[root, 0]];
  while (queue.length) {
    const [dir, depth] = queue.shift(); if (depth > 6) continue;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && e.name === "server.js") return join(dir, e.name);
      if (e.isDirectory() && e.name !== "node_modules") queue.push([join(dir, e.name), depth + 1]);
    }
  }
  return null;
}
async function startServer(serverJs, extraEnv) {
  const port = await freePort(); const env = { ...process.env }; for (const k of Object.keys(env)) if (/^(QLOO_|LLM_|NEXT_PUBLIC_|TASTEGATE_)/.test(k)) delete env[k];
  Object.assign(env, { PORT: String(port), HOSTNAME: "127.0.0.1", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", QLOO_API_KEY: CANARY.key, LLM_API_KEY: CANARY.llm, QLOO_MODE: "live", ...extraEnv });
  const child = spawn(process.execPath, [serverJs], { cwd: dirname(serverJs), env, stdio: ["ignore", "pipe", "pipe"] });
  const log = { text: "" }; const grab = (d) => { if (log.text.length < 1_000_000) log.text += d; }; child.stdout.on("data", grab); child.stderr.on("data", grab);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base + "/", { signal: AbortSignal.timeout(2000) })).status === 200) return { child, base, log }; } catch { /* not ready */ } await new Promise((r) => setTimeout(r, 250)); }
  child.kill(); throw new Error("SERVER_DID_NOT_START");
}
const leaks = (text) => NEEDLES.filter(([, v]) => text.includes(v) || text.includes(encodeURIComponent(v)) || text.includes(Buffer.from(v).toString("base64"))).map(([label]) => label);
const post = (base, body, headers = { "Content-Type": "application/json" }, raw) => fetch(base + "/api/audit", { method: "POST", headers, body: raw ?? JSON.stringify(body), signal: AbortSignal.timeout(20_000) });

async function runtimeChecks(label, server, expectedLive) {
  const { base } = server; const bodies = [];
  const read = async (response) => { const text = await response.text(); bodies.push(text); return text; };
  const ok = (name, pass, detail = "") => record(`${label}: ${name}`, pass ? "PASS" : "FAIL", pass ? "" : detail);
  const home = await fetch(base + "/"); const homeText = await read(home);
  ok("home page loads", home.status === 200 && homeText.includes("TasteGate"), `status ${home.status}`);
  const h = (n) => home.headers.get(n) ?? "";
  ok("security headers present", /default-src 'self'/.test(h("content-security-policy")) && /frame-ancestors 'none'/.test(h("content-security-policy")) && h("x-content-type-options") === "nosniff" &&
    h("x-frame-options") === "DENY" && h("referrer-policy") === "no-referrer" && !home.headers.has("x-powered-by"), "a required header is missing");
  const assets = [...homeText.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+\.(?:css|js))"/g)].map((m) => m[1]); const css = assets.find((a) => a.endsWith(".css")); const js = assets.find((a) => a.endsWith(".js"));
  const served = await Promise.all([css, js].map(async (a) => { if (!a) return null; const r = await fetch(base + a); const body = await r.text(); return { status: r.status, type: r.headers.get("content-type") ?? "", length: body.length }; }));
  ok("static assets referenced by the page are served (stylesheet and script)", served.every((s) => s && s.status === 200 && s.length > 100) && /css/.test(served[0]?.type ?? "") && /javascript/.test(served[1]?.type ?? ""), JSON.stringify(served));
  const results = await fetch(base + "/results"); const resultsText = await read(results); ok("results page loads", results.status === 200 && resultsText.includes("Does the gate keep bad recommendations out?"), `status ${results.status}`);
  const catalogRes = await fetch(base + "/api/audit"); const catalogText = await read(catalogRes); let catalog = {}; try { catalog = JSON.parse(catalogText); } catch { /* reported below */ }
  ok("catalog: no private evidence means recorded mode is unavailable, empty and not substituted", catalogRes.status === 200 && catalog.modes?.recorded_live === "UNAVAILABLE" &&
    catalog.scenarios?.[0]?.available === false && catalog.recorded_history?.length === 0 && Object.values(catalog.recorded_coverage ?? { x: [1] }).every((l) => l.length === 0), "unexpected recorded availability");
  ok(`catalog: live is locked (${expectedLive})`, catalog.modes?.live === "LOCKED" && catalog.live_gate?.reason === expectedLive, `reason ${catalog.live_gate?.reason}`);
  ok("catalog: caching disabled", (catalogRes.headers.get("cache-control") ?? "").includes("no-store"), "cache-control");
  const fixture = await post(base, { scenario: "wrong-city-repair" }); const fixtureBody = JSON.parse(await read(fixture));
  ok("synthetic scenario works with no private data", fixture.status === 200 && fixtureBody.source_mode === "fixture" && fixtureBody.final_status === "PASS", `status ${fixture.status}`);
  // A custom plan on a server with no recordings is audited with NO provider evidence: every lookup is UNKNOWN, nothing is replayed or requested.
  const customPlan = { input: { schema_revision: "tastegate.input.v0", preferences: [{ id: "p", text: "x", kind: "artist", confirmed_anchor: "x" }], task: "t", destination: "d",
    constraints: [{ id: "c1", kind: "city", value: "x" }, { id: "c2", kind: "country", value: "US" }, { id: "c3", kind: "entity_type", value: "place" }, { id: "c4", kind: "max_items", value: 3 }],
    recommendations: [{ id: "r", name: "y", address_hint: null, claims: [] }] } };
  const custom = await post(base, customPlan); const customBody = JSON.parse(await read(custom));
  ok("custom plan with no recordings is audited with no provider evidence (UNKNOWN, nothing replayed or requested)", custom.status === 200 && customBody.source_mode === "recorded_live" &&
    customBody.final_status === "UNKNOWN" && customBody.usage?.recorded_replays === 0 && customBody.usage?.qloo_dispatches === 0 && customBody.evidence.every((e) => e.provider !== "qloo"), `status ${custom.status}`);
  for (const [name, body, status, error] of [["recorded scenario", { scenario: "recorded-nyc-evening" }, 503, "RECORDED_EVIDENCE_UNAVAILABLE"],
    ["live attempt without acknowledgement", { scenario: "recorded-nyc-evening", source: "live" }, 403, expectedLive === "LIVE_DISABLED" ? "LIVE_UNAVAILABLE" : "LIVE_ACK_REQUIRED"],
    ["live attempt with acknowledgement", { scenario: "recorded-nyc-evening", source: "live", live_ack: "RUN_LIVE_QLOO_REQUESTS" }, 403, "LIVE_UNAVAILABLE"]]) {
    const r = await post(base, body); const t = JSON.parse(await read(r)); ok(`${name} is refused safely`, r.status === status && t.error === error && (name !== "live attempt with acknowledgement" || t.reason === expectedLive), `status ${r.status} ${t.error}`);
  }
  ok("malformed, oversized and wrong-type requests are refused", (await post(base, null, undefined, "{")).status === 400 && (await post(base, { scenario: "nyc-evening", padding: "x".repeat(30_000) })).status === 413 &&
    (await post(base, null, { "Content-Type": "text/plain" }, "hello")).status === 415, "unexpected status");
  const found = leaks(bodies.join("\n") + "\n" + [...home.headers].join("\n")); ok("no canary appears in any response body or header", found.length === 0, found.join(","));
  return bodies;
}

// ---------- orchestration ----------
async function main() {
  if (!existsSync(join(project, "node_modules"))) { record("prerequisites", "FAIL", "node_modules is missing"); return; }
  mkdirSync(work, { recursive: true });
  const copied = stage(); record("stage a clean copy (tracked + untracked, none of the private or local files)", "PASS", `${copied} files`);
  plantCanaries(); record("plant synthetic canaries (env, .env.local, private directory, artifacts)", "PASS");
  if (selfTest) { injectLeaks(); record("SELF-TEST: planted a public canary asset and a trace that includes the private directory", "PASS"); }
  const trackedBad = git(["ls-files", "-z"]).split("\0").filter(Boolean).filter((f) => forbiddenPathLabels(f).length);
  record("no sensitive path is tracked by git", trackedBad.length ? "FAIL" : "PASS", trackedBad.length ? `${trackedBad.length} path(s): ${trackedBad.slice(0, 3).join(", ")}` : "");
  const ignore = existsSync(join(project, ".gitignore")) ? readFileSync(join(project, ".gitignore"), "utf8") : "";
  record(".gitignore covers private/, .env*, .artifacts/ and .cache/", ["private/", ".env", ".artifacts/", ".cache/"].every((p) => ignore.includes(p)) ? "PASS" : "FAIL");

  const built = await build(); record("production build (standalone) succeeds", built.code === 0 ? "PASS" : "FAIL", built.code === 0 ? "" : `exit ${built.code}`);
  const logLeaks = leaks(built.out); record("build log contains no canary", logLeaks.length ? "FAIL" : "PASS", logLeaks.join(","));
  if (built.code !== 0) return;
  const next = join(clone, ".next"); const skip = ["cache", "diagnostics", "dev"];
  const layout = findServer(join(next, "standalone")); record("standalone layout is flat (a clean clone has no path prefix)", layout && dirname(layout) === join(next, "standalone") ? "PASS" : "FAIL", layout ? "" : "no server.js");
  const scan = await scanTree(next, { needles: NEEDLES, skipDirs: skip });
  // public/ is served to everyone and is copied next to a standalone server: it is part of what ships.
  const publicScan = existsSync(join(clone, "public")) ? await scanTree(join(clone, "public"), { needles: NEEDLES }) : { files: 0, bytes: 0, findings: [], skipped: [] };
  scan.findings.push(...publicScan.findings.map((f) => ({ ...f, file: `public/${f.file}` }))); scan.files += publicScan.files; scan.bytes += publicScan.bytes;
  const canaryHits = scan.findings.filter((f) => f.kind === "content"); const pathHits = scan.findings.filter((f) => f.kind === "path");
  record("build output holds no canary (server bundles, static assets, source maps, standalone)", canaryHits.length ? "FAIL" : "PASS", canaryHits.length ? JSON.stringify(summarizeFindings(canaryHits)) : `${scan.files} files, ${(scan.bytes / 1024).toFixed(0)} KiB scanned`);
  record("build output contains no private, env, artifact or cache path", pathHits.length ? "FAIL" : "PASS", pathHits.length ? JSON.stringify(summarizeFindings(pathHits)) : "");
  const traces = await scanTraces(next, { skipDirs: skip }); record("no file trace would package a sensitive file", traces.findings.length ? "FAIL" : "PASS", traces.findings.length ? JSON.stringify(summarizeFindings(traces.findings)) : `${traces.traces} traces, ${traces.entries} entries`);
  const maps = []; for await (const f of walk(next, { skipDirs: skip })) if (f.rel?.endsWith(".map")) maps.push(f.rel);
  const clientMaps = maps.filter((m) => m.startsWith("static/")); record("no browser source map is published", clientMaps.length ? "FAIL" : "PASS", clientMaps.length ? `${clientMaps.length} file(s)` : `${maps.length} server-side map(s) are not served`);
  record("scan coverage is stated", "PASS", `skipped: ${scan.skipped.map((s) => s.path).join(", ") || "nothing"}`);

  // Real private tokens, derived from the owner's ignored captures on THIS machine, never printed.
  const real = await deriveSensitiveTokens(project);
  if (!real.available) record("real private tokens absent from the build output and the tracked source", "NOT RUN", "no private evidence on this machine to derive tokens from");
  else {
    const needles = [...real.tokens].map(([token, category]) => [`real:${category}`, token]);
    const inBuild = await scanTree(next, { needles, skipDirs: skip, checkPaths: false }); const inSource = await scanTree(clone, { needles, skipDirs: ["node_modules", ".next", "private", ".artifacts", "test-results"], checkPaths: false });
    const privateFacts = await loadPrivateFacts(project);
    const facts = await scanTree(next, { needles: privateFacts.map((f) => ["private_fact", f]), skipDirs: skip, checkPaths: false });
    const sourceFacts = await scanTree(clone, { needles: privateFacts.map((f) => ["private_fact", f]), skipDirs: ["node_modules", ".next", "private", ".artifacts", "test-results"], checkPaths: false });
    record("real private tokens absent from the build output", inBuild.findings.length ? "FAIL" : "PASS", inBuild.findings.length ? JSON.stringify(summarizeFindings(inBuild.findings)) : `${real.tokens.size} tokens from ${real.captures} captures`);
    record("real private tokens absent from the tracked source", inSource.findings.length ? "FAIL" : "PASS", inSource.findings.length ? JSON.stringify(summarizeFindings(inSource.findings)) : "");
    if (!privateFacts.length) record("provider-derived place facts absent from the build output and the tracked source", "NOT RUN", "private/scan-facts.private.json is missing or empty");
    else record("provider-derived place facts absent from the build output and the tracked source", facts.findings.length + sourceFacts.findings.length ? "FAIL" : "PASS",
      facts.findings.length + sourceFacts.findings.length ? JSON.stringify(summarizeFindings([...facts.findings, ...sourceFacts.findings])) : `${privateFacts.length} strings`);
  }

  // Runtime: the standalone server, started with no private directory in its working tree.
  const serverJs = findServer(join(next, "standalone")); if (!serverJs) { record("standalone server entry exists", "FAIL"); return; }
  record("standalone server entry exists", "PASS");
  // A standalone deployment serves static assets from its own .next/static: copy them exactly as a deployment must.
  cpSync(join(next, "static"), join(dirname(serverJs), ".next", "static"), { recursive: true });
  record("the standalone working tree contains no private directory", existsSync(join(dirname(serverJs), "private")) ? "FAIL" : "PASS");
  for (const [label, env, reason] of [["server (live switched off)", { TASTEGATE_DISABLE_LIVE: "1" }, "LIVE_DISABLED"], ["server (live not switched off, no grant)", {}, "GRANT_MISSING"]]) {
    let server; try { server = await startServer(serverJs, env); } catch { record(`${label} starts`, "FAIL", "did not become ready"); continue; }
    try { await runtimeChecks(label, server, reason); }
    catch (error) { record(`${label} runtime checks`, "FAIL", error instanceof Error ? error.name : "error"); }
    finally { server.child.kill(); await new Promise((r) => setTimeout(r, 300)); }
    const logLeak = leaks(server.log.text); record(`${label}: no canary in the server's own output`, logLeak.length ? "FAIL" : "PASS", logLeak.join(","));
  }
}
function cleanup() {
  if (keep) { process.stdout.write(`kept: ${work}\n`); return; }
  try { rmSync(work, { recursive: true, force: true }); } catch { process.stdout.write(`cleanup skipped (a directory is still in use); remove ${work} manually\n`); }
  if (!existsSync(join(project, "node_modules", "next"))) { process.stderr.write("the project's node_modules was damaged\n"); process.exitCode = 3; }
}

try { await main(); }
catch (error) { record("gate execution", "FAIL", error instanceof Error ? error.message : "error"); }
finally { cleanup(); }
const summary = { PASS: 0, FAIL: 0, "NOT RUN": 0 }; for (const c of checks) summary[c.status]++;
mkdirSync(join(project, ".artifacts"), { recursive: true });
writeFileSync(join(project, ".artifacts", selfTest ? "deploy-safety-selftest.json" : "deploy-safety-report.json"), JSON.stringify({ evidence_kind: selfTest ? "ACTUAL_DEPLOY_SAFETY_SELF_TEST" : "ACTUAL_DEPLOY_SAFETY_RUN",
  executed_at_utc: new Date().toISOString(), node: process.version, base_commit: git(["rev-parse", "HEAD"]).trim(), working_tree_dirty: git(["status", "--porcelain"]).trim() !== "",
  canaries: "synthetic, generated per run, never recorded here", summary, checks }, null, 2) + "\n");
process.stdout.write(`\n${summary.PASS} passed, ${summary.FAIL} failed, ${summary["NOT RUN"]} not run\n`);
if (selfTest) {
  // In self-test mode "passing" means the gate FAILED the checks that cover the planted leaks. A leak that goes unreported is the failure.
  const failed = (prefix) => checks.some((c) => c.name.startsWith(prefix) && c.status === "FAIL");
  const caught = failed("build output holds no canary") && failed("build output contains no private") && failed("no file trace would package");
  process.stdout.write(caught ? "SELF-TEST PASSED: the gate reported the planted leaks.\n" : "SELF-TEST FAILED: the gate did not report every planted leak.\n");
  if (!caught) process.exitCode ||= 1;
} else if (summary.FAIL) process.exitCode ||= 1;
