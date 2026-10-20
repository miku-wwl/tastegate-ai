import { defineConfig } from "vitest/config";

// The default worker count (one per logical CPU) exhausted memory on the development machine ("Zone Allocation
// failed", worker exit codes 3221226505/134): every worker loads zod, the audit engine and the probe framework.
// Four workers is enough parallelism for this suite and removes the need to remember --maxWorkers=4.
// The 5 s default timeout is too tight for the CLI child-process tests, which spawn Node and transpile ~25
// TypeScript modules per invocation under load. 20 s still fails a genuinely hung test; it hides no assertion.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node", maxWorkers: 4, testTimeout: 20_000, hookTimeout: 30_000 },
});
