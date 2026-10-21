// Local-only P07 administration. It never contacts Qloo and never reads a credential. Modes:
//   --status                                  where P07 stands (no gate / open / expired / withdrawn / approval registered / executed)
//   --prepare-gate                            write the proposal for the one P07 request and print the gate, including the ONE sentence
//                                             that approves it. Preparing a gate sends nothing and approves nothing.
//   --register-approval --proposal=<id> --owner-reply=<sentence>
//                                             register the single-use approval. The reply must equal the printed sentence exactly;
//                                             anything else (a refusal, a hedge, another probe) is refused and nothing is written.
//   --withdraw --proposal=<id>                withdraw an offer, or revoke an approval that has not run
// Output is public-safe: no provider ID, request URL or evidence hash.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// TASTEGATE_ADMIN_ROOT redirects only WHERE the private evidence lives (tests use a throwaway directory); the code is always this repository's.
const project = process.env.TASTEGATE_ADMIN_ROOT ? resolve(process.env.TASTEGATE_ADMIN_ROOT) : scriptRoot;
const args = process.argv.slice(2);
const fail = (reason) => { process.stderr.write(JSON.stringify({ status: "BLOCKED", reason }) + "\n"); process.exitCode = 2; };
const option = (name) => { const hit = args.filter((a) => a.startsWith(`--${name}=`)); return hit.length === 1 ? hit[0].slice(name.length + 3) : null; };
let target = null;
try {
  const mode = args[0];
  const shape = { "--status": 1, "--prepare-gate": 1, "--register-approval": 3, "--withdraw": 2 }[mode];
  if (shape === undefined || args.length !== shape) throw new Error("INVALID_ARGUMENTS");
  if (mode === "--register-approval" && (option("proposal") === null || option("owner-reply") === null)) throw new Error("INVALID_ARGUMENTS");
  if (mode === "--withdraw" && option("proposal") === null) throw new Error("INVALID_ARGUMENTS");
  const cache = join(scriptRoot, ".cache/qloo-probe"); await mkdir(cache, { recursive: true });
  target = await mkdtemp(join(cache, "p07-admin-"));
  await writeFile(join(target, "package.json"), '{"type":"commonjs"}\n');
  for (const name of ["boundary-error", "server-config", "p01-profile", "p01-local-env", "p01-runner", "p01-private-store", "p02-profile", "p02-private-store",
    "p03-profile", "p03-private-store", "p04-profile", "p04-private-store", "p05-profile", "p05-signal", "p06-profile", "p06-shortlist", "p07-profile", "p07-signal",
    "p07-consent", "p07-approval", "owner-consent", "p03r-profile", "p03r-private-store", "probe-cli-contract", "probe-definitions", "raw-probe-runner", "raw-probe-store",
    "p01-reuse", "search-observation"]) {
    const source = await readFile(join(scriptRoot, "src/qloo", `${name}.ts`), "utf8");
    await writeFile(join(target, `${name}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
  }
  const p07 = createRequire(import.meta.url)(join(target, "p07-approval.js"));
  const result = mode === "--status" ? await p07.inspectP07State(project) : mode === "--prepare-gate" ? await p07.prepareP07Gate(project) :
    mode === "--withdraw" ? await p07.withdrawP07Gate(project, { proposalId: option("proposal") }) :
    await p07.registerP07Approval(project, { proposalId: option("proposal"), ownerReply: option("owner-reply") });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} catch (error) { fail(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "P07_ADMIN_FAILED"); }
finally { if (target) await rm(target, { recursive: true, force: true }).catch(() => {}); }
