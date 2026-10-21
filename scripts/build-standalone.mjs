// Builds the self-contained production server (`output: "standalone"`) and copies the static assets next to it, the way a deployment must.
// Local and offline: it contacts no network and publishes nothing. Run the result with `npm run start:prod`.
//
// Note: a standalone build records the absolute path it was built in. Build in the place that will run it (the container image does),
// and never ship a build made on a developer machine; scripts/deploy-safety.mjs builds from a clean copy and checks for such paths.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, TASTEGATE_STANDALONE: "1", NEXT_TELEMETRY_DISABLED: "1" };
const build = spawnSync(process.execPath, [join(project, "node_modules", "next", "dist", "bin", "next"), "build"], { cwd: project, env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const standalone = join(project, ".next", "standalone");
cpSync(join(project, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
if (existsSync(join(project, "public"))) cpSync(join(project, "public"), join(standalone, "public"), { recursive: true });
process.stdout.write("standalone build ready. Start it with: npm run start:prod\n");
