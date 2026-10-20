import type { NextConfig } from "next";

// Defense in depth: owner-private evidence, environment files and local artifacts must never be traced
// into server output, even though the recorded-evidence route reads private files at runtime.
const neverTrace = ["./private/**/*", "./.env*", "./.artifacts/**/*", "./.cache/**/*", "./test-results/**/*"];
// The app needs inline scripts and styles for Next's own hydration; everything else stays on this origin. A development
// server additionally needs eval for React's debugging tools.
const dev = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'", `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'",
  "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");
const config: NextConfig = {
  poweredByHeader: false,
  // `TASTEGATE_STANDALONE=1` produces a self-contained server (used by the deployment-safety gate and by self-hosting). It is
  // opt-in because `next start` does not run a standalone build.
  ...(process.env.TASTEGATE_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  outputFileTracingExcludes: { "/*": neverTrace, "/api/audit": neverTrace },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: contentSecurityPolicy }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" }, { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    ] }];
  },
};
export default config;
