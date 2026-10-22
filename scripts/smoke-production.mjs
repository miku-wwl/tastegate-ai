// Local production smoke test. It starts the BUILT standalone server (npm run build:standalone first) through the same start script a
// container uses, in the PRODUCTION-SAFE profile, on a free loopback port, and checks what a public deployment must guarantee. It makes no
// request to any external host and never reads a credential.   npm run smoke:prod
// (That the PROFILE, not the absence of files, keeps private evidence out is proven in tests/runtime-profile.test.ts, which runs the real
// route in this repository where the owner's recordings exist. A standalone server runs in its own directory and cannot see them anyway.)
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const start = join(project, "scripts", "start-production.mjs");
const checks = [];
const record = (name, pass, detail = "") => { checks.push({ name, status: pass ? "PASS" : "FAIL", detail: pass ? "" : detail }); process.stdout.write(`${pass ? "PASS   " : "FAIL   "} ${name}${pass || !detail ? "" : ` — ${detail}`}\n`); };
const cleanEnv = (extra) => { const env = { ...process.env }; for (const k of Object.keys(env)) if (/^(QLOO_|LLM_|NEXT_PUBLIC_|TASTEGATE_)/.test(k)) delete env[k]; return { ...env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", ...extra }; };
const freePort = () => new Promise((ok, bad) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); }); s.on("error", bad); });
const post = (base, body) => fetch(base + "/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });

// 1. The start script refuses an invalid configuration before anything listens.
for (const [label, extra] of [["an unknown profile", { TASTEGATE_PROFILE: "staging" }], ["the reserved production-live profile", { TASTEGATE_PROFILE: "production-live" }],
  ["a credential on a public profile", { QLOO_API_KEY: "authored-smoke-value" }], ["live mode on a public profile", { QLOO_MODE: "live" }], ["a secret-looking public variable", { NEXT_PUBLIC_QLOO_API_KEY: "authored-smoke-value" }]]) {
  const run = spawnSync(process.execPath, [start, "--check"], { env: cleanEnv(extra), encoding: "utf8" });
  record(`start script refuses ${label} (exit 78, fixed code, no value printed)`, run.status === 78 && /"status":"REFUSED"/.test(run.stdout) && !run.stdout.includes("authored-smoke-value") && !run.stderr.includes("authored-smoke-value"), `exit ${run.status}`);
}
const valid = spawnSync(process.execPath, [start, "--check"], { env: cleanEnv({}), encoding: "utf8" });
record("start script accepts the default (production-safe) configuration", valid.status === 0 && JSON.parse(valid.stdout || "{}").profile === "production-safe", `exit ${valid.status}`);

// 2. The built server, started exactly as the container starts it.
const port = await freePort(); const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [start], { cwd: project, env: cleanEnv({ PORT: String(port), HOSTNAME: "127.0.0.1" }), stdio: ["ignore", "pipe", "pipe"] });
let log = ""; const grab = (d) => { if (log.length < 200_000) log += d; }; child.stdout.on("data", grab); child.stderr.on("data", grab);
let ready = false;
for (let i = 0; i < 120 && !ready; i++) { try { ready = (await fetch(base + "/api/health", { signal: AbortSignal.timeout(2000) })).status === 200; } catch { /* not ready */ } if (!ready) await new Promise((r) => setTimeout(r, 250)); }
record("the standalone server starts through the start script and answers /api/health", ready, "no build output? run npm run build:standalone first");
const sizing = { rss_idle_mb: null, rss_after_mb: null, audits: 0 };
if (ready) try {
  const health = await (await fetch(base + "/api/health")).json();
  record("health: ok, production-safe, live and recorded replay disabled by the profile, no configuration error",
    health.status === "ok" && health.profile === "production-safe" && health.live === "DISABLED_BY_PROFILE" && health.recorded_replay === "DISABLED_BY_PROFILE" && health.config_errors.length === 0, JSON.stringify({ ...health, uptime_s: 0 }));
  sizing.rss_idle_mb = health.memory_mb?.rss ?? null;
  const home = await fetch(base + "/"); const homeText = await home.text(); const h = (n) => home.headers.get(n) ?? "";
  record("home page loads with the security headers and no framework banner", home.status === 200 && homeText.includes("TasteGate") && /frame-ancestors 'none'/.test(h("content-security-policy")) && h("x-content-type-options") === "nosniff" && !home.headers.has("x-powered-by"), `status ${home.status}`);
  const catalog = await (await fetch(base + "/api/audit")).json();
  record("catalog: no recorded evidence is loaded and live is locked by the profile",
    catalog.modes.recorded_live === "UNAVAILABLE" && catalog.recorded_history.length === 0 && Object.values(catalog.recorded_coverage).every((l) => l.length === 0) && catalog.live_gate.reason === "LIVE_DISABLED", JSON.stringify(catalog.modes));
  const fixture = await post(base, { scenario: "wrong-city-repair" }); const fixtureBody = await fixture.json();
  record("a synthetic scenario audits correctly", fixture.status === 200 && fixtureBody.source_mode === "fixture" && fixtureBody.final_status === "PASS", `status ${fixture.status}`);
  const recorded = await post(base, { scenario: "recorded-nyc-evening" }); const recordedBody = await recorded.json();
  record("the recorded scenario is refused as unavailable", recorded.status === 503 && recordedBody.error === "RECORDED_EVIDENCE_UNAVAILABLE", `status ${recorded.status}`);
  const p07 = await post(base,{scenario:"recorded-nyc-p07"}),p07Body=await p07.json();
  record("the P07 recorded scenario is refused without loading private evidence",p07.status===503&&p07Body.error==="RECORDED_EVIDENCE_UNAVAILABLE",`status ${p07.status}`);
  const live = await post(base, { scenario: "recorded-nyc-evening", source: "live", live_ack: "RUN_LIVE_QLOO_REQUESTS" }); const liveBody = await live.json();
  record("a live request with the acknowledgement is refused (profile)", live.status === 403 && liveBody.error === "LIVE_UNAVAILABLE" && liveBody.reason === "LIVE_DISABLED", `status ${live.status}`);
  const custom = await post(base, { input: { schema_revision: "tastegate.input.v0", preferences: [{ id: "p", text: "x", kind: "artist", confirmed_anchor: "x" }], task: "t", destination: "d",
    constraints: [{ id: "c1", kind: "city", value: "x" }, { id: "c2", kind: "country", value: "US" }, { id: "c3", kind: "entity_type", value: "place" }, { id: "c4", kind: "max_items", value: 3 }],
    recommendations: [{ id: "r", name: "y", address_hint: null, claims: [] }] } });
  const customBody = await custom.json();
  record("a custom plan is audited with no provider evidence (UNKNOWN, nothing replayed or requested)", custom.status === 200 && customBody.final_status === "UNKNOWN" && customBody.usage.qloo_dispatches === 0 && customBody.usage.recorded_replays === 0, `status ${custom.status}`);
  for (let i = 0; i < 30; i++) { const r = await post(base, { scenario: "nyc-evening" }); await r.arrayBuffer(); sizing.audits++; }
  sizing.rss_after_mb = (await (await fetch(base + "/api/health")).json()).memory_mb?.rss ?? null;
  record("the server stays healthy after a burst of audits", (await fetch(base + "/api/health")).status === 200);
} catch (error) { record("smoke checks", false, error instanceof Error ? error.message : "error"); }
child.kill(); await new Promise((r) => setTimeout(r, 400));
let closed=false;try{await fetch(base+"/api/health",{signal:AbortSignal.timeout(500)});}catch{closed=true;}
record("shutdown releases the listening port",closed);
const restarted=spawn(process.execPath,[start],{cwd:project,env:cleanEnv({PORT:String(port),HOSTNAME:"127.0.0.1"}),stdio:["ignore","pipe","pipe"]});
restarted.stdout.on("data",grab);restarted.stderr.on("data",grab);
let recovered=false;
for(let i=0;i<30&&!recovered;i++){
 try{const h=await(await fetch(base+"/api/health",{signal:AbortSignal.timeout(500)})).json();recovered=h.status==="ok"&&h.profile==="production-safe"&&h.live==="DISABLED_BY_PROFILE"&&h.recorded_replay==="DISABLED_BY_PROFILE";}catch{}
 if(!recovered)await new Promise(r=>setTimeout(r,100));
}
record("restart on the same port recovers the default safe profile",recovered);
restarted.kill();await new Promise(r=>setTimeout(r,400));
record("the server's own output names no secret", !/QLOO_API_KEY|X-Api-Key/.test(log), "unexpected output");

const reportDir = resolve(project, process.env.TASTEGATE_VERIFICATION_OUTPUT_DIR ?? ".artifacts");
mkdirSync(reportDir, { recursive: true });
const summary = { PASS: checks.filter((c) => c.status === "PASS").length, FAIL: checks.filter((c) => c.status === "FAIL").length };
writeFileSync(join(reportDir, "smoke-production.json"), JSON.stringify({ evidence_kind: "ACTUAL_LOCAL_PRODUCTION_SMOKE", executed_at_utc: new Date().toISOString(), node: process.version,
  note: "measured on the development machine; not a statement about any target host", sizing, summary, checks }, null, 2) + "\n");
process.stdout.write(`\n${summary.PASS} passed, ${summary.FAIL} failed. Memory (RSS) ${sizing.rss_idle_mb ?? "?"} MB idle, ${sizing.rss_after_mb ?? "?"} MB after ${sizing.audits} audits.\n`);
process.exitCode = summary.FAIL ? 1 : 0;
