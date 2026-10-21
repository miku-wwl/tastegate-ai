import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rename } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { assertServer } from "./boundary-error";
import { CONSENT_REVISION, canonicalApproval, isConsentSubjectId, replyIsCanonicalApproval, termsDigest, type ConsentTerms } from "./owner-consent";

// AUTHORIZED_LIVE authority. A live Qloo request needs ALL of: a server-side credential, an owner-created grant
// file (this module), and an explicit live action. An environment variable, the app being opened, or a generic demo
// click is never authority. The grant is time-boxed, request-budgeted and run-budgeted; every dispatch is recorded
// in a durable ledger BEFORE it is sent, so budgets survive restarts and an unsettled request still counts.
// Nothing here prints, logs or persists a provider ID, response body or credential.
//
// How a grant comes to exist (v2):
//   1. `proposeLiveGrant` writes the TERMS (operations, endpoints, allowed parameters, budgets, timeouts, size cap,
//      environment, expiry of the offer, a unique identity) as a proposal and prints the one canonical sentence that approves them.
//   2. `createLiveGrant` reads the terms from that stored proposal (never from the caller), accepts only a reply that is
//      exactly that sentence (see owner-consent.ts: no keyword matching), consumes the proposal, then writes the grant.
//   3. `loadLiveGrant` re-derives the terms from the grant, and refuses it unless the digest, the sentence, the proposal
//      and its consumption marker all still agree. A hand-edited limit, an old-format grant or a free-text reply is invalid.
export const LIVE_OPERATIONS = ["entity_lookup", "tag_lookup", "rank_places", "discover_places"] as const;
export type LiveOperation = typeof LIVE_OPERATIONS[number];
export const LIVE_ENDPOINT: Record<LiveOperation, "/search" | "/v2/tags" | "/v2/insights"> =
  { entity_lookup: "/search", tag_lookup: "/v2/tags", rank_places: "/v2/insights", discover_places: "/v2/insights" };
// The query-parameter names each fixed request builder may send. The grant's terms bind them, so a builder that starts sending
// anything else needs a new approval (the digest changes) and the adapter refuses it before reserving a slot.
export const LIVE_PARAMETERS: Record<LiveOperation, readonly string[]> = {
  entity_lookup: ["page", "query", "take", "types"],
  tag_lookup: ["filter.query", "page", "take"],
  rank_places: ["filter.results.entities", "filter.type", "signal.interests.entities", "take"],
  discover_places: ["filter.type", "signal.interests.entities", "take"],
};
export function parametersAllowed(operation: LiveOperation, names: readonly string[]): boolean {
  return names.every((name) => LIVE_PARAMETERS[operation].includes(name)) && new Set(names).size === names.length;
}
// Mirrors LIVE_ORIGIN in live-transport.ts (a test pins them together); kept here so the owner CLI needs no network module.
export const GRANT_ORIGIN = "https://hackathon.api.qloo.com" as const;
export const GRANT_ENVIRONMENTS = ["DEVELOPMENT", "PRODUCTION_LIVE"] as const;
export type GrantEnvironment = typeof GRANT_ENVIRONMENTS[number];
export const MAX_GRANT_MINUTES = 60;
export const PROPOSAL_WINDOW_MINUTES = 60;
const MAX_PROPOSAL_FILES = 150; // 50 offers x (offer + consumed/withdrawn marker): a bound against runaway proposal creation

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const operationList = z.array(z.enum(LIVE_OPERATIONS)).min(1).max(4).refine((v) => new Set(v).size === v.length, "Duplicate operations");
export const LiveGrantSchema = z.strictObject({
  revision: z.literal("tastegate.live-grant.v2"), grant_id: z.uuidv4(), approval: z.literal("AUTHORIZE_BOUNDED_LIVE_SESSION"),
  environment: z.enum(GRANT_ENVIRONMENTS), approved_at: z.iso.datetime(), expires_at: z.iso.datetime(),
  duration_minutes: z.number().int().min(1).max(MAX_GRANT_MINUTES),
  max_requests: z.number().int().min(1).max(14), max_runs: z.number().int().min(1).max(5), max_concurrency: z.literal(1),
  allowed_operations: operationList,
  per_request_timeout_ms: z.literal(4000), max_response_bytes: z.literal(262_144),
  acknowledgements: z.strictObject({ credential_exposure_risk: z.literal(true), unknown_entitlements_and_quota: z.literal(true),
    display_and_caching_terms_reviewed: z.literal(true), no_retries_no_redirects: z.literal(true) }),
  // `proposal_id` is the grant's unique identity; `terms_sha256` is the digest the owner's sentence was derived from.
  consent: z.strictObject({ revision: z.literal(CONSENT_REVISION), proposal_id: z.uuidv4(), approve_before: z.iso.datetime(), terms_sha256: sha }),
  owner_reply: z.string().min(1).max(200),
});
export type LiveGrant = z.infer<typeof LiveGrantSchema>;
export const LiveProposalSchema = z.strictObject({
  revision: z.literal("tastegate.live-proposal.v1"), proposal_id: z.uuidv4(), created_at: z.iso.datetime(), approve_before: z.iso.datetime(),
  environment: z.enum(GRANT_ENVIRONMENTS), allowed_operations: operationList, duration_minutes: z.number().int().min(1).max(MAX_GRANT_MINUTES),
  max_requests: z.number().int().min(1).max(14), max_runs: z.number().int().min(1).max(5), terms_sha256: sha,
});
export type LiveProposal = z.infer<typeof LiveProposalSchema>;
export type GrantFailure = "GRANT_MISSING" | "GRANT_INVALID" | "GRANT_NOT_YET_VALID" | "GRANT_EXPIRED" | "GRANT_REVOKED" | "LEDGER_UNAVAILABLE";
export type GrantStatus = { ok: true; grant: LiveGrant } | { ok: false; reason: GrantFailure };

type TermsInput = Pick<LiveGrant, "environment" | "allowed_operations" | "duration_minutes" | "max_requests" | "max_runs"> & { approve_before: string };
// (a proposal carries the same five fields plus its own `approve_before`, so it satisfies this shape directly)
// Everything the owner is approving, derived from code constants plus the few numbers the owner chose. If a constant (an endpoint,
// a parameter list, a limit) changes after approval, the digest no longer matches and the grant stops being valid.
function liveTerms(t: TermsInput): ConsentTerms {
  return {
    environment: t.environment, endpoint: { origin: GRANT_ORIGIN, method: "GET" },
    operations: [...t.allowed_operations].sort().map((operation) => ({ operation, path: LIVE_ENDPOINT[operation], parameters: [...LIVE_PARAMETERS[operation]] })),
    limits: { duration_minutes: t.duration_minutes, max_requests: t.max_requests, max_runs: t.max_runs, max_concurrency: 1, per_request_timeout_ms: 4000,
      max_response_bytes: 262_144, retries: 0, redirects: 0 },
    approve_before: t.approve_before, credential: "SERVER_SIDE_ONLY", single_use_approval: true,
    revocation: "OWNER_LOCAL_REVOKE_MARKER_CHECKED_ON_EVERY_LOAD_AND_RESERVATION",
  };
}

const LIVE_DIR = ["private", "qloo-live"] as const;
const PROPOSAL_DIR = [...LIVE_DIR, "proposals"] as const;
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
const decode = (bytes: Buffer): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

export function validGrantWindow(grant: LiveGrant, now: number): "OK" | "GRANT_NOT_YET_VALID" | "GRANT_EXPIRED" | "GRANT_INVALID" {
  const start = Date.parse(grant.approved_at); const end = Date.parse(grant.expires_at);
  if (!(end > start) || end - start > MAX_GRANT_MINUTES * 60_000) return "GRANT_INVALID";
  return start > now ? "GRANT_NOT_YET_VALID" : end <= now ? "GRANT_EXPIRED" : "OK";
}

// A proposal is only ever read back through this function: it re-derives the digest from the stored terms, so a hand-edited
// proposal (a larger budget, another operation, a later deadline) is refused rather than approved under the old sentence.
async function readProposal(proposals: string, id: string): Promise<LiveProposal> {
  if (!isConsentSubjectId(id)) throw new Error("PROPOSAL_INVALID");
  const bytes = await readSmall(proposals, `${id}.json`, 4096); if (!bytes) throw new Error("PROPOSAL_MISSING");
  const proposal = LiveProposalSchema.parse(decode(bytes));
  if (proposal.proposal_id !== id || Date.parse(proposal.approve_before) - Date.parse(proposal.created_at) !== PROPOSAL_WINDOW_MINUTES * 60_000 ||
      proposal.terms_sha256 !== termsDigest("LIVE_GRANT", id, liveTerms(proposal))) throw new Error("PROPOSAL_INVALID");
  return proposal;
}
// The grant must be exactly what the owner's sentence approved, and the proposal it came from must be consumed by it.
async function grantIsConsistent(root: string, grant: LiveGrant): Promise<boolean> {
  if (grant.consent.proposal_id !== grant.grant_id) return false;
  const digest = termsDigest("LIVE_GRANT", grant.grant_id, liveTerms({ ...grant, approve_before: grant.consent.approve_before }));
  if (digest !== grant.consent.terms_sha256 || grant.owner_reply !== canonicalApproval("LIVE_GRANT", grant.grant_id, digest)) return false;
  const start = Date.parse(grant.approved_at);
  if (Date.parse(grant.expires_at) - start !== grant.duration_minutes * 60_000 || start > Date.parse(grant.consent.approve_before)) return false;
  const proposals = await safeDir(root, PROPOSAL_DIR, false); if (!proposals) return false;
  const proposal = await readProposal(proposals, grant.grant_id);
  if (proposal.terms_sha256 !== digest || proposal.approve_before !== grant.consent.approve_before) return false;
  const marker = await readSmall(proposals, `${grant.grant_id}.consumed.json`, 4096); if (!marker) return false;
  const consumed = z.strictObject({ revision: z.literal("tastegate.live-proposal-consumed.v1"), proposal_id: z.uuidv4(), grant_id: z.uuidv4(), consumed_utc: z.iso.datetime() }).parse(decode(marker));
  return consumed.proposal_id === grant.grant_id && consumed.grant_id === grant.grant_id;
}
// `environment` is where this process runs (the owner CLI and tests default to DEVELOPMENT). A grant approved for one environment is not valid in another.
export async function loadLiveGrant(projectRoot: string, now = Date.now(), environment: GrantEnvironment = "DEVELOPMENT"): Promise<GrantStatus> {
  assertServer();
  try {
    const root = await realpath(/*turbopackIgnore: true*/ projectRoot); const dir = await safeDir(root, LIVE_DIR, false);
    if (!dir) return { ok: false, reason: "GRANT_MISSING" };
    const bytes = await readSmall(dir, "grant.json", 8192); if (!bytes) return { ok: false, reason: "GRANT_MISSING" };
    const parsed = LiveGrantSchema.safeParse(decode(bytes));
    if (!parsed.success) return { ok: false, reason: "GRANT_INVALID" };
    if (await readSmall(dir, `revoked-${parsed.data.grant_id}.json`, 4096)) return { ok: false, reason: "GRANT_REVOKED" };
    if (parsed.data.environment !== environment || !await grantIsConsistent(root, parsed.data)) return { ok: false, reason: "GRANT_INVALID" };
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
// The grant passed in is re-validated against the stored grant: a stale, revoked or hand-built object cannot start a run.
export async function startLiveRun(projectRoot: string, grant: LiveGrant, now = Date.now()): Promise<LiveRunHandle | { reason: "LIVE_RUN_LIMIT_REACHED" | "LEDGER_UNAVAILABLE" | GrantFailure }> {
  assertServer();
  try {
    if (validGrantWindow(grant, now) !== "OK") return { reason: "GRANT_EXPIRED" };
    const current = await loadLiveGrant(projectRoot, now, grant.environment);
    if (!current.ok) return { reason: current.reason };
    if (JSON.stringify(current.grant) !== JSON.stringify(grant)) return { reason: "GRANT_INVALID" };
    const root = await realpath(/*turbopackIgnore: true*/ projectRoot);
    const liveDir = await safeDir(root, LIVE_DIR, false); if (!liveDir) return { reason: "LEDGER_UNAVAILABLE" };
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
        // Revocation takes effect on the very next request, not only at the next load.
        if (await readSmall(liveDir, `revoked-${grant.grant_id}.json`, 4096)) throw new Error("LIVE_GRANT_REVOKED");
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

export type LiveProposalResult = { status: "PROPOSED"; proposal_id: string; approve_before: string; environment: GrantEnvironment; operations: LiveOperation[];
  minutes: number; max_requests: number; max_runs: number; terms_sha256: string; approval_statement: string };
// Owner-side administration (local CLI only). A proposal has no authority: it only records the terms and returns the one
// sentence that approves them. Validation happens before the filesystem is touched, so a refused proposal leaves no trace.
export async function proposeLiveGrant(projectRoot: string, input: { minutes: number; maxRequests: number; maxRuns: number;
  operations: readonly LiveOperation[]; environment?: GrantEnvironment; now?: number }): Promise<LiveProposalResult> {
  assertServer();
  try {
    // PRODUCTION_LIVE is not creatable: its operator-side safety design (quotas, rate limits, kill switch, observability) is not approved.
    const environment = input.environment ?? "DEVELOPMENT"; if (environment !== "DEVELOPMENT") throw new Error();
    const now = input.now ?? Date.now(); const id = randomUUID();
    const approveBefore = new Date(now + PROPOSAL_WINDOW_MINUTES * 60_000).toISOString();
    const terms = LiveProposalSchema.pick({ environment: true, allowed_operations: true, duration_minutes: true, max_requests: true, max_runs: true })
      .parse({ environment, allowed_operations: [...input.operations], duration_minutes: input.minutes, max_requests: input.maxRequests, max_runs: input.maxRuns });
    const digest = termsDigest("LIVE_GRANT", id, liveTerms({ ...terms, approve_before: approveBefore }));
    const proposal = LiveProposalSchema.parse({ revision: "tastegate.live-proposal.v1", proposal_id: id, created_at: new Date(now).toISOString(), approve_before: approveBefore, ...terms, terms_sha256: digest });
    const root = await realpath(/*turbopackIgnore: true*/ projectRoot);
    if ((await loadLiveGrant(root, now, environment)).ok) throw new Error(); // a usable grant must be revoked or expire first
    const proposals = await safeDir(root, PROPOSAL_DIR, true); if (!proposals) throw new Error();
    if ((await readdir(/*turbopackIgnore: true*/ proposals)).length > MAX_PROPOSAL_FILES) throw new Error();
    await exclusiveWrite(proposals, `${id}.json`, proposal);
    return { status: "PROPOSED", proposal_id: id, approve_before: approveBefore, environment, operations: [...proposal.allowed_operations], minutes: proposal.duration_minutes,
      max_requests: proposal.max_requests, max_runs: proposal.max_runs, terms_sha256: digest, approval_statement: canonicalApproval("LIVE_GRANT", id, digest) };
  } catch { throw new Error("LIVE_PROPOSAL_FAILED"); }
}
// Turns a proposal into a grant ONLY IF the reply is exactly its sentence. The caller supplies no terms: they come from the
// stored proposal, so parameter substitution at approval time is impossible. The proposal is consumed before the grant is written.
export async function createLiveGrant(projectRoot: string, input: { proposalId: string; ownerReply: string; now?: number }):
  Promise<{ status: "CREATED"; grant_id: string; expires_at: string; max_requests: number; max_runs: number; operations: LiveOperation[] }> {
  assertServer();
  try {
    if (!isConsentSubjectId(input.proposalId) || typeof input.ownerReply !== "string") throw new Error();
    const now = input.now ?? Date.now();
    const root = await realpath(/*turbopackIgnore: true*/ projectRoot);
    const dir = await safeDir(root, LIVE_DIR, false); const proposals = await safeDir(root, PROPOSAL_DIR, false); if (!dir || !proposals) throw new Error();
    const proposal = await readProposal(proposals, input.proposalId);
    if (await readSmall(proposals, `${proposal.proposal_id}.consumed.json`, 4096) || await readSmall(proposals, `${proposal.proposal_id}.withdrawn.json`, 4096)) throw new Error();
    if (Date.parse(proposal.created_at) > now || Date.parse(proposal.approve_before) <= now) throw new Error();
    if (!replyIsCanonicalApproval(input.ownerReply, canonicalApproval("LIVE_GRANT", proposal.proposal_id, proposal.terms_sha256))) throw new Error();
    // A usable grant must be revoked or expired before a new one exists. An old grant file is kept as history, never deleted or overwritten.
    if ((await loadLiveGrant(root, now, proposal.environment)).ok) throw new Error();
    const grant = LiveGrantSchema.parse({ revision: "tastegate.live-grant.v2", grant_id: proposal.proposal_id, approval: "AUTHORIZE_BOUNDED_LIVE_SESSION", environment: proposal.environment,
      approved_at: new Date(now).toISOString(), expires_at: new Date(now + proposal.duration_minutes * 60_000).toISOString(), duration_minutes: proposal.duration_minutes,
      max_requests: proposal.max_requests, max_runs: proposal.max_runs, max_concurrency: 1, allowed_operations: [...proposal.allowed_operations],
      per_request_timeout_ms: 4000, max_response_bytes: 262_144,
      acknowledgements: { credential_exposure_risk: true, unknown_entitlements_and_quota: true, display_and_caching_terms_reviewed: true, no_retries_no_redirects: true },
      consent: { revision: CONSENT_REVISION, proposal_id: proposal.proposal_id, approve_before: proposal.approve_before, terms_sha256: proposal.terms_sha256 },
      owner_reply: input.ownerReply.trim() });
    // Consume first: a crash between the two writes leaves a spent proposal and no grant (fail closed), never a replayable sentence.
    await exclusiveWrite(proposals, `${proposal.proposal_id}.consumed.json`, { revision: "tastegate.live-proposal-consumed.v1", proposal_id: proposal.proposal_id, grant_id: grant.grant_id, consumed_utc: new Date(now).toISOString() });
    if (await readSmall(dir, "grant.json", 8192)) await rename(/*turbopackIgnore: true*/ join(dir, "grant.json"), /*turbopackIgnore: true*/ join(dir, `grant-${now}-${randomUUID().slice(0, 8)}.json`));
    await exclusiveWrite(dir, "grant.json", grant);
    return { status: "CREATED", grant_id: grant.grant_id, expires_at: grant.expires_at, max_requests: grant.max_requests, max_runs: grant.max_runs, operations: [...grant.allowed_operations] };
  } catch { throw new Error("LIVE_GRANT_CREATION_FAILED"); }
}
// Revokes the current grant (the file is kept as history) and withdraws every proposal that has not been used, so an offer the
// owner no longer wants cannot be approved later.
export async function revokeLiveGrant(projectRoot: string, now = Date.now()): Promise<{ status: "REVOKED" | "NO_ACTIVE_GRANT"; withdrawn_proposals: number }> {
  assertServer();
  const root = await realpath(/*turbopackIgnore: true*/ projectRoot); const dir = await safeDir(root, LIVE_DIR, false);
  if (!dir) return { status: "NO_ACTIVE_GRANT", withdrawn_proposals: 0 };
  let withdrawn = 0; const proposals = await safeDir(root, PROPOSAL_DIR, false);
  if (proposals) for (const name of await readdir(/*turbopackIgnore: true*/ proposals)) {
    const parts = name.split("."); const id = parts[0] ?? ""; if (parts.length !== 2 || parts[1] !== "json" || !isConsentSubjectId(id)) continue;
    if (await readSmall(proposals, `${id}.consumed.json`, 4096) || await readSmall(proposals, `${id}.withdrawn.json`, 4096)) continue;
    try { await exclusiveWrite(proposals, `${id}.withdrawn.json`, { revision: "tastegate.live-proposal-withdrawn.v1", proposal_id: id, withdrawn_utc: new Date(now).toISOString() }); withdrawn++; } catch { /* already withdrawn */ }
  }
  const bytes = await readSmall(dir, "grant.json", 8192); if (!bytes) return { status: "NO_ACTIVE_GRANT", withdrawn_proposals: withdrawn };
  const grant = LiveGrantSchema.safeParse(decode(bytes)); if (!grant.success) return { status: "NO_ACTIVE_GRANT", withdrawn_proposals: withdrawn };
  try { await exclusiveWrite(dir, `revoked-${grant.data.grant_id}.json`, { revoked_utc: new Date(now).toISOString() }); } catch { /* already revoked */ }
  return { status: "REVOKED", withdrawn_proposals: withdrawn };
}
