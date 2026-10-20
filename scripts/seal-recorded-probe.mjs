// Local review/seal step for an EXECUTED P06 (fixed-shortlist ranking). It never contacts Qloo and never prints a
// provider ID, score, name or hash.
//
//   --inspect-p06   classify the saved response (ALL_RETURNED / PARTIAL / UNEXPECTED_ENTITY / INCOMPATIBLE_SCORES /
//                   RESPONSE_UNUSABLE) and print sanitized structure counts. Writes nothing.
//   --seal-p06      after a human reviewed that classification: write the post-execution integrity manifest that lets the
//                   product REPLAY the response, then prove the real product loader accepts it. If the loader refuses,
//                   the new seal is removed again so the state returns to "review required".
//
// Historical probe evidence is never modified. The seal manifest is the only file this script creates.
import { mkdir, mkdtemp, open, readFile, readdir, realpath, rm, writeFile, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
const fail = (reason) => { process.stderr.write(JSON.stringify({ status: "BLOCKED", reason }) + "\n"); process.exitCode = 2; };
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  if (process.argv.length !== 3 || !["--inspect-p06", "--seal-p06"].includes(mode)) throw new Error("INVALID_ARGUMENTS");
  const root = await realpath(project); const base = join(root, "private", "qloo-probes");
  const attemptsDir = join(base, "p06", "attempts");
  const attempts = (await readdir(attemptsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  if (attempts.length !== 1) throw new Error("EXACTLY_ONE_P06_ATTEMPT_REQUIRED");
  const attemptId = attempts[0]; const dir = join(attemptsDir, attemptId);
  const files = ["attempt.json", "summary.json", "response.raw.json"];
  const bytes = {}; for (const name of files) { try { bytes[name] = await readFile(join(dir, name)); } catch (error) { if (error.code !== "ENOENT" || name !== "response.raw.json") throw error; } }
  const summary = JSON.parse(bytes["summary.json"].toString("utf8")).summary;
  const attempt = JSON.parse(bytes["attempt.json"].toString("utf8"));
  if (summary.probe !== "P06" || summary.attempt_id !== attemptId || attempt.checkpoint.attempt_id !== attemptId || summary.dispatches !== 1) throw new Error("P06_ATTEMPT_RECORD_MISMATCH");

  // Compile the real product modules into a mirrored tree so the exact production code classifies and verifies.
  const cache = join(root, ".cache/qloo-probe"); await mkdir(cache, { recursive: true });
  const target = await mkdtemp(join(cache, "seal-compile-"));
  await writeFile(join(target, "package.json"), '{"type":"commonjs"}\n');
  for (const rel of ["src/domain/contracts.ts", "src/qloo/boundary-error.ts", "src/qloo/server-config.ts", "src/qloo/provider-ref.ts", "src/qloo/projections.ts",
    "src/qloo/shortlist-ranking.ts", "src/qloo/recorded-adapter.ts"]) {
    const out = join(target, rel.replace(/\.ts$/, ".js")); await mkdir(dirname(out), { recursive: true });
    await writeFile(out, ts.transpileModule(await readFile(join(root, rel), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
  }
  const require = createRequire(import.meta.url);
  const { providerRef } = require(join(target, "src/qloo/provider-ref.js"));
  const { interpretShortlistRanking } = require(join(target, "src/qloo/shortlist-ranking.js"));
  const { loadRecordedEvidence, P06_SEAL_MANIFEST } = require(join(target, "src/qloo/recorded-adapter.js"));
  const shortlist = attempt.checkpoint.shortlist_entity_ids.map((id) => providerRef("entity", id));
  const usable = summary.http_status === 200 && summary.raw_saved_privately && summary.reason === "SCHEMA_REVIEW_REQUIRED" && bytes["response.raw.json"];
  const result = usable ? interpretShortlistRanking(JSON.parse(bytes["response.raw.json"].toString("utf8")), shortlist) : { class: "RESPONSE_UNUSABLE", returned: null, requested: shortlist.length };
  // Booleans and counts only. Ordering is reported as a relation between the two reviewed roles, never as a value.
  const raw = usable ? JSON.parse(bytes["response.raw.json"].toString("utf8")) : null;
  const entities = raw?.results?.entities ?? [];
  const sanitized = { attempt_id: attemptId, http_status: summary.http_status, response_bytes: summary.response_bytes, summary_reason: summary.reason, classification: result.class,
    requested: result.requested, returned: result.returned, every_returned_entity_has_numeric_affinity: usable ? entities.every((e) => typeof e?.query?.affinity === "number") : null,
    returned_ids_all_on_shortlist: usable ? entities.every((e) => shortlist.includes(providerRef("entity", e.entity_id))) : null,
    shortlist_first_role_ordered_before_second: result.ordered ? (result.ordered.length === 2 ? result.ordered[0].id === shortlist[0] : null) : null };
  if (mode === "--inspect-p06") { process.stdout.write(JSON.stringify({ mode: "INSPECT_ONLY", wrote_nothing: true, ...sanitized }, null, 2) + "\n"); }
  else {
    const sealDir = join(base, ...P06_SEAL_MANIFEST.slice(0, 1)); const sealPath = join(base, ...P06_SEAL_MANIFEST);
    await mkdir(sealDir, { recursive: true, mode: 0o700 });
    const rels = files.filter((n) => bytes[n]).map((n) => ({ path: `private/qloo-probes/p06/attempts/${attemptId}/${n}`, sha256: sha(bytes[n]) }));
    const handle = await open(sealPath, "wx", 0o600); // exclusive: a seal is never replaced
    try { await handle.writeFile(JSON.stringify(rels, null, 2) + "\n"); await handle.sync(); } finally { await handle.close(); }
    let verdict;
    try { const loaded = await loadRecordedEvidence(root); verdict = { loader_accepts_seal: true, shortlist_state: loaded.shortlist.state, history_row_present: loaded.history.some((h) => h.probe === "P06") }; }
    catch { await rm(sealPath); await lstat(sealPath).then(() => { throw new Error("SEAL_ROLLBACK_FAILED"); }, () => {}); verdict = { loader_accepts_seal: false, seal_removed: true }; }
    process.stdout.write(JSON.stringify({ mode: "SEAL", ...sanitized, ...verdict }, null, 2) + "\n");
    if (!verdict.loader_accepts_seal) process.exitCode = 2;
  }
} catch (error) { fail(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "P06_SEAL_FAILED"); }
