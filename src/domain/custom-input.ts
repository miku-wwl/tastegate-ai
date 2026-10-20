import { AuditInputSchema, type AuditInput } from "./contracts";

// User-supplied (custom or imported) audit input. The base schema already bounds sizes, rejects unknown fields,
// authority fields and lone surrogates; this layer adds what matters when a person, not the codebase, wrote the text.
//   * no control, bidi-override, zero-width or line-separator characters (display spoofing and log/field injection);
//   * NFC-normalized, trimmed, internal whitespace collapsed (formatting only: case is never altered);
//   * IDs may not use the reserved prefixes that identify internal targets or evidence namespaces.
// Failures report only field paths and fixed reason codes: never the offending value.
import { RESERVED_ID_PREFIXES, hasUnsafeCharacters } from "./text-safety";

export { RESERVED_ID_PREFIXES, hasUnsafeCharacters };
export type CustomInputIssue = { path: string; reason: "UNSAFE_CHARACTERS" | "RESERVED_ID" | "SCHEMA" | "NOT_AN_OBJECT" | "TOO_LARGE" | "UNREADABLE" };
export type CustomInputResult = { ok: true; input: AuditInput } | { ok: false; issues: CustomInputIssue[] };

const clean = (value: string) => value.normalize("NFC").trim().replace(/ {2,}/g, " ");
// The deepest legitimate value is root > list > item > field > string; anything deeper is not this schema.
const MAX_DEPTH = 6;
function walk(value: unknown, path: string, issues: CustomInputIssue[], depth = 0): unknown {
  if (depth > MAX_DEPTH) { issues.push({ path, reason: "SCHEMA" }); return null; }
  if (typeof value === "string") {
    if (hasUnsafeCharacters(value)) { issues.push({ path, reason: "UNSAFE_CHARACTERS" }); return value; }
    return clean(value);
  }
  if (Array.isArray(value)) return value.map((item, i) => walk(item, `${path}.${i}`, issues, depth + 1));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, path ? `${path}.${key}` : key, issues, depth + 1)]));
  return value; // numbers, booleans, null: left to the schema
}
export function normalizeCustomInput(raw: unknown): CustomInputResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) return { ok: false, issues: [{ path: "", reason: "NOT_AN_OBJECT" }] };
  // Bound the work before walking: the schema's 16 KiB limit applies after normalization, this applies before it.
  // Serialization can throw (BigInt, cycles, extreme nesting): that is "unreadable", never an exception to the caller.
  let size: number; try { size = new TextEncoder().encode(JSON.stringify(raw)).length; } catch { return { ok: false, issues: [{ path: "", reason: "UNREADABLE" }] }; }
  if (size > 32_768) return { ok: false, issues: [{ path: "", reason: "TOO_LARGE" }] };
  const issues: CustomInputIssue[] = []; const cleaned = walk(raw, "", issues);
  if (issues.length) return { ok: false, issues: issues.slice(0, 10) };
  const parsed = AuditInputSchema.safeParse(cleaned);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), reason: "SCHEMA" as const })) };
  const reserved = [...parsed.data.preferences.map((p, i) => ({ id: p.id, path: `preferences.${i}.id` })),
    ...parsed.data.recommendations.map((r, i) => ({ id: r.id, path: `recommendations.${i}.id` })),
    ...parsed.data.constraints.map((c, i) => ({ id: c.id, path: `constraints.${i}.id` }))]
    .filter((x) => RESERVED_ID_PREFIXES.some((prefix) => x.id.toLowerCase().startsWith(prefix)));
  if (reserved.length) return { ok: false, issues: reserved.map((x) => ({ path: x.path, reason: "RESERVED_ID" as const })) };
  return { ok: true, input: parsed.data };
}
// A small, fixed list: the country is a hard-constraint code, never free text.
export const COUNTRIES: ReadonlyArray<{ code: string; name: string }> = Object.freeze([
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" }, { code: "CA", name: "Canada" }, { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" }, { code: "FR", name: "France" }, { code: "DE", name: "Germany" }, { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" }, { code: "JP", name: "Japan" }, { code: "KR", name: "South Korea" }, { code: "MX", name: "Mexico" }, { code: "BR", name: "Brazil" },
]);
