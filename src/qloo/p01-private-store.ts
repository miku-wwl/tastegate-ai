import { lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { P01_PROFILE, blockedP01, P01SummarySchema, validP01Checkpoint, type P01Summary } from "./p01-profile";
import { executeLiveP01, type ProbeStore } from "./p01-runner";

async function checkedDirectory(projectRoot: string): Promise<string> {
  const root = await realpath(projectRoot); let folder = root;
  for (const part of ["private", "qloo-probes", "p01"] ) {
    folder = join(folder, part);
    try { await mkdir(folder, { mode: 0o700 }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
    }
    const info = await lstat(folder);
    if (info.isSymbolicLink() || !info.isDirectory() || await realpath(folder) !== folder ||
        (process.platform !== "win32" && (info.mode & 0o077) !== 0))
      throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
  }
  return folder;
}
async function exclusiveWrite(path: string, bytes: Uint8Array | string): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
type SourceRecord = { revision: string; files: Array<{ path: string; sha256: string }> };
export function createPrivateP01Store(projectRoot: string, source: SourceRecord | null = null): ProbeStore {
  const localProbeId = randomUUID();
  let reserved: string | null = null;
  return Object.freeze({
    async reserve() {
      const folder = await checkedDirectory(projectRoot);
      // The persistent one-attempt marker is not reset on timeout, failure or restart.
      await exclusiveWrite(join(folder, "attempt.json"), JSON.stringify({ profile: P01_PROFILE, local_probe_id: localProbeId,
        source, maximum_dispatches: 1,
        reserved_utc: new Date().toISOString(), state: "RESERVED_NO_AUTOMATIC_REPLAY" }, null, 2) + "\n");
      reserved = folder;
    },
    async saveRaw(bytes: Uint8Array) {
      if (!reserved) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
      await exclusiveWrite(join(reserved, "response.raw.json"), bytes);
    },
    async saveSummary(summary: P01Summary) {
      if (!reserved) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
      await exclusiveWrite(join(reserved, "summary.json"), JSON.stringify({ local_probe_id: localProbeId,
        summary: P01SummarySchema.parse(summary) }, null, 2) + "\n");
    },
  });
}

// This function is only called by the separate opt-in CLI. No Next route imports this module.
export async function liveP01FromPrivateCheckpoint(projectRoot: string, signal?: AbortSignal): Promise<P01Summary> {
  const filename = resolve(projectRoot, "private/qloo-probes/p01-checkpoint.json");
  let checkpoint: unknown;
  try {
    // Reject links and oversized setup state; never load dotenv, shell history or other credentials.
    const root = await realpath(projectRoot);
    for (const relative of ["private", "private/qloo-probes"]) {
      const parentPath = resolve(root, relative); const parent = await lstat(parentPath);
      if (parent.isSymbolicLink() || !parent.isDirectory() || await realpath(parentPath) !== parentPath) return blockedP01();
    }
    const file = await lstat(filename);
    if (file.isSymbolicLink() || !file.isFile() || file.size > 4096) return blockedP01();
    checkpoint = JSON.parse(await readFile(filename, "utf8")) as unknown;
  } catch { return blockedP01(); }
  if (!validP01Checkpoint(checkpoint)) return blockedP01();
  let source: SourceRecord;
  try {
    const revision = execFileSync("git", ["-C", projectRoot, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    if (!/^[a-f0-9]{40}$/.test(revision)) return blockedP01("EVIDENCE_UNAVAILABLE");
    const files = [];
    for (const path of ["src/qloo/boundary-error.ts", "src/qloo/server-config.ts", "src/qloo/p01-profile.ts",
      "src/qloo/p01-runner.ts", "src/qloo/p01-private-store.ts", "scripts/qloo-probe.mjs", "package.json", "package-lock.json"]) {
      files.push({ path, sha256: createHash("sha256").update(await readFile(resolve(projectRoot, path))).digest("hex") });
    }
    source = { revision, files };
  } catch { return blockedP01("EVIDENCE_UNAVAILABLE"); }
  return executeLiveP01({ checkpoint, signal }, createPrivateP01Store(projectRoot, source));
}
