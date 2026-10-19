import type { NextConfig } from "next";

// Defense in depth: owner-private evidence, environment files and local artifacts must never be traced
// into server output, even though the recorded-evidence route reads private files at runtime.
const neverTrace = ["./private/**/*", "./.env*", "./.artifacts/**/*", "./.cache/**/*", "./test-results/**/*"];
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: { "/*": neverTrace, "/api/audit": neverTrace },
};
export default config;
