import { ProjectionError, projectInsightsPlaces } from "./projections";

// Judges ONE P07 response by what it contains, never by what was asked for. The locality parameters may be silently ignored for
// place, so an HTTP 200 proves nothing about geography. This is a pure function over an already-captured body: no HTTP, no IDs
// in its output, no affinity use, and no verdict about whether any returned place is a valid replacement (that needs its own
// identity and hard-constraint audit; see the repair workflow). Pre-registered, in this order:
//   E_UNUSABLE                  the envelope or an item does not match the reviewed shape (or more than `take` places came back)
//   D_EMPTY                     a valid envelope with no places: the filter may have excluded everything, or the parameter set was not understood
//   C_PARAMETER_APPARENTLY_IGNORED  places returned but no resolved-locality marker: treat the locality filter as NOT applied
//   B_PARTIAL_OR_MIXED          marker present, but a place is outside the US/NYC, lacks geography, or the matched locality is not New York
//   A_HONORED_NYC               marker present, matched locality (if named) mentions New York, every place is in the US and in New York City
export const P07_TAKE = 3;
export type P07Class = "A_HONORED_NYC" | "B_PARTIAL_OR_MIXED" | "C_PARAMETER_APPARENTLY_IGNORED" | "D_EMPTY" | "E_UNUSABLE";
export type LocalityMarker = { status: "PRESENT" | "ABSENT" | "MALFORMED"; path: "ROOT" | "RESULTS" | null; matched_name_mentions_new_york: boolean | "UNKNOWN" };
export type PlaceGeography = { index: number; country: "US" | "OTHER" | "MISSING"; city: "NEW_YORK" | "NYC_BOROUGH" | "OTHER_CITY" | "MISSING"; verdict: "IN_NYC" | "OUTSIDE_NYC" | "GEOGRAPHY_MISSING" };
export type P07Interpretation = { class: P07Class; locality_marker: LocalityMarker; returned: number; geography: PlaceGeography[];
  counts: { in_nyc: number; outside_nyc: number; geography_missing: number }; reason: string };

const norm = (value: string) => value.normalize("NFKC").trim().toLowerCase();
// The five boroughs are New York City; geocode.city can carry the borough name. This is the filter-honoring test only: the audit's own
// hard-constraint check still compares the user's constraint value strictly, so a borough venue is not silently passed as "New York".
const BOROUGHS = new Set(["manhattan", "brooklyn", "queens", "bronx", "the bronx", "staten island", "new york city", "nyc"]);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function marker(body: unknown): LocalityMarker {
  const root = isRecord(body) ? body : {};
  const results = isRecord(root.results) ? root.results : {};
  for (const [path, holder] of [["ROOT", root], ["RESULTS", results]] as const) {
    const query = holder.query; if (!isRecord(query) || !("locality" in query)) continue;
    const locality = query.locality; if (!isRecord(locality) || !("signal" in locality)) return { status: "MALFORMED", path, matched_name_mentions_new_york: "UNKNOWN" };
    const signal = locality.signal; if (!isRecord(signal)) return { status: "MALFORMED", path, matched_name_mentions_new_york: "UNKNOWN" };
    return { status: "PRESENT", path, matched_name_mentions_new_york: typeof signal.name === "string" && signal.name.trim() ? norm(signal.name).includes("new york") : "UNKNOWN" };
  }
  return { status: "ABSENT", path: null, matched_name_mentions_new_york: "UNKNOWN" };
}
const unusable = (reason: string, locality_marker: LocalityMarker): P07Interpretation =>
  ({ class: "E_UNUSABLE", locality_marker, returned: 0, geography: [], counts: { in_nyc: 0, outside_nyc: 0, geography_missing: 0 }, reason });

export function interpretNycDiscovery(body: unknown): P07Interpretation {
  const locality = marker(body);
  let places: ReturnType<typeof projectInsightsPlaces>;
  try { places = projectInsightsPlaces(body, P07_TAKE); }
  catch (error) { return unusable(error instanceof ProjectionError ? error.code : "UNREADABLE", locality); }
  const geography = places.map(({ entity }, index): PlaceGeography => {
    const country = entity.country === null ? "MISSING" : entity.country === "US" ? "US" : "OTHER";
    const city = entity.city === null ? "MISSING" : norm(entity.city) === "new york" ? "NEW_YORK" : BOROUGHS.has(norm(entity.city)) ? "NYC_BOROUGH" : "OTHER_CITY";
    const verdict = country === "OTHER" || city === "OTHER_CITY" ? "OUTSIDE_NYC" : country === "MISSING" || city === "MISSING" ? "GEOGRAPHY_MISSING" : "IN_NYC";
    return { index, country, city, verdict };
  });
  const counts = { in_nyc: geography.filter((g) => g.verdict === "IN_NYC").length, outside_nyc: geography.filter((g) => g.verdict === "OUTSIDE_NYC").length,
    geography_missing: geography.filter((g) => g.verdict === "GEOGRAPHY_MISSING").length };
  const result = (cls: P07Class, reason: string): P07Interpretation => ({ class: cls, locality_marker: locality, returned: places.length, geography, counts, reason });
  if (!places.length) return result("D_EMPTY", "A valid response with no places: nothing to repair with, and no evidence the locality was applied.");
  if (locality.status !== "PRESENT") return result("C_PARAMETER_APPARENTLY_IGNORED", "No resolved-locality marker: the locality filter is treated as not applied. Each place must be judged on its own geography.");
  if (counts.outside_nyc || counts.geography_missing || locality.matched_name_mentions_new_york === false)
    return result("B_PARTIAL_OR_MIXED", "A locality was resolved but the places or the matched locality do not all support New York City. Judge each place individually.");
  return result("A_HONORED_NYC", "A locality marker is present and every returned place reports a US, New York City geography. This does not validate any place as a replacement.");
}
