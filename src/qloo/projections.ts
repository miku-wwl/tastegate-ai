import { z } from "zod";
import type { Entity } from "../domain/contracts";
import { providerRef } from "./provider-ref";

// Strict projections of shapes actually observed in the owner-approved captures: P01/P02/P03-R
// (GET /search), P04 (GET /v2/tags) and P05 (GET /v2/insights). The three endpoints use different
// envelopes and tag shapes, so each has its own schema. Only consumed fields are picked and validated;
// everything else stays quarantined in the private raw capture. These are not universal Qloo schemas.
export class ProjectionError extends Error {
  constructor(readonly code: "ENVELOPE_MISMATCH" | "ITEM_MISMATCH" | "TYPE_MISMATCH" | "ID_COLLISION" | "TOO_MANY_RESULTS") {
    super(code); this.name = "ProjectionError";
  }
}
const observedId = z.string().min(1).max(256).refine((v) => !/[\s\u0000-\u001f\u007f]/u.test(v));
const label = (max: number) => z.string().min(1).max(max).refine((v) => v.trim().length > 0 && !/[\uD800-\uDFFF]/u.test(v));
const record = z.record(z.string(), z.unknown());
const own = (v: Record<string, unknown>, key: string) => Object.hasOwn(v, key);
const pick = (v: Record<string, unknown>, fields: readonly string[]) => Object.fromEntries(fields.filter((k) => own(v, k)).map((k) => [k, v[k]]));
function parse<T>(schema: z.ZodType<T>, value: unknown, code: ProjectionError["code"]): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ProjectionError(code);
  return result.data;
}
// Observed geocode fields: city, country_code (ISO alpha-2) and name (neighborhood). Other keys ignored.
const Geocode = z.strictObject({ city: label(100).optional(), country_code: z.string().regex(/^[A-Z]{2}$/).optional(), name: label(100).optional() });
function geocodeOf(item: Record<string, unknown>) {
  if (!own(item, "properties")) return undefined;
  const properties = parse(record, item.properties, "ITEM_MISMATCH");
  return own(properties, "geocode") ? parse(Geocode, pick(parse(record, properties.geocode, "ITEM_MISMATCH"), ["city", "country_code", "name"]), "ITEM_MISMATCH") : undefined;
}
const DESCRIPTIVE_TAG_TYPES = new Set(["urn:tag:category:place", "urn:tag:genre:place"]);
// Code-point safe: never splits a surrogate pair.
const clip = (v: string, max: number) => Array.from(v).slice(0, max).join("");
function descriptiveTags(tags: Array<{ name: string; type: string }>): string[] {
  const names = tags.filter((t) => DESCRIPTIVE_TAG_TYPES.has(t.type) && t.name !== "Place" && t.name.length <= 100).map((t) => t.name);
  return [...new Set(names)].slice(0, 8);
}
function unique<T extends { entity_id: string }>(items: T[]): T[] {
  if (new Set(items.map((i) => i.entity_id)).size !== items.length) throw new ProjectionError("ID_COLLISION");
  return items;
}

// GET /search: { results: [...] } with a `types` array and tags shaped { name, tag_id, type, value? }.
// P02 showed attached tags may omit `value`; nothing is defaulted.
const SearchTag = z.strictObject({ name: label(200), tag_id: observedId, type: observedId, value: z.string().optional() });
const SearchItem = z.strictObject({ entity_id: observedId, name: label(200), types: z.array(observedId).min(1).max(100),
  disambiguation: z.string().max(300).optional(), tags: z.array(SearchTag).max(1000).optional() });
export function projectSearch(raw: unknown, requested: "artist" | "movie" | "place", maxResults: number): Entity[] {
  const envelope = parse(record, raw, "ENVELOPE_MISMATCH");
  if (!Array.isArray(envelope.results)) throw new ProjectionError("ENVELOPE_MISMATCH");
  if (envelope.results.length > maxResults) throw new ProjectionError("TOO_MANY_RESULTS");
  const urn = `urn:entity:${requested}`;
  const items = unique(envelope.results.map((value) => {
    const item = parse(record, value, "ITEM_MISMATCH");
    const picked = pick(item, ["entity_id", "name", "types", "disambiguation"]);
    if (own(item, "tags")) picked.tags = Array.isArray(item.tags) ? item.tags.map((t) => pick(parse(record, t, "ITEM_MISMATCH"), ["name", "tag_id", "type", "value"])) : item.tags;
    return { ...parse(SearchItem, picked, "ITEM_MISMATCH"), geocode: geocodeOf(item) };
  }));
  return items.map((item): Entity => {
    // The requested type must be explicitly present; it is never inferred from a name or tag.
    if (!item.types.includes(urn) || new Set(item.types).size !== item.types.length) throw new ProjectionError("TYPE_MISMATCH");
    const place = requested === "place";
    return { id: providerRef("entity", item.entity_id), name: item.name, kind: requested,
      city: place ? item.geocode?.city ?? null : null, country: place ? item.geocode?.country_code ?? null : null,
      detail: item.disambiguation?.trim() ? item.disambiguation : null, neighborhood: place ? item.geocode?.name ?? null : null,
      provider_class: clip(`types: ${item.types.join(", ")}`, 160),
      ...(place ? { descriptive_tags: descriptiveTags(item.tags ?? []) } : {}) };
  });
}

// GET /v2/tags: { success: true, results: { tags: [...] } } with top-level `id` (not search's `tag_id`).
const TagItem = z.strictObject({ id: observedId, name: label(200), type: observedId.refine((v) => /^urn:tag:[a-z0-9_]+(:[a-z0-9_]+)*$/.test(v)),
  parents: z.array(z.strictObject({ type: observedId.refine((v) => v.startsWith("urn:entity:")) })).max(20).optional() });
export type ProjectedTag = { id: string; name: string; type_label: string; parent_types: string[] };
export function projectTags(raw: unknown, maxResults: number): ProjectedTag[] {
  const envelope = parse(z.object({ success: z.literal(true), results: z.object({ tags: z.array(z.unknown()) }) }), raw, "ENVELOPE_MISMATCH");
  if (envelope.results.tags.length > maxResults) throw new ProjectionError("TOO_MANY_RESULTS");
  const items = envelope.results.tags.map((value) => {
    const item = parse(record, value, "ITEM_MISMATCH");
    const picked = pick(item, ["id", "name", "type"]);
    if (own(item, "parents")) picked.parents = Array.isArray(item.parents) ? item.parents.map((p) => pick(parse(record, p, "ITEM_MISMATCH"), ["type"])) : item.parents;
    return parse(TagItem, picked, "ITEM_MISMATCH");
  });
  if (new Set(items.map((i) => i.id)).size !== items.length) throw new ProjectionError("ID_COLLISION");
  // Type and parent context are what distinguish e.g. a music genre from a media keyword of the same name.
  return items.map((t) => ({ id: providerRef("tag", t.id), name: t.name, type_label: t.type.slice("urn:tag:".length).split(":").join(" · ").slice(0, 120),
    parent_types: [...new Set((t.parents ?? []).map((p) => clip(p.type.slice("urn:entity:".length), 60)))].filter((p) => p.trim()).slice(0, 8) }));
}

// GET /v2/insights: { success: true, results: { entities: [...] } }. Each entity carries a singular
// `type` ("urn:entity" in P05 and the documented example) plus a `subtype` holding the category. The
// subtype must equal the requested filter.type exactly; it is never silently copied into `type`.
// query.affinity is retained only as query-relative transparency data; measurements are not consumed.
const InsightsTag = z.strictObject({ id: observedId, name: label(200), type: observedId });
const InsightsItem = z.strictObject({ entity_id: observedId, name: label(200), type: z.literal("urn:entity"), subtype: observedId,
  disambiguation: z.string().max(300).optional(), tags: z.array(InsightsTag).max(1000).optional() });
export type ProjectedInsight = { entity: Entity; query_affinity: number | null };
export function projectInsightsPlaces(raw: unknown, maxResults: number): ProjectedInsight[] {
  const envelope = parse(z.object({ success: z.literal(true), results: z.object({ entities: z.array(z.unknown()) }) }), raw, "ENVELOPE_MISMATCH");
  if (envelope.results.entities.length > maxResults) throw new ProjectionError("TOO_MANY_RESULTS");
  const items = unique(envelope.results.entities.map((value) => {
    const item = parse(record, value, "ITEM_MISMATCH");
    const picked = pick(item, ["entity_id", "name", "type", "subtype", "disambiguation"]);
    if (own(item, "tags")) picked.tags = Array.isArray(item.tags) ? item.tags.map((t) => pick(parse(record, t, "ITEM_MISMATCH"), ["id", "name", "type"])) : item.tags;
    const query = own(item, "query") ? parse(record, item.query, "ITEM_MISMATCH") : {};
    const affinity = own(query, "affinity") ? parse(z.number().finite(), query.affinity, "ITEM_MISMATCH") : null;
    return { ...parse(InsightsItem, picked, "ITEM_MISMATCH"), geocode: geocodeOf(item), affinity };
  }));
  return items.map((item) => {
    if (item.subtype !== "urn:entity:place") throw new ProjectionError("TYPE_MISMATCH");
    return { query_affinity: item.affinity, entity: { id: providerRef("entity", item.entity_id), name: item.name, kind: "place",
      city: item.geocode?.city ?? null, country: item.geocode?.country_code ?? null,
      detail: item.disambiguation?.trim() ? item.disambiguation : null, neighborhood: item.geocode?.name ?? null,
      provider_class: clip(`type: ${item.type} · subtype: ${item.subtype}`, 160), descriptive_tags: descriptiveTags(item.tags ?? []) } };
  });
}
