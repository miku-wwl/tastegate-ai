// Derives the set of sensitive tokens (provider IDs, tag URNs, private hashes, place facts, credential values)
// from the owner's ignored private captures and env files, so scans can look for them without ever printing
// them. Returns { tokens: Map<token, category>, available }. When no private evidence exists (a clean clone)
// there is nothing to leak: `available` is false and callers must report "NOT RUN", never "PASS".
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Reviewed allowlist: public by design or required verbatim in product code.
const ALLOWLIST_EXACT = new Set(["urn:tag:genre:place", "urn:entity", "urn:entity:place"]);
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function collect(value, into, path = "") {
  if (Array.isArray(value)) { value.forEach((v) => collect(v, into, path)); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.length >= 8 && !ALLOWLIST_EXACT.has(item)) {
      if (["entity_id", "place_id"].includes(key)) into.set(item, "provider_id");
      else if (["id", "tag_id"].includes(key) && item.startsWith("urn:tag:")) into.set(item, "tag_urn");
      else if (UUID.test(item)) into.set(item, path.includes("external") ? "external_reference_uuid" : "provider_uuid");
    }
    collect(item, into, path + "." + key);
  }
}
async function* rawCaptures(base) {
  for (const probe of ["p01", "p02", "p03", "p03r", "p04", "p05", "p06", "p07"]) {
    const attempts = join(base, probe, "attempts");
    if (!existsSync(attempts)) continue;
    for (const attempt of await readdir(attempts)) {
      const file = join(attempts, attempt, "response.raw.json");
      if (existsSync(file)) yield { probe, attempt, file };
    }
  }
}
// Reviewed allowlist, derived from the evidence itself: probe attempt IDs are local record identifiers that
// earlier phases already publish in tracked reports and source, and the artist's public MusicBrainz catalog ID
// appears in a published Phase 1B report. Neither is a Qloo provider identifier.
async function publicIdentifiers(base) {
  const allow = new Set();
  for (const probe of ["p01", "p02", "p03", "p03r", "p04", "p05", "p06", "p07"]) {
    const dir = join(base, probe, "attempts");
    if (existsSync(dir)) for (const attempt of await readdir(dir)) allow.add(attempt);
  }
  const review = join(base, "p05-radiohead-identity.private.json");
  if (existsSync(review)) { try { const id = JSON.parse(await readFile(review, "utf8")).musicbrainz_id; if (typeof id === "string") allow.add(id); } catch { /* ignore */ } }
  return allow;
}
export async function deriveSensitiveTokens(root, { publicAttemptIds = new Set(), allow: extraAllow = new Set() } = {}) {
  const base = join(root, "private", "qloo-probes");
  const tokens = new Map(); let captures = 0;
  const allow = new Set([...extraAllow, ...publicAttemptIds, ...(existsSync(base) ? await publicIdentifiers(base) : [])]);
  const add = (token, category) => { if (!allow.has(token) && !tokens.has(token)) tokens.set(token, category); };
  if (existsSync(base)) {
    for await (const { attempt, file } of rawCaptures(base)) {
      captures++;
      const found = new Map(); collect(JSON.parse(await readFile(file, "utf8")), found);
      for (const [token, category] of found) if (token !== attempt && !publicAttemptIds.has(token)) add(token, category);
      add(sha256(await readFile(file)), "raw_capture_sha256");
    }
    // Private integrity manifests and identity reviews hold hashes and selected identifiers.
    for (const entry of await readdir(base, { recursive: true })) {
      const rel = String(entry).replaceAll("\\", "/");
      if (!/integrity.*\.json$|identity.*\.json$|shortlist-review.*\.json$/.test(rel) || rel.includes("/review/")) continue;
      let parsed; try { parsed = JSON.parse(await readFile(join(base, rel), "utf8")); } catch { continue; }
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) for (const [key, value] of Object.entries(item ?? {})) {
        if (typeof value === "string" && value.length >= 16 && /sha256|entity_id|spotify_id|musicbrainz_id|id$/.test(key))
          add(value, /sha256/.test(key) ? "private_file_sha256" : "review_identifier");
        if (value && typeof value === "object") { const nested = new Map(); collect(value, nested); nested.forEach((c, t) => add(t, c)); }
      }
    }
  }
  for (const name of [".env.local", ".env"]) {
    if (!existsSync(join(root, name))) continue;
    const env = parseEnv(await readFile(join(root, name), "utf8"));
    for (const key of ["QLOO_API_KEY", "LLM_API_KEY"]) if (env[key]?.length >= 8) add(env[key], "credential");
  }
  // Offer digests and request bindings are private even before a receipt exists. The public approval sentence is shown only
  // at the owner's current gate, never shipped in source/docs/review archives. This is scanning, not a consent decision.
  if (existsSync(base)) for (const name of await readdir(base, { recursive: true })) {
    const rel = String(name).replaceAll("\\", "/");
    if (!/^(p07-proposals\/.*|p07-approval-receipt-.*)\.json$/.test(rel)) continue;
    let value; try { value = JSON.parse(await readFile(join(base, name), "utf8")); } catch { continue; }
    for (const [key, token] of Object.entries(value)) {
      if (typeof token !== "string") continue;
      if (/sha256$/.test(key) && /^[a-f0-9]{64}$/.test(token)) {
        add(token, "private_approval_binding");
        if (key === "terms_sha256") add("SHA256:" + token.slice(0, 32), "approval_digest_token");
      }
      if (key === "owner_reply" && token.startsWith("APPROVE ") && token.includes(" SHA256:")) add(token, "approval_sentence");
    }
  }
  return { tokens, available: captures > 0, captures };
}
// Provider-derived place facts (names, address fragments, a phone number) that are deliberately kept out of tracked files. They are
// NOT written in this file: this tool is meant to be committed, so the strings live in the owner's ignored private directory
// (private/scan-facts.private.json, `{ "strings": [...] }`). Without that file there is nothing to scan for, and callers must
// report "NOT RUN", never "PASS".
export async function loadPrivateFacts(root) {
  const file = join(root, "private", "scan-facts.private.json");
  if (!existsSync(file)) return [];
  try { const parsed = JSON.parse(await readFile(file, "utf8")); return Array.isArray(parsed?.strings) ? parsed.strings.filter((s) => typeof s === "string" && s.length >= 4) : []; }
  catch { return []; }
}
