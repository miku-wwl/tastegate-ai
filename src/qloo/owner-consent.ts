import { createHash, timingSafeEqual } from "node:crypto";

// Exact, structured owner consent. This module is the ONLY place that decides whether an owner's reply approves
// something, and it never reads meaning out of free text:
//   * the terms of a request (scope, endpoint, parameters, budgets, timeouts, size cap, expiry, environment,
//     unique identity) are written down first as a JSON document and reduced to a SHA-256 digest;
//   * the one reply that approves them is a canonical sentence derived from the kind, the unique identity and that digest;
//   * a reply is accepted only if it equals that sentence exactly (outer whitespace aside).
// There is no keyword matching and no list of negative words: "I do not approve LIVE", "maybe later", a bare "LIVE" or a
// reply approving different terms are all simply not equal to the expected sentence. Changing any term changes the digest,
// so an approval cannot be reused for other terms, another identity or another kind.
//
// What this is NOT: authentication. Whoever can run the local owner command can also paste the sentence. The record
// that results (the verbatim sentence, the digest and the markers written beside it) makes the approval specific,
// single-use and auditable; it does not prove which human produced it.
export const CONSENT_REVISION = "tastegate.consent.v1" as const;
export const CONSENT_KINDS = ["LIVE_GRANT", "PROBE_P07"] as const;
export type ConsentKind = typeof CONSENT_KINDS[number];
const VERB: Record<ConsentKind, string> = { LIVE_GRANT: "LIVE-GRANT", PROBE_P07: "P07-NYC-DISCOVERY" };

export type ConsentTerms = null | boolean | number | string | ConsentTerms[] | { [key: string]: ConsentTerms };
const SUBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_REPLY_LENGTH = 200;

// Deterministic JSON: sorted keys, no whitespace, and nothing that JSON cannot represent exactly.
export function canonicalJson(value: ConsentTerms): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("CONSENT_TERMS_INVALID"); return JSON.stringify(value); }
  if (Array.isArray(value)) return "[" + value.map((item) => canonicalJson(item)).join(",") + "]";
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto !== Object.prototype && proto !== null) throw new Error("CONSENT_TERMS_INVALID");
    return "{" + Object.keys(value).sort().map((key) => {
      const item = (value as Record<string, ConsentTerms | undefined>)[key];
      if (item === undefined) throw new Error("CONSENT_TERMS_INVALID");
      return JSON.stringify(key) + ":" + canonicalJson(item);
    }).join(",") + "}";
  }
  throw new Error("CONSENT_TERMS_INVALID");
}
export function isConsentSubjectId(value: unknown): value is string { return typeof value === "string" && SUBJECT_ID.test(value); }

// The digest binds revision, kind, unique identity and every term.
export function termsDigest(kind: ConsentKind, subjectId: string, terms: ConsentTerms): string {
  if (!CONSENT_KINDS.includes(kind) || !isConsentSubjectId(subjectId)) throw new Error("CONSENT_TERMS_INVALID");
  return createHash("sha256").update([CONSENT_REVISION, kind, subjectId, canonicalJson(terms)].join("\n"), "utf8").digest("hex");
}
// The only sentence that approves these terms. 32 hex digits (128 bits) of the digest are shown to the owner.
export function canonicalApproval(kind: ConsentKind, subjectId: string, digest: string): string {
  if (!CONSENT_KINDS.includes(kind) || !isConsentSubjectId(subjectId) || !DIGEST.test(digest)) throw new Error("CONSENT_TERMS_INVALID");
  return `APPROVE ${VERB[kind]} ${subjectId} SHA256:${digest.slice(0, 32)}`;
}
// Exact equality. Outer whitespace (a trailing newline from a shell, say) is ignored; nothing else is.
export function replyIsCanonicalApproval(reply: unknown, expected: string): boolean {
  if (typeof reply !== "string" || reply.length === 0 || reply.length > MAX_REPLY_LENGTH) return false;
  const given = Buffer.from(reply.trim(), "utf8"); const wanted = Buffer.from(expected, "utf8");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
