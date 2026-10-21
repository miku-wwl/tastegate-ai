import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { captureSha256 } from "../src/qloo/capture-review";
import { loadOfficialReferences } from "../src/qloo/official-reference-store";
import { providerRef } from "../src/qloo/provider-ref";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function seed() {
  const root = await mkdtemp(join(tmpdir(), "tastegate-reference-")); roots.push(root);
  const dir = join(root, "private/venue-references"); await mkdir(dir, { recursive: true, mode: 0o700 });
  const page = Buffer.from("AUTHORED OFFICIAL PAGE\nAuthored Venue\nNew York\nUS\n");
  const entry = { provider_entity_id: "authored-private-id",
    reference: { source: "OFFICIAL_PUBLIC_REFERENCE", publisher: "Authored venue", url: "https://venue.example/location",
      asserted_name: "Authored Venue", asserted_city: "New York", asserted_country: "US",
      reviewed_utc: "2026-01-02T00:00:00Z", review_basis: "OWNER_REVIEW_OF_PUBLIC_PAGE", content_sha256: captureSha256(page) },
    source_capture: { filename: "official-page.txt", retrieved_utc: "2026-01-01T00:00:00Z", retrieval: "INDEPENDENT_OFFICIAL_PAGE_CAPTURE", retrieved_url: "https://venue.example/location",
      exact_excerpts: { name: "Authored Venue", city: "New York", country: "US" } } };
  const save = async (entries = [entry]) => writeFile(join(dir, "registry.json"), JSON.stringify({ revision: "tastegate.official-reference-registry.v1", entries }), { mode: 0o600 });
  await writeFile(join(dir, "official-page.txt"), page, { mode: 0o600 }); await save();
  return { root, dir, entry, save };
}
describe("independent official-source registry (authored captures only)", () => {
  it("binds corroborating page bytes and excerpts to the process-local identity for the existing adapter hook", async () => {
    const s = await seed(); const refs = await loadOfficialReferences(s.root, ["venue.example"]);
    expect(refs.get(providerRef("entity", s.entry.provider_entity_id))).toEqual(s.entry.reference);
    expect([...refs.keys()].join("")).not.toContain(s.entry.provider_entity_id);
  });
  it.each(["assertion_only", "tampered_page", "untrusted_host", "provider_source", "wrong_excerpt", "unsupported_fact", "duplicate", "traversal", "future_review", "changed_url"])("refuses %s as independent verification", async (damage) => {
    const s = await seed();
    if (damage === "assertion_only") await rm(join(s.dir, "official-page.txt"));
    if (damage === "tampered_page") await writeFile(join(s.dir, "official-page.txt"), "changed");
    if (damage === "provider_source") s.entry.reference.url = "https://qloo.com/place";
    if (damage === "wrong_excerpt") s.entry.source_capture.exact_excerpts.city = "Elsewhere";
    if (damage === "unsupported_fact") s.entry.reference.asserted_city = "Elsewhere";
    if (damage === "traversal") s.entry.source_capture.filename = "../official-page.txt";
    if (damage === "future_review") s.entry.reference.reviewed_utc = "2099-01-01T00:00:00Z";
    if (damage === "changed_url") s.entry.reference.url = "https://venue.example/another-location";
    await s.save(damage === "duplicate" ? [s.entry, s.entry] : [s.entry]);
    await expect(loadOfficialReferences(s.root, damage === "untrusted_host" ? [] : ["venue.example", "qloo.com"])).rejects.toThrow("OFFICIAL_REFERENCE_UNAVAILABLE");
  });
});
