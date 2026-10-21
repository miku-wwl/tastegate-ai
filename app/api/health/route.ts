import { profileSummary, resolveRuntimeProfile } from "../../../src/server/runtime-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const STARTED = Date.now();
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Liveness and configuration check for container health checks and load balancers. It reads no file, contacts no provider and never
// returns a secret, a path, an identifier or a provider value: only the resolved profile, fixed labels, and process figures.
// 200 means this process is serving with a valid configuration; 503 means it is up but misconfigured (it then behaves as production-safe).
export async function GET(): Promise<Response> {
  const resolved = resolveRuntimeProfile(process.env); const memory = process.memoryUsage();
  const body = { status: resolved.ok ? "ok" : "degraded", ...profileSummary(resolved), uptime_s: Math.round((Date.now() - STARTED) / 1000),
    memory_mb: { rss: Math.round(memory.rss / 1_048_576), heap_used: Math.round(memory.heapUsed / 1_048_576) } };
  return Response.json(body, { status: resolved.ok ? 200 : 503, headers });
}
export async function HEAD(): Promise<Response> { return new Response(null, { status: resolveRuntimeProfile(process.env).ok ? 200 : 503, headers }); }
