// Local-only owner administration of the AUTHORIZED_LIVE grant. It never contacts Qloo and never reads a credential.
//   --status                                  show whether a usable grant exists and what is left of it
//   --create --owner-reply=<text> --gate-id=<id> --minutes=<1-60> --max-requests=<1-14> --max-runs=<1-5> --operations=<a,b,..>
//                                             create ONE time-boxed, request-budgeted grant. Run ONLY after the owner's own
//                                             explicit reply naming LIVE; the reply text is recorded verbatim. An existing usable
//                                             grant is never replaced: revoke it or wait for it to expire.
//   --revoke                                  revoke the current grant (the file is kept as history)
// Operations: entity_lookup, tag_lookup, rank_places, discover_places. Output is public-safe: no credential, provider ID or URL.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// TASTEGATE_ADMIN_ROOT redirects only WHERE the grant and its ledger live (the automated tests use a throwaway directory);
// the compiled helpers and their dependencies always come from this repository.
const project = process.env.TASTEGATE_ADMIN_ROOT ? resolve(process.env.TASTEGATE_ADMIN_ROOT) : scriptRoot;
const args = process.argv.slice(2);
const fail = (reason) => { process.stderr.write(JSON.stringify({ status: "BLOCKED", reason }) + "\n"); process.exitCode = 2; };
const option = (name) => { const hit = args.filter((a) => a.startsWith(`--${name}=`)); return hit.length === 1 ? hit[0].slice(name.length + 3) : null; };
const integer = (name) => { const value = option(name); if (value === null || !/^[0-9]{1,3}$/.test(value)) throw new Error("INVALID_ARGUMENTS"); return Number(value); };
let target = null;
try {
  const mode = args[0];
  const known = new Set(["--status", "--revoke", "--create"]);
  if (!known.has(mode) || (mode !== "--create" && args.length !== 1) || (mode === "--create" && args.length !== 7)) throw new Error("INVALID_ARGUMENTS");
  let create = null;
  if (mode === "--create") {
    const reply = option("owner-reply"); const gate = option("gate-id"); const operations = option("operations");
    if (reply === null || gate === null || operations === null) throw new Error("INVALID_ARGUMENTS");
    create = { ownerReply: reply, gateId: gate, minutes: integer("minutes"), maxRequests: integer("max-requests"), maxRuns: integer("max-runs"), operations: operations.split(",") };
  }
  const cache = join(scriptRoot, ".cache/qloo-probe"); await mkdir(cache, { recursive: true });
  target = await mkdtemp(join(cache, "live-grant-"));
  await writeFile(join(target, "package.json"), '{"type":"commonjs"}\n');
  for (const name of ["boundary-error", "live-grant"]) {
    const source = await readFile(join(scriptRoot, "src/qloo", `${name}.ts`), "utf8");
    await writeFile(join(target, `${name}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
  }
  const grants = createRequire(import.meta.url)(join(target, "live-grant.js"));
  let result;
  if (mode === "--create") result = await grants.createLiveGrant(project, create);
  else if (mode === "--revoke") result = await grants.revokeLiveGrant(project);
  else {
    const status = await grants.loadLiveGrant(project);
    if (!status.ok) result = { status: "LOCKED", reason: status.reason };
    else {
      const used = await grants.readLiveBudget(project, status.grant);
      const g = status.grant;
      result = { status: "ACTIVE", grant: g.grant_id.slice(0, 8), approved_at: g.approved_at, expires_at: g.expires_at, operations: g.allowed_operations,
        requests_left: g.max_requests - used.requests_reserved, runs_left: g.max_runs - used.runs_used };
    }
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} catch (error) { fail(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "LIVE_GRANT_ADMIN_FAILED"); }
finally { if (target) await rm(target, { recursive: true, force: true }).catch(() => {}); }
