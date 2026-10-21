// Local-only P06 administration. Modes:
//   --prepare-review                          create the private shortlist review from verified captures
//   --register-approval                       RETIRED: the single P06 approval was consumed and sealed; this mode always refuses
// Neither mode contacts Qloo or reads a credential. Output is public-safe: no provider ID, hash or URL.
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const fail = (reason) => { process.stderr.write(JSON.stringify({ status: "BLOCKED", reason }) + "\n"); process.exitCode = 2; };
try {
  const mode = args[0];
  if (mode === "--register-approval") throw new Error("P06_APPROVAL_RETIRED");
  if (mode !== "--prepare-review" || args.length !== 1) throw new Error("INVALID_ARGUMENTS");
  const cache = join(project, ".cache/qloo-probe"); await mkdir(cache, { recursive: true });
  const target = await mkdtemp(join(cache, "admin-compile-"));
  await writeFile(join(target, "package.json"), '{"type":"commonjs"}\n');
  for (const name of ["boundary-error", "server-config", "p01-profile", "p01-local-env", "p01-runner", "p01-private-store", "p02-profile", "p02-private-store",
    "p03-profile", "p03-private-store", "p04-profile", "p04-private-store", "p05-profile", "p05-signal", "p06-profile", "p06-shortlist", "p06-approval",
    "p03r-profile", "p03r-private-store", "probe-cli-contract", "probe-definitions", "raw-probe-runner", "raw-probe-store", "p01-reuse", "search-observation"]) {
    const source = await readFile(join(project, "src/qloo", `${name}.ts`), "utf8");
    await writeFile(join(target, `${name}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
  }
  const { prepareP06ShortlistReview } = createRequire(import.meta.url)(join(target, "p06-approval.js"));
  process.stdout.write(JSON.stringify(await prepareP06ShortlistReview(project), null, 2) + "\n");
} catch (error) { fail(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "P06_ADMIN_FAILED"); }
