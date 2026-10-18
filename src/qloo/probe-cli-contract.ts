// Execution exit codes are independent of HTTP 200 / JSON syntax / process completion.
// Preview and local preflight are informational modes, handled separately by the CLI.
export function probeExecutionExitCode(status: "PASS" | "FAIL" | "BLOCKED" | "UNKNOWN"): number {
  return { PASS: 0, FAIL: 1, BLOCKED: 2, UNKNOWN: 3 }[status];
}
