import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rename } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { assertServer } from "./boundary-error";

// AUTHORIZED_LIVE authority. A live Qloo request needs ALL of: a server-side credential, an owner-created grant
// file (this module), and an explicit live action. An environment variable, the app being opened, or a generic demo
// click is never authority. The grant is time-boxed, request-budgeted and run-budgeted; every dispatch is recorded
// in a durable ledger BEFORE it is sent, so budgets survive restarts and an unsettled request still counts.
// Nothing here prints, logs or persists a provider ID, response body or credential.
export const LIVE_OPERATIONS = ["entity_lookup", "tag_lookup", "rank_places", "discover_places"] as const;
export type LiveOperation = typeof LIVE_OPERATIONS[number];
export const LIVE_ENDPOINT: Record<LiveOperation, "/search" | "/v2/tags" | "/v2/insights"> =
  { entity_lookup: "/search", tag_lookup: "/v2/tags", rank_places: "/v2/insights", discover_places: "/v2/insights" };
export const MAX_GRANT_MINUTES = 60;

export const LiveGrantSchema = z.strictObject({
  revision: z.literal("tastegate.live-grant.v1"), grant_id: z.uuidv4(), approval: z.literal("AUTHORIZE_BOUNDED_LIVE_SESSION"),
  approved_at: z.iso.datetime(), expires_at: z.iso.datetime(),
  max_requests: z.number().int().min(1).max(14), max_runs: z.number().int().min(1).max(5),
  allowed_operations: z.array(z.enum(LIVE_OPERATIONS)).min(1).max(4).refine((v) => new Set(v).size === v.length, "Duplicate operations"),
  per_request_timeout_ms: z.literal(4000), max_response_bytes: z.literal(262_144),
  acknowledgements: z.strictObject({ credential_exposure_risk: z.literal(true), unknown_entitlements_and_quota: z.literal(true),
    display_and_caching_terms_reviewed: z.literal(true), no_retries_no_redirects: z.literal(true) }),
  owner_reply: z.string().min(1).max(500), gate_id: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
});
export type LiveGrant = z.infer<typeof LiveGrantSchema>;
export type GrantFailure = "GRANT_MISSING" | "GRANT_INVALID" | "GRANT_NOT_YET_VALID" | "GRANT_EXPIRED" | "GRANT_REVOKED" | "LEDGER_UNAVAILABLE";
export type GrantStatus = { ok: true; grant: LiveGrant } | { ok: false; reason: GrantFailure };

const LIVE_DIR = ["private", "qloo-live"] as const;
async function safeDir(root: string, parts: readonly string[], create: boolean): Promise<string | null> {
  let path = root;
  for (const part of parts) {
    path = join(/*turbopackIgnore: true*/ path, part);
    let info; try { info = await lstat(/*turbopackIgnore: true*/ path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("LEDGER_UNAVAILABLE");
      if (!create) return null;
      await mkdir(/*turbopackIgnore: true*/ path, { mode: 0o700 }); info = await lstat(/*turbopackIgnore: true*/ path);
    }
    if (info.isSymbolicLink() || !info.isDirectory() || await realpath(/*turbopackIgnore: true*/ path) !== path || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw new Error("LEDGER_UNAVAILABLE");
  }
  return path;
}
async function readSmall(dir: string, name: string, cap: number): Promise<Buffer | null> {
  const path = join(/*turbopackIgnore: true*/ dir, name);
  try {
    const info = await lstat(/*turbopackIgnore: true*/ path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > cap) throw new Error("LEDGER_UNAVAILABLE");
    return await readFile(/*turbopackIgnore: true*/ path);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("LEDGER_UNAVAILABLE"); }
}
async function exclusiveWrite(dir: string, name: string, value: unknown): Promise<void> {
  const handle = await open(join(/*turbopackIgnore: true*/ dir, name), "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + "\n"); await handle.sync(); } finally { await handle.close(); }
}
export function validGrantWindow(grant: LiveGrant, now: number): "OK" | "GRANT_NOT_YET_VALID" | "GRANT_EXPIRED" | "GRANT_INVALID" {
  const start = Date.parse(grant.approved_at); const end = Date.parse(grant.expires_at);
  if (!(end > start) || end - start > MAX_GRANT_MINUTES * 60_000) return "GRANT_INVALID";
  return start > now ? "GRANT_NOT_YET_VALID" : end <= now ? "GRANT_EXPIRED" : "OK";
}
export async function loadLiveGrant(projectRoot: string, now = Date.now()): Promise<GrantStatus> {
  assertServer();
  try {
    const root = await realpath(/*turbopackIgnore: true*/ projectRoot); const dir = await safeDir(root, LIVE_DIR, false);
    if (!dir) return { ok: false, reason: "GRANT_MISSING" };
    const bytes = await readSmall(dir, "grant.json", 8192); if (!bytes) return { ok: false, reason: "GRANT_MISSING" };
    const parsed = LiveGrantSchema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (!parsed.success) return { ok: false, reason: "GRANT_INVALID" };
    if (await readSmall(dir, `revoked-${parsed.data.grant_id}.json`, 4096)) return { ok: false, reason: "GRANT_REVOKED" };
    const window = validGrantWindow(parsed.data, now);
    return window === "OK" ? { ok: true, grant: parsed.data } : { ok: false, reason: window };
  } catch { return { ok: false, reason: "GRANT_INVALID" }; }
}

export type LedgerCounts = { runs: number; reserved: number; settled: number };
export type RequestShape = Record<string, string | number | boolean>; // parameter NAMES with non-identifying values only
export type RequestHandle = Readonly<{ index: number; requestId: string; settle(result: { httpStatus: number | null; responseBytes: number | null; elapsedMs: number; outcome: string }): Promise<void> }>;
export type LiveRunHandle = Readonly<{ runIndex: number; grantId: string; reserve(operation: LiveOperation, shape: RequestShape): Promise<RequestHandle>; counts(): Promise<LedgerCounts> }>;
const pad = (n: number) => String(n).padStart(4, "0");
async function countFiles(dir: string, suffix: string) { return (await readdir(/*turbopackIgnore: true*/ dir)).filter((n) => n.endsWith(suffix)).length; }

// Starts one workflow run under the grant. Exclusive file creation makes the run budget atomic even across processes.
export async function startLiveRun(projectRoot: string, grant: LiveGrant, now = Date.now()): Promise<LiveRunHandle | { reason: "LIVE_RUN_LIMIT_REACHED" | "LEDGER_UNAVAILABLE" | GrantFailure }> {
  assertServer();
  try {
    if (validGrantWindow(grant, now) !== "OK") return { reason: "GRANT_EXPIRED" };
    const root = await realpath(/*turbopackIgnore: true*/ projectRoot);
    const runs = await safeDir(root, [...LIVE_DIR, "ledger", grant.grant_id, "runs"], true); const requests = await safeDir(root, [...LIVE_DIR, "ledger", grant.grant_id, "requests"], true);
    if (!runs || !requests) return { reason: "LEDGER_UNAVAILABLE" };
    const used = await countFiles(runs, ".json"); if (used >= grant.max_runs) return { reason: "LIVE_RUN_LIMIT_REACHED" };
    const runIndex = used + 1;
    try { await exclusiveWrite(runs, `${pad(runIndex)}.json`, { run: runIndex, started_utc: new Date(now).toISOString() }); } catch { return { reason: "LIVE_RUN_LIMIT_REACHED" }; }
    const counts = async (): Promise<LedgerCounts> => ({ runs: await countFiles(runs, ".json"), reserved: await countFiles(requests, ".reserved.json"), settled: await countFiles(requests, ".result.json") });
    return Object.freeze({ runIndex, grantId: grant.grant_id,
      counts,
      async reserve(operation: LiveOperation, shape: RequestShape): Promise<RequestHandle> {
        if (!grant.allowed_operations.includes(operation)) throw new Error("LIVE_OPERATION_NOT_ALLOWED");
        if (validGrantWindow(grant, Date.now()) !== "OK") throw new Error("LIVE_GRANT_EXPIRED");
        const reserved = await countFiles(requests, ".reserved.json"); if (reserved >= grant.max_requests) throw new Error("LIVE_BUDGET_EXHAUSTED");
        const index = reserved + 1; const requestId = randomUUID();
        // Reserve BEFORE dispatch: if the process dies mid-request the slot stays spent (conservative accounting).
        await exclusiveWrite(requests, `${pad(index)}.reserved.json`, { request_id: requestId, run: runIndex, operation, shape, reserved_utc: new Date().toISOString() });
        return Object.freeze({ index, requestId, async settle(result) { await exclusiveWrite(requests, `${pad(index)}.result.json`, { request_id: requestId, ...result, settled_utc: new Date().toISOString() }); } });
      } });
  } catch { return { reason: "LEDGER_UNAVAILABLE" }; }
}
// Read-only budget view for status displays. It never creates a directory, a run or a reservation.
export async function readLiveBudget(projectRoot: string, grant: LiveGrant): Promise<{ runs_used: number; requests_reserved: number }> {
  assertServer();
  try {
    const root = await realpath(/*turbopackIgnore: true*/ projectRoot);
    const runs = await safeDir(root, [...LIVE_DIR, "ledger", grant.grant_id, "runs"], false); const requests = await safeDir(root, [...LIVE_DIR, "ledger", grant.grant_id, "requests"], false);
    return { runs_used: runs ? await countFiles(runs, ".json") : 0, requests_reserved: requests ? await countFiles(requests, ".reserved.json") : 0 };
  } catch { throw new Error("LEDGER_UNAVAILABLE"); }
}
// Owner-side administration (local CLI only). Exclusive writes: an existing grant is never replaced.
export function ownerReplyAuthorizesLive(reply: string): boolean {
  return reply.trim().length > 0 && reply.length <= 500 && /(^|[^A-Za-z0-9])LIVE([^A-Za-z0-9]|$)/i.test(reply) && !/(^|[^A-Za-z0-9])P(0[1-9]|10)([^A-Za-z0-9]|$)/.test(reply);
}
export async function createLiveGrant(projectRoot: string, input: { ownerReply: string; gateId: string; minutes: number; maxRequests: number; maxRuns: number;
  operations: readonly LiveOperation[]; now?: number }): Promise<{ status: "CREATED"; grant_id: string; expires_at: string; max_requests: number; max_runs: number; operations: LiveOperation[] }> {
  assertServer();
  try {
    if (!ownerReplyAuthorizesLive(input.ownerReply) || !Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > MAX_GRANT_MINUTES) throw new Error();
    // Validate everything BEFORE touching the filesystem: a refused creation must leave no trace.
    const now = input.now ?? Date.now();
    const grant = LiveGrantSchema.parse({ revision: "tastegate.live-grant.v1", grant_id: randomUUID(), approval: "AUTHORIZE_BOUNDED_LIVE_SESSION",
      approved_at: new Date(now).toISOString(), expires_at: new Date(now + input.minutes * 60_000).toISOString(), max_requests: input.maxRequests, max_runs: input.maxRuns,
      allowed_operations: [...input.operations], per_request_timeout_ms: 4000, max_response_bytes: 262_144,
      acknowledgements: { credential_exposure_risk: true, unknown_entitlements_and_quota: true, display_and_caching_terms_reviewed: true, no_retries_no_redirects: true },
      owner_reply: input.ownerReply, gate_id: input.gateId });
    const root = await realpath(/*turbopackIgnore: true*/ projectRoot);
    const dir = await safeDir(root, LIVE_DIR, true); if (!dir) throw new Error();
    // A usable grant must be revoked or expired before a new one exists. An old grant file is kept as history, never deleted or overwritten.
    if ((await loadLiveGrant(root, now)).ok) throw new Error();
    if (await readSmall(dir, "grant.json", 8192)) await rename(/*turbopackIgnore: true*/ join(dir, "grant.json"), /*turbopackIgnore: true*/ join(dir, `grant-${now}-${randomUUID().slice(0, 8)}.json`));
    await exclusiveWrite(dir, "grant.json", grant);
    return { status: "CREATED", grant_id: grant.grant_id, expires_at: grant.expires_at, max_requests: grant.max_requests, max_runs: grant.max_runs, operations: [...grant.allowed_operations] };
  } catch { throw new Error("LIVE_GRANT_CREATION_FAILED"); }
}
export async function revokeLiveGrant(projectRoot: string, now = Date.now()): Promise<{ status: "REVOKED" | "NO_ACTIVE_GRANT" }> {
  assertServer();
  const root = await realpath(/*turbopackIgnore: true*/ projectRoot); const dir = await safeDir(root, LIVE_DIR, false); if (!dir) return { status: "NO_ACTIVE_GRANT" };
  const bytes = await readSmall(dir, "grant.json", 8192); if (!bytes) return { status: "NO_ACTIVE_GRANT" };
  const grant = LiveGrantSchema.safeParse(JSON.parse(bytes.toString("utf8"))); if (!grant.success) return { status: "NO_ACTIVE_GRANT" };
  try { await exclusiveWrite(dir, `revoked-${grant.data.grant_id}.json`, { revoked_utc: new Date(now).toISOString() }); } catch { /* already revoked */ }
  return { status: "REVOKED" };
}
