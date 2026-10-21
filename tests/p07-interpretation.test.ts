import { describe, expect, it } from "vitest";
import { P07_TAKE, interpretNycDiscovery } from "../src/qloo/p07-interpretation";

// Every body below is AUTHORED. Nothing is copied from a provider response; no real name, ID or location is used.
type Geo = { city?: string; country_code?: string; name?: string } | null;
const place = (n: number, geocode: Geo = { city: "New York", country_code: "US", name: "Authored Village" }, extra: Record<string, unknown> = {}) => ({
  entity_id: `authored-place-${n}`, name: `Authored Place ${n}`, type: "urn:entity", subtype: "urn:entity:place",
  ...(geocode === null ? {} : { properties: { geocode } }), query: { affinity: 0.5 + n / 100 }, ...extra });
const body = (entities: unknown[], extra: Record<string, unknown> = {}) => ({ success: true, results: { entities, duration: 12 }, ...extra });
const withMarker = (name: unknown = "New York") => ({ query: { locality: { signal: { entity_id: "authored-locality", name } } } });
const unnamedMarker = { query: { locality: { signal: { entity_id: "authored-locality" } } } };

describe("P07 response interpretation: judged by content, never by the request", () => {
  it("A: a resolved-locality marker plus only US New York City places", () => {
    const r = interpretNycDiscovery(body([place(1), place(2), place(3)], withMarker()));
    expect(r).toMatchObject({ class: "A_HONORED_NYC", returned: 3, counts: { in_nyc: 3, outside_nyc: 0, geography_missing: 0 }, locality_marker: { status: "PRESENT", path: "ROOT", matched_name_mentions_new_york: true } });
    expect(r.reason).toMatch(/does not validate any place/);
  });
  it("A also accepts borough names as New York City, and a marker whose name is not stated", () => {
    const boroughs = ["Brooklyn", "Queens", "The Bronx", "Staten Island", "Manhattan"].map((city, i) => place(i + 1, { city, country_code: "US" }));
    expect(interpretNycDiscovery(body(boroughs.slice(0, 3), withMarker())).class).toBe("A_HONORED_NYC");
    const r = interpretNycDiscovery(body([place(1)], unnamedMarker));
    expect(r).toMatchObject({ class: "A_HONORED_NYC", locality_marker: { status: "PRESENT", matched_name_mentions_new_york: "UNKNOWN" } });
  });
  it("C: places without a locality marker mean the filter is treated as NOT applied, even if every place is in New York", () => {
    const r = interpretNycDiscovery(body([place(1), place(2)]));
    expect(r).toMatchObject({ class: "C_PARAMETER_APPARENTLY_IGNORED", returned: 2, locality_marker: { status: "ABSENT", path: null } });
    expect(r.counts.in_nyc).toBe(2); // the places are still individually described; the class is about the filter
  });
  it.each([
    ["wrong city", [place(1), place(2, { city: "Authored City", country_code: "US" })]],
    ["wrong country", [place(1), place(2, { city: "New York", country_code: "GB" })]],
    ["city in another country that shares the name", [place(1, { city: "New York", country_code: "CA" })]],
    ["geography missing on one place", [place(1), place(2, null)]],
    ["city missing", [place(1, { country_code: "US" })]],
    ["country missing", [place(1, { city: "New York" })]],
  ])("B: a marker is present but %s", (_, entities) => {
    expect(interpretNycDiscovery(body(entities, withMarker())).class).toBe("B_PARTIAL_OR_MIXED");
  });
  it("B: the matched locality is not New York", () => {
    expect(interpretNycDiscovery(body([place(1)], withMarker("Authored Springs"))).class).toBe("B_PARTIAL_OR_MIXED");
  });
  it("counts out-of-city and missing geography separately and never rounds them into a pass", () => {
    const r = interpretNycDiscovery(body([place(1), place(2, { city: "Elsewhere", country_code: "US" }), place(3, null)], withMarker()));
    expect(r.counts).toEqual({ in_nyc: 1, outside_nyc: 1, geography_missing: 1 });
    expect(r.geography.map((g) => g.verdict)).toEqual(["IN_NYC", "OUTSIDE_NYC", "GEOGRAPHY_MISSING"]);
  });
  it("D: an empty but valid response, with or without a marker", () => {
    expect(interpretNycDiscovery(body([]))).toMatchObject({ class: "D_EMPTY", returned: 0 });
    expect(interpretNycDiscovery(body([], withMarker()))).toMatchObject({ class: "D_EMPTY", locality_marker: { status: "PRESENT" } });
  });
  it.each([
    ["an unexpected entity type", body([place(1, undefined, { subtype: "urn:entity:brand" })], withMarker())],
    ["a type that is not the provider's envelope type", body([place(1, undefined, { type: "urn:entity:place" })], withMarker())],
    ["more places than the take allowed", body([place(1), place(2), place(3), place(4)], withMarker())],
    ["a duplicate entity", body([place(1), place(1)], withMarker())],
    ["a missing entity id", body([{ ...place(1), entity_id: "" }], withMarker())],
    ["success false", { success: false, results: { entities: [] } }],
    ["no results envelope", { success: true }],
    ["entities that are not an array", { success: true, results: { entities: "x" } }],
    ["an array body", [place(1)]], ["null", null], ["a string", "authored"], ["a number", 7],
  ])("E: %s is unusable", (_, input) => {
    expect(interpretNycDiscovery(input).class).toBe("E_UNUSABLE");
  });
  it("fields the reviewed projection does not consume are quarantined, not trusted and not echoed", () => {
    const r = interpretNycDiscovery(body([{ ...place(1), surprise: { geocode: { city: "Elsewhere", country_code: "ZZ" } }, rating: 5 }], withMarker()));
    expect(r.class).toBe("A_HONORED_NYC"); expect(JSON.stringify(r)).not.toContain("surprise");
  });
  it("a malformed marker is not a marker, so the filter is not credited", () => {
    for (const query of [{ locality: "New York" }, { locality: { signal: "New York" } }, { locality: { signal: null } }, { locality: {} }, { locality: [] }]) {
      const r = interpretNycDiscovery(body([place(1)], { query })); expect(r.locality_marker.status).toBe("MALFORMED"); expect(r.class).toBe("C_PARAMETER_APPARENTLY_IGNORED");
    }
    expect(interpretNycDiscovery(body([place(1)], { query: { affinity: 1 } })).locality_marker.status).toBe("ABSENT");
  });
  it("reads the marker where the documentation puts it (response root) and notes a nested location", () => {
    expect(interpretNycDiscovery(body([place(1)], withMarker())).locality_marker.path).toBe("ROOT");
    const nested = { success: true, results: { entities: [place(1)], ...withMarker() } };
    expect(interpretNycDiscovery(nested)).toMatchObject({ class: "A_HONORED_NYC", locality_marker: { status: "PRESENT", path: "RESULTS" } });
  });
  it("never echoes an identifier, a name or an affinity", () => {
    const printed = JSON.stringify(interpretNycDiscovery(body([place(1), place(2)], withMarker())));
    for (const leaked of ["authored-place", "Authored Place", "authored-locality", "affinity", "0.51"]) expect(printed).not.toContain(leaked);
  });
  it("fixes the take at three, matching the profile", () => { expect(P07_TAKE).toBe(3); });
  it("classes are exhaustive and exclusive for a battery of shapes", () => {
    const classes = new Set(["A_HONORED_NYC", "B_PARTIAL_OR_MIXED", "C_PARAMETER_APPARENTLY_IGNORED", "D_EMPTY", "E_UNUSABLE"]);
    for (const n of [0, 1, 2, 3, 4]) for (const marker of [true, false]) for (const geo of [place(1), place(2, null), place(3, { city: "Far", country_code: "US" })]) {
      const entities = Array.from({ length: n }, (_, i) => ({ ...geo, entity_id: `authored-${n}-${i}` }));
      expect(classes.has(interpretNycDiscovery(body(entities, marker ? withMarker() : {})).class)).toBe(true);
    }
  });
});
