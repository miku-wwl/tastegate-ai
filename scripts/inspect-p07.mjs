// Read-only, owner-local intake. No execute/seal/register switch, no environment credential loading and no HTTP.
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let target, cache;
try {
  if (process.argv.length !== 2) throw new Error("INVALID_ARGUMENTS");
  const root = await realpath(source);
  await mkdir(join(root, ".cache/qloo-probe"), { recursive: true });
  cache = await realpath(join(root, ".cache/qloo-probe"));
  const underRoot = relative(root, cache);
  if (!underRoot || underRoot.startsWith("..") || isAbsolute(underRoot)) throw new Error("UNSAFE_TEMP_DIRECTORY");
  target = await mkdtemp(join(cache, "p07-intake-"));
  await writeFile(join(target, "package.json"), '{"type":"commonjs"}\n');
  for (const folder of ["qloo", "domain"]) {
    const output = join(target, "src", folder); await mkdir(output, { recursive: true });
    for (const name of await readdir(join(root, "src", folder))) {
      if (!name.endsWith(".ts")) continue;
      const text = await readFile(join(root, "src", folder, name), "utf8");
      await writeFile(join(output, name.replace(/\.ts$/, ".js")), ts.transpileModule(text,
        { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
    }
  }
  const { inspectP07Capture } = createRequire(import.meta.url)(join(target, "src/qloo/p07-intake.js"));
  process.stdout.write(JSON.stringify(await inspectP07Capture(root), null, 2) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({ status: "BLOCKED", reason: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "P07_INTAKE_REVIEW_REQUIRED" }) + "\n");
  process.exitCode = 2;
} finally {
  if (target && cache && relative(cache, target) && !relative(cache, target).startsWith("..") && !isAbsolute(relative(cache, target)))
    await rm(target, { recursive: true, force: true });
}
