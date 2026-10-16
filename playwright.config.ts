import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser", workers: 1, retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", browserName: "chromium", viewport: { width: 1280, height: 960 } },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" }, timeout: 30_000,
  },
});
