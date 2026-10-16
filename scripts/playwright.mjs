import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Keep large browser downloads in this D:-backed workspace, with no global install.
const result = spawnSync(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve(".cache/playwright"), NEXT_TELEMETRY_DISABLED: "1" },
});
if (result.error) { process.stderr.write("Playwright could not start.\n"); process.exit(1); }
process.exit(result.status ?? 1);
