import { realpath } from "node:fs/promises";
import { z } from "zod";
import { CaptureSchema } from "../domain/contracts";
import { assertServer } from "./boundary-error";
import { captureSha256, verifyCaptureSeal } from "./capture-review";
import { decodeJson, readPrivateSmall } from "./p07-consent";
import { inspectP07Capture } from "./p07-intake";
import { P07_PROFILE } from "./p07-profile";
import { projectInsightsPlaces } from "./projections";
import { loadRecordedEvidence, type VerifiedRecordings } from "./recorded-adapter";

export const P07_REPLAY_REVISION = "tastegate.p07.observed-places.v1";
export const P07_REPLAY_FILE = "replay-admission.v1.json";
// Observed 2026-10-22: query.localities.filter exists; its name "New York" remains ambiguous.
// We admit candidate-specific fields, never a claim that the locality boundary was honored.
const Place = z.object({ entity_id: z.string().min(1).max(256), name: z.string().min(1).max(200),
  type: z.literal("urn:entity"), subtype: z.literal("urn:entity:place"),
  properties: z.object({ address: z.string().min(1).max(300), website: z.url(),
    geocode: z.object({ city: z.string().min(1).max(100), country_code: z.string().regex(/^[A-Z]{2}$/) }) }),
  query: z.object({ affinity: z.number().finite().min(0).max(1) }) });
const Body = z.object({ success: z.literal(true), results: z.object({ entities: z.array(Place).min(1).max(3) }),
  query: z.object({ localities: z.object({ filter: z.array(z.object({ name: z.literal("New York"), subtype: z.literal("urn:entity:locality") })).length(1) }) }) });
export function reviewObservedP07Body(value: unknown) {
  const body = Body.parse(value), rows = body.results.entities;
  if (new Set(rows.map((e) => e.entity_id)).size !== rows.length ||
      rows.some((e, i) => i > 0 && e.query.affinity > rows[i - 1]!.query.affinity)) throw new Error("P07_OBSERVED_ORDER_INVALID");
  return { returned: rows.length, observed_locality: "PRESENT_BUT_NAME_AMBIGUOUS" as const,
    locality_boundary_verified: false as const, projection_revision: P07_REPLAY_REVISION };
}
export async function loadP07Recordings(projectRoot: string): Promise<VerifiedRecordings> {
  assertServer();
  try {
    const root = await realpath(projectRoot), intake = await inspectP07Capture(root);
    if (intake.status !== "CAPTURED_TRANSPORT_VALIDATED" || intake.review_seal !== "INTACT_INTEGRITY_ONLY") throw new Error();
    const state = JSON.parse(new TextDecoder().decode((await readPrivateSmall(root, ["private","qloo-probes","p07-checkpoint.json"], 32768))!));
    const id = z.uuidv4().parse(state.attempt_id);
    const parts = ["private","qloo-probes","p07","attempts",id];
    const read = async (name: string, cap: number) => { const b = await readPrivateSmall(root, [...parts,name],cap); if (!b) throw new Error(); return b; };
    await verifyCaptureSeal(root, id);
    const raw = await read("response.raw.json",262144);
    const admission = z.strictObject({ revision: z.literal(P07_REPLAY_REVISION), body_sha256: z.string().regex(/^[a-f0-9]{64}$/),
      reviewed_utc: z.iso.datetime(), locality_boundary_verified: z.literal(false) }).parse(decodeJson(await read(P07_REPLAY_FILE,8192)));
    if (admission.body_sha256 !== captureSha256(raw) || Date.parse(admission.reviewed_utc)>Date.now()) throw new Error();
    reviewObservedP07Body(decodeJson(raw));
    const attempt = z.object({ reserved_utc: z.iso.datetime(), profile: z.object({ revision: z.literal(P07_PROFILE.revision) }) })
      .parse(decodeJson(await read("attempt.json",32768)));
    if (Date.parse(admission.reviewed_utc)<Date.parse(attempt.reserved_utc)) throw new Error();
    const baseline = await loadRecordedEvidence(root);
    const params = { ...P07_PROFILE.params, "signal.interests.entities": baseline.discovery.signalRef };
    const capture = CaptureSchema.parse({ probe:"P07",attempt_id:id,endpoint:"/v2/insights",profile_revision:P07_PROFILE.revision,
      recorded_at:attempt.reserved_utc,http_status:200,response_bytes:raw.length,request_params:params,integrity:"SHA256_MATCHES_PRIVATE_MANIFEST" });
    return Object.freeze({ ...baseline, datasetId:"qloo-recorded-p07-2026-10",
      discovery:{ capture,signalRef:baseline.discovery.signalRef,take:3,found:projectInsightsPlaces(decodeJson(raw),3) },
      history:Object.freeze([...baseline.history,{probe:"P07" as const,attempt_id:id,endpoint:"/v2/insights" as const,recorded_at:attempt.reserved_utc,
        http_status:200,outcome:"REPLAYABLE" as const,response_bytes:raw.length}]) });
  } catch { throw new Error("P07_RECORDED_EVIDENCE_UNAVAILABLE"); }
}
