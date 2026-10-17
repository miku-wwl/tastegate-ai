import { lstat, mkdir, open, readFile, readdir, realpath, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { P01_PROFILE, P01CheckpointSchema, blockedP01, P01SummarySchema, validP01Checkpoint, type P01Checkpoint, type P01Summary } from "./p01-profile";
import { executeLiveP01, type ProbeStore } from "./p01-runner";
import { loadLocalP01Config } from "./p01-local-env";

async function checkedDirectory(projectRoot: string): Promise<string> {
  const root = await realpath(projectRoot); let folder = root;
  for (const part of ["private", "qloo-probes", "p01", "attempts"]) {
    folder = join(folder, part);
    try { await mkdir(folder, { mode: 0o700 }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
    }
    const info = await lstat(folder);
    if (info.isSymbolicLink() || !info.isDirectory() || await realpath(folder) !== folder ||
        (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
  }
  return folder;
}
async function exclusiveWrite(path: string, bytes: Uint8Array | string): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
  }
}
async function privateJson(path: string, cap = 32_768): Promise<unknown> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > cap || await realpath(path) !== path) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
  const handle = await open(path, "r");
  try {
    const bytes = Buffer.alloc(cap + 1); const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > cap) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead))) as unknown;
  } finally { await handle.close(); }
}
type SourceRecord = { revision: string; files: Array<{ path: string; sha256: string }> };
async function ledger(attempts: string, ownedLock?: string) {
  const folder = resolve(attempts, ".."); const lockPath = join(folder, "active.lock");
  const activeLock = await exists(lockPath); const legacy = await exists(join(folder, "attempt.json"));
  if (activeLock) {
    const lock = await privateJson(lockPath) as { attempt_id?: unknown };
    if (!ownedLock || lock.attempt_id !== ownedLock) throw new Error("LEDGER_BUSY_OR_REVIEW_REQUIRED");
  }
  if (legacy) throw new Error("LEGACY_ATTEMPT_REVIEW_REQUIRED");
  const children = await readdir(attempts, { withFileTypes: true });
  if (children.length > 1000) throw new Error("LEDGER_REVIEW_REQUIRED");
  const records: Array<{ checkpoint: P01Checkpoint; summary: P01Summary | null }> = [];
  for (const child of children) {
    if (!child.isDirectory() || child.isSymbolicLink() || !P01CheckpointSchema.shape.attempt_id.safeParse(child.name).success)
      throw new Error("LEDGER_REVIEW_REQUIRED");
    const path = join(attempts, child.name);
    if (await realpath(path) !== path) throw new Error("LEDGER_REVIEW_REQUIRED");
    const record = await privateJson(join(path, "attempt.json")) as { checkpoint?: unknown };
    const checkpoint = P01CheckpointSchema.parse(record.checkpoint);
    if (checkpoint.attempt_id !== child.name) throw new Error("LEDGER_REVIEW_REQUIRED");
    const summaryPath = join(path, "summary.json"); let summary: P01Summary | null = null;
    if (await exists(summaryPath)) {
      const value = await privateJson(summaryPath) as { summary?: unknown };
      summary = P01SummarySchema.parse(value.summary);
      if (summary.attempt_id !== child.name) throw new Error("LEDGER_REVIEW_REQUIRED");
    }
    records.push({ checkpoint, summary });
  }
  records.sort((a, b) => a.checkpoint.prior_reserved_attempts - b.checkpoint.prior_reserved_attempts);
  let previous: string | null = null; let dispatches = 0; let unresolved = 0; let unrecorded = 0;
  for (const [index, record] of records.entries()) {
    if (record.checkpoint.prior_reserved_attempts !== index || record.checkpoint.previous_attempt_id !== previous)
      throw new Error("LEDGER_REVIEW_REQUIRED");
    previous = record.checkpoint.attempt_id;
    dispatches += record.summary?.dispatches ?? 0;
    if (!record.summary) unrecorded++;
    if (!record.summary || !record.summary.transport_settled) unresolved++;
  }
  return { reserved_attempts: records.length, recorded_dispatches: dispatches, unresolved_attempts: unresolved,
    conservative_dispatch_upper_bound: dispatches + unrecorded, last_attempt_id: previous };
}
export async function inspectPrivateP01Ledger(projectRoot: string) {
  const attempts = await checkedDirectory(projectRoot);
  return ledger(attempts);
}
export function createPrivateP01Store(projectRoot: string, checkpoint: P01Checkpoint, source: SourceRecord | null = null): ProbeStore {
  const id = checkpoint.attempt_id; let reserved: string | null = null; let lockPath: string | null = null;
  async function releaseLock() {
    if (!lockPath) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
    const lock = await privateJson(lockPath) as { attempt_id?: unknown };
    if (lock.attempt_id !== id) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
    await unlink(lockPath); lockPath = null;
  }
  return Object.freeze({
    async reserve() {
      if (!validP01Checkpoint(checkpoint) || reserved) throw new Error("CHECKPOINT_REQUIRED");
      const attempts = await checkedDirectory(projectRoot); const lock = join(resolve(attempts, ".."), "active.lock");
      await exclusiveWrite(lock, JSON.stringify({ attempt_id: id }) + "\n"); lockPath = lock;
      let created = false;
      try {
        const previous = await ledger(attempts, id);
        if (previous.unresolved_attempts || previous.reserved_attempts !== checkpoint.prior_reserved_attempts ||
            previous.last_attempt_id !== checkpoint.previous_attempt_id) throw new Error("PRIOR_ATTEMPTS_NOT_REVIEWED");
        const folder = join(attempts, id); await mkdir(folder, { mode: 0o700 }); created = true;
        await exclusiveWrite(join(folder, "attempt.json"), JSON.stringify({ profile: P01_PROFILE, checkpoint, source,
          previous_accounting: previous, maximum_dispatches: 1, reserved_utc: new Date().toISOString(),
          state: "RESERVED_NO_AUTOMATIC_REPLAY" }, null, 2) + "\n");
        reserved = folder;
      } catch {
        // Once a record directory exists, retain the lock on incomplete preparation for human review.
        if (!created) await releaseLock();
        throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
      }
    },
    async saveRaw(bytes: Uint8Array) {
      if (!reserved || bytes.byteLength > 65_536) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
      await exclusiveWrite(join(reserved, "response.raw.json"), bytes);
    },
    async saveSummary(summary: P01Summary) {
      if (!reserved || summary.attempt_id !== id) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
      const checked = P01SummarySchema.parse(summary);
      await exclusiveWrite(join(reserved, "summary.json"), JSON.stringify({ summary: checked }, null, 2) + "\n");
      // Unsettled transport or interrupted capture keeps the durable cross-process lock.
      if (checked.transport_settled) await releaseLock();
    },
  });
}

// Only the opt-in local CLI calls this; no Next route imports this module.
export async function liveP01FromPrivateCheckpoint(projectRoot: string, signal?: AbortSignal): Promise<P01Summary> {
  let checkpoint: unknown;
  try {
    const root = await realpath(projectRoot);
    for (const relative of ["private", "private/qloo-probes"]) {
      const parentPath = resolve(root, relative); const parent = await lstat(parentPath);
      if (parent.isSymbolicLink() || !parent.isDirectory() || await realpath(parentPath) !== parentPath) return blockedP01();
    }
    checkpoint = await privateJson(resolve(root, "private/qloo-probes/p01-checkpoint.json"), 8192);
  } catch { return blockedP01(); }
  if (!validP01Checkpoint(checkpoint)) return blockedP01();
  const approved = P01CheckpointSchema.parse(checkpoint);
  let local: Awaited<ReturnType<typeof loadLocalP01Config>>;
  try { local = await loadLocalP01Config(projectRoot); }
  catch (error) { return blockedP01((error as Error).message === "UNSAFE_DIAGNOSTICS" ? "UNSAFE_DIAGNOSTICS" : "CONFIG_BLOCKED"); }
  let source: SourceRecord;
  try {
    const revision = execFileSync("git", ["-C", projectRoot, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (!/^[a-f0-9]{40}$/.test(revision)) return blockedP01("EVIDENCE_UNAVAILABLE");
    const files = [];
    for (const path of ["src/qloo/boundary-error.ts", "src/qloo/server-config.ts", "src/qloo/p01-profile.ts",
      "src/qloo/p01-runner.ts", "src/qloo/p01-private-store.ts", "src/qloo/p01-local-env.ts", "scripts/qloo-probe.mjs", "package.json", "package-lock.json"])
      files.push({ path, sha256: createHash("sha256").update(await readFile(resolve(projectRoot, path))).digest("hex") });
    source = { revision, files };
  } catch { return blockedP01("EVIDENCE_UNAVAILABLE"); }
  return executeLiveP01({ checkpoint: approved, signal }, createPrivateP01Store(projectRoot, approved, source), local.config);
}
