import net from "node:net";
import { appendFileSync } from "node:fs";

// Offline proof for the unit and integration suite: every TCP connection that would leave this machine is refused BEFORE any DNS lookup, and the
// attempt is counted. Loopback and local pipes are untouched. Logging is opt-in (TASTEGATE_NETGUARD_LOG) and records only the event, the process id,
// a host name and a port, never a path, a query, a header or a body.
// It covers the code that runs inside the test workers (routes, services, adapters, transports). Child processes started by CLI tests run in isolated
// temporary roots with no credential and NODE_OPTIONS stripped on purpose, so they are covered by construction, not by this guard.
const FLAG = Symbol.for("tastegate.netguard");

const ipv4 = (host: string) => {
  const parts = host.split(".");
  return parts.length === 4 && parts.every((p) => p.length > 0 && p.length <= 3 && [...p].every((c) => c >= "0" && c <= "9")) ? parts.map(Number) : null;
};
export const isLoopbackHost = (host: string) => {
  const h = host.toLowerCase();
  const mapped = h.startsWith("::ffff:") ? h.slice(7) : h;
  const v4 = ipv4(mapped);
  return h === "localhost" || h === "::1" || h === "[::1]" || h === "::" || (v4 !== null && (v4[0] === 127 || v4.every((n) => n === 0)));
};

// Node passes connect() arguments in three shapes: (options), (port[, host]), (path), and internally a pre-normalized array [options, callback].
export function connectTarget(args: unknown[]): { local: boolean; host: string; port: number | null } {
  const a = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  const first = a[0];
  if (first !== null && typeof first === "object") {
    const o = first as { host?: unknown; port?: unknown; path?: unknown };
    if (typeof o.path === "string" && o.path) return { local: true, host: "pipe", port: null };
    const host = typeof o.host === "string" && o.host ? o.host : "localhost";
    const port = Number(o.port);
    return { local: isLoopbackHost(host), host, port: Number.isFinite(port) ? port : null };
  }
  if (typeof first === "string" && !/^[0-9]+$/.test(first)) return { local: true, host: "pipe", port: null };
  const host = typeof a[1] === "string" ? a[1] : "localhost";
  const port = Number(first);
  return { local: isLoopbackHost(host), host, port: Number.isFinite(port) ? port : null };
}

const note = (event: string, detail: Record<string, unknown> = {}) => {
  const file = process.env.TASTEGATE_NETGUARD_LOG;
  if (!file) return;
  try { appendFileSync(file, JSON.stringify({ event, pid: process.pid, ...detail }) + "\n"); } catch { /* logging must never change a test result */ }
};

type Connect = (this: net.Socket, ...args: unknown[]) => net.Socket;
const proto = net.Socket.prototype as unknown as { connect: Connect } & Record<symbol, unknown>;
if (!proto[FLAG]) {
  const original = proto.connect;
  proto.connect = function guarded(this: net.Socket, ...args: unknown[]) {
    const target = connectTarget(args);
    if (target.local) return original.apply(this, args);
    note("blocked", { host: target.host, port: target.port });
    const error = Object.assign(new Error("outbound network connections are blocked in tests"), { code: "ECONNREFUSED" });
    process.nextTick(() => this.destroy(error));
    return this;
  };
  proto[FLAG] = true;
}
note("loaded");
