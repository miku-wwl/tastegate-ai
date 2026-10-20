import { describe, expect, it } from "vitest";
import { interpretShortlistRanking } from "../src/qloo/shortlist-ranking";
import { providerRef } from "../src/qloo/provider-ref";
import { AUTHORED, p06Body, type P06Variant } from "./helpers/recorded-root";

// The five outcomes defined for the first fixed-shortlist ranking response. Authored payloads only.
const shortlist = [providerRef("entity", AUTHORED.venue), providerRef("entity", AUTHORED.far)] as const;
const classify = (body: unknown) => interpretShortlistRanking(body, shortlist);

describe("fixed-shortlist ranking classification", () => {
  it("A. all shortlisted entities returned, scored and consistently ordered: usable ordering", () => {
    const r = classify(p06Body("all"));
    expect(r).toMatchObject({ class: "ALL_RETURNED", returned: 2, requested: 2 });
    if (r.class === "ALL_RETURNED") {
      expect(r.ordered.map((e) => e.id)).toEqual([shortlist[0], shortlist[1]]);
      expect(r.scores).toEqual([{ entity_id: shortlist[0], query_affinity: 0.82 }, { entity_id: shortlist[1], query_affinity: 0.41 }]);
    }
  });
  it("A. the same shortlist in the opposite provider order is classified by what Qloo actually returned", () => {
    const flipped = { success: true, results: { entities: [(p06Body("all") as { results: { entities: unknown[] } }).results.entities[1], (p06Body("all") as { results: { entities: unknown[] } }).results.entities[0]] } };
    const r = classify(flipped);
    // Order contradicts the scores (0.41 then 0.82): the ordering cannot be trusted, so it is not A.
    expect(r.class).toBe("INCOMPATIBLE_SCORES");
  });
  it("B. a partial shortlist keeps only what was returned; omission is not negative evidence", () => {
    const r = classify(p06Body("partial"));
    expect(r).toMatchObject({ class: "PARTIAL", returned: 1, requested: 2 });
    if (r.class === "PARTIAL") expect(r.ordered.map((e) => e.id)).toEqual([shortlist[1]]);
  });
  it("B. an empty but well-formed response is a partial result with nothing ranked, not a failure", () => {
    expect(classify({ success: true, results: { entities: [] } })).toMatchObject({ class: "PARTIAL", returned: 0, requested: 2 });
  });
  it.each<[P06Variant, string]>([["unexpected", "UNEXPECTED_ENTITY"], ["non-place", "UNEXPECTED_ENTITY"],
    ["unscored", "INCOMPATIBLE_SCORES"], ["disordered", "INCOMPATIBLE_SCORES"], ["unusable", "RESPONSE_UNUSABLE"]])("%s is %s and yields no ordering", (variant, expected) => {
    const r = classify(p06Body(variant));
    expect(r.class).toBe(expected); expect("ordered" in r).toBe(false);
  });
  it("C. more entities than requested is unexpected even when every ID is on the shortlist", () => {
    const entities = (p06Body("all") as { results: { entities: unknown[] } }).results.entities;
    expect(classify({ success: true, results: { entities: [...entities, entities[0]] } }).class).toBe("RESPONSE_UNUSABLE"); // duplicate ID
    expect(interpretShortlistRanking(p06Body("all"), [shortlist[0]]).class).toBe("UNEXPECTED_ENTITY"); // 2 returned, 1 requested
  });
  it("D. ties are allowed (equal affinity is a consistent order) but a rising score is not", () => {
    const base = (p06Body("all") as { results: { entities: Array<Record<string, unknown>> } }).results.entities;
    const withScores = (a: number, b: number) => ({ success: true, results: { entities: [{ ...base[0], query: { affinity: a } }, { ...base[1], query: { affinity: b } }] } });
    expect(classify(withScores(0.5, 0.5)).class).toBe("ALL_RETURNED");
    expect(classify(withScores(0.4, 0.5)).class).toBe("INCOMPATIBLE_SCORES");
    expect(classify(withScores(Number.NaN, 0.5)).class).toBe("RESPONSE_UNUSABLE"); // JSON cannot carry NaN; a non-finite score is a bad shape
  });
  it.each([null, "text", [], { success: true }, { success: true, results: {} }, { success: true, results: { entities: "x" } }])("treats a malformed envelope %j as unusable", (body) => {
    expect(classify(body).class).toBe("RESPONSE_UNUSABLE");
  });
  it("never carries provider IDs: only pseudonymous references", () => {
    const text = JSON.stringify(classify(p06Body("all")));
    for (const raw of [AUTHORED.venue, AUTHORED.far, AUTHORED.artist]) expect(text).not.toContain(raw);
  });
});
