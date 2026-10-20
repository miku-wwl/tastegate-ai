// Local-only P06 administration. Modes:
//   --prepare-review                          create the private shortlist review from verified captures
//   --register-approval --owner-reply=<text> --gate-id=<id>
//                                             register the single-use P06 checkpoint. Run ONLY after the owner's
//                                             explicit, P06-only reply; the reply text is recorded verbatim.
// Neither mode contacts Qloo or reads a credential. Output is public-safe: no provider ID, hash or URL.
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const fail = (reason) => { process.stderr.write(JSON.stringify({ status: "BLOCKED", reason }) + "\n"); process.exitCode = 2; };
const option = (name) => { const hit = args.filter((a) => a.startsWith(`--${name}=`)); return hit.length === 1 ? hit[0].slice(name.length + 3) : null; };
try {
  const mode = args[0];
  if (mode === "--prepare-review" ? args.length !== 1 : mode === "--register-approval" ? args.length !== 3 || option("owner-reply") === null || option("gate-id") === null : true) throw new Error("INVALID_ARGUMENTS");
  const cache = join(project, ".cache/qloo-probe"); await mkdir(cache, { recursive: true });
  const target = await mkdtemp(join(cache, "admin-compile-"));
  await writeFile(join(target, "package.json"), '{"type":"commonjs"}\n');
  for (const name of ["boundary-error", "server-config", "p01-profile", "p01-local-env", "p01-runner", "p01-private-store", "p02-profile", "p02-private-store",
    "p03-profile", "p03-private-store", "p04-profile", "p04-private-store", "p05-profile", "p05-signal", "p06-profile", "p06-shortlist", "p06-approval",
    "p03r-profile", "p03r-private-store", "probe-cli-contract", "probe-definitions", "raw-probe-runner", "raw-probe-store", "p01-reuse", "search-observation"]) {
    const source = await readFile(join(project, "src/qloo", `${name}.ts`), "utf8");
    await writeFile(join(target, `${name}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
  }
  const { prepareP06ShortlistReview, registerP06Approval } = createRequire(import.meta.url)(join(target, "p06-approval.js"));
  const result = mode === "--prepare-review" ? await prepareP06ShortlistReview(project) :
    await registerP06Approval(project, { ownerReply: option("owner-reply"), gateId: option("gate-id") });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} catch (error) { fail(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "P06_ADMIN_FAILED"); }
