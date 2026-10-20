import { describe, expect, it } from "vitest";
import { AuditInputSchema } from "../src/domain/contracts";
import { COUNTRIES, hasUnsafeCharacters, normalizeCustomInput, RESERVED_ID_PREFIXES } from "../src/domain/custom-input";

// Authored, invented data only. Invisible and control characters are built from numeric code points so that no such
// character is ever pasted into this file.
const cp = (...points: number[]) => String.fromCodePoint(...points);
const VALID = () => ({
  schema_revision: "tastegate.input.v0",
  preferences: [{ id: "pref-1", text: "Authored Band", kind: "artist", confirmed_anchor: null }, { id: "pref-2", text: "slow jazz", kind: "tag_concept", confirmed_anchor: null }],
  task: "Pick a late-night live music venue",
  destination: "Authored City",
  constraints: [{ id: "c-city", kind: "city", value: "Authored City" }, { id: "c-country", kind: "country", value: "US" }, { id: "c-type", kind: "entity_type", value: "place" }, { id: "c-max", kind: "max_items", value: 2 }],
  recommendations: [
    { id: "rec-1", name: "Authored Jazz Room", address_hint: "1 Invented Street", claims: ["Live jazz nightly"] },
    { id: "rec-2", name: "Authored Far Pavilion", address_hint: null, claims: [] },
  ],
});
type Mutable = ReturnType<typeof VALID>;
const withChange = (change: (input: Mutable) => void) => { const input = VALID(); change(input); return input; };
const fails = (raw: unknown) => { const result = normalizeCustomInput(raw); expect(result.ok).toBe(false); return result.ok ? [] : result.issues; };

describe("custom input: accepted shape", () => {
  it("accepts a valid input and returns exactly the schema's parse of it", () => {
    const result = normalizeCustomInput(VALID()); expect(result.ok).toBe(true);
    if (result.ok) expect(result.input).toEqual(AuditInputSchema.parse(VALID()));
  });
  it("normalizes formatting only: NFC, trim, collapsed spaces; case and wording are never altered", () => {
    const decomposed = "Cafe" + cp(0x301) + "   Bar   Authored "; // e + combining acute, runs of spaces, trailing space
    const result = normalizeCustomInput(withChange((i) => { i.recommendations[0]!.name = decomposed; i.preferences[0]!.text = "  Authored   BAND  "; }));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.input.recommendations[0]!.name).toBe("Caf" + cp(0xe9) + " Bar Authored"); // precomposed
    expect(result.input.preferences[0]!.text).toBe("Authored BAND");
  });
  it("is idempotent and survives a JSON export/import round trip unchanged", () => {
    const first = normalizeCustomInput(withChange((i) => { i.task = "  spaced   task  "; })); expect(first.ok).toBe(true); if (!first.ok) return;
    const second = normalizeCustomInput(JSON.parse(JSON.stringify(first.input))); expect(second.ok).toBe(true); if (second.ok) expect(second.input).toEqual(first.input);
  });
  it("does not mutate what it was given", () => {
    const raw = withChange((i) => { i.task = "  spaced   task  "; }); const before = JSON.stringify(raw); normalizeCustomInput(raw); expect(JSON.stringify(raw)).toBe(before);
  });
  it("accepts ordinary international text, punctuation and emoji", () => {
    for (const text of ["Caf" + cp(0xe9), cp(0x6771, 0x4eac) + " Jazz", cp(0x41f, 0x440, 0x438, 0x432, 0x435, 0x442), "Rock & Roll, 24/7 (live) - \"quoted\"", cp(0x1f3b7) + " saxophone"])
      expect(hasUnsafeCharacters(text)).toBe(false);
    expect(normalizeCustomInput(withChange((i) => { i.preferences[0]!.text = cp(0x6771, 0x4eac) + " Jazz"; })).ok).toBe(true);
  });
  it("offers a small fixed country list of valid uppercase codes", () => {
    expect(COUNTRIES.length).toBeGreaterThan(5); expect(COUNTRIES.length).toBeLessThan(30);
    for (const c of COUNTRIES) { expect(c.code).toMatch(/^[A-Z]{2}$/); expect(c.name.length).toBeGreaterThan(1); }
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length); expect(Object.isFrozen(COUNTRIES)).toBe(true);
  });
});

describe("custom input: unsafe characters (display spoofing, field and log injection)", () => {
  const UNSAFE = [0x00, 0x07, 0x09, 0x0a, 0x0d, 0x1b, 0x7f, 0x85, 0x9f, 0xad, 0x61c, 0x180e, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2060, 0x2066, 0x2069, 0x206f, 0xfeff, 0xfff9, 0xfffb];
  it.each(UNSAFE.map((point) => [`U+${point.toString(16).toUpperCase().padStart(4, "0")}`, point] as const))("rejects %s in any text field and reports only the path", (_, point) => {
    const char = cp(point);
    expect(hasUnsafeCharacters("a" + char + "b")).toBe(true);
    const where: Array<[string, (i: Mutable) => void]> = [
      ["task", (i) => { i.task = "plan" + char; }], ["destination", (i) => { i.destination = char + "x"; }],
      ["preferences.0.text", (i) => { i.preferences[0]!.text = "a" + char + "b"; }], ["recommendations.1.name", (i) => { i.recommendations[1]!.name = "a" + char + "b"; }],
      ["recommendations.0.claims.0", (i) => { i.recommendations[0]!.claims[0] = "a" + char + "b"; }], ["constraints.0.value", (i) => { i.constraints[0]!.value = "a" + char + "b"; }],
    ];
    for (const [path, change] of where) {
      const issues = fails(withChange(change)); expect(issues).toContainEqual({ path, reason: "UNSAFE_CHARACTERS" });
      expect(JSON.stringify(issues)).not.toContain(char); // the offending value is never echoed
    }
  });
  it("neighbouring ordinary characters are not flagged (range boundaries)", () => {
    for (const point of [0x20, 0x7e, 0xa0, 0xa1, 0xae, 0x61b, 0x61d, 0x2010, 0x2027, 0x202f, 0x205f, 0x2070, 0xfefe, 0xff00, 0xfff8, 0xfffc]) expect(hasUnsafeCharacters("a" + cp(point) + "b")).toBe(false);
  });
  it("rejects a lone surrogate through the schema", () => {
    const issues = fails(withChange((i) => { i.task = "bad" + String.fromCharCode(0xd800); })); expect(issues.map((x) => x.reason)).toEqual(["SCHEMA"]);
  });
  it("reports at most ten issues", () => {
    const issues = fails(withChange((i) => { i.task = cp(7); i.destination = cp(7); i.preferences[0]!.text = cp(7); i.preferences[1]!.text = cp(7); i.recommendations[0]!.name = cp(7); i.recommendations[1]!.name = cp(7);
      i.constraints[0]!.value = cp(7); i.recommendations[0]!.claims = [cp(7), cp(7), cp(7), cp(7), cp(7)]; }));
    expect(issues.length).toBeLessThanOrEqual(10); expect(issues.length).toBeGreaterThan(5);
  });
});

describe("custom input: reserved identifiers and authority fields", () => {
  it.each(RESERVED_ID_PREFIXES.flatMap((prefix) => [[prefix], [prefix.toUpperCase()]]))("rejects an ID that starts with the reserved prefix %s", (prefix) => {
    expect(fails(withChange((i) => { i.preferences[0]!.id = prefix + "x"; }))).toContainEqual({ path: "preferences.0.id", reason: "RESERVED_ID" });
    expect(fails(withChange((i) => { i.recommendations[1]!.id = prefix + "x"; }))).toContainEqual({ path: "recommendations.1.id", reason: "RESERVED_ID" });
    expect(fails(withChange((i) => { i.constraints[2]!.id = prefix + "x"; }))).toContainEqual({ path: "constraints.2.id", reason: "RESERVED_ID" });
  });
  it("allows a prefix inside an ID, only the start is reserved", () => {
    expect(normalizeCustomInput(withChange((i) => { i.recommendations[0]!.id = "my-repair:ok"; })).ok).toBe(true);
  });
  it.each([["source_mode"], ["evidence"], ["confirmations"], ["api_key"], ["qloo_ref"], ["authorization"], ["live"], ["constructor"], ["prototype"]])("rejects the unknown field %s at the top level and inside items", (key) => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(VALID())); (raw as Record<string, unknown>)[key] = "authored-secret-value-0001";
    const issues = fails(JSON.parse(JSON.stringify(raw))); expect(issues.every((x) => x.reason === "SCHEMA")).toBe(true); expect(JSON.stringify(issues)).not.toContain("authored-secret-value-0001");
    const nested = VALID() as unknown as { preferences: Array<Record<string, unknown>> }; nested.preferences[0]![key] = "authored-secret-value-0002";
    expect(fails(JSON.parse(JSON.stringify(nested))).every((x) => x.reason === "SCHEMA")).toBe(true);
  });
  it("a JSON '__proto__' key is rejected and cannot pollute any prototype", () => {
    const raw = JSON.parse(JSON.stringify(VALID()).replace(/^\{/, '{"__proto__":{"polluted":true},'));
    fails(raw); expect(({} as Record<string, unknown>).polluted).toBeUndefined(); expect(Object.prototype).not.toHaveProperty("polluted");
  });
});

describe("custom input: schema limits and hostile shapes", () => {
  it.each([[null], [undefined], ["text"], [42], [true], [[]], [[VALID()]], [Object.create(null)], [new Map()], [new (class Input {})()], [() => VALID()]])("rejects a non-plain-object root (%#)", (root) => {
    expect(fails(root)).toEqual([{ path: "", reason: "NOT_AN_OBJECT" }]);
  });
  it("rejects over-large input before walking it", () => {
    const issues = fails(withChange((i) => { i.recommendations[0]!.claims = ["x".repeat(300)]; i.task = "t".repeat(500); i.recommendations[1]!.name = "n".repeat(200); (i as unknown as Record<string, unknown>).filler = "f".repeat(33_000); }));
    expect(issues).toEqual([{ path: "", reason: "TOO_LARGE" }]);
  });
  it("rejects input that cannot be serialized or is absurdly nested, without throwing", () => {
    expect(fails({ n: BigInt(1) })).toEqual([{ path: "", reason: "UNREADABLE" }]);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic; expect(fails(cyclic)).toEqual([{ path: "", reason: "UNREADABLE" }]);
    let deep: unknown = "leaf"; for (let n = 0; n < 5000; n++) deep = [deep];
    expect(() => normalizeCustomInput({ deep })).not.toThrow(); expect(normalizeCustomInput({ deep }).ok).toBe(false);
    let shallowButTooDeep: unknown = "leaf"; for (let n = 0; n < 12; n++) shallowButTooDeep = { next: shallowButTooDeep };
    expect(fails({ ...VALID(), preferences: shallowButTooDeep }).length).toBeGreaterThan(0);
  });
  it.each<[string, (i: Mutable) => void]>([
    ["no preferences", (i) => { i.preferences = []; }],
    ["four preferences", (i) => { i.preferences = Array.from({ length: 4 }, (_, n) => ({ id: `p${n}`, text: "x", kind: "artist", confirmed_anchor: null })); }],
    ["four recommendations", (i) => { i.recommendations = Array.from({ length: 4 }, (_, n) => ({ id: `r${n}`, name: "x", address_hint: null, claims: [] })); }],
    ["no recommendations", (i) => { i.recommendations = []; }],
    ["six claims", (i) => { i.recommendations[0]!.claims = ["a", "b", "c", "d", "e", "f"]; }],
    ["nine constraints", (i) => { i.constraints = Array.from({ length: 9 }, (_, n) => ({ id: `k${n}`, kind: "city", value: "x" })); }],
    ["no constraints", (i) => { i.constraints = []; }],
    ["max_items of 4", (i) => { i.constraints[3]!.value = 4; }],
    ["max_items of 0", (i) => { i.constraints[3]!.value = 0; }],
    ["max_items fractional", (i) => { i.constraints[3]!.value = 1.5; }],
    ["lowercase country", (i) => { i.constraints[1]!.value = "us"; }],
    ["three-letter country", (i) => { i.constraints[1]!.value = "USA"; }],
    ["entity type that is not a place", (i) => { (i.constraints[2] as { value: string }).value = "artist"; }],
    ["blank city", (i) => { i.constraints[0]!.value = "   "; }],
    ["duplicate IDs", (i) => { i.recommendations[1]!.id = i.recommendations[0]!.id; }],
    ["an ID with a space", (i) => { i.preferences[0]!.id = "bad id"; }],
    ["an ID with a slash", (i) => { i.preferences[0]!.id = "bad/id"; }],
    ["an over-long ID", (i) => { i.preferences[0]!.id = "x".repeat(129); }],
    ["an unknown preference kind", (i) => { (i.preferences[0] as { kind: string }).kind = "podcast"; }],
    ["a wrong schema revision", (i) => { i.schema_revision = "tastegate.input.v9"; }],
    ["a numeric task", (i) => { (i as unknown as { task: unknown }).task = 7; }],
    ["a blank task", (i) => { i.task = "   "; }],
    ["an over-long task", (i) => { i.task = "x".repeat(501); }],
    ["an over-long name", (i) => { i.recommendations[0]!.name = "x".repeat(201); }],
  ])("rejects %s", (_, change) => { const issues = fails(withChange(change)); expect(issues.length).toBeGreaterThan(0); expect(issues.length).toBeLessThanOrEqual(10); });
  it("failures carry only a path and a fixed reason code, never a value", () => {
    const secret = "authored-secret-needle-9931";
    const issues = fails(withChange((i) => { i.task = secret.repeat(40); (i.constraints[3] as { value: unknown }).value = secret; i.recommendations[0]!.id = "repair:" + secret; }));
    for (const issue of issues) { expect(Object.keys(issue).sort()).toEqual(["path", "reason"]); expect(issue.reason).toMatch(/^[A-Z_]+$/); }
    expect(JSON.stringify(issues)).not.toContain(secret);
  });
  it("makes no network call and has no dependency on provider code", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile("src/domain/custom-input.ts", "utf8"));
    expect(source).not.toMatch(/from "\.\.\/qloo|from "node:(http|https|net|dns)|fetch\(/);
  });
});
