// Starts the built standalone server AFTER validating its environment, and refuses to start on an invalid configuration. Plain JavaScript
// on purpose: the runtime image has no TypeScript compiler. Its rules mirror src/server/runtime-profile.ts (a test pins the two together).
//
//   node scripts/start-production.mjs            validate, then start the server (HOSTNAME defaults to 127.0.0.1; set it to 0.0.0.0 in a container)
//   node scripts/start-production.mjs --check    validate only, print a sanitized result, start nothing
//
// It prints only fixed codes: never an environment value, a path of the owner's, a secret or an identifier.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROFILES = ["development", "test", "recorded-local", "production-safe", "production-live"];
const CREDENTIAL_PROFILES = new Set(["development", "production-live"]);
// Mirrors PRODUCTION_LIVE_AUTHORIZED in src/server/runtime-profile.ts. Public live access is not authorized.
const PRODUCTION_LIVE_AUTHORIZED = false;
const present = (value) => value !== undefined && value.trim() !== "";

export function validateStartup(env) {
  const errors = [];
  const requested = present(env.TASTEGATE_PROFILE) ? env.TASTEGATE_PROFILE.trim() : null;
  const fallback = env.NODE_ENV === "production" ? "production-safe" : env.NODE_ENV === "test" || present(env.VITEST) ? "test" : "development";
  let profile = requested === null ? fallback : "production-safe";
  if (requested !== null) {
    if (!PROFILES.includes(requested)) errors.push("UNKNOWN_PROFILE");
    else if (requested === "production-live" && !PRODUCTION_LIVE_AUTHORIZED) errors.push("PRODUCTION_LIVE_NOT_AUTHORIZED");
    else profile = requested;
  }
  for (const name of Object.keys(env)) if (name.startsWith("NEXT_PUBLIC_") && /(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i.test(name) && present(env[name])) errors.push("PUBLIC_SECRET_VARIABLE");
  if (!CREDENTIAL_PROFILES.has(profile)) {
    if (present(env.QLOO_API_KEY)) errors.push("CREDENTIAL_PRESENT_BUT_NOT_ALLOWED");
    if (present(env.LLM_API_KEY)) errors.push("CREDENTIAL_PRESENT_BUT_NOT_ALLOWED");
    if (env.QLOO_MODE === "live") errors.push("LIVE_MODE_NOT_ALLOWED");
  }
  return { profile: errors.length ? "production-safe" : profile, errors };
}
const here = dirname(fileURLToPath(import.meta.url));
// Container layout: <app>/server.js next to <app>/scripts/. Repository layout: <repo>/.next/standalone/server.js.
export const serverEntry = () => [join(here, "..", "server.js"), join(here, "..", ".next", "standalone", "server.js")].find((p) => existsSync(p)) ?? null;

async function main() {
  const result = validateStartup(process.env);
  if (process.argv.includes("--check")) { process.stdout.write(JSON.stringify({ status: result.errors.length ? "REFUSED" : "VALID", profile: result.profile, errors: result.errors }) + "\n"); process.exitCode = result.errors.length ? 78 : 0; return; }
  if (result.errors.length) { process.stderr.write(JSON.stringify({ status: "REFUSED", reason: "INVALID_CONFIGURATION", errors: result.errors }) + "\n"); process.exitCode = 78; return; }
  const entry = serverEntry();
  if (!entry) { process.stderr.write(JSON.stringify({ status: "REFUSED", reason: "NO_BUILD_OUTPUT" }) + "\n"); process.exitCode = 66; return; }
  process.env.HOSTNAME ??= "127.0.0.1"; // loopback unless the operator (or the container image) chooses otherwise
  process.stdout.write(JSON.stringify({ status: "STARTING", profile: result.profile }) + "\n");
  await import(pathToFileURL(entry).href);
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
