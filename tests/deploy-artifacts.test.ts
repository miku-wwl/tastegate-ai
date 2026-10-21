import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { contextFiles, globToRegExp, isExcluded, parseDockerignore } from "../scripts/lib/dockerignore.mjs";
import { forbiddenPathLabels } from "../scripts/lib/deploy-scan.mjs";

// The deployment artifacts are PREPARED, not deployed. These tests read them as text and model the build context; they start no container.
const text = (path: string) => readFile(path, "utf8");
const temp: string[] = [];
afterAll(async () => { for (const d of temp) await rm(d, { recursive: true, force: true }); });
const rules = async () => parseDockerignore(await text(".dockerignore"));
// What a build daemon would receive: walk the tree, never descending into a directory the rules exclude (as Docker does).
async function walkContext(root: string, ignore: ReturnType<typeof parseDockerignore>): Promise<string[]> {
  const out: string[] = [];
  async function inner(dir: string, rel: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (isExcluded(ignore, next)) continue;
      if (entry.isDirectory()) await inner(join(dir, entry.name), next); else out.push(next);
    }
  }
  await inner(root, ""); return out;
}

describe(".dockerignore matching model", () => {
  it("translates globs the way the rules below rely on", () => {
    expect(globToRegExp("**/private").test("private")).toBe(true); expect(globToRegExp("**/private").test("a/b/private")).toBe(true); expect(globToRegExp("**/private").test("privates")).toBe(false);
    expect(globToRegExp("**/.env.*").test(".env.local")).toBe(true); expect(globToRegExp("**/.env.*").test("x/.env.production.local")).toBe(true); expect(globToRegExp("**/.env.*").test(".env")).toBe(false);
    expect(globToRegExp("**/*.log").test("a.log")).toBe(true); expect(globToRegExp("**/*.log").test("x/y/a.log")).toBe(true); expect(globToRegExp("**/*.log").test("a.logs")).toBe(false);
    expect(globToRegExp("tests").test("tests")).toBe(true); expect(globToRegExp("tests").test("src/tests")).toBe(false);
    expect(globToRegExp("a?c").test("abc")).toBe(true); expect(globToRegExp("a?c").test("a/c")).toBe(false); expect(globToRegExp("a*c").test("a/c")).toBe(false);
  });
  it("excludes everything under an excluded directory, lets later rules win, and ignores comments and blanks", () => {
    const r = parseDockerignore("# comment\n\nprivate\n!private/keep\n/docs/\n");
    expect(isExcluded(r, "private/x/y")).toBe(true); expect(isExcluded(r, "private/keep")).toBe(false); expect(isExcluded(r, "docs/a.md")).toBe(true); expect(isExcluded(r, "src/a.ts")).toBe(false);
  });
  it("treats sensitive patterns in the explicit **/ form, so a nested copy is excluded as well", async () => {
    const r = await rules();
    for (const path of ["private/qloo-probes/p05/x.json", "src/private/a.txt", ".env", ".env.local", "app/.env.production", ".artifacts/screens/a.png", "a/.cache/b", "test-results/a", ".git/config", "node_modules/next/package.json", ".next/server/app.js", "notes.log", "secrets/server.pem", "k/id_rsa.pub", "data/store.sqlite3"])
      expect(isExcluded(r, path), path).toBe(true);
  });
});

describe(".dockerignore against planted canaries and the real tree", () => {
  it("keeps every private-looking path out of a synthetic context and keeps every file the build needs", async () => {
    const root = await mkdtemp(join(tmpdir(), "tg-ctx-")); temp.push(root);
    const put = async (rel: string) => { const file = join(root, rel); await mkdir(join(file, ".."), { recursive: true }); await writeFile(file, "canary"); };
    const secret = ["private/qloo-probes/p05/attempts/x/response.raw.json", "private/qloo-live/grant.json", ".env", ".env.local", ".env.production.local", ".artifacts/a.json", ".cache/b", "test-results/c", "nested/private/d.json", "nested/.env", "nested/.cache/e", "client.pem", "backup.sqlite3", "run.log"];
    const needed = ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "app/page.tsx", "app/api/health/route.ts", "src/server/runtime-profile.ts", "data/evaluation-results.json", "scripts/start-production.mjs", "next-env.d.ts"];
    const useless = ["tests/a.test.ts", "docs/a.md", "deploy/compose.example.yml", "Dockerfile", ".dockerignore", "AGENTS.md"];
    for (const rel of [...secret, ...needed, ...useless]) await put(rel);
    const files = await walkContext(root, await rules());
    for (const rel of secret) expect(files, rel).not.toContain(rel);
    for (const rel of needed) expect(files, rel).toContain(rel);
    for (const rel of useless) expect(files, rel).not.toContain(rel);
    expect(files.filter((f) => forbiddenPathLabels(f).length)).toEqual([]);
  });
  it("on the REAL working tree (names only, no content), no private, env, artifact, cache or credential path would reach a build daemon", async () => {
    const files = await walkContext(process.cwd(), await rules());
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => forbiddenPathLabels(f).length)).toEqual([]);
    expect(files.filter((f) => /(^|\/)(private|\.artifacts|\.cache|test-results|node_modules|\.git|\.next)(\/|$)/.test(f))).toEqual([]);
    expect(files.filter((f) => /\.(pem|key|sqlite3|log)$/.test(f))).toEqual([]);
    for (const rel of ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "data/evaluation-results.json", "scripts/start-production.mjs", "app/api/health/route.ts", "app/api/audit/route.ts", "src/server/runtime-profile.ts"])
      expect(files, rel).toContain(rel);
  });
  it("the helper agrees with the gate's own forbidden-path labels on every kind of sensitive path", () => {
    for (const rel of ["private/a", "x/private/a", ".env", ".env.local", ".artifacts/a", ".cache/a", "test-results/a", ".git/a"]) expect(forbiddenPathLabels(rel).length, rel).toBeGreaterThan(0);
    for (const rel of [".env.example", "src/a.ts", "app/page.tsx", "privately/a"]) expect(forbiddenPathLabels(rel), rel).toEqual([]);
  });
});

describe("Dockerfile", () => {
  it("is multi-stage, unprivileged, health-checked and starts through the validating start script", async () => {
    const d = await text("Dockerfile"); const from = d.split("\n").filter((l) => l.startsWith("FROM "));
    expect(from).toHaveLength(3); expect(from.map((l) => l.split(" AS ")[1])).toEqual(["deps", "build", "runner"]);
    expect(from.every((l) => /^FROM node:\$\{NODE_VERSION\}-alpine AS /.test(l))).toBe(true); expect(d).toMatch(/^ARG NODE_VERSION=\d+$/m); expect(d).not.toMatch(/:latest/);
    const runner = d.slice(d.indexOf("AS runner"));
    expect(runner).toMatch(/^USER tastegate$/m); expect(runner).not.toMatch(/^USER root/m); expect(runner).toMatch(/adduser -S -u 10001/);
    expect(runner).toMatch(/^HEALTHCHECK /m); expect(runner).toMatch(/\/api\/health/); expect(runner).toMatch(/^CMD \["node", "scripts\/start-production\.mjs"\]$/m); expect(runner).toMatch(/^EXPOSE 3000$/m);
    expect(runner).toMatch(/TASTEGATE_PROFILE=production-safe/); expect(runner).toMatch(/TASTEGATE_DISABLE_LIVE=1/);
    expect(runner).not.toMatch(/COPY \. /); expect(runner).not.toMatch(/COPY --from=deps/);
    expect([...runner.matchAll(/^COPY (?:--[a-z]+=\S+ )*(.+)$/gm)].map((m) => m[1]!.split(" ")[0])).toEqual(["/app/.next/standalone", "/app/.next/static", "/app/public", "scripts/start-production.mjs"]);
  });
  it("builds only with the standalone output, a locked install and no scripts, and bakes in no secret", async () => {
    const d = await text("Dockerfile");
    expect(d).toMatch(/npm ci --ignore-scripts/); expect(d).toMatch(/TASTEGATE_STANDALONE=1/); expect(d).not.toMatch(/npm install\b/);
    expect(d).not.toMatch(/(^|\s)(ARG|ENV)\s+[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/m); expect(d).not.toMatch(/ADD\s+https?:/); expect(d).not.toMatch(/curl|wget/);
    expect(d).not.toMatch(/QLOO_API_KEY|LLM_API_KEY|QLOO_MODE/);
  });
  it("names every file it copies from the context in a form the .dockerignore keeps", async () => {
    const files = contextFiles(await rules(), ["package.json", "package-lock.json", "scripts/start-production.mjs", "next.config.ts", "app/page.tsx", "src/a.ts", "data/evaluation-results.json"]);
    expect(files).toHaveLength(7);
  });
});

describe("deploy examples", () => {
  it("compose: read-only, unprivileged, loopback-only, health-checked, resource-limited, no secret", async () => {
    const c = await text("deploy/compose.example.yml"); const body = c.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    for (const needle of ["read_only: true", "no-new-privileges:true", "cap_drop: [ALL]", "TASTEGATE_PROFILE: production-safe", 'TASTEGATE_DISABLE_LIVE: "1"', '"127.0.0.1:3000:3000"', "healthcheck:", "/api/health", "memory:", "restart:", "pids: 128"]) expect(body, needle).toContain(needle);
    expect(body).not.toMatch(/QLOO_API_KEY|LLM_API_KEY|NEXT_PUBLIC_|env_file|privileged|network_mode: host|volumes:/); expect(body).not.toMatch(/image:\s*\S*\//); // no registry named
  });
  it("nginx: transport security, size and rate limits, health restricted, no real host", async () => {
    const n = await text("deploy/nginx.example.conf"); const body = n.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    for (const needle of ["limit_req_zone", "limit_conn_zone", "client_max_body_size 32k", "server_tokens off", "Strict-Transport-Security", "return 301 https://", "location = /api/health", "deny  all", "ssl_protocols       TLSv1.2 TLSv1.3"]) expect(body, needle).toContain(needle);
    expect([...body.matchAll(/server_name\s+(\S+);/g)].map((m) => m[1])).toEqual(["example.invalid", "example.invalid"]); expect(n).toMatch(/PER PROXY INSTANCE/);
  });
  it("the production environment example is safe by construction: no secret assigned, the safe profile named, the forbidden variables listed as absent", async () => {
    const e = await text("deploy/env.production.example"); const assigned = e.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split("=")[0]);
    expect(assigned).toEqual(["TASTEGATE_PROFILE", "TASTEGATE_DISABLE_LIVE", "NODE_ENV", "NEXT_TELEMETRY_DISABLED", "PORT", "HOSTNAME"]);
    expect(e).toMatch(/^TASTEGATE_PROFILE=production-safe$/m); for (const name of ["QLOO_API_KEY", "LLM_API_KEY", "QLOO_MODE=live", "NEXT_PUBLIC_"]) expect(e).toContain(name);
    expect(e.split("\n").filter((l) => /^[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z_]*=/.test(l))).toEqual([]);
  });
  it("is provider-neutral: no cloud provider, registry, region or account appears in any deployment artifact", async () => {
    const all = (await Promise.all(["Dockerfile", ".dockerignore", "deploy/compose.example.yml", "deploy/nginx.example.conf", "deploy/env.production.example", "scripts/start-production.mjs"].map(text))).join("\n");
    expect(all).not.toMatch(/amazonaws|azure|googleapis|gcr\.io|ghcr\.io|docker\.io|vercel|netlify|heroku|fly\.io|railway|render\.com|cloudflare|digitalocean|\.pem\b.*BEGIN/i);
    expect(all).not.toMatch(/[A-Za-z]:[\\/]Users|\/home\/\w|workshop[\\/]oct/);
  });
  it("the standalone helpers never print an environment value", async () => {
    for (const f of ["scripts/start-production.mjs", "scripts/smoke-production.mjs", "scripts/build-standalone.mjs"]) { const s = await text(f); expect(s, f).not.toMatch(/console\.log\(process\.env|JSON\.stringify\(process\.env|JSON\.stringify\(env\)/); }
    expect(posix.basename("scripts/start-production.mjs")).toBe("start-production.mjs");
  });
});
