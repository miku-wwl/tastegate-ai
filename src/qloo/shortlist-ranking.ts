import type { Entity, UnavailableReason } from "../domain/contracts";
import { ProjectionError, projectInsightsPlaces } from "./projections";

// Interprets ONE response to `filter.results.entities` (fixed-shortlist ranking). Qloo documents the parameter as a
// way "to assess the affinity of an entity towards input" and its own tooling ranks a caller-supplied shortlist
// with it, but this was never observed under the event key, so the response is classified before any use:
//
//   ALL_RETURNED         every shortlisted entity came back, scored, in an order consistent with the scores
//   PARTIAL              only some came back (omission is not negative evidence; no rank exists for the omitted ones)
//   UNEXPECTED_ENTITY    an entity outside the shortlist (or of another type) appeared: the parameter was not honored
//   INCOMPATIBLE_SCORES  scores are missing or the order contradicts them, so no ordering can be trusted
//   RESPONSE_UNUSABLE    the envelope/shape is unsupported (a failed or non-200 response never reaches this function)
//
// Only the first two yield rank evidence. Affinity values are query-relative: they are returned for transparency and
// may be compared only to each other within this single response, never across queries and never as a probability.
export type ShortlistClass = "ALL_RETURNED" | "PARTIAL" | "UNEXPECTED_ENTITY" | "INCOMPATIBLE_SCORES" | "RESPONSE_UNUSABLE";
export type ShortlistInterpretation =
  | { class: "ALL_RETURNED" | "PARTIAL"; ordered: Entity[]; scores: Array<{ entity_id: string; query_affinity: number }>; returned: number; requested: number }
  | { class: "UNEXPECTED_ENTITY" | "INCOMPATIBLE_SCORES" | "RESPONSE_UNUSABLE"; returned: number | null; requested: number };

const MAX_PARSED = 100; // the response cap already bounds size; the interpreter must still reject, not trust, extra entities
export function interpretShortlistRanking(body: unknown, shortlistRefs: readonly string[]): ShortlistInterpretation {
  const requested = shortlistRefs.length;
  let items: ReturnType<typeof projectInsightsPlaces>;
  try { items = projectInsightsPlaces(body, MAX_PARSED); }
  catch (error) {
    // A non-place entity in a Place query is an unexpected entity; any other malformed shape is simply unusable.
    return { class: error instanceof ProjectionError && error.code === "TYPE_MISMATCH" ? "UNEXPECTED_ENTITY" : "RESPONSE_UNUSABLE", returned: null, requested };
  }
  const refs = items.map((i) => i.entity.id); const allowed = new Set(shortlistRefs);
  if (refs.some((ref) => !allowed.has(ref)) || refs.length > requested) return { class: "UNEXPECTED_ENTITY", returned: refs.length, requested };
  const scores = items.map((i) => i.query_affinity);
  if (scores.some((s) => s === null) || scores.some((s, i) => i > 0 && s! > scores[i - 1]!))
    return { class: "INCOMPATIBLE_SCORES", returned: refs.length, requested };
  return { class: refs.length === requested ? "ALL_RETURNED" : "PARTIAL", ordered: items.map((i) => i.entity),
    scores: items.map((i) => ({ entity_id: i.entity.id, query_affinity: i.query_affinity! })), returned: refs.length, requested };
}
export const UNAVAILABLE_REASON_FOR: Record<"UNEXPECTED_ENTITY" | "INCOMPATIBLE_SCORES" | "RESPONSE_UNUSABLE", UnavailableReason> = {
  UNEXPECTED_ENTITY: "UNEXPECTED_ENTITY", INCOMPATIBLE_SCORES: "INCOMPATIBLE_SCORES", RESPONSE_UNUSABLE: "RESPONSE_UNUSABLE",
};
