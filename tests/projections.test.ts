import { describe, expect, it } from "vitest";
import { EntitySchema, QLOO_REF_PATTERN } from "../src/domain/contracts";
import { ProjectionError, projectInsightsPlaces, projectSearch, projectTags } from "../src/qloo/projections";
import { providerRef } from "../src/qloo/provider-ref";
import { AUTHORED, authoredBodies } from "./helpers/recorded-root";

// Authored payloads only; shapes follow the reviewed P01/P02/P03-R, P04 and P05 observations.
const bodies = authoredBodies();
const code = (fn: () => unknown) => { try { fn(); return "NO_ERROR"; } catch (e) { return e instanceof ProjectionError ? e.code : "OTHER"; } };

describe("search projection (GET /search)", () => {
  it("projects place geography and descriptive categories, pseudonymizing every provider ID", () => {
    const [venue] = projectSearch(bodies.P03R, "place", 1);
    expect(venue).toMatchObject({ name: "Authored Jazz Room", kind: "place", city: "New York", country: "US", neighborhood: "Authored Village",
      detail: "1 Authored St, New York", provider_class: "types: urn:entity:place", descriptive_tags: ["Jazz club"] });
    expect(venue!.id).toMatch(QLOO_REF_PATTERN); expect(venue!.id).toBe(providerRef("entity", AUTHORED.venue));
    expect(EntitySchema.parse(venue)).toEqual(venue);
    const text = JSON.stringify(venue);
    for (const hidden of [AUTHORED.venue, "metro", "ignored", "urn:tag:category:place:authored_club"]) expect(text).not.toContain(hidden);
  });
  it("accepts attached tags without a value field and never defaults one (the P02 lesson)", () => {
    const films = projectSearch(bodies.P02, "movie", 5);
    expect(films.map((f) => [f.name, f.detail, f.city])).toEqual([["Authored Film", "2000", null], ["Authored Film Remake", "2019", null]]);
  });
  it("never attaches geography to an artist or film, even if a geocode is present", () => {
    const body = { results: [{ entity_id: "a", name: "Authored", types: ["urn:entity:artist"], properties: { geocode: { city: "New York", country_code: "US" } } }] };
    expect(projectSearch(body, "artist", 5)[0]).toMatchObject({ city: null, country: null, neighborhood: null });
  });
  it.each([
    ["requested type absent", { results: [{ entity_id: "a", name: "A", types: ["urn:entity:brand"] }] }, "TYPE_MISMATCH"],
    ["duplicate types", { results: [{ entity_id: "a", name: "A", types: ["urn:entity:place", "urn:entity:place"] }] }, "TYPE_MISMATCH"],
    ["malformed country code", { results: [{ entity_id: "a", name: "A", types: ["urn:entity:place"], properties: { geocode: { country_code: "USA" } } }] }, "ITEM_MISMATCH"],
    ["blank name", { results: [{ entity_id: "a", name: " ", types: ["urn:entity:place"] }] }, "ITEM_MISMATCH"],
    ["control character in ID", { results: [{ entity_id: "a\nb", name: "A", types: ["urn:entity:place"] }] }, "ITEM_MISMATCH"],
    ["tag value of the wrong type", { results: [{ entity_id: "a", name: "A", types: ["urn:entity:place"], tags: [{ name: "T", tag_id: "t", type: "t", value: 3 }] }] }, "ITEM_MISMATCH"],
    ["ID collision", { results: [{ entity_id: "a", name: "A", types: ["urn:entity:place"] }, { entity_id: "a", name: "B", types: ["urn:entity:place"] }] }, "ID_COLLISION"],
    ["missing results", { items: [] }, "ENVELOPE_MISMATCH"],
    ["an Insights envelope", bodies.P05, "ENVELOPE_MISMATCH"],
  ])("fails closed on %s", (_, body, expected) => { expect(code(() => projectSearch(body, "place", 5))).toBe(expected); });
  it("rejects more results than the reviewed take", () => { expect(code(() => projectSearch(bodies.P01, "artist", 1))).toBe("TOO_MANY_RESULTS"); });
});

describe("tag projection (GET /v2/tags)", () => {
  it("keeps the type and parent context that distinguishes same-name tags", () => {
    expect(projectTags(bodies.P04, 5).map(({ name, type_label, parent_types }) => ({ name, type_label, parent_types }))).toEqual([
      { name: "Jazz", type_label: "genre · music", parent_types: ["artist", "album"] },
      { name: "Jazz", type_label: "genre · media", parent_types: ["book"] }]);
    expect(JSON.stringify(projectTags(bodies.P04, 5))).not.toContain(AUTHORED.musicTag);
  });
  it.each([
    ["success false", { success: false, results: { tags: [] } }, "ENVELOPE_MISMATCH"],
    ["search-shaped tag_id", { success: true, results: { tags: [{ tag_id: "urn:tag:x:y", name: "X", type: "urn:tag:x" }] } }, "ITEM_MISMATCH"],
    ["non-URN type", { success: true, results: { tags: [{ id: "urn:tag:x:y", name: "X", type: "genre" }] } }, "ITEM_MISMATCH"],
    ["non-entity parent", { success: true, results: { tags: [{ id: "urn:tag:x:y", name: "X", type: "urn:tag:x", parents: [{ type: "urn:tag:y" }] }] } }, "ITEM_MISMATCH"],
    ["duplicate IDs", { success: true, results: { tags: [{ id: "urn:tag:x:y", name: "X", type: "urn:tag:x" }, { id: "urn:tag:x:y", name: "Y", type: "urn:tag:x" }] } }, "ID_COLLISION"],
  ])("fails closed on %s", (_, body, expected) => { expect(code(() => projectTags(body, 5))).toBe(expected); });
});

describe("Insights projection (GET /v2/insights) is separate from search", () => {
  it("requires type urn:entity with an exact place subtype and keeps both visible", () => {
    const [found] = projectInsightsPlaces(bodies.P05, 1);
    expect(found).toMatchObject({ query_affinity: 0.5, entity: { name: "Authored Far Pavilion", kind: "place", city: "Authored City", country: "ES",
      provider_class: "type: urn:entity · subtype: urn:entity:place", descriptive_tags: ["Historical landmark"] } });
    expect(JSON.stringify(found)).not.toContain("audience_growth");
  });
  const entity = (extra: Record<string, unknown>) => ({ success: true, results: { entities: [{ entity_id: "a", name: "A", type: "urn:entity", subtype: "urn:entity:place", ...extra }] } });
  it.each([
    ["subtype copied into type", entity({ type: "urn:entity:place" }), "ITEM_MISMATCH"],
    ["a different subtype", entity({ subtype: "urn:entity:brand" }), "TYPE_MISMATCH"],
    ["missing subtype", entity({ subtype: undefined }), "ITEM_MISMATCH"],
    ["non-finite affinity", entity({ query: { affinity: "0.9" } }), "ITEM_MISMATCH"],
    ["a search-shaped item", { success: true, results: { entities: [{ entity_id: "a", name: "A", types: ["urn:entity:place"] }] } }, "ITEM_MISMATCH"],
    ["a search envelope", bodies.P03R, "ENVELOPE_MISMATCH"],
  ])("fails closed on %s", (_, body, expected) => { expect(code(() => projectInsightsPlaces(body, 5))).toBe(expected); });
  it("treats an absent affinity as null, not zero", () => { expect(projectInsightsPlaces(entity({}), 1)[0]!.query_affinity).toBeNull(); });
});

it("provider references are stable per process, kind-separated and never the raw ID", () => {
  expect(providerRef("entity", "X")).toBe(providerRef("entity", "X"));
  expect(providerRef("entity", "X")).not.toBe(providerRef("tag", "X"));
  expect(providerRef("entity", "X")).not.toBe(providerRef("entity", "Y"));
  expect(providerRef("entity", "X")).toMatch(QLOO_REF_PATTERN);
});
