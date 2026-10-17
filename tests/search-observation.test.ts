import { expect, it } from "vitest";
import { observeSearch } from "../src/qloo/search-observation";

// Authored test data only. Never copy provider IDs or captured bodies into fixtures.
const tag = (extra: Record<string, unknown> = {}) => ({ name: "Authored genre", tag_id: "authored:tag:1",
  type: "authored:tag-type", ...extra });
const film = (extra: Record<string, unknown> = {}) => ({ name: "Authored Film", entity_id: "authored:movie:1",
  types: ["urn:entity:movie"], ...extra });
const observe = (items: unknown[]) => observeSearch({ results: items }, "urn:entity:movie", "Authored Film");

it("accepts absent tag.value without inventing a value or identity", () => {
  const raw = { results: [film({ tags: [tag()] })] }; const before = structuredClone(raw);
  expect(observeSearch(raw, "urn:entity:movie", "Authored Film")).toMatchObject({ tag_items_count: 1,
    tag_value_missing_count: 1, tag_value_present_count: 0, selected_entity_id: null,
    identity: "INDEPENDENT_REVIEW_REQUIRED", cultural_affinity: "NOT_ESTABLISHED" });
  expect(raw).toEqual(before);
});
it.each(["authored value", ""])("preserves valid string value compatibility (%j)", (value) => {
  expect(observe([film({ tags: [tag({ value })] })])).toMatchObject({ tag_value_present_count: 1, tag_value_missing_count: 0 });
});
it("accepts missing tags and empty tags separately", () => {
  expect(observe([film()])).toMatchObject({ tags_missing_count: 1, tags_present_count: 0, tag_items_count: 0 });
  expect(observe([film({ tags: [] })])).toMatchObject({ tags_missing_count: 0, tags_present_count: 1, tag_items_count: 0 });
});
it.each([null, false, 5, [], {}].map((value) => ({ value })))("rejects a present malformed value (%j)", ({ value }) => {
  expect(() => observe([film({ tags: [tag({ value })] })])).toThrow();
});
it.each([null, false, 5, [], {}, "", " ", "authored type"].map((type) => ({ type })))("rejects malformed tag types (%j)", ({ type }) => {
  expect(() => observe([film({ tags: [tag({ type })] })])).toThrow();
});
it.each([null, false, 5, [], {}, "", " ", " bad-id", "bad id", "bad\nid", "bad\u0000id"].map((tag_id) => ({ tag_id })))("rejects malformed tag IDs (%j)", ({ tag_id }) => {
  expect(() => observe([film({ tags: [tag({ tag_id })] })])).toThrow();
});
it.each([null, false, 5, [], {}, "", " ", " bad-id", "bad id", "bad\nid", "bad\u0000id"].map((entity_id) => ({ entity_id })))("rejects malformed entity IDs (%j)", ({ entity_id }) => {
  expect(() => observe([film({ entity_id })])).toThrow();
});
it("accepts bounded opaque IDs without assuming UUID format", () => {
  expect(observe([film({ entity_id: "authored:opaque/id-1" })]).distinct_ids).toBe(1);
});
it("rejects conflicting records sharing an ID and retains ambiguity for distinct same-title entities", () => {
  expect(() => observe([film(), film({ name: "Conflicting authored title" })])).toThrow("OBSERVED_SEARCH_ID_COLLISION");
  const result = observe([film({ properties: { release_year: 2000 } }),
    film({ entity_id: "authored:movie:2", properties: { release_year: 2001 } })]);
  expect(result).toMatchObject({ exact_label_count: 2, exact_label_ambiguity: true,
    selected_entity_id: null, identity: "INDEPENDENT_REVIEW_REQUIRED" });
});
it("quarantines unknown fields and refuses forged identity/affinity promotion", () => {
  const result = observe([film({ tags: [tag({ unknown_claim: "do-not-export-this" })],
    independently_verified: true, selected_entity_id: "forged-selection", affinity: 0.99,
    properties: { director: "authored claim", external: { invented: "do-not-export-this" } } })]);
  expect(result).toMatchObject({ selected_entity_id: null, identity: "INDEPENDENT_REVIEW_REQUIRED",
    cultural_affinity: "NOT_ESTABLISHED", pagination: "NOT_INTERPRETED" });
  expect(JSON.stringify(result)).not.toContain("do-not-export-this");
  expect(JSON.stringify(result)).not.toContain("forged-selection");
});
it("preserves the P01 artist pattern with optional tags and string value", () => {
  const results = Array.from({ length: 5 }, (_, n) => ({ name: n === 0 ? "Authored Artist" : "Other authored artist",
    entity_id: "authored:artist:" + n, types: ["urn:entity:artist"],
    ...(n === 0 ? { tags: [tag({ value: "authored value" })] } : {}) }));
  expect(observeSearch({ results }, "urn:entity:artist", "Authored Artist")).toMatchObject({
    result_count: 5, exact_label_count: 1, tags_present_count: 1, tags_missing_count: 4,
    tag_value_present_count: 1, selected_entity_id: null, cultural_affinity: "NOT_ESTABLISHED" });
});
