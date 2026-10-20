// Pure logic behind the custom-input form: form state <-> the audit input JSON, JSON import, light client-side checks
// and the evidence-coverage hints. Type-only imports from the domain keep server code out of the browser bundle; the
// server re-validates everything (src/domain/custom-input.ts), so these checks only save a round trip.
import type { AuditInput } from "../src/domain/contracts";
import { MAX_IMPORT_BYTES } from "../src/domain/protocol";
import { hasUnsafeCharacters } from "../src/domain/text-safety";

export type InterestKind = "artist" | "film_concept" | "tag_concept";
export const INTEREST_KINDS: ReadonlyArray<{ value: InterestKind; label: string; lookup: "artist" | "movie" | "tag" }> = Object.freeze([
  { value: "artist", label: "Artist or band", lookup: "artist" }, { value: "film_concept", label: "Film", lookup: "movie" }, { value: "tag_concept", label: "Genre or tag", lookup: "tag" }]);
export type FormState = {
  task: string; city: string; country: string; maxItems: 1 | 2 | 3;
  interests: Array<{ kind: InterestKind; text: string; search: string }>;
  recommendations: Array<{ name: string; address: string; claims: string }>;
};
export const LIMITS = Object.freeze({ interests: 3, recommendations: 3, claims: 5, text: 200, task: 500, city: 100, address: 300, claim: 300 });
export type FieldIssue = { field: string; message: string };

export const emptyForm = (): FormState => ({ task: "", city: "", country: "US", maxItems: 3,
  interests: [{ kind: "artist", text: "", search: "" }], recommendations: [{ name: "", address: "", claims: "" }] });
// A small worked example that matches the recorded evidence, so the first custom run shows what coverage looks like.
export const exampleForm = (): FormState => ({ task: "Audit my New York evening plan.", city: "New York", country: "US", maxItems: 3,
  interests: [{ kind: "artist", text: "Radiohead", search: "Radiohead" }],
  recommendations: [{ name: "Blue Note New York", address: "131 W 3rd St", claims: "Radiohead fans are guaranteed to love it." }, { name: "Corner Jazz Cellar", address: "", claims: "" }] });

const squeeze = (value: string) => value.normalize("NFC").trim().replace(/ {2,}/g, " ");
const lines = (value: string) => value.split("\n").map(squeeze).filter(Boolean);

export function formToInput(form: FormState): AuditInput {
  const city = squeeze(form.city);
  return {
    schema_revision: "tastegate.input.v0",
    preferences: form.interests.filter((i) => squeeze(i.text)).map((i, n) => ({ id: `pref-${n + 1}`, text: squeeze(i.text), kind: i.kind, confirmed_anchor: squeeze(i.search) || squeeze(i.text) })),
    task: squeeze(form.task) || `Audit my recommendations for ${city || "my destination"}.`,
    destination: city,
    constraints: [{ id: "c-city", kind: "city", value: city }, { id: "c-country", kind: "country", value: form.country },
      { id: "c-type", kind: "entity_type", value: "place" }, { id: "c-max", kind: "max_items", value: form.maxItems }],
    recommendations: form.recommendations.filter((r) => squeeze(r.name)).map((r, n) => ({ id: `rec-${n + 1}`, name: squeeze(r.name), address_hint: squeeze(r.address) || null, claims: lines(r.claims) })),
  };
}

export function clientIssues(form: FormState, countries: ReadonlyArray<{ code: string }>): FieldIssue[] {
  const issues: FieldIssue[] = []; const add = (field: string, message: string) => issues.push({ field, message });
  const check = (field: string, value: string, max: number, label: string, required = false) => {
    const v = squeeze(value);
    if (required && !v) add(field, `${label} is required.`);
    else if (v.length > max) add(field, `${label} must be at most ${max} characters.`);
    if (hasUnsafeCharacters(value)) add(field, `${label} contains characters that aren’t allowed (control, invisible or text-direction characters).`);
  };
  check("task", form.task, LIMITS.task, "The request");
  check("city", form.city, LIMITS.city, "The city", true);
  if (!countries.some((c) => c.code === form.country)) add("country", "Choose a country from the list.");
  const interests = form.interests.filter((i) => squeeze(i.text));
  if (!interests.length) add("interests.0.text", "Add at least one taste signal, for example an artist you like.");
  if (form.interests.length > LIMITS.interests) add("interests", `At most ${LIMITS.interests} taste signals.`);
  form.interests.forEach((i, n) => { check(`interests.${n}.text`, i.text, LIMITS.text, "The taste signal"); check(`interests.${n}.search`, i.search, LIMITS.text, "The search term"); });
  const recs = form.recommendations.filter((r) => squeeze(r.name));
  if (!recs.length) add("recommendations.0.name", "Add at least one recommendation to audit.");
  if (form.recommendations.length > LIMITS.recommendations) add("recommendations", `At most ${LIMITS.recommendations} recommendations.`);
  form.recommendations.forEach((r, n) => {
    check(`recommendations.${n}.name`, r.name, LIMITS.text, "The name"); check(`recommendations.${n}.address`, r.address, LIMITS.address, "The address");
    const claims = lines(r.claims); if (claims.length > LIMITS.claims) add(`recommendations.${n}.claims`, `At most ${LIMITS.claims} claims per recommendation (one per line).`);
    claims.forEach((claim) => { if (claim.length > LIMITS.claim) add(`recommendations.${n}.claims`, `Each claim must be at most ${LIMITS.claim} characters.`); });
    if (hasUnsafeCharacters(r.claims.replace(/\n/g, " "))) add(`recommendations.${n}.claims`, "Claims contain characters that aren’t allowed (control, invisible or text-direction characters).");
  });
  if (!issues.length && new TextEncoder().encode(JSON.stringify(formToInput(form))).length > MAX_IMPORT_BYTES) add("", "The whole input is larger than 16 KiB. Shorten some text.");
  return issues;
}

// ---- JSON import: the same shape the export writes (an audit input). Anything else is refused with a plain reason. ----
export type ImportResult = { ok: true; form: FormState } | { ok: false; message: string };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const onlyKeys = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).every((k) => keys.includes(k));
const str = (v: unknown) => typeof v === "string" ? v : null;
export function parseImport(text: string): ImportResult {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return { ok: false, message: "That file is larger than 16 KiB. Nothing was imported." };
  let raw: unknown; try { raw = JSON.parse(text); } catch { return { ok: false, message: "That file isn’t valid JSON. Nothing was imported." }; }
  return inputToForm(raw);
}
export function inputToForm(raw: unknown): ImportResult {
  const bad = (message: string): ImportResult => ({ ok: false, message: `${message} Nothing was imported.` });
  if (!isRecord(raw) || !onlyKeys(raw, ["schema_revision", "preferences", "task", "destination", "constraints", "recommendations"]) || raw.schema_revision !== "tastegate.input.v0") return bad("This isn’t a TasteGate input file.");
  const { preferences, constraints, recommendations } = raw;
  if (!Array.isArray(preferences) || !Array.isArray(constraints) || !Array.isArray(recommendations) || !str(raw.task)) return bad("The input file is missing required sections.");
  if (preferences.length < 1 || preferences.length > LIMITS.interests || recommendations.length < 1 || recommendations.length > LIMITS.recommendations) return bad("The file has too many or too few items.");
  const form = emptyForm(); form.task = raw.task as string; form.interests = []; form.recommendations = [];
  for (const p of preferences) {
    if (!isRecord(p) || !onlyKeys(p, ["id", "text", "kind", "confirmed_anchor"]) || !INTEREST_KINDS.some((k) => k.value === p.kind) || !str(p.text) || (p.confirmed_anchor !== null && !str(p.confirmed_anchor))) return bad("A taste signal in the file is malformed.");
    form.interests.push({ kind: p.kind as InterestKind, text: p.text as string, search: (p.confirmed_anchor as string | null) ?? "" });
  }
  let city: string | null = null; let country: string | null = null; let max: number | null = null;
  for (const c of constraints) {
    if (!isRecord(c) || !onlyKeys(c, ["id", "kind", "value"])) return bad("A constraint in the file is malformed.");
    if (c.kind === "city" && city === null && str(c.value)) city = c.value as string;
    else if (c.kind === "country" && country === null && str(c.value)) country = c.value as string;
    else if (c.kind === "max_items" && max === null && typeof c.value === "number" && [1, 2, 3].includes(c.value)) max = c.value;
    else if (!(c.kind === "entity_type" && c.value === "place")) return bad("This form supports one city, one country, a venue-type and one size limit.");
  }
  if (city === null || country === null || max === null) return bad("The file needs a city, a country and a size limit.");
  form.city = city; form.country = country; form.maxItems = max as 1 | 2 | 3;
  for (const r of recommendations) {
    if (!isRecord(r) || !onlyKeys(r, ["id", "name", "address_hint", "claims"]) || !str(r.name) || (r.address_hint !== null && !str(r.address_hint)) || !Array.isArray(r.claims) || r.claims.some((x) => !str(x)) || r.claims.length > LIMITS.claims)
      return bad("A recommendation in the file is malformed.");
    form.recommendations.push({ name: r.name as string, address: (r.address_hint as string | null) ?? "", claims: (r.claims as string[]).join("\n") });
  }
  return { ok: true, form };
}

// ---- Evidence-coverage hints (exact strings: recorded replay matches the query text exactly, case included). ----
export type Coverage = { artist: string[]; movie: string[]; place: string[]; tag: string[] };
export type CoverageHint = { state: "empty" | "covered" | "near" | "none"; suggestion?: string };
export function coverageHint(known: readonly string[], term: string): CoverageHint {
  const t = squeeze(term); if (!t) return { state: "empty" };
  if (known.includes(t)) return { state: "covered" };
  const near = known.find((k) => k.toLowerCase() === t.toLowerCase()); return near ? { state: "near", suggestion: near } : { state: "none" };
}
export const interestCoverage = (coverage: Coverage, kind: InterestKind) => kind === "artist" ? coverage.artist : kind === "film_concept" ? coverage.movie : coverage.tag;

// ---- Server-side issues -> form fields and plain messages (the server never echoes the offending value). ----
export type ServerIssue = { path: string; reason: string };
const REASON_TEXT: Record<string, string> = {
  UNSAFE_CHARACTERS: "contains characters that aren’t allowed (control, invisible or text-direction characters)", RESERVED_ID: "uses a reserved identifier",
  SCHEMA: "isn’t valid (check that required fields are filled and within their length limits)", TOO_LARGE: "is too large", NOT_AN_OBJECT: "couldn’t be read", UNREADABLE: "couldn’t be read",
};
export function serverIssueToField(issue: ServerIssue): FieldIssue {
  const parts = issue.path.split("."); const [section, index, key] = parts; const message = `This ${REASON_TEXT[issue.reason] ?? "isn’t valid"}.`;
  const n = Number(index);
  if (section === "preferences" && Number.isInteger(n)) return { field: `interests.${n}.${key === "confirmed_anchor" ? "search" : "text"}`, message };
  if (section === "recommendations" && Number.isInteger(n)) return { field: `recommendations.${n}.${key === "address_hint" ? "address" : key === "claims" ? "claims" : "name"}`, message };
  if (section === "constraints" && Number.isInteger(n)) return { field: n === 0 ? "city" : n === 1 ? "country" : "", message };
  if (section === "task") return { field: "task", message };
  if (section === "destination") return { field: "city", message };
  return { field: "", message: `The input ${REASON_TEXT[issue.reason] ?? "isn’t valid"}.` };
}
