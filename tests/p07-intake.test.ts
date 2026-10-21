import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectP07Capture } from "../src/qloo/p07-intake";
import { prepareP07Gate, registerP07Approval } from "../src/qloo/p07-approval";
import { inspectAcceptedP05Signal } from "../src/qloo/p05-signal";
import { P07CheckpointSchema } from "../src/qloo/p07-profile";
import { createPrivateProbeStore } from "../src/qloo/raw-probe-store";
import { createLocalRawProbeRunner } from "../src/qloo/raw-probe-runner";
import { seedP07, p07Config } from "./helpers/p07-root";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function authoredCapture() {
  const s = await seedP07(); roots.push(s.root);
  const gate = await prepareP07Gate(s.root);
  await registerP07Approval(s.root, { proposalId: gate.attempt_id, ownerReply: gate.approval_statement });
  const cp = P07CheckpointSchema.parse(JSON.parse(await readFile(join(s.base, "p07-checkpoint.json"), "utf8")));
  const binding = await inspectAcceptedP05Signal(s.root), store = createPrivateProbeStore(s.root, "P07", cp, null, binding);
  await createLocalRawProbeRunner("P07", p07Config(), { kind: "local-test-double", send: async () => Response.json({ success: true, results: { entities: [] } }) }, store, binding).run({ checkpoint: cp });
  return { ...s, cp, dir: join(s.base, "p07/attempts", cp.attempt_id) };
}
describe("P07 offline intake of authored transport records only", () => {
  it("reports no attempt without reading or inventing a provider body", async () => {
    const s = await seedP07(); roots.push(s.root);
    expect(await inspectP07Capture(s.root)).toEqual({ probe: "P07", replay: "NOT_ENABLED", real_repair: "NOT_ESTABLISHED", status: "NOT_EXECUTED" });
  });
  it("never represents a test-double capture as real provider evidence", async () => {
    const s = await authoredCapture(); expect((await inspectP07Capture(s.root)).status).toBe("TEST_DOUBLE_ONLY");
  });
  it("a transport-record fixture can exercise bounded ingestion but never grants schema admission or replay", async () => {
    const s = await authoredCapture(), path = join(s.dir, "summary.json");
    const json = JSON.parse(await readFile(path, "utf8")); json.summary.source_mode = "live_probe";
    await writeFile(path, JSON.stringify(json)); // authored metadata branch, not a real API observation
    const result = await inspectP07Capture(s.root);
    expect(result.status).toBe("CAPTURED_AWAITING_SCHEMA_REVIEW"); expect(result.replay).toBe("NOT_ENABLED");
    const printed = JSON.stringify(result);
    expect(printed).not.toContain(s.cp.signal_entity_id); expect(printed).not.toContain(s.cp.request_sha256);
    await writeFile(join(s.dir, "response.raw.json"), "{}");
    await expect(inspectP07Capture(s.root)).rejects.toThrow("P07_INTAKE_REVIEW_REQUIRED");
  });
  it.each(["request_url", "destination", "registration_time", "consumed_time"])("rejects consent-record drift: %s", async (damage) => {
    const s = await authoredCapture(), receipt = join(s.base, "p07-approval-receipt-" + s.cp.attempt_id + ".json");
    const json = JSON.parse(await readFile(receipt, "utf8"));
    if (damage === "request_url") json.request.url += "&take=4";
    if (damage === "destination") json.destination += "elsewhere/";
    if (damage === "registration_time") json.local_registration_utc = "2020-01-01T00:00:00Z";
    if (damage === "consumed_time") {
      const path = join(s.base, "p07-proposals", s.cp.attempt_id + ".consumed.json");
      const marker = JSON.parse(await readFile(path, "utf8")); marker.consumed_utc = "2020-01-01T00:00:00Z"; await writeFile(path, JSON.stringify(marker));
    } else await writeFile(receipt, JSON.stringify(json));
    await expect(inspectP07Capture(s.root)).rejects.toThrow("P07_INTAKE_REVIEW_REQUIRED");
  });
});
