import { describe, expect, it } from "vitest";
import { clientIssues, coverageHint, emptyForm, exampleForm, formToInput, inputToForm, interestCoverage, parseImport, serverIssueToField, type FormState } from "../app/custom-form";
import { COUNTRIES, normalizeCustomInput } from "../src/domain/custom-input";
import { MAX_IMPORT_BYTES } from "../src/domain/protocol";

const cp = (...points: number[]) => String.fromCodePoint(...points);
const valid = (): FormState => ({ task: "Plan my evening", city: "Authored City", country: "US", maxItems: 2,
  interests: [{ kind: "artist", text: "Authored Band", search: "" }, { kind: "tag_concept", text: "slow jazz", search: "jazz" }],
  recommendations: [{ name: "Authored Jazz Room", address: "1 Invented Street", claims: "Live jazz nightly\nOpen late" }, { name: "Second Place", address: "", claims: "" }] });
const issuesOf = (form: FormState) => clientIssues(form, COUNTRIES);
const fieldsOf = (form: FormState) => issuesOf(form).map((i) => i.field);

describe("form -> audit input", () => {
  it("produces an input the server-side normalizer accepts unchanged", () => {
    for (const form of [valid(), exampleForm()]) {
      const input = formToInput(form); const server = normalizeCustomInput(JSON.parse(JSON.stringify(input)));
      expect(server.ok).toBe(true); if (server.ok) expect(server.input).toEqual(input);
    }
  });
  it("names IDs deterministically, defaults the search term to the interest text and the task to a plain sentence", () => {
    const input = formToInput(valid());
    expect(input.preferences.map((p) => [p.id, p.text, p.confirmed_anchor])).toEqual([["pref-1", "Authored Band", "Authored Band"], ["pref-2", "slow jazz", "jazz"]]);
    expect(input.recommendations.map((r) => [r.id, r.name, r.address_hint, r.claims])).toEqual([["rec-1", "Authored Jazz Room", "1 Invented Street", ["Live jazz nightly", "Open late"]], ["rec-2", "Second Place", null, []]]);
    expect(input.constraints).toEqual([{ id: "c-city", kind: "city", value: "Authored City" }, { id: "c-country", kind: "country", value: "US" }, { id: "c-type", kind: "entity_type", value: "place" }, { id: "c-max", kind: "max_items", value: 2 }]);
    expect(input.destination).toBe("Authored City");
    const bare = valid(); bare.task = "   "; expect(formToInput(bare).task).toBe("Audit my recommendations for Authored City.");
  });
  it("trims, collapses spaces and drops blank rows without altering case or wording", () => {
    const form = valid(); form.interests.push({ kind: "film_concept", text: "   ", search: "ignored" }); form.recommendations.push({ name: "  ", address: "x", claims: "y" });
    form.recommendations[0]!.name = "  Authored   JAZZ  Room "; form.recommendations[0]!.claims = "  one  claim \n\n   \nsecond";
    const input = formToInput(form);
    expect(input.preferences.length).toBe(2); expect(input.recommendations.map((r) => r.name)).toEqual(["Authored JAZZ Room", "Second Place"]); expect(input.recommendations[0]!.claims).toEqual(["one claim", "second"]);
  });
  it("keeps IDs free of the reserved prefixes by construction", () => {
    const input = formToInput(valid()); for (const id of [...input.preferences, ...input.recommendations, ...input.constraints].map((x) => x.id)) expect(id).toMatch(/^(pref|rec|c)-/);
  });
});

describe("client-side checks (the server still decides)", () => {
  it("accepts a valid form and requires the essentials", () => {
    expect(issuesOf(valid())).toEqual([]);
    const empty = emptyForm(); expect(fieldsOf(empty)).toEqual(expect.arrayContaining(["city", "interests.0.text", "recommendations.0.name"]));
    const noCountry = valid(); noCountry.country = "ZZ"; expect(fieldsOf(noCountry)).toContain("country");
  });
  it("enforces lengths and counts", () => {
    const f = valid(); f.city = "c".repeat(101); f.recommendations[0]!.name = "n".repeat(201); f.recommendations[0]!.address = "a".repeat(301); f.task = "t".repeat(501);
    f.recommendations[0]!.claims = Array.from({ length: 6 }, (_, n) => `claim ${n}`).join("\n"); f.interests[0]!.text = "i".repeat(201);
    expect(fieldsOf(f)).toEqual(expect.arrayContaining(["city", "recommendations.0.name", "recommendations.0.address", "task", "recommendations.0.claims", "interests.0.text"]));
    const many = valid(); many.interests = Array.from({ length: 4 }, () => ({ kind: "artist" as const, text: "x", search: "" })); many.recommendations = Array.from({ length: 4 }, () => ({ name: "x", address: "", claims: "" }));
    expect(fieldsOf(many)).toEqual(expect.arrayContaining(["interests", "recommendations"]));
    const longClaim = valid(); longClaim.recommendations[0]!.claims = "c".repeat(301); expect(fieldsOf(longClaim)).toContain("recommendations.0.claims");
  });
  it("flags control, invisible and text-direction characters in every text field", () => {
    for (const point of [0x07, 0x1b, 0x200b, 0x202e, 0x2066, 0xfeff]) {
      const bad = cp(point);
      for (const [field, change] of [["task", (f: FormState) => { f.task = "a" + bad; }], ["city", (f: FormState) => { f.city = "a" + bad; }], ["interests.0.text", (f: FormState) => { f.interests[0]!.text = "a" + bad; }],
        ["interests.1.search", (f: FormState) => { f.interests[1]!.search = "a" + bad; }], ["recommendations.0.name", (f: FormState) => { f.recommendations[0]!.name = "a" + bad; }],
        ["recommendations.0.address", (f: FormState) => { f.recommendations[0]!.address = "a" + bad; }], ["recommendations.0.claims", (f: FormState) => { f.recommendations[0]!.claims = "a" + bad; }]] as const) {
        const form = valid(); change(form); expect(fieldsOf(form)).toContain(field);
        expect(JSON.stringify(issuesOf(form))).not.toContain(bad); // messages never repeat the offending character
      }
    }
  });
  it("refuses an input larger than the 16 KiB limit (reachable only with multi-byte text: every field is within its own limit)", () => {
    const wide = (n: number) => cp(0x4e2d).repeat(n); // 3 bytes per character in UTF-8
    const f = valid(); f.recommendations = Array.from({ length: 3 }, () => ({ name: wide(200), address: wide(300), claims: Array.from({ length: 5 }, () => wide(300)).join("\n") }));
    f.task = wide(500); f.interests = Array.from({ length: 3 }, () => ({ kind: "artist" as const, text: wide(200), search: wide(200) }));
    expect(new TextEncoder().encode(JSON.stringify(formToInput(f))).length).toBeGreaterThan(MAX_IMPORT_BYTES);
    expect(issuesOf(f)).toEqual([{ field: "", message: "The whole input is larger than 16 KiB. Shorten some text." }]);
    const server = normalizeCustomInput(JSON.parse(JSON.stringify(formToInput(f)))); expect(server.ok).toBe(false); // the server agrees
  });
  it("agrees with the server: whatever the client passes, a form built here is accepted by the server normalizer", () => {
    for (const form of [valid(), exampleForm()]) { expect(issuesOf(form)).toEqual([]); expect(normalizeCustomInput(formToInput(form)).ok).toBe(true); }
  });
});

describe("JSON export and import", () => {
  it("round-trips a form through the exported JSON", () => {
    const form = valid(); const text = JSON.stringify(formToInput(form), null, 2); const back = parseImport(text);
    expect(back.ok).toBe(true); if (!back.ok) return;
    expect(formToInput(back.form)).toEqual(formToInput(form));
    // blank "search" round-trips as the explicit anchor
    expect(back.form.interests[0]!.search).toBe("Authored Band");
  });
  it.each([
    ["invalid JSON", "{"], ["a JSON array", "[]"], ["null", "null"], ["a string", JSON.stringify("x")], ["an object of another kind", JSON.stringify({ hello: "world" })],
    ["the wrong revision", JSON.stringify({ ...formToInput(valid()), schema_revision: "tastegate.input.v9" })],
    ["extra top-level keys", JSON.stringify({ ...formToInput(valid()), source_mode: "authorized_live" })],
    ["an authority-looking key", JSON.stringify({ ...formToInput(valid()), api_key: "authored-key" })],
  ])("refuses %s with a plain reason and imports nothing", (_, text) => {
    const result = parseImport(text); expect(result.ok).toBe(false); if (!result.ok) { expect(result.message).toMatch(/Nothing was imported\.$/); expect(result.message).not.toContain("authored-key"); }
  });
  it("refuses an oversized file before parsing it", () => {
    const result = parseImport(" ".repeat(MAX_IMPORT_BYTES + 1)); expect(result).toEqual({ ok: false, message: "That file is larger than 16 KiB. Nothing was imported." });
  });
  it("refuses structures the form cannot represent faithfully", () => {
    const base = () => JSON.parse(JSON.stringify(formToInput(valid())));
    const mutate = (change: (input: any) => void) => { const input = base(); change(input); return inputToForm(input); };
    for (const result of [
      mutate((i) => { i.constraints.push({ id: "c-city-2", kind: "city", value: "Another" }); }),
      mutate((i) => { i.constraints = i.constraints.filter((c: any) => c.kind !== "city"); }),
      mutate((i) => { i.constraints = i.constraints.filter((c: any) => c.kind !== "max_items"); }),
      mutate((i) => { i.constraints[3].value = 7; }),
      mutate((i) => { i.constraints[2].value = "artist"; }),
      mutate((i) => { i.preferences = []; }), mutate((i) => { i.recommendations = []; }),
      mutate((i) => { i.preferences = Array.from({ length: 4 }, (_, n) => ({ id: `p${n}`, text: "x", kind: "artist", confirmed_anchor: null })); }),
      mutate((i) => { i.preferences[0].kind = "podcast"; }), mutate((i) => { i.preferences[0].extra = 1; }), mutate((i) => { i.recommendations[0].claims = [1]; }),
      mutate((i) => { i.recommendations[0].claims = ["a", "b", "c", "d", "e", "f"]; }), mutate((i) => { i.recommendations[0].name = 5; }), mutate((i) => { delete i.task; }),
    ]) expect(result.ok).toBe(false);
  });
  it("imports an input with a null search term as an empty (defaulted) field", () => {
    const input = JSON.parse(JSON.stringify(formToInput(valid()))); input.preferences[0].confirmed_anchor = null;
    const result = inputToForm(input); expect(result.ok && result.form.interests[0]!.search).toBe("");
  });
  it("the shipped example is itself a valid, importable input", () => {
    const text = JSON.stringify(formToInput(exampleForm())); expect(parseImport(text).ok).toBe(true); expect(new TextEncoder().encode(text).length).toBeLessThan(MAX_IMPORT_BYTES);
  });
});

describe("evidence-coverage hints", () => {
  const known = ["Blue Note New York"];
  it("distinguishes exact, case-different, uncovered and empty input", () => {
    expect(coverageHint(known, "Blue Note New York")).toEqual({ state: "covered" });
    expect(coverageHint(known, "  Blue   Note New York ")).toEqual({ state: "covered" });
    expect(coverageHint(known, "blue note new york")).toEqual({ state: "near", suggestion: "Blue Note New York" });
    expect(coverageHint(known, "Village Vanguard")).toEqual({ state: "none" });
    expect(coverageHint(known, "   ")).toEqual({ state: "empty" });
    expect(coverageHint([], "anything")).toEqual({ state: "none" });
  });
  it("maps each interest kind to its lookup list", () => {
    const coverage = { artist: ["A"], movie: ["M"], place: ["P"], tag: ["T"] };
    expect(interestCoverage(coverage, "artist")).toEqual(["A"]); expect(interestCoverage(coverage, "film_concept")).toEqual(["M"]); expect(interestCoverage(coverage, "tag_concept")).toEqual(["T"]);
  });
});

describe("server issues -> form fields", () => {
  it("maps every path the server can report to a field, with a message that never repeats a value", () => {
    const form = valid(); const input = JSON.parse(JSON.stringify(formToInput(form)));
    const cases: Array<[(i: any) => void, string]> = [
      [(i) => { i.preferences[1].text = "a" + cp(7); }, "interests.1.text"], [(i) => { i.preferences[0].confirmed_anchor = "a" + cp(7); }, "interests.0.search"],
      [(i) => { i.recommendations[1].name = "a" + cp(7); }, "recommendations.1.name"], [(i) => { i.recommendations[0].address_hint = "a" + cp(7); }, "recommendations.0.address"],
      [(i) => { i.recommendations[0].claims[1] = "a" + cp(7); }, "recommendations.0.claims"], [(i) => { i.task = "a" + cp(7); }, "task"], [(i) => { i.destination = "a" + cp(7); }, "city"],
      [(i) => { i.constraints[0].value = "a" + cp(7); }, "city"], [(i) => { i.constraints[1].value = "a" + cp(7); }, "country"],
      [(i) => { i.recommendations[0].id = "repair:x"; }, "recommendations.0.name"],
    ];
    for (const [change, field] of cases) {
      const copy = JSON.parse(JSON.stringify(input)); change(copy); const result = normalizeCustomInput(copy); expect(result.ok).toBe(false); if (result.ok) continue;
      const mapped = result.issues.map(serverIssueToField); expect(mapped.map((m) => m.field)).toContain(field);
      expect(JSON.stringify(mapped)).not.toContain(cp(7)); for (const m of mapped) expect(m.message.length).toBeGreaterThan(10);
    }
    expect(serverIssueToField({ path: "", reason: "TOO_LARGE" })).toEqual({ field: "", message: "The input is too large." });
    expect(serverIssueToField({ path: "weird", reason: "SOMETHING_NEW" }).field).toBe("");
  });
});
