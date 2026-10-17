import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let executionStarted = false;
try {
  if (args.length > 1 || (args.length === 1 && !["--execute-p01", "--preflight-p01"].includes(args[0]))) throw new Error("INVALID_PROBE_ARGUMENTS");
  // Compile only these reviewed local modules with the existing pinned TypeScript dependency.
  // This avoids a new runtime package/global tool; compilation never reads a credential.
  const target = join(project, ".cache/qloo-probe"); await mkdir(target, { recursive: true });
  await writeFile(join(target, "package.json"), '{"type":"commonjs"}\n');
  for (const name of ["boundary-error", "server-config", "p01-profile", "p01-local-env", "p01-runner", "p01-private-store"]) {
    const source = await readFile(join(project, "src/qloo", `${name}.ts`), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
    await writeFile(join(target, `${name}.js`), compiled.outputText);
  }
  const require = createRequire(import.meta.url);
  const { P01_PROFILE, blockedP01 } = require(join(target, "p01-profile.js"));
  if (args[0] === "--preflight-p01") {
    const { loadLocalP01Config, P01LocalEnvironmentError } = require(join(target, "p01-local-env.js"));
    const { inspectPrivateP01Ledger } = require(join(target, "p01-private-store.js"));
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
    try { preflight.ledger = await inspectPrivateP01Ledger(project); }
    catch { preflight.reason = "LEDGER_REVIEW_REQUIRED"; configReady = false; }
    if (configReady && preflight.ledger?.unresolved_attempts === 0) preflight.status = "READY_FOR_HUMAN_APPROVAL";
    process.stdout.write(JSON.stringify({ profile: P01_PROFILE, max_dispatches_per_approval: 1, max_response_bytes: 65536,
      deadline_ms: 4000, redirects: 0, automatic_retries: 0, preflight }, null, 2) + "\n");
    process.exitCode = preflight.status === "BLOCKED" ? 2 : 0;
  } else {
  let summary = blockedP01();
  if (args[0] === "--execute-p01") {
    const { liveP01FromPrivateCheckpoint } = require(join(target, "p01-private-store.js"));
    const controller = new AbortController(); const cancel = () => controller.abort();
    process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
    executionStarted = true;
    try { summary = await liveP01FromPrivateCheckpoint(project, controller.signal); }
    finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
  }
  // Safe fixed profile and bounded summary only; no raw JSON, checkpoint, headers or env dump.
  process.stdout.write(JSON.stringify({ profile: P01_PROFILE, summary }, null, 2) + "\n");
  if (args.length) process.exitCode = summary.status === "BLOCKED" ? 2 : 0;
  }
} catch {
  process.stderr.write(JSON.stringify(executionStarted ?
    { status: "UNKNOWN", reason: "PROBE_EXECUTION_INTERRUPTED", dispatches: null, max_dispatches: 1 } :
    { status: "BLOCKED", reason: "PROBE_PREPARATION_FAILED", dispatches: 0 }) + "\n"); process.exitCode = 2;
}
