import { realpath } from "node:fs/promises";
import { z } from "zod";
import { assertServer } from "./boundary-error";
import { inspectCapturedBody, verifyCaptureSeal } from "./capture-review";
import { decodeJson, readPrivateSmall, verifyP07Consent } from "./p07-consent";
import { P07CheckpointSchema, P07ProfileSchema, P07SummarySchema, validP07Checkpoint } from "./p07-profile";
import { inspectAcceptedP05Signal } from "./p05-signal";
import { matchesP07Signal } from "./p07-signal";
import { inspectPrivateProbeLedger } from "./raw-probe-store";

// Intake verifies KNOWN LOCAL transport/consent records, not an unseen P07 provider schema.
// Its output is counts/codes only. No credential, body, private URL/ID/hash or replay-capable Capture is returned.
const Attempt = z.object({ record_revision: z.literal("tastegate.probe-attempt.v6"),
  profile: P07ProfileSchema, profile_revision: P07ProfileSchema.shape.revision, max_response_bytes: z.literal(262144),
  maximum_dispatches: z.literal(1), checkpoint: P07CheckpointSchema, reserved_utc: z.iso.datetime(),
  state: z.literal("RESERVED_NO_AUTOMATIC_REPLAY") });
export async function inspectP07Capture(projectRoot: string) {
  assertServer();
  const base = { probe: "P07" as const, replay: "NOT_ENABLED" as const, real_repair: "NOT_ESTABLISHED" as const };
  try {
    const root = await realpath(projectRoot), ledger = await inspectPrivateProbeLedger(root, "P07");
    if (!ledger.reserved_attempts) return { ...base, status: "NOT_EXECUTED" as const };
    if (ledger.reserved_attempts !== 1 || ledger.recorded_dispatches !== 1 || ledger.unresolved_attempts || !ledger.last_attempt_id) throw new Error();
    const id = ledger.last_attempt_id, parts = ["private", "qloo-probes", "p07", "attempts", id];
    const read = async (name: string, cap: number) => {
      const bytes = await readPrivateSmall(root, [...parts, name], cap); if (!bytes) throw new Error(); return bytes;
    };
    const attempt = Attempt.parse(decodeJson(await read("attempt.json", 32768)));
    const summary = z.object({ summary: P07SummarySchema }).parse(decodeJson(await read("summary.json", 16384))).summary;
    const cp = attempt.checkpoint, signal = await inspectAcceptedP05Signal(root);
    // Historical inspection uses the durable reservation time, never renews the now-expired execution window.
    if (cp.attempt_id !== id || summary.attempt_id !== id || !validP07Checkpoint(cp, Date.parse(attempt.reserved_utc)) ||
        !matchesP07Signal(cp, signal) || !await verifyP07Consent(root, cp, signal)) throw new Error();
    if (summary.source_mode !== "live_probe") return { ...base, status: "TEST_DOUBLE_ONLY" as const };
    if (!summary.transport_settled) throw new Error();
    if (summary.http_status !== 200 || !summary.raw_saved_privately || summary.reason !== "SCHEMA_REVIEW_REQUIRED")
      return { ...base, status: "EXECUTED_UNUSABLE" as const, http_status: summary.http_status, reason: summary.reason };
    const bytes = await read("response.raw.json", 262144);
    if (bytes.length !== summary.response_bytes) throw new Error();
    const inspected = inspectCapturedBody(bytes);
    const seal = await readPrivateSmall(root, [...parts, "capture-review-seal.json"], 16384);
    if (seal) await verifyCaptureSeal(root, id);
    return { ...base, status: "CAPTURED_AWAITING_SCHEMA_REVIEW" as const, http_status: summary.http_status,
      response_bytes: bytes.length, elapsed_ms: summary.elapsed_ms, transport_settled: true,
      preregistered_interpretation: inspected.interpretation,
      interpretation_scope: "PREREGISTERED_CLASSIFIER_NOT_OBSERVED_SCHEMA_ADMISSION" as const,
      review_seal: seal ? "INTACT_INTEGRITY_ONLY" as const : "NOT_SEALED" as const,
      provider_projection: "P07_OBSERVED_SCHEMA_REVIEW_REQUIRED" as const };
  } catch { throw new Error("P07_INTAKE_REVIEW_REQUIRED"); }
}
