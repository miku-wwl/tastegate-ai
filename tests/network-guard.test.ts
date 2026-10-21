import net from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectTarget, isLoopbackHost } from "./setup/network-guard";

// The guard is what lets the suite state "zero outbound connections" as a measurement. These tests only ever name a host that can never resolve
// (the .invalid TLD) or a reserved documentation address, so even a broken guard could not reach a real server. Each test logs to its own temporary
// file, so the attempts made HERE never appear in the suite-wide log (TASTEGATE_NETGUARD_LOG set by the runner), which must stay at zero blocked attempts.
const attempt = (host: string, port = 443) => new Promise<string>((resolve) => {
  const socket = net.connect({ host, port });
  socket.on("error", (e: NodeJS.ErrnoException) => resolve(e.code ?? "NO_CODE"));
  socket.on("connect", () => { socket.destroy(); resolve("CONNECTED"); });
});
const suiteLog = process.env.TASTEGATE_NETGUARD_LOG;
const roots: string[] = [];
let log = "";
const readLog = async () => (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
beforeEach(async () => { const dir = await mkdtemp(join(tmpdir(), "netguard-")); roots.push(dir); log = join(dir, "guard.jsonl"); process.env.TASTEGATE_NETGUARD_LOG = log; });
afterEach(async () => {
  if (suiteLog === undefined) delete process.env.TASTEGATE_NETGUARD_LOG; else process.env.TASTEGATE_NETGUARD_LOG = suiteLog;
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

describe("offline guard", () => {
  it("refuses a connection that would leave the machine, before any lookup", async () => {
    expect(await attempt("example.invalid")).toBe("ECONNREFUSED");
    expect(await attempt("192.0.2.1", 80)).toBe("ECONNREFUSED"); // TEST-NET-1 (RFC 5737): reserved, never routed
    expect((await readLog()).filter((e) => e.event === "blocked")).toHaveLength(2);
  });
  it("refuses fetch to a host outside the machine, and the refusal comes from the guard", async () => {
    await expect(fetch("https://example.invalid/")).rejects.toThrow();
    expect((await readLog()).filter((e) => e.event === "blocked" && e.host === "example.invalid")).toHaveLength(1);
  });
  it("counts a refused attempt when logging is switched on, and records only a host and a port", async () => {
    await attempt("example.invalid", 8443);
    const lines = await readLog();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ event: "blocked", host: "example.invalid", port: 8443 });
    expect(Object.keys(lines[0]!).sort()).toEqual(["event", "host", "pid", "port"]);
  });
  it("leaves loopback connections alone", async () => {
    const server = net.createServer((s) => s.end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try { expect(await attempt("127.0.0.1", (server.address() as net.AddressInfo).port)).toBe("CONNECTED"); }
    finally { await new Promise((resolve) => server.close(resolve)); }
  });
  it("classifies hosts exactly (a name that merely starts with 127. is not loopback)", () => {
    for (const h of ["localhost", "LOCALHOST", "127.0.0.1", "127.255.0.9", "::1", "[::1]", "0.0.0.0", "::", "::ffff:127.0.0.1"]) expect(isLoopbackHost(h), h).toBe(true);
    for (const h of ["127.example.com", "127.0.0.1.example.com", "128.0.0.1", "10.0.0.1", "192.168.1.1", "example.invalid", "hackathon.api.example", "localhost.example", "1.2.3", "::ffff:8.8.8.8", ""]) expect(isLoopbackHost(h), h).toBe(false);
  });
  it("reads every argument shape Node uses for connect()", () => {
    expect(connectTarget([{ host: "example.invalid", port: 443 }])).toEqual({ local: false, host: "example.invalid", port: 443 });
    expect(connectTarget([[{ host: "example.invalid", port: 443 }, null]])).toMatchObject({ local: false, host: "example.invalid" });
    expect(connectTarget([443, "example.invalid"])).toEqual({ local: false, host: "example.invalid", port: 443 });
    expect(connectTarget(["8080"])).toEqual({ local: true, host: "localhost", port: 8080 });
    expect(connectTarget([{ port: 3000 }])).toEqual({ local: true, host: "localhost", port: 3000 });
    expect(connectTarget([{ path: "\\\\.\\pipe\\example" }])).toMatchObject({ local: true, host: "pipe" });
    expect(connectTarget(["/tmp/example.sock"])).toMatchObject({ local: true, host: "pipe" });
  });
});
