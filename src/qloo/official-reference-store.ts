import { realpath } from "node:fs/promises";
import { z } from "zod";
import { PublicReferenceSchema, type PublicReference } from "../domain/contracts";
import { assertServer } from "./boundary-error";
import { captureSha256 } from "./capture-review";
import { readPrivateSmall, decodeJson } from "./p07-consent";
import { providerRef } from "./provider-ref";

// Trusted host-only loader for the existing recorded-adapter references hook. No HTTP and no client-supplied paths.
// A typed assertion alone is insufficient: each entry needs a separately captured official page, exact factual excerpts,
// an independently reviewed host allowlist, and matching saved bytes. Neither a hash nor the owner's click proves origin:
// the host operator must inspect the original official URL before admitting its domain/capture. No real entry exists yet.
const Entry = z.strictObject({
  provider_entity_id: z.string().min(1).max(256), reference: PublicReferenceSchema,
  source_capture: z.strictObject({ filename: z.string().regex(/^[a-z0-9-]{1,80}\.txt$/), retrieved_utc: z.iso.datetime(),
    retrieval: z.literal("INDEPENDENT_OFFICIAL_PAGE_CAPTURE"), retrieved_url: PublicReferenceSchema.shape.url,
    exact_excerpts: z.strictObject({ name: z.string().min(1).max(500), city: z.string().min(1).max(500), country: z.string().min(1).max(500) }) }),
});
const Registry = z.strictObject({ revision: z.literal("tastegate.official-reference-registry.v1"), entries: z.array(Entry).max(6) });
const normalize = (s: string) => s.normalize("NFKC").trim().toLowerCase();
export async function loadOfficialReferences(projectRoot: string, trustedOfficialHosts: readonly string[]): Promise<ReadonlyMap<string, PublicReference>> {
  assertServer();
  try {
    const root = await realpath(projectRoot); const base = ["private", "venue-references"];
    const bytes = await readPrivateSmall(root, [...base, "registry.json"], 32768);
    if (!bytes) return new Map();
    const registry = Registry.parse(decodeJson(bytes)); const refs = new Map<string, PublicReference>();
    for (const entry of registry.entries) {
      const ref = entry.reference, url = new URL(ref.url), host = url.hostname;
      if (entry.source_capture.retrieved_url !== ref.url || !trustedOfficialHosts.includes(host) || host === "qloo.com" || host.endsWith(".qloo.com") ||
          url.search || host === "localhost" || /^\d+(\.\d+){3}$/.test(host) || host.includes(":")) throw new Error();
      const source = await readPrivateSmall(root, [...base, entry.source_capture.filename], 262144);
      if (!source || captureSha256(source) !== ref.content_sha256 ||
          Date.parse(entry.source_capture.retrieved_utc) > Date.parse(ref.reviewed_utc) ||
          Date.parse(ref.reviewed_utc) > Date.now()) throw new Error();
      const content = new TextDecoder("utf-8", { fatal: true }).decode(source);
      const expected = { name: ref.asserted_name, city: ref.asserted_city, country: ref.asserted_country };
      for (const field of ["name", "city", "country"] as const) {
        const excerpt = entry.source_capture.exact_excerpts[field];
        if (!content.split(/\r?\n/).some((line) => normalize(line) === normalize(excerpt)) ||
            normalize(excerpt) !== normalize(expected[field])) throw new Error();
      }
      const id = providerRef("entity", entry.provider_entity_id);
      if (refs.has(id)) throw new Error();
      refs.set(id, ref);
    }
    return refs;
  } catch { throw new Error("OFFICIAL_REFERENCE_UNAVAILABLE"); }
}
