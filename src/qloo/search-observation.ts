import { z } from "zod";

// A strict projection of fields observed in P01, for local post-capture review only.
// Unknown provider fields remain quarantined in the private raw file, never trusted evidence.
const TagProjection = z.strictObject({ name: z.string().min(1), tag_id: z.string().min(1),
  type: z.string().min(1), value: z.string() });
const CandidateProjection = z.strictObject({
  entity_id: z.string().min(1).max(256).refine((value) => value === value.trim()),
  name: z.string().min(1).max(500).refine((value) => value.trim().length > 0),
  types: z.array(z.string().min(1)).min(1).max(100),
  popularity: z.number().finite().optional(), disambiguation: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(), tags: z.array(TagProjection).max(1000).optional(),
});
const EnvelopeProjection = z.strictObject({ results: z.array(CandidateProjection).max(5) });
const object = z.record(z.string(), z.unknown());
const own = (v: Record<string, unknown>, key: string) => Object.hasOwn(v, key);
function pick(v: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(fields.filter((k) => own(v, k)).map((k) => [k, v[k]]));
}
export function observeSearch(raw: unknown, requestedType: "urn:entity:artist" | "urn:entity:movie", query: string) {
  const envelope = object.parse(raw);
  if (!Array.isArray(envelope.results)) throw new Error("OBSERVED_SEARCH_SCHEMA_MISMATCH");
  const fields = Object.keys(CandidateProjection.shape);
  const projected = envelope.results.map((item) => {
    const candidate = object.parse(item); const value = pick(candidate, fields);
    if (own(candidate, "tags") && Array.isArray(candidate.tags)) value.tags = candidate.tags.map((tag) => pick(object.parse(tag), Object.keys(TagProjection.shape)));
    return value;
  });
  const checked = EnvelopeProjection.parse({ results: projected });
  if (checked.results.some((item) => !item.types.includes(requestedType) || new Set(item.types).size !== item.types.length))
    throw new Error("OBSERVED_SEARCH_TYPE_MISMATCH");
  const ids = checked.results.map((item) => item.entity_id);
  if (new Set(ids).size !== ids.length) throw new Error("OBSERVED_SEARCH_ID_COLLISION");
  const exact = checked.results.filter((item) => item.name === query).length;
  return Object.freeze({
    collection_path: "$.results", result_count: ids.length, distinct_ids: ids.length,
    exact_label_count: exact, exact_label_ambiguity: exact > 1,
    tags_present_count: checked.results.filter((item) => item.tags !== undefined).length,
    tags_missing_count: checked.results.filter((item) => item.tags === undefined).length,
    top_level_keys: Object.keys(envelope).sort(),
    pagination: "NOT_INTERPRETED", selected_entity_id: null,
    identity: "INDEPENDENT_REVIEW_REQUIRED", cultural_affinity: "NOT_ESTABLISHED",
  } as const);
}
