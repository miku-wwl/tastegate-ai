// Container smoke test (LOCAL; needs a running Docker engine). It builds the image from this repository's Dockerfile, checks what the build
// context actually contained, inspects the image, starts it with a hardened runtime (read-only root, no capabilities, no new privileges,
// loopback port) and checks the production-safe guarantees over HTTP. It pushes nothing and contacts no registry except to pull the public
// base image and the npm packages the lockfile names during the build. No credential is read or passed, except the deliberately WRONG
// values used to prove the container refuses to start.   npm run smoke:container
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { forbiddenPathLabels } from "./lib/deploy-scan.mjs";
import { isExcluded, parseDockerignore } from "./lib/dockerignore.mjs";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tag = "tastegate-ai:smoke-local"; const name = `tastegate-smoke-${process.pid}`;
const checks = []; const facts = {};
const record = (label, pass, detail = "") => { checks.push({ name: label, status: pass ? "PASS" : "FAIL", detail: pass ? "" : detail }); process.stdout.write(`${pass ? "PASS   " : "FAIL   "} ${label}${pass || !detail ? "" : ` — ${detail}`}\n`); };
const docker = (args, options = {}) => spawnSync("docker", args, { encoding: "utf8", cwd: project, maxBuffer: 64 * 1024 * 1024, ...options });
const freePort = () => new Promise((ok, bad) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); }); s.on("error", bad); });
const walkFiles = (root, rules) => { const out = []; const inner = (dir, rel) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const next = rel ? rel + "/" + e.name : e.name; if (rules && isExcluded(rules, next)) continue; if (e.isDirectory()) inner(join(dir, e.name), next); else out.push(next); } }; inner(root, ""); return out; };

if (docker(["info", "--format", "{{.ServerVersion}}"]).status !== 0) { record("a Docker engine is running", false, "start Docker, then re-run"); process.exit(2); }
const stage = mkdtempSync(join(tmpdir(), "tg-container-"));
try {
  // 1. What the build daemon actually received (a scratch image holding the context), compared with the model in scripts/lib/dockerignore.mjs.
  const lister = spawnSync("docker", ["build", "--no-cache", "-f", "-", "--output", "type=local,dest=" + stage, "."], { cwd: project, input: "FROM scratch\nCOPY . /\n", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const actual = lister.status === 0 ? walkFiles(stage).sort() : [];
  const modelled = walkFiles(project, parseDockerignore(readFileSync(join(project, ".dockerignore"), "utf8"))).sort();
  record("the real build context holds no private, env, artifact, cache or credential path", lister.status === 0 && actual.length > 50 && actual.filter((f) => forbiddenPathLabels(f).length || /[.](pem|key|sqlite3|log)$/.test(f)).length === 0, lister.stderr.slice(-200));
  const extra = actual.filter((f) => !modelled.includes(f)); const missing = modelled.filter((f) => !actual.includes(f));
  record("the .dockerignore model agrees with Docker on this tree (no file Docker sent that the model withheld)", lister.status === 0 && extra.length === 0, `${extra.length} file(s), e.g. ${extra.slice(0, 3).join(", ")}`);
  facts.context_files = actual.length; facts.model_only_files = missing.length;

  // 2. Build.
  const began = Date.now(); const build = docker(["build", "-t", tag, "."]); facts.build_seconds = Math.round((Date.now() - began) / 100) / 10;
  record("the image builds from a clean context (multi-stage, locked install)", build.status === 0, (build.stderr || build.stdout).slice(-400));
  if (build.status !== 0) throw new Error("BUILD_FAILED");
  const inspect = JSON.parse(docker(["image", "inspect", tag]).stdout)[0];
  facts.image_mib = Math.round(inspect.Size / 104857.6) / 10; facts.base = inspect.Config.Labels?.["org.opencontainers.image.base.name"] ?? null;
  record("the image runs as a non-root user and holds no credential or secret-looking variable", inspect.Config.User === "tastegate" && !inspect.Config.Env.some((e) => /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(e.split("=")[0])), `user ${inspect.Config.User}`);
  record("the image environment names the safe profile and the live kill switch", inspect.Config.Env.includes("TASTEGATE_PROFILE=production-safe") && inspect.Config.Env.includes("TASTEGATE_DISABLE_LIVE=1"), "profile variables missing");
  record("the image declares a health check and the validating start command", !!inspect.Config.Healthcheck && JSON.stringify(inspect.Config.Cmd) === JSON.stringify(["node", "scripts/start-production.mjs"]), "healthcheck or cmd differs");
  const listing = docker(["run", "--rm", "--entrypoint", "sh", tag, "-c", "id -u; find /app -maxdepth 3 \\( -name private -o -name '.env*' -o -name '*.sqlite3' \\) -print; test -f /app/server.js && echo SERVER; test -f /app/scripts/start-production.mjs && echo START; ls /app"]);
  const lines = listing.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  record("the image contains the server and start script and no private or env path", lines[0] === "10001" && lines.includes("SERVER") && lines.includes("START") && !lines.some((l) => /private|\.env|sqlite3/.test(l) && l.startsWith("/app")), lines.slice(0, 6).join(" | "));

  // 3. Refusal of an invalid configuration, before anything listens.
  for (const [what, args] of [["a credential", ["-e", "QLOO_API_KEY=authored-smoke-value"]], ["the reserved production-live profile", ["-e", "TASTEGATE_PROFILE=production-live"]], ["live mode", ["-e", "QLOO_MODE=live"]]]) {
    const run = docker(["run", "--rm", ...args, tag]);
    record(`the container refuses ${what} (exit 78, no value printed)`, run.status === 78 && !(run.stdout + run.stderr).includes("authored-smoke-value"), `exit ${run.status}`);
  }

  // 4. Run hardened and check the production-safe guarantees over HTTP.
  const port = await freePort();
  const started = docker(["run", "-d", "--name", name, "--read-only", "--tmpfs", "/tmp", "--tmpfs", "/app/.next/cache:uid=10001,gid=10001", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
    "--pids-limit", "128", "--memory", "512m", "--cpus", "1", "-p", `127.0.0.1:${port}:3000`, tag]);
  record("the hardened container starts (read-only root, no capabilities, no new privileges, 512 MiB, 1 CPU, loopback port)", started.status === 0, started.stderr.slice(-300));
  const base = `http://127.0.0.1:${port}`; let health = null;
  for (let i = 0; i < 120 && !health; i++) { try { const r = await fetch(base + "/api/health", { signal: AbortSignal.timeout(2000) }); if (r.status === 200) health = await r.json(); } catch { /* starting */ } if (!health) await new Promise((r) => setTimeout(r, 500)); }
  record("health answers: ok, production-safe, live and recorded replay disabled by the profile", !!health && health.status === "ok" && health.profile === "production-safe" && health.live === "DISABLED_BY_PROFILE" && health.recorded_replay === "DISABLED_BY_PROFILE", JSON.stringify(health));
  if (health) {
    const post = (body) => fetch(base + "/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    const home = await fetch(base + "/"); const text = await home.text();
    record("the home page is served with the security headers", home.status === 200 && text.includes("TasteGate") && /frame-ancestors 'none'/.test(home.headers.get("content-security-policy") ?? "") && !home.headers.has("x-powered-by"), `status ${home.status}`);
    const fixture = await post({ scenario: "wrong-city-repair" }); const body = await fixture.json();
    record("a synthetic scenario audits correctly inside the container", fixture.status === 200 && body.final_status === "PASS" && body.source_mode === "fixture", `status ${fixture.status}`);
    const recorded = await post({ scenario: "recorded-nyc-evening" }); record("the recorded scenario is unavailable", recorded.status === 503, `status ${recorded.status}`);
    const live = await post({ scenario: "recorded-nyc-evening", source: "live", live_ack: "RUN_LIVE_QLOO_REQUESTS" }); const liveBody = await live.json();
    record("a live request with the acknowledgement is refused by the profile", live.status === 403 && liveBody.reason === "LIVE_DISABLED", `status ${live.status}`);
    for (let i = 0; i < 30; i++) await (await post({ scenario: "nyc-evening" })).arrayBuffer();
    const stats = docker(["stats", "--no-stream", "--format", "{{.MemUsage}}|{{.PIDs}}", name]).stdout.trim(); facts.container_memory = stats;
    record("the container stays healthy after a burst of audits", (await fetch(base + "/api/health")).status === 200);
    for (let i = 0; i < 40; i++) { const status = docker(["inspect", "--format", "{{.State.Health.Status}}", name]).stdout.trim(); if (status === "healthy") { facts.docker_health = status; break; } await new Promise((r) => setTimeout(r, 1000)); }
    record("Docker's own health check reports healthy", facts.docker_health === "healthy", "the HEALTHCHECK did not turn healthy");
    const logs = docker(["logs", name]); record("the container's output names no secret", !/QLOO_API_KEY|X-Api-Key|authored-smoke-value/.test(logs.stdout + logs.stderr), "unexpected output");
  }
} catch (error) { record("container smoke test", false, error instanceof Error ? error.message : "error"); }
finally { docker(["rm", "-f", name]); rmSync(stage, { recursive: true, force: true }); }
mkdirSync(join(project, ".artifacts"), { recursive: true });
const summary = { PASS: checks.filter((c) => c.status === "PASS").length, FAIL: checks.filter((c) => c.status === "FAIL").length };
writeFileSync(join(project, ".artifacts", "container-smoke.json"), JSON.stringify({ evidence_kind: "ACTUAL_LOCAL_CONTAINER_SMOKE", executed_at_utc: new Date().toISOString(), docker: docker(["version", "--format", "{{.Server.Version}}"]).stdout.trim(),
  note: "measured on the development machine; not a statement about any target host; nothing was pushed or deployed", facts, summary, checks }, null, 2) + "\n");
process.stdout.write(`\n${summary.PASS} passed, ${summary.FAIL} failed. ${JSON.stringify(facts)}\n`);
process.exitCode = summary.FAIL ? 1 : 0;
