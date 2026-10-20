import type { LiveHttpRequest, LiveSend } from "../../src/qloo/live-transport";
import { AUTHORED, authoredBodies } from "./recorded-root";

// Entirely authored: a scripted fake of the provider built from invented data. No network, no real credential.
export const KEY = "authored-live-key-never-issued";
export type Seen = LiveHttpRequest[];
export type WorldOptions = { status?: number; contentType?: string; text?: string; reflect?: boolean; oversize?: boolean; never?: boolean };
export function world(seen: Seen = [], options: WorldOptions = {}): LiveSend {
  const bodies = authoredBodies() as Record<string, any>;
  return async (request) => {
    seen.push(request);
    if (options.never) return new Promise<Response>(() => {});
    if (options.status) return new Response("x", { status: options.status });
    if (options.reflect) return Response.json({ echoed: KEY });
    if (options.oversize) return new Response("[" + "0,".repeat(131_100) + "0]", { headers: { "content-type": "application/json" } });
    if (options.text !== undefined) return new Response(options.text, { headers: { "content-type": options.contentType ?? "application/json" } });
    const u = new URL(request.url); const q = u.searchParams;
    if (u.pathname === "/search") {
      const key = `${q.get("types")}|${q.get("query")}`;
      const table: Record<string, unknown> = { "urn:entity:artist|Radiohead": bodies.P01, "urn:entity:movie|In the Mood for Love": bodies.P02, "urn:entity:place|Blue Note New York": bodies.P03R };
      return Response.json(table[key] ?? { results: [] });
    }
    if (u.pathname === "/v2/tags") return Response.json(bodies.P04);
    if (q.get("filter.results.entities")) {
      const wanted = q.get("filter.results.entities")!.split(","); const known: Record<string, number> = { [AUTHORED.venue]: 0.8, [AUTHORED.far]: 0.4 };
      const ids = wanted.filter((id) => id in known).sort((a, b) => known[b]! - known[a]!);
      const entity = (id: string) => ({ entity_id: id, name: id === AUTHORED.venue ? "Authored Jazz Room" : "Authored Far Pavilion", type: "urn:entity", subtype: "urn:entity:place",
        properties: { geocode: id === AUTHORED.venue ? { city: "New York", country_code: "US" } : { city: "Authored City", country_code: "ES" } }, query: { affinity: known[id] } });
      return Response.json({ success: true, results: { entities: ids.map(entity) } });
    }
    return Response.json(bodies.P05);
  };
}
