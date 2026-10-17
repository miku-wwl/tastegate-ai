import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

export async function runProbeCli(probe) {
if (probe !== "P01" && probe !== "P02") throw new Error("PROBE_NOT_EXECUTABLE");
const lower = probe.toLowerCase();
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let executionStarted = false;
try {
  if (args.length > 1 || (args.length === 1 && ![`--execute-${lower}`, `--preflight-${lower}`].includes(args[0]))) throw new Error("INVALID_PROBE_ARGUMENTS");
  // Compile only these reviewed local modules with the existing pinned TypeScript dependency.
  // This avoids a new runtime package/global tool; compilation never reads a credential.
  const cache = join(project, ".cache/qloo-probe"); await mkdir(cache, { recursive: true });
  // Concurrent preview/test processes must never require partially written compiled modules.
  const target = await mkdtemp(join(cache, "compile-"));
  await writeFile(join(target, "package.json"), '{"type":"commonjs"}\n');
  for (const name of ["boundary-error", "server-config", "p01-profile", "p01-local-env", "p01-runner", "p01-private-store",
    "p02-profile", "p02-private-store", "probe-definitions", "raw-probe-runner", "raw-probe-store", "p01-reuse", "search-observation"]) {
    const source = await readFile(join(project, "src/qloo", `${name}.ts`), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
    await writeFile(join(target, `${name}.js`), compiled.outputText);
  }
  const require = createRequire(import.meta.url);
  const { probeDefinition } = require(join(target, "probe-definitions.js"));
  const def = probeDefinition(probe);
  if (args[0] === `--preflight-${lower}`) {
    const { loadLocalP01Config, P01LocalEnvironmentError } = require(join(target, "p01-local-env.js"));
    const { inspectPrivateProbeLedger } = require(join(target, "raw-probe-store.js"));
    const preflight = { status: "BLOCKED", dispatches: 0, approval: "NOT_GRANTED_BY_PREFLIGHT",
      credential_configured: null, env_file: "NOT_INSPECTED", reason: "CONFIG_BLOCKED", ledger: null };
    let configReady = false;
    try {
      const local = await loadLocalP01Config(project);
      preflight.credential_configured = local.credential_configured; preflight.env_file = local.env_file;
      configReady = local.config.mode === "live";
      preflight.reason = configReady ? "HUMAN_APPROVAL_REQUIRED" : "LIVE_MODE_REQUIRED";
    } catch (error) {
      if (error instanceof P01LocalEnvironmentError) {
        preflight.reason = error.reason; preflight.credential_configured = error.credentialConfigured; preflight.env_file = error.envFile;
      }
    }
    try { preflight.ledger = await inspectPrivateProbeLedger(project, probe);
      if (probe === "P02") {
        const p01 = await inspectPrivateProbeLedger(project, "P01");
        if (p01.recorded_dispatches !== 1 || p01.reserved_attempts !== 1 || p01.unresolved_attempts !== 0) throw new Error("P01_REUSE_REVIEW_REQUIRED");
        const { inspectSavedP01 } = require(join(target, "p01-reuse.js"));
        const saved = await inspectSavedP01(project);
        preflight.p01_reuse = { source_attempt: saved.sourceAttempt, integrity_verified: true, observation: saved.observation };
      } }
    catch { preflight.reason = "LEDGER_REVIEW_REQUIRED"; configReady = false; }
    if (configReady && preflight.ledger?.unresolved_attempts === 0) preflight.status = "READY_FOR_HUMAN_APPROVAL";
    process.stdout.write(JSON.stringify({ profile: def.profile, max_dispatches_per_approval: 1, max_response_bytes: 65536,
      deadline_ms: 4000, redirects: 0, automatic_retries: 0, preflight }, null, 2) + "\n");
    process.exitCode = preflight.status === "BLOCKED" ? 2 : 0;
  } else {
  let summary = def.blocked();
  if (args[0] === `--execute-${lower}`) {
    const { liveProbeFromPrivateCheckpoint } = require(join(target, "raw-probe-store.js"));
    const controller = new AbortController(); const cancel = () => controller.abort();
    process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
    executionStarted = true;
    try { summary = await liveProbeFromPrivateCheckpoint(project, probe, controller.signal); }
    finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
  }
  // Safe fixed profile and bounded summary only; no raw JSON, checkpoint, headers or env dump.
  process.stdout.write(JSON.stringify({ profile: def.profile, summary }, null, 2) + "\n");
  if (args.length) process.exitCode = summary.status === "BLOCKED" ? 2 : 0;
  }
} catch {
  process.stderr.write(JSON.stringify(executionStarted ?
    { status: "UNKNOWN", reason: "PROBE_EXECUTION_INTERRUPTED", dispatches: null, max_dispatches: 1 } :
    { status: "BLOCKED", reason: "PROBE_PREPARATION_FAILED", dispatches: 0 }) + "\n"); process.exitCode = 2;
}


}
