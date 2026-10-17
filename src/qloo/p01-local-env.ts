import { lstat, open, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import { QlooServerConfig } from "./server-config";
import { assertServer } from "./boundary-error";

export class P01LocalEnvironmentError extends Error {
  constructor(readonly reason: "UNSAFE_DIAGNOSTICS" | "PRIVATE_ENV_NOT_IGNORED" | "PRIVATE_ENV_UNAVAILABLE" | "CONFIG_BLOCKED",
    readonly credentialConfigured: boolean | null = null, readonly envFile: "LOADED" | "ABSENT" | "NOT_INSPECTED" = "NOT_INSPECTED") { super(reason); }
}

export function unsafeP01Diagnostics(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const flags = (env.NODE_OPTIONS ?? "") + " " + process.execArgv.join(" ");
  return !!(env.NODE_DEBUG?.trim() || env.NODE_DEBUG_NATIVE?.trim() || env.SSLKEYLOGFILE ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    /--(?:tls-keylog|trace-tls|inspect|require|import|experimental-loader|loader|eval|print|report)/.test(flags));
}

// Reviewed env-file equivalent: parse inside this local Node process, never execute dotenv
// contents, expand variables, mutate process.env, load NODE_OPTIONS, or serialize values.
// Existing process values take precedence, matching Node's --env-file precedence.
export async function loadLocalP01Config(projectRoot: string, inherited: Readonly<Record<string, string | undefined>> = process.env) {
  assertServer();
  if (unsafeP01Diagnostics(inherited)) throw new P01LocalEnvironmentError("UNSAFE_DIAGNOSTICS");
  const root = await realpath(projectRoot); const filename = resolve(root, ".env.local");
  const git = (args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  try {
    if (git(["ls-files", "-z", "--", ".env.local"]).length) throw new Error();
    git(["check-ignore", "--quiet", "--", ".env.local"]);
  } catch { throw new P01LocalEnvironmentError("PRIVATE_ENV_NOT_IGNORED"); }
  let local: Record<string, string | undefined> = {}; let envFile: "LOADED" | "ABSENT" = "ABSENT";
  try {
    const info = await lstat(filename);
    if (info.isSymbolicLink() || !info.isFile() || info.size > 16_384 || await realpath(filename) !== filename ||
        (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw new Error();
    const file = await open(filename, "r");
    try {
      const bytes = Buffer.alloc(16_385); const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 16_384) throw new Error();
      local = parseEnv(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead)));
      bytes.fill(0); envFile = "LOADED";
    } finally { await file.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new P01LocalEnvironmentError("PRIVATE_ENV_UNAVAILABLE");
  }
  if (unsafeP01Diagnostics(local)) throw new P01LocalEnvironmentError("UNSAFE_DIAGNOSTICS");
  const selected: Record<string, string | undefined> = {};
  for (const name of ["QLOO_MODE", "QLOO_API_KEY", "QLOO_BASE_URL", "QLOO_REQUEST_TIMEOUT_MS", "NEXT_PUBLIC_QLOO_API_KEY"])
    selected[name] = inherited[name] ?? local[name];
  const credentialConfigured = !!selected.QLOO_API_KEY?.trim();
  try {
    const config = QlooServerConfig.load(selected);
    return { config, env_file: envFile, credential_configured: credentialConfigured,
      credential_source: inherited.QLOO_API_KEY !== undefined ? "process_environment" : local.QLOO_API_KEY !== undefined ? "private_env_file" : "absent" } as const;
  } catch { throw new P01LocalEnvironmentError("CONFIG_BLOCKED", credentialConfigured, envFile); }
}
