// Pure scanning helpers for the deployment-safety gate (scripts/deploy-safety.mjs). They look for planted canaries and for
// sensitive paths and strings inside a build output, and they report only LABELS, relative paths and counts: a needle's text
// is never returned, printed or logged.
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const FORBIDDEN_PATH = [
  { label: "private_directory", pattern: /(^|\/)private(\/|$)/ },
  { label: "env_file", pattern: /(^|\/)\.env(\.(?!example$)[^/]*)?$/ },
  { label: "local_artifacts", pattern: /(^|\/)\.artifacts(\/|$)/ },
  { label: "local_cache", pattern: /(^|\/)\.cache(\/|$)/ },
  { label: "test_results", pattern: /(^|\/)test-results(\/|$)/ },
  { label: "git_directory", pattern: /(^|\/)\.git(\/|$)/ },
];
const posix = (path) => path.split(sep).join("/");
export const forbiddenPathLabels = (rel) => FORBIDDEN_PATH.filter((f) => f.pattern.test(posix(rel))).map((f) => f.label);

// Encodings a secret can plausibly take when a bundler or a framework serializes it.
export function variants(secret) {
  if (secret.length < 8) return []; // too short to be a meaningful secret: it would only produce false positives
  const raw = Buffer.from(secret, "utf8");
  return [...new Set([secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1), raw.toString("base64"), raw.toString("hex")])]
    .filter((v) => v.length >= 8).map((v) => Buffer.from(v, "utf8"));
}

/** @param {string} root @param {{ skipDirs?: string[] }} [options] */
export async function* walk(root, { skipDirs = [] } = {}) {
  const skip = new Set(skipDirs.map(posix));
  async function* inner(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name); const rel = posix(relative(root, full));
      if (entry.isDirectory()) { if (skip.has(rel)) { yield { rel, skippedDirectory: true }; continue; } yield* inner(full); }
      else yield { rel, full, symlink: entry.isSymbolicLink() };
    }
  }
  yield* inner(root);
}

// needles: pairs of [label, secret] (a Map works; so does an array when several secrets share a label). Returns where each label was found, never the secret.
/** @param {string} root @param {{ needles?: Iterable<[string, string]>, skipDirs?: string[], maxBytes?: number, checkPaths?: boolean }} [options] */
export async function scanTree(root, { needles = new Map(), skipDirs = [], maxBytes = 64 * 1024 * 1024, checkPaths = true } = {}) {
  const compiled = [...needles].map(([label, value]) => ({ label, variants: variants(value) })).filter((n) => n.variants.length);
  const findings = []; const skipped = []; let files = 0; let bytes = 0;
  for await (const item of walk(root, { skipDirs })) {
    if (item.skippedDirectory) { skipped.push({ path: item.rel, reason: "excluded directory" }); continue; }
    files++;
    if (checkPaths) for (const label of forbiddenPathLabels(item.rel)) findings.push({ kind: "path", label, file: item.rel });
    let info; try { info = await lstat(item.full); } catch { continue; }
    if (item.symlink || !info.isFile()) { if (item.symlink) skipped.push({ path: item.rel, reason: "symbolic link (not followed)" }); continue; }
    if (info.size > maxBytes) { skipped.push({ path: item.rel, reason: "larger than the scan limit" }); continue; }
    if (!compiled.length) continue;
    const content = await readFile(item.full); bytes += content.length;
    for (const n of compiled) if (n.variants.some((v) => content.includes(v))) findings.push({ kind: "content", label: n.label, file: item.rel });
  }
  return { files, bytes, findings, skipped };
}

// A trace file lists every file a server entry may read at runtime. None of them may be a sensitive path.
/** @param {string} root @param {{ skipDirs?: string[] }} [options] */
export async function scanTraces(root, { skipDirs = [] } = {}) {
  const findings = []; let traces = 0; let entries = 0;
  for await (const item of walk(root, { skipDirs })) {
    if (item.skippedDirectory || !item.rel.endsWith(".nft.json")) continue;
    traces++;
    let parsed; try { parsed = JSON.parse(await readFile(item.full, "utf8")); } catch { findings.push({ kind: "trace", label: "unreadable_trace", file: item.rel }); continue; }
    for (const file of Array.isArray(parsed?.files) ? parsed.files : []) {
      entries++; for (const label of forbiddenPathLabels(String(file).replaceAll("\\", "/"))) findings.push({ kind: "trace", label, file: item.rel });
    }
  }
  return { traces, entries, findings };
}
// Collapses findings into label -> count and the (relative) files involved, for a report that carries no secret.
export function summarizeFindings(findings) {
  const byLabel = {}; for (const f of findings) { const row = (byLabel[f.label] ??= { kind: f.kind, count: 0, files: [] }); row.count++; if (row.files.length < 5 && !row.files.includes(f.file)) row.files.push(f.file); }
  return byLabel;
}
